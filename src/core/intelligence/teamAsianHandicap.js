// Team Asian Handicap — núcleo matemático y contrato de dominio.
//
// Mercado deportivo INDEPENDIENTE de cuotas: el settlement se calcula
// exclusivamente a partir del marcador real y la línea, nunca de
// decimal_odds, implied_probability, bookmaker ni disponibilidad del
// proveedor (ver ATLAS_DECISIONS_LOG.md, decisiones 8-13).
//
// Identidad exacta de un candidato: fixture_id + market_family + team_id +
// line. El lado apostado se identifica por equipo explícito (side: "home"
// u "away"), NUNCA por direction="over"|"under" — esa vocabulario solo
// tiene sentido para mercados de total, no por equipo (decisión 13).
//
// Reutiliza la matemática de partición/combinación de líneas de cuarto ya
// verificada para asian_total_goals (settlementMath.js), generalizada allí
// sin cambiar su comportamiento — ver asianTotalGoals.js.
//
// Este módulo NO genera candidatos productivos, NO construye una
// distribución deportiva de diferencia de goles y NO se conecta a
// Jornada/Radar/Individual/Parlay/LIVE/UI. Es exclusivamente el contrato
// matemático de settlement, listo para que un bloque futuro lo use.

import {
  SETTLEMENT_OUTCOME_VALUES,
  combineSettlementParts,
  generateQuarterStepLines,
  settlementFavorability,
  settlementPriceEquivalentInterval,
  settlementPriceEquivalentProbability,
  settlementUncertainty,
  splitQuarterStepLine,
} from "./settlementMath.js";
import { buildAsianTotalGoalDistribution } from "./candidateLineGenerator.js";
import { buildMarketComponents } from "./marketComponentAdapter.js";
import {
  ESTIMATED_PROBABILITY_REPRESENTS,
  classifyProbability,
  toProbabilityPercent,
} from "./probabilityClassification.js";

export const TEAM_ASIAN_HANDICAP_FAMILY = "team_asian_handicap";
export const TEAM_ASIAN_HANDICAP_LABEL = "Asiático — Hándicap por equipo";

// Vocabulario ya usado en el repo para identificar equipo (home_team/
// away_team, homeTeamProfile/awayTeamProfile, as_home/as_away) — no se
// inventa un alias nuevo.
export const TEAM_ASIAN_HANDICAP_SIDES = Object.freeze(["home", "away"]);

export function isValidTeamAsianHandicapSide(side) {
  return TEAM_ASIAN_HANDICAP_SIDES.includes(String(side || "").toLowerCase());
}

// Contrato de línea válida para team_asian_handicap: cualquier número
// finito, múltiplo exacto de 0.25, CON signo (a diferencia de
// isValidAsianTotalGoalLine, que exige líneas no negativas porque
// asian_total_goals no tiene concepto de "a favor de quién"). No se impone
// ningún rango artificial ni se valida contra disponibilidad de bookmaker
// — la línea es deportiva por definición.
export function isValidTeamAsianHandicapLine(line) {
  const numericLine = Number(line);
  if (!Number.isFinite(numericLine)) return false;
  const quarter = numericLine * 4;
  return Math.abs(quarter - Math.round(quarter)) <= 1e-8;
}

/**
 * Divide una línea de hándicap por equipo (firmada, pasos de 0.25) en sus
 * componentes de medio punto. Composición delgada sobre
 * splitQuarterStepLine (settlementMath.js) — sin envoltorio de
 * direction/stake_fraction propio de asian_total_goals, porque Team AH no
 * tiene concepto de over/under: el signo de la línea ya codifica a favor de
 * quién corre el hándicap.
 *
 * @param {number} line
 * @returns {number[]|null}
 */
export function splitTeamAsianHandicapLine(line) {
  if (!isValidTeamAsianHandicapLine(line)) return null;
  return splitQuarterStepLine(Number(line));
}

/**
 * Traduce side (home|away) a la perspectiva del equipo seleccionado. Pura:
 * no consulta ningún dato de proveedor ni construye un candidato — solo
 * resuelve qué marcador cuenta como "propio" y cuál como "rival" según el
 * lado elegido.
 */
export function selectedTeamGoalsFromSide({ side, homeGoals, awayGoals } = {}) {
  const normalizedSide = String(side || "").toLowerCase();
  if (normalizedSide === "home") return { selectedTeamGoals: Number(homeGoals), opponentGoals: Number(awayGoals) };
  if (normalizedSide === "away") return { selectedTeamGoals: Number(awayGoals), opponentGoals: Number(homeGoals) };
  return { selectedTeamGoals: NaN, opponentGoals: NaN };
}

function evaluateMargin(adjustedMargin) {
  if (adjustedMargin > 0) return "win";
  if (adjustedMargin < 0) return "loss";
  return "push";
}

/**
 * Settlement canónico de Team Asian Handicap.
 *
 * goal_difference = selectedTeamGoals - opponentGoals
 * adjusted_margin = goal_difference + (cada componente de la línea)
 *
 * Para líneas enteras/.5 (un solo componente): adjusted_margin>0→full_win,
 * =0→push, <0→full_loss. Para quarter-lines (.25/.75, dos componentes de
 * medio punto): cada componente se evalúa por separado y se combina con la
 * misma reducción de 5 estados que asian_total_goals ya usa
 * (combineSettlementParts, settlementMath.js) — nunca inventa un sexto
 * estado.
 *
 * No depende de cuotas, bookmaker ni disponibilidad del proveedor — solo
 * del marcador real y la línea.
 *
 * @param {{selectedTeamGoals:number, opponentGoals:number, line:number}} input
 * @returns {{status:"full_win"|"half_win"|"push"|"half_loss"|"full_loss"|"not_evaluable", goal_difference:number|null, exact_line:number|null, parts:object[]}}
 */
export function settleTeamAsianHandicap({ selectedTeamGoals, opponentGoals, line } = {}) {
  const selected = Number(selectedTeamGoals);
  const opponent = Number(opponentGoals);
  const halves = splitTeamAsianHandicapLine(line);
  if (!Number.isFinite(selected) || !Number.isFinite(opponent) || !halves) {
    return { status: "not_evaluable", goal_difference: null, exact_line: null, parts: [] };
  }
  const goalDifference = selected - opponent;
  const stakeFraction = halves.length === 2 ? 0.5 : 1;
  const parts = halves.map((halfLine) => {
    const adjustedMargin = Number((goalDifference + halfLine).toFixed(6));
    return {
      line: halfLine,
      stake_fraction: stakeFraction,
      adjusted_margin: adjustedMargin,
      result: evaluateMargin(adjustedMargin),
    };
  });
  return {
    status: combineSettlementParts(parts),
    goal_difference: goalDifference,
    exact_line: Number(line),
    parts,
  };
}

/**
 * Identidad exacta de un candidato Team Asian Handicap: fixture_id +
 * market_family + team_id + line. No usa direction=over|under (decisión
 * 13) — el lado ya queda identificado por team_id/side fuera de esta
 * cadena. Puramente descriptiva: no construye un candidato productivo.
 */
export function buildTeamAsianHandicapCandidateId({ fixtureId, teamId, line } = {}) {
  return `${TEAM_ASIAN_HANDICAP_FAMILY}:${fixtureId}:${teamId}:${Number(line)}`;
}

function round(value, decimals = 6) {
  return Number(Number(value).toFixed(decimals));
}

// ---------------------------------------------------------------------------
// Distribución deportiva de diferencia de gol por equipo.
//
// SPORTS-FIRST: solo consume homeTeamProfile/awayTeamProfile/leagueProfile
// ya existentes — nunca cuotas, bookmaker ni disponibilidad del proveedor.
// Compone, sin duplicar matemática:
//   media   -> buildMarketComponents (marketComponentAdapter.js), ya usado
//              por candidateLineGenerator.js para el mismo propósito
//              (expected_home_component - expected_away_component);
//   dispersión -> reutiliza la dispersión ya calculada de la familia
//              "goals" (buildAsianTotalGoalDistribution). Justificación
//              estadística: si los goles de local y visitante fueran
//              aproximadamente independientes, Var(diferencia) =
//              Var(local)+Var(visitante) = Var(total) — la MISMA identidad
//              que hace que el total y la diferencia compartan varianza
//              bajo esa aproximación. No se inventa una dispersión nueva.
//   percentiles -> se recentran (mismo radio observado alrededor de la
//              media) sobre la nueva media de diferencia, en vez de
//              reutilizar percentiles del total tal cual (que están
//              centrados en un valor distinto).
// ---------------------------------------------------------------------------

export function buildTeamAsianHandicapDistribution({ side, ...context } = {}) {
  if (!isValidTeamAsianHandicapSide(side)) return null;
  const normalizedSide = String(side).toLowerCase();
  const goalsDistribution = buildAsianTotalGoalDistribution(context);
  if (!goalsDistribution) return null;
  const components = buildMarketComponents({
    marketFamily: "goals",
    homeTeamProfile: context.homeTeamProfile,
    awayTeamProfile: context.awayTeamProfile,
  });
  const homeExpected = components?.home_component?.expected;
  const awayExpected = components?.away_component?.expected;
  if (!Number.isFinite(homeExpected) || !Number.isFinite(awayExpected)) return null;
  const meanForHome = homeExpected - awayExpected;
  const projectedMean = normalizedSide === "home" ? meanForHome : -meanForHome;
  const totalMean = goalsDistribution.projected_mean;
  const lowerRadius = Number.isFinite(goalsDistribution.percentile_10) ? totalMean - goalsDistribution.percentile_10 : null;
  const upperRadius = Number.isFinite(goalsDistribution.percentile_90) ? goalsDistribution.percentile_90 - totalMean : null;
  return {
    contract: "TeamAsianHandicapDistribution",
    version: 1,
    market_family: TEAM_ASIAN_HANDICAP_FAMILY,
    side: normalizedSide,
    projected_mean: round(projectedMean),
    dispersion: goalsDistribution.dispersion,
    percentile_10: Number.isFinite(lowerRadius) ? round(projectedMean - lowerRadius) : null,
    percentile_90: Number.isFinite(upperRadius) ? round(projectedMean + upperRadius) : null,
    effective_sample_size: goalsDistribution.canonical_observations?.effective_sample_size ?? null,
    home_component_expected: round(homeExpected),
    away_component_expected: round(awayExpected),
    limitations: [
      "Distribución de diferencia de gol derivada de componentes esperados de la familia goals; no observaciones pareadas por fixture.",
      "La dispersión reutiliza la de goles totales bajo una aproximación de independencia local/visitante.",
    ],
  };
}

/**
 * Genera líneas Team Asian Handicap (firmadas, pasos de 0.25) a partir de
 * su distribución deportiva ya calculada. SPORTS-FIRST: no recibe ni
 * consulta cuotas, bookmaker ni líneas de mercado externas. Composición
 * delgada sobre generateQuarterStepLines (settlementMath.js,
 * allowNegative:true) — a diferencia de asian_total_goals, sí conserva
 * líneas negativas porque el signo forma parte del dominio.
 */
export const TEAM_ASIAN_HANDICAP_LINE_STEP = 0.25;
export const DEFAULT_TEAM_ASIAN_HANDICAP_LINE_GENERATION_MAX_LINES = 13;

export function generateTeamAsianHandicapLines(distribution = {}, { maxLines = DEFAULT_TEAM_ASIAN_HANDICAP_LINE_GENERATION_MAX_LINES } = {}) {
  return generateQuarterStepLines(distribution, { maxLines, allowNegative: true });
}

// ---------------------------------------------------------------------------
// Estimación paramétrica de probabilidades de settlement.
//
// asian_total_goals construye su perfil de settlement de forma EMPÍRICA
// (settleAsianTotalGoals aplicada a cada observación histórica real de
// canonicalObservations). Esa ruta no es reutilizable aquí sin inventar
// datos: canonicalObservations.js solo extrae un valor total por fixture
// por familia — no existe hoy ninguna fuente de diferencia de gol pareada
// por fixture en homeTeamProfile/awayTeamProfile. Reconstruirla exigiría
// una nueva extracción de datos del proveedor, fuera de alcance de este
// bloque ("componer con infraestructura existente", no crear una nueva).
//
// En su lugar, se estima la probabilidad de cada estado de settlement de
// forma PARAMÉTRICA: la diferencia de gol se aproxima por una normal con
// continuidad (mean, dispersion ya compuestos arriba), evaluada en cada
// entero cercano y combinada con combineSettlementParts (misma tabla que
// asian_total_goals). Es una aproximación explícita, marcada como
// preliminar/no calibrada — nunca se presenta como una probabilidad
// empírica verificada.
// ---------------------------------------------------------------------------

// Aproximación estándar de la función de error (Abramowitz & Stegun 7.1.26,
// error máximo ~1.5e-7). No existe ningún helper de CDF normal en el
// repositorio — es la pieza mínima de matemática estadística estándar
// necesaria para convertir media/dispersión en probabilidades discretas de
// settlement; no duplica ningún modelo de negocio existente.
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

function normalCdf(x, mean, sd) {
  if (!(sd > 0)) return x >= mean ? 1 : 0;
  return 0.5 * (1 + erf((x - mean) / (sd * Math.SQRT2)));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

/**
 * Probabilidades de settlement {full_win, half_win, push, half_loss,
 * full_loss} para una línea Team Asian Handicap, a partir de una
 * distribución de diferencia de gol (mean, dispersion) aproximada como
 * normal con corrección de continuidad (la diferencia real es entera).
 * Devuelve null si la línea o la distribución no son evaluables.
 */
export function estimateTeamAsianHandicapProbabilities({ line, mean, dispersion } = {}) {
  const components = splitQuarterStepLine(Number(line));
  const numericMean = Number(mean);
  const numericDispersion = Math.max(0.5, Number(dispersion) || 0.5);
  if (!components || !Number.isFinite(numericMean)) return null;
  const stakeFraction = components.length === 2 ? 0.5 : 1;
  const totals = { full_win: 0, half_win: 0, push: 0, half_loss: 0, full_loss: 0 };
  // Ventana de enteros que cubre la masa de probabilidad relevante; el
  // radio crece con la dispersión y con la distancia de la línea a la
  // media para no truncar escenarios plausibles pero infrecuentes.
  const radius = Math.max(8, Math.ceil(numericDispersion * 8), Math.ceil(Math.abs(numericMean)) + 8);
  const low = Math.round(numericMean) - radius;
  const high = Math.round(numericMean) + radius;
  let coveredMass = 0;
  for (let d = low; d <= high; d += 1) {
    const parts = components.map((componentLine) => {
      const margin = round(d + componentLine);
      return { line: componentLine, stake_fraction: stakeFraction, result: margin > 0 ? "win" : margin < 0 ? "loss" : "push" };
    });
    const outcome = combineSettlementParts(parts);
    const mass = normalCdf(d + 0.5, numericMean, numericDispersion) - normalCdf(d - 0.5, numericMean, numericDispersion);
    totals[outcome] += mass;
    coveredMass += mass;
  }
  // Colas fuera de la ventana: por debajo siempre resuelve full_loss (goal
  // difference muy negativa), por encima siempre full_win — se asigna la
  // masa residual ahí en vez de descartarla, para que las probabilidades
  // sumen exactamente 1.
  const lowerTailMass = normalCdf(low - 0.5, numericMean, numericDispersion);
  const upperTailMass = 1 - normalCdf(high + 0.5, numericMean, numericDispersion);
  totals.full_loss += lowerTailMass;
  totals.full_win += upperTailMass;
  const totalMass = lowerTailMass + coveredMass + upperTailMass;
  if (!(totalMass > 0)) return null;
  return {
    full_win: clamp01(totals.full_win / totalMass),
    half_win: clamp01(totals.half_win / totalMass),
    push: clamp01(totals.push / totalMass),
    half_loss: clamp01(totals.half_loss / totalMass),
    full_loss: clamp01(totals.full_loss / totalMass),
  };
}

/**
 * Perfil de settlement Team Asian Handicap para una línea exacta:
 * probabilidades de los 5 estados, Favorabilidad Atlas (settlement
 * genérico reutilizado, ver settlementMath.js) y probability_semantics.
 * PARAMÉTRICO (ver comentario arriba) — nunca se etiqueta como
 * probabilidad literal de ganar ni como calibración empírica.
 */
export function buildTeamAsianHandicapSettlementProfile({ distribution, line } = {}) {
  const probabilities = estimateTeamAsianHandicapProbabilities({
    line,
    mean: distribution?.projected_mean,
    dispersion: distribution?.dispersion,
  });
  if (!probabilities) return null;
  const weightedWin = probabilities.full_win + 0.5 * probabilities.half_win;
  const weightedLoss = probabilities.full_loss + 0.5 * probabilities.half_loss;
  const favorability = settlementFavorability(probabilities);
  // Varianza ponderada real de Y (SETTLEMENT_OUTCOME_VALUES), calculada
  // directamente desde las probabilidades ya estimadas arriba — no
  // fabricada: es la varianza del modelo paramétrico declarado, reutilizando
  // la MISMA fórmula de incertidumbre que asian_total_goals ya usa
  // (settlementUncertainty, settlementMath.js) sobre la MISMA escala
  // (mean/margin en [0,1], z=1.645). Con effective_sample_size insuficiente
  // cae al mismo fallback conservador [0,1] — nunca finge precisión.
  const weightedPopulationVariance = Object.entries(probabilities).reduce(
    (sum, [outcome, probability]) => sum + probability * (SETTLEMENT_OUTCOME_VALUES[outcome] - favorability) ** 2,
    0,
  );
  const uncertainty = settlementUncertainty({
    mean: favorability,
    weightedPopulationVariance,
    effectiveSampleSize: distribution?.effective_sample_size,
  });
  // Métrica económica — independiente de Favorabilidad Atlas y de su
  // intervalo (igual que asian_total_goals: ver asianTotalGoals.js). NUNCA
  // se deriva de sports_favorability. Reutiliza los mismos helpers
  // genéricos settlementPriceEquivalentProbability/Interval — sin
  // duplicar matemática.
  const priceEquivalentProbability = settlementPriceEquivalentProbability({
    weighted_win_probability: weightedWin,
    weighted_loss_probability: weightedLoss,
  });
  const priceEquivalentInterval = settlementPriceEquivalentInterval({
    weightedWinProbability: weightedWin,
    weightedLossProbability: weightedLoss,
    effectiveSampleSize: distribution?.effective_sample_size,
  });
  return {
    contract: "TeamAsianHandicapSettlementProfile",
    version: 1,
    market_family: TEAM_ASIAN_HANDICAP_FAMILY,
    side: distribution?.side ?? null,
    line: Number(line),
    parts: splitQuarterStepLine(Number(line)),
    probabilities: {
      full_win: round(probabilities.full_win),
      half_win: round(probabilities.half_win),
      push: round(probabilities.push),
      half_loss: round(probabilities.half_loss),
      full_loss: round(probabilities.full_loss),
    },
    weighted_win_probability: round(weightedWin),
    weighted_loss_probability: round(weightedLoss),
    push_probability: round(probabilities.push),
    // Favorabilidad Atlas: NO es una probabilidad literal de ganar — media
    // ponderada del settlement (settlementFavorability, settlementMath.js).
    sports_favorability: round(favorability),
    sports_favorability_uncertainty_low: round(uncertainty.uncertainty_low),
    sports_favorability_uncertainty_high: round(uncertainty.uncertainty_high),
    sports_favorability_uncertainty_status: uncertainty.status,
    sports_favorability_method: uncertainty.method,
    // Probabilidad equivalente Atlas por precio — NO la probabilidad
    // literal de ganar (ver asianTotalGoals.js). null cuando W+L<=0 o la
    // muestra decisiva es insuficiente — nunca se sustituye por un valor
    // inventado.
    price_equivalent_probability: Number.isFinite(priceEquivalentProbability) ? round(priceEquivalentProbability) : null,
    price_equivalent_probability_low: Number.isFinite(priceEquivalentInterval.low) ? round(priceEquivalentInterval.low) : null,
    price_equivalent_probability_high: Number.isFinite(priceEquivalentInterval.high) ? round(priceEquivalentInterval.high) : null,
    price_equivalent_probability_method: priceEquivalentInterval.method,
    probability_semantics: "settlement_favorability",
    // Aproximación paramétrica normal con continuidad — no empírica por
    // observación individual (a diferencia de asianSettlementProfile), pero
    // el intervalo de incertidumbre sí es real: se deriva de la varianza del
    // propio modelo paramétrico, no se fabrica ni se omite.
    model_validation_status: "preliminary_unvalidated",
    estimation_method: "goal_difference_normal_approximation",
    effective_sample_size: distribution?.effective_sample_size ?? null,
  };
}

/**
 * Evaluación deportiva de una línea Team Asian Handicap exacta —
 * equivalente a evaluateExactMarketLine (candidateLineGenerator.js) para
 * asian_total_goals, pero con identidad por equipo (side/team_id) en vez
 * de direction=over|under. Produce un candidato con la misma forma de
 * campos que ya consumen calculateSportsScore/rankMarketCandidates
 * (marketCandidateRanker.js) — isSettlementFavorabilityCandidate ya
 * reconoce market_family="team_asian_handicap" (probabilityClassification.js),
 * así que Solidez se calcula con la rama settlement_favorability existente
 * sin ningún cambio adicional.
 *
 * `candidate.direction` se fija al valor de `side` únicamente por
 * compatibilidad con el comparador genérico de rankMarketCandidates (que
 * usa esa cadena como desempate final) — NO es direction=over|under ni
 * tiene ese significado; la identidad pública real es side/team_id.
 */
export function evaluateTeamAsianHandicapExactLine({ fixtureId, teamId, side, line, ...context } = {}) {
  const normalizedSide = String(side || "").toLowerCase();
  if (!isValidTeamAsianHandicapSide(normalizedSide)) {
    return { contract: "TeamAsianHandicapExactLineEvaluation", version: 1, status: "unavailable", exact_selection_ready: false, candidate: null, reason: "invalid_side" };
  }
  const distribution = buildTeamAsianHandicapDistribution({ side: normalizedSide, ...context });
  if (!distribution) {
    return { contract: "TeamAsianHandicapExactLineEvaluation", version: 1, status: "unavailable", exact_selection_ready: false, candidate: null, reason: "insufficient_distribution_data" };
  }
  const profile = buildTeamAsianHandicapSettlementProfile({ distribution, line });
  if (!profile) {
    return { contract: "TeamAsianHandicapExactLineEvaluation", version: 1, status: "unavailable", exact_selection_ready: false, candidate: null, reason: "unsupported_exact_line" };
  }
  const point = profile.sports_favorability;
  const numericLine = Number(line);
  const contextualOnly = Math.abs(numericLine - distribution.projected_mean) > distribution.dispersion * 2.25;
  const candidate = {
    contract: "TeamAsianHandicapCandidate",
    version: 1,
    candidate_id: buildTeamAsianHandicapCandidateId({ fixtureId, teamId, line: numericLine }),
    market_family: TEAM_ASIAN_HANDICAP_FAMILY,
    fixture_id: fixtureId ?? null,
    team_id: teamId ?? null,
    side: normalizedSide,
    direction: normalizedSide,
    selection: `${normalizedSide === "home" ? "Local" : "Visitante"} ${numericLine >= 0 ? "+" : ""}${numericLine}`,
    line: numericLine,
    projected_mean: distribution.projected_mean,
    dispersion: distribution.dispersion,
    preliminary_probability: point,
    probability_status: "preliminary",
    estimated_probability: point,
    probability_percent: toProbabilityPercent(point),
    probability_classification: classifyProbability(point),
    estimated_probability_represents: ESTIMATED_PROBABILITY_REPRESENTS,
    estimated_probability_is_calibrated: false,
    model_validation_status: profile.model_validation_status,
    uncertainty_low: profile.sports_favorability_uncertainty_low,
    uncertainty_high: profile.sports_favorability_uncertainty_high,
    uncertainty_status: profile.sports_favorability_uncertainty_status,
    uncertainty_method: profile.sports_favorability_method,
    sample_size_effective: distribution.effective_sample_size,
    limitations: [
      ...distribution.limitations,
      "sports_favorability representa la media ponderada del settlement (Favorabilidad Atlas), no una probabilidad literal de ganar.",
      "Perfil paramétrico (aproximación normal), no empírico por observación individual.",
    ],
    context_adjustment: null,
    contextual_only: contextualOnly,
    price_status: "unavailable",
    probability_semantics: "settlement_favorability",
    sports_favorability: point,
    team_asian_handicap_settlement_profile: profile,
    // Alias genérico: toJourneyCandidate (sportsIntelligenceService.js) y
    // otros consumidores ya existentes leen candidate.asian_settlement_profile
    // de forma family-agnostic para exponer el detalle de settlement en la
    // presentación de Jornada — se expone aquí el mismo perfil bajo esa
    // clave, sin tocar esos consumidores ni duplicar el objeto.
    asian_settlement_profile: profile,
  };
  return { contract: "TeamAsianHandicapExactLineEvaluation", version: 1, status: "ready_for_pricing", exact_selection_ready: true, candidate, reason: null };
}

/**
 * Genera el catálogo completo de candidatos Team Asian Handicap para un
 * fixture — ambos equipos (home y away), todas las líneas SPORTS-FIRST
 * generadas por generateTeamAsianHandicapLines. Composición pura sobre las
 * funciones ya existentes de este módulo (buildTeamAsianHandicapDistribution
 * + generateTeamAsianHandicapLines + evaluateTeamAsianHandicapExactLine) —
 * no reimplementa ninguna matemática. Un side sin teamId disponible se
 * omite silenciosamente (no fabrica un candidato sin identidad de equipo).
 */
export function generateTeamAsianHandicapCandidates({ fixtureId, homeTeamId, awayTeamId, ...sportsContext } = {}) {
  const sides = [
    { side: "home", teamId: homeTeamId },
    { side: "away", teamId: awayTeamId },
  ];
  return sides.flatMap(({ side, teamId }) => {
    if (teamId === undefined || teamId === null) return [];
    const distribution = buildTeamAsianHandicapDistribution({ side, ...sportsContext });
    if (!distribution) return [];
    const lines = generateTeamAsianHandicapLines(distribution);
    return lines.flatMap((line) => {
      const evaluation = evaluateTeamAsianHandicapExactLine({ fixtureId, teamId, side, line, ...sportsContext });
      return evaluation.candidate ? [evaluation.candidate] : [];
    });
  });
}
