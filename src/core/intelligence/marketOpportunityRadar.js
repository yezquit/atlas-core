// RADAR deportivo de ATLAS (Fase 3A).
//
// Detecta convergencia real de señales para UNA market_family, formula una
// tesis HIGH/LOW/NEUTRAL, la somete a validación adversarial, y decide si
// existe una oportunidad deportiva digna de pasar a DecisionFrontier.
//
// RADAR NO elige la línea exacta (eso sigue siendo responsabilidad de
// DecisionFrontier) y NO usa cuotas. radar_score es una medida de
// calidad/convergencia de oportunidad deportiva, NUNCA una probabilidad:
// no sustituye ni recalcula estimated_probability, sports_score ni
// probability_classification.
//
// Consume exclusivamente la base ya construida en Fase 2: el resultado de
// generateCandidateLines() (candidateLineGenerator.js), que ya trae
// distribution.canonical_observations (canonicalObservations.js,
// deduplicado por fixture_id) y market_model_audit por candidato
// (home_for/away_against/away_for/home_against/league_baseline/
// expected_total/coherence_ratio/model_coherence_warning, vía
// marketComponentAdapter.js). No crea ninguna extracción paralela de datos.
//
// INDEPENDENCIA DE SEÑALES — CÓMO SE VERIFICA (no se asume):
// recent_home/recent_away/home_role/away_role se comparan contra una
// referencia de liga construida con EXCLUSIÓN EXPLÍCITA (leave-one-out): la
// media de liga se recalcula quitando cualquier fixture_id que también
// respalde la señal. Señal y referencia quedan físicamente no solapadas por
// construcción (overlap_fixture_count = 0). Si tras excluir esos fixtures
// no queda muestra de liga suficiente, la señal se marca inválida y no
// participa en la votación (ni en el numerador ni en el denominador de
// convergencia).
//
// Cada media se pondera SOLO por la contribución de su(s) propia(s)
// fuente(s) (memberships[].contribution), nunca por effective_weight
// agregado: effective_weight mezcla la contribución de TODAS las
// membresías de un fixture (p.ej. liga + reciente + rol a la vez), lo cual
// contaminaría una media que pretende representar una sola perspectiva.
//
// Cuando los fixture_id subyacentes de una cantidad NO pueden reconstruirse
// de forma fiable (es el caso de expected_home_component/
// expected_away_component/expected_total: marketComponentAdapter.js los
// calcula a partir de los arrays .for/.conceded, que no llevan fixture_id),
// esa cantidad NUNCA vota HIGH/LOW: se expone solo como señal descriptiva,
// porque no hay manera honesta de demostrar su independencia. Por la misma
// razón, home_for/away_against/away_for/home_against (escala de equipo, sin
// baseline compatible que no sea circular) son siempre descriptivas.

import { runAdversarialMarketCheck } from "./adversarialMarketCheck.js";

export const MARKET_OPPORTUNITY_RADAR_VERSION = "market-opportunity-radar-v5";

// Todas las constantes del radar viven aquí, centralizadas y auditables.
export const RADAR_THRESHOLDS = Object.freeze({
  // Distancia (en desviaciones de dispersión) a partir de la cual una señal
  // votante deja de considerarse neutral y pasa a "high" o "low".
  SIGNAL_DIRECTION_THRESHOLD: 0.15,
  // Fracción mínima de señales votantes VÁLIDAS que deben coincidir para
  // que exista convergencia real (evita decidir HIGH/LOW con mayoría débil).
  CONVERGENCE_MIN_RATIO: 0.6,
  // Máximo de señales votantes opuestas toleradas incluso si la fracción
  // anterior se cumple; más que esto se considera demasiado contradictorio.
  CONVERGENCE_MAX_OPPOSING: 1,
  // Mismo mínimo que canonicalObservations.js exige para incluir la fuente
  // "league" en el pool canónico (no se inventa un umbral nuevo): si tras
  // excluir los fixtures de la señal no quedan al menos 8 observaciones de
  // liga, la referencia leave-one-out no es fiable.
  MIN_LEAGUE_REFERENCE_SAMPLE: 8,
  // Escalas de referencia (valor que mapea a 100 puntos) para normalizar
  // dimensiones ya existentes sin inventar una fórmula nueva por dimensión.
  SAMPLE_QUALITY_REFERENCE: 15, // effective_sample_size canónico (ponderado, deduplicado)
  UNIQUE_FIXTURE_REFERENCE: 10, // canonical.observations.length (fixtures físicos únicos)
  STABILITY_REFERENCE: 3, // dispersion de la distribución empírica
});

export const RADAR_SCORE_WEIGHTS = Object.freeze({
  directional_agreement: 0.30,
  sample_quality: 0.20,
  unique_fixture_support: 0.20,
  stability: 0.15,
  coherence: 0.15,
});

function clamp(value, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, value));
}
function round(value, decimals = 2) {
  return Number(Number(value).toFixed(decimals));
}

function directionFromDelta(delta, threshold) {
  if (!Number.isFinite(delta)) return "neutral";
  if (delta > threshold) return "high";
  if (delta < -threshold) return "low";
  return "neutral";
}

// Peso de UNA perspectiva concreta para un fixture: suma de las
// contribuciones (memberships[].contribution) que pertenecen a esa
// perspectiva únicamente, ignorando cualquier otra membership del mismo
// fixture. Nunca usa item.effective_weight (agregado de todas las fuentes).
function sourceSpecificWeight(item, sourceNames) {
  return item.memberships?.filter((membership) => sourceNames.includes(membership.source_name))
    .reduce((sum, membership) => sum + membership.contribution, 0) ?? 0;
}

// Media de una perspectiva concreta (p.ej. "home_role", o "home_last_5"+
// "home_last_10" combinadas) ponderada SOLO por la contribución de esa
// perspectiva. Un fixture solo aparece una vez aunque tenga otras
// memberships; esas otras memberships no influyen en este promedio.
function weightedMeanBySource(observations = [], sourceNames = []) {
  const weighted = observations
    .map((item) => ({ item, weight: sourceSpecificWeight(item, sourceNames) }))
    .filter((entry) => entry.weight > 0);
  if (!weighted.length) return { value: null, sample_size: 0 };
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0) || 1;
  const value = weighted.reduce((sum, entry) => sum + entry.item.value * entry.weight, 0) / totalWeight;
  return { value: round(value), sample_size: weighted.length };
}

// Conjunto de fixture_id físicos cuyas memberships incluyen alguna de las
// fuentes indicadas.
function fixtureIdSet(observations = [], sourceNames = []) {
  const ids = new Set();
  for (const item of observations) {
    if (item.memberships?.some((membership) => sourceNames.includes(membership.source_name))) ids.add(item.fixture_id);
  }
  return ids;
}

// Referencia de liga leave-one-out: media de las observaciones canónicas
// con membership "league" EXCLUYENDO explícitamente cualquier fixture_id
// que también respalde la señal que se va a comparar, ponderada solo por
// la contribución de la membership "league" de cada fixture restante. No
// es una nueva extracción de datos: usa exactamente canonicalObservations
// ya calculado.
function leagueReferenceExcluding(observations, excludeIds) {
  const matches = observations.filter((item) =>
    item.memberships?.some((membership) => membership.source_name === "league") && !excludeIds.has(item.fixture_id)
  );
  if (!matches.length) return { value: null, sample_size: 0, fixture_ids: new Set() };
  const weighted = matches.map((item) => ({ item, weight: sourceSpecificWeight(item, ["league"]) }));
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0) || 1;
  const value = weighted.reduce((sum, entry) => sum + entry.item.value * entry.weight, 0) / totalWeight;
  return { value: round(value), sample_size: matches.length, fixture_ids: new Set(matches.map((item) => item.fixture_id)) };
}

// Señal votante "perspectiva vs liga sin esos fixtures", construida por
// exclusión real de fixture_id, nunca por umbral de tolerancia al
// solapamiento. Sirve por igual para reciente (home_last_5/10,
// away_last_5/10) y para rol (home_role, away_role): todas tienen
// fixture_id trazable en canonicalObservations.
function makeVsLeagueSignal({ name, signalValue, signalFixtureIds, spread, threshold, observations }) {
  const reference = leagueReferenceExcluding(observations, signalFixtureIds);
  const overlapFixtureCount = [...signalFixtureIds].filter((id) => reference.fixture_ids.has(id)).length; // debe ser 0 por construcción
  const validReference = reference.sample_size >= RADAR_THRESHOLDS.MIN_LEAGUE_REFERENCE_SAMPLE;
  const valid = validReference && Number.isFinite(signalValue.value) && Number.isFinite(reference.value);
  const magnitude = valid ? (signalValue.value - reference.value) / spread : null;
  return {
    name,
    voting: true,
    valid,
    value: Number.isFinite(signalValue.value) ? signalValue.value : null,
    sample_size: signalValue.sample_size,
    reference: valid ? reference.value : null,
    signal_fixture_count: signalFixtureIds.size,
    reference_fixture_count: reference.sample_size,
    overlap_fixture_count: overlapFixtureCount,
    magnitude,
    direction: directionFromDelta(magnitude, threshold),
  };
}

// Señal descriptiva: se muestra para auditoría pero NUNCA vota HIGH/LOW,
// porque no existe una referencia de su misma escala verificablemente
// independiente (baseline circular, o fixture_id subyacentes no
// reconstruibles). Forzar una dirección aquí sería inventar independencia
// que no está demostrada.
function makeDescriptiveSignal(name, value, sampleSize, reason) {
  return {
    name,
    voting: false,
    valid: false,
    value: Number.isFinite(value) ? value : null,
    sample_size: sampleSize ?? 0,
    reference: null,
    magnitude: null,
    direction: "neutral",
    reason,
  };
}

function buildSignals({ audit, distribution }) {
  const spread = Math.max(0.75, distribution.dispersion || 0.75);
  const threshold = RADAR_THRESHOLDS.SIGNAL_DIRECTION_THRESHOLD;
  const observations = distribution.canonical_observations?.observations || [];

  const perspectives = [
    { name: "recent_home", sourceNames: ["home_last_5", "home_last_10"] },
    { name: "recent_away", sourceNames: ["away_last_5", "away_last_10"] },
    { name: "home_role", sourceNames: ["home_role"] },
    { name: "away_role", sourceNames: ["away_role"] },
  ];

  const votingSignals = perspectives.map(({ name, sourceNames }) => {
    const signalValue = weightedMeanBySource(observations, sourceNames);
    const signalFixtureIds = fixtureIdSet(observations, sourceNames);
    return makeVsLeagueSignal({ name, signalValue, signalFixtureIds, spread, threshold, observations });
  });

  const descriptiveSignals = [
    makeDescriptiveSignal("home_production", audit.home_for?.value, audit.home_for?.sample_size, "no_independent_team_scale_reference"),
    makeDescriptiveSignal("away_concession", audit.away_against?.value, audit.away_against?.sample_size, "no_independent_team_scale_reference"),
    makeDescriptiveSignal("away_production", audit.away_for?.value, audit.away_for?.sample_size, "no_independent_team_scale_reference"),
    makeDescriptiveSignal("home_concession", audit.home_against?.value, audit.home_against?.sample_size, "no_independent_team_scale_reference"),
    // expected_total (marketComponentAdapter.js) se calcula desde arrays
    // .for/.conceded sin fixture_id: no hay forma fiable de comprobar su
    // solapamiento contra ninguna referencia, así que no vota.
    makeDescriptiveSignal("league_vs_matchup", audit.expected_total, audit.league_baseline?.sample_size, "underlying_fixture_ids_not_reconstructible"),
  ];

  return { votingSignals, descriptiveSignals };
}

// Decide la dirección GENERAL del mercado a partir del voto de las señales
// VOTANTES CON DATOS VÁLIDOS (ni las descriptivas ni las señales
// invalidadas por referencia insuficiente participan en el conteo).
// Deliberadamente NO recibe ninguna selección/dirección solicitada por el
// usuario: el radar no puede tener sesgo de confirmación porque nunca ve
// qué pidió el usuario.
function decideDirection(votingSignals) {
  const validSignals = votingSignals.filter((signal) => signal.valid);
  const total = validSignals.length;
  if (total === 0) return { direction: "neutral", convergence_ratio: 0, opposing_count: 0 };
  const highCount = validSignals.filter((signal) => signal.direction === "high").length;
  const lowCount = validSignals.filter((signal) => signal.direction === "low").length;
  if (highCount === 0 && lowCount === 0) {
    return { direction: "neutral", convergence_ratio: 0, opposing_count: 0 };
  }
  if (highCount === lowCount) {
    return { direction: "neutral", convergence_ratio: highCount / total, opposing_count: highCount };
  }
  const dominant = highCount > lowCount ? "high" : "low";
  const dominantCount = Math.max(highCount, lowCount);
  const opposingCount = Math.min(highCount, lowCount);
  const convergenceRatio = dominantCount / total;
  const converges = convergenceRatio >= RADAR_THRESHOLDS.CONVERGENCE_MIN_RATIO && opposingCount <= RADAR_THRESHOLDS.CONVERGENCE_MAX_OPPOSING;
  return converges
    ? { direction: dominant, convergence_ratio: convergenceRatio, opposing_count: opposingCount }
    : { direction: "neutral", convergence_ratio: convergenceRatio, opposing_count: opposingCount };
}

function buildRadarScore({ direction, convergenceRatio, sampleQuality, uniqueFixtureSupport, stability, coherenceScore }) {
  const directionalAgreement = direction === "neutral" ? 0 : clamp(convergenceRatio * 100);
  const weights = RADAR_SCORE_WEIGHTS;
  // coherenceScore puede ser null cuando coherence_ratio no es evaluable
  // para esta market_family (p.ej. cards: MARKET_COMPONENT_ADAPTERS.cards.
  // supports_components=false => component_total siempre null). Esa
  // dimensión se EXCLUYE por completo (no aporta 0 ni 100 puntos) y el
  // score se renormaliza dividiendo solo entre los pesos de las
  // dimensiones evaluables. Cuando las 5 dimensiones son finitas,
  // activeWeightTotal = 1 exacto (0.30+0.20+0.20+0.15+0.15) y el
  // resultado es matemáticamente idéntico a la fórmula anterior.
  const dimensions = [
    { score: directionalAgreement, weight: weights.directional_agreement },
    { score: sampleQuality, weight: weights.sample_quality },
    { score: uniqueFixtureSupport, weight: weights.unique_fixture_support },
    { score: stability, weight: weights.stability },
    { score: coherenceScore, weight: weights.coherence },
  ].filter((dimension) => Number.isFinite(dimension.score));
  const activeWeightTotal = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  const weightedSum = dimensions.reduce((sum, dimension) => sum + dimension.score * dimension.weight, 0);
  const score = activeWeightTotal > 0 ? weightedSum / activeWeightTotal : 0;
  return round(clamp(score), 1);
}

function emptyRadarResult(marketFamily, reason) {
  return {
    contract: "MarketOpportunityRadar",
    version: 1,
    methodology_version: MARKET_OPPORTUNITY_RADAR_VERSION,
    market_family: marketFamily,
    radar_direction: "neutral",
    radar_score: 0,
    opportunity_detected: false,
    supporting_signals: [],
    opposing_signals: [],
    neutral_signals: [],
    independent_signal_count: 0,
    unique_fixture_count: 0,
    signal_group_count: 0,
    sample_quality: 0,
    model_coherence: null,
    adversarial_passed: false,
    critical_contradictions: [reason],
    opposing_strength: 0,
    thesis_summary: "No hay suficiente base deportiva para formular una tesis.",
  };
}

// Punto de entrada único del Radar. Consume el resultado ya calculado por
// generateCandidateLines() (candidateLineGenerator.js) para una sola
// market_family; NO recalcula distribución, componentes ni observaciones
// canónicas.
export function buildMarketOpportunityRadar({ generatedLines, contextItems = [], contextImpacts = [] } = {}) {
  const marketFamily = generatedLines?.market_family ?? null;
  const distribution = generatedLines?.distribution ?? null;
  const audit = generatedLines?.candidates?.[0]?.market_model_audit ?? null;
  if (!distribution || !audit) {
    return emptyRadarResult(marketFamily, "insufficient_distribution_data");
  }

  const canonical = distribution.canonical_observations || { observations: [], sources: [], effective_sample_size: 0 };
  const { votingSignals, descriptiveSignals } = buildSignals({ audit, distribution });
  const { direction, convergence_ratio: convergenceRatio } = decideDirection(votingSignals);

  // Tres dimensiones DISTINTAS, cada una con su propia definición y fuente,
  // medidas por fixture_id (no por conteo de fuentes ni suma de muestras),
  // y sin relación con qué perspectivas terminaron votando arriba:
  // - unique_fixture_count: fixtures físicos canónicos únicos, tal cual los
  //   deduplica canonicalObservations.js (un fixture = un registro, sin
  //   importar cuántas fuentes lo referencien).
  // - signal_group_count: cuántas perspectivas estadísticas (league,
  //   home_last_5, home_last_10, away_last_5, away_last_10, home_role,
  //   away_role) aportaron muestra suficiente para entrar al análisis. Es
  //   diversidad de perspectivas, NO independencia: varias pueden compartir
  //   fixture_id.
  // - independent_signal_count: SOLO los fixtures cuyo único origen es una
  //   perspectiva (memberships.length === 1), es decir, evidencia
  //   verificablemente no solapada entre perspectivas. Puede ser 0 si toda
  //   la muestra se solapa entre fuentes; eso es honesto, no un error.
  const observations = canonical.observations || [];
  const uniqueFixtureCount = observations.length;
  const signalGroupCount = canonical.sources?.length ?? 0;
  const independentSignalCount = observations.filter((item) => (item.memberships?.length ?? 0) === 1).length;
  const effectiveSampleSize = canonical.effective_sample_size ?? 0;

  const sampleQuality = round(clamp((effectiveSampleSize / RADAR_THRESHOLDS.SAMPLE_QUALITY_REFERENCE) * 100), 1);
  const uniqueFixtureSupport = round(clamp((uniqueFixtureCount / RADAR_THRESHOLDS.UNIQUE_FIXTURE_REFERENCE) * 100), 1);
  const stability = round(clamp(100 - (distribution.dispersion / RADAR_THRESHOLDS.STABILITY_REFERENCE) * 100), 1);
  // coherence_ratio es null cuando esta market_family no soporta el modelo
  // de componentes o component_total no es finito: la coherencia NO es
  // evaluable, no "coherente por defecto".
  const coherenceEvaluable = Number.isFinite(audit.coherence_ratio);
  const coherenceScore = !coherenceEvaluable
    ? null
    : audit.model_coherence_warning ? 40 : round(clamp(100 - audit.coherence_ratio * 60), 1);

  const radarScore = buildRadarScore({ direction, convergenceRatio, sampleQuality, uniqueFixtureSupport, stability, coherenceScore });

  const allSignals = [...votingSignals, ...descriptiveSignals];
  const supportingSignals = direction === "neutral" ? [] : votingSignals.filter((signal) => signal.valid && signal.direction === direction);
  const opposingSignals = direction === "neutral"
    ? votingSignals.filter((signal) => signal.valid && signal.direction !== "neutral")
    : votingSignals.filter((signal) => signal.valid && signal.direction !== "neutral" && signal.direction !== direction);
  const neutralSignals = allSignals.filter((signal) => !signal.valid || signal.direction === "neutral");

  const adversarial = runAdversarialMarketCheck({
    direction,
    directionalSignals: votingSignals.filter((signal) => signal.valid),
    audit,
    uniqueFixtureCount,
    sampleQuality,
    contextItems,
    contextImpacts,
    marketFamily,
  });

  const opportunityDetected = direction !== "neutral" && adversarial.adversarial_passed === true;

  const validVotingCount = votingSignals.filter((signal) => signal.valid).length;
  const thesisSummary = direction === "neutral"
    ? `Sin convergencia suficiente en ${marketFamily}: señales divididas o insuficientes para formular una tesis.`
    : `Convergencia hacia volumen ${direction === "high" ? "alto" : "bajo"} en ${marketFamily} (${supportingSignals.length}/${validVotingCount} señales votantes válidas a favor, radar_score ${radarScore}).`;

  return {
    contract: "MarketOpportunityRadar",
    version: 1,
    methodology_version: MARKET_OPPORTUNITY_RADAR_VERSION,
    market_family: marketFamily,
    radar_direction: direction,
    radar_score: radarScore,
    opportunity_detected: opportunityDetected,
    supporting_signals: supportingSignals,
    opposing_signals: opposingSignals,
    neutral_signals: neutralSignals,
    independent_signal_count: independentSignalCount,
    unique_fixture_count: uniqueFixtureCount,
    signal_group_count: signalGroupCount,
    sample_quality: sampleQuality,
    // coherent es null (no true/false) cuando coherence_ratio no es
    // evaluable: evita reportar "coherente" cuando nunca se comprobó.
    model_coherence: { coherent: coherenceEvaluable ? !audit.model_coherence_warning : null, coherence_ratio: audit.coherence_ratio ?? null },
    adversarial_passed: adversarial.adversarial_passed,
    critical_contradictions: adversarial.critical_contradictions,
    opposing_strength: adversarial.opposing_strength,
    thesis_summary: thesisSummary,
  };
}

// Integración mínima con DecisionFrontier (sección 9 de Fase 3A): adjunta el
// contexto de recomendabilidad del Radar a cada candidato SIN tocar
// decisionFrontier.js y sin reemplazar su selección de línea. DecisionFrontier
// sigue decidiendo la frontera útil dentro de la tesis que el Radar entrega.
export function attachRadarContext(candidates = [], radarResult = null) {
  if (!radarResult) return candidates;
  const context = {
    radar_direction: radarResult.radar_direction,
    radar_score: radarResult.radar_score,
    opportunity_detected: radarResult.opportunity_detected,
    adversarial_passed: radarResult.adversarial_passed,
    critical_contradictions: radarResult.critical_contradictions,
  };
  return candidates.map((candidate) => ({ ...candidate, radar_context: context }));
}
