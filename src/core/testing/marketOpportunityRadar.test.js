import test from "node:test";
import assert from "node:assert/strict";

import { generateCandidateLines } from "../intelligence/candidateLineGenerator.js";
import { buildCanonicalObservations } from "../intelligence/canonicalObservations.js";
import { buildDecisionFrontier } from "../intelligence/decisionFrontier.js";
import { buildMarketOpportunityRadar, attachRadarContext, RADAR_SCORE_WEIGHTS, RADAR_THRESHOLDS } from "../intelligence/marketOpportunityRadar.js";

// ---------------------------------------------------------------------------
// Perfiles con fixture_id DISJUNTOS entre liga y perspectivas de equipo (para
// poder ejercitar honestamente la exclusión leave-one-out), pero con
// last_5 ⊂ last_10 usando LOS MISMOS fixture_id (como en datos reales: los
// últimos 5 partidos son un subconjunto físico de los últimos 10).
// ---------------------------------------------------------------------------
function taggedObs(prefix, values) {
  return values.map((value, index) => ({ fixture_id: `${prefix}-${index}`, value }));
}

// tenValues debe tener longitud 10; last_5 reutiliza los últimos 5 fixture_id
// de last_10 (mismos IDs, mismos valores), nunca partidos distintos.
function recentPair(prefix, tenValues) {
  const last10 = taggedObs(prefix, tenValues);
  const last5 = last10.slice(-5);
  return { last5, last10 };
}

// preliminaryMarketModel.js todavía evalúa una cobertura legacy basada en
// match_totals ANTES de intentar la rama canónica (ver diagnóstico): sin
// match_totals, esa comprobación legacy falla y generateCandidateLines nunca
// llega a producir candidatos, aunque canonicalObservations esté completo.
// match_totals debe representar EXACTAMENTE los mismos partidos/valores que
// observations, nunca una extracción distinta.
function eventSample(observations) {
  return { observations, match_totals: observations.map((item) => item.value) };
}

function buildRadarProfiles({
  marketFamily = "goals",
  leagueValues,
  homeRecentValues10,
  awayRecentValues10,
  homeRoleValues,
  awayRoleValues,
  homeFor,
  homeAgainst,
  awayFor,
  awayAgainst,
}) {
  const homeRecent = recentPair("home", homeRecentValues10);
  const awayRecent = recentPair("away", awayRecentValues10);
  const homeRoleObs = taggedObs("homerole", homeRoleValues);
  const awayRoleObs = taggedObs("awayrole", awayRoleValues);
  const leagueProfile = {
    quality_status: "verified",
    event_samples: { [marketFamily]: eventSample(taggedObs("league", leagueValues)) },
  };
  const homeTeamProfile = {
    quality_status: "verified",
    last_5: { event_samples: { [marketFamily]: eventSample(homeRecent.last5) } },
    last_10: { event_samples: { [marketFamily]: eventSample(homeRecent.last10) } },
    as_home: { event_samples: { [marketFamily]: { ...eventSample(homeRoleObs), for: homeFor, conceded: homeAgainst } } },
    as_away: { event_samples: { [marketFamily]: eventSample([]) } },
  };
  const awayTeamProfile = {
    quality_status: "verified",
    last_5: { event_samples: { [marketFamily]: eventSample(awayRecent.last5) } },
    last_10: { event_samples: { [marketFamily]: eventSample(awayRecent.last10) } },
    as_away: { event_samples: { [marketFamily]: { ...eventSample(awayRoleObs), for: awayFor, conceded: awayAgainst } } },
    as_home: { event_samples: { [marketFamily]: eventSample([]) } },
  };
  return { leagueProfile, homeTeamProfile, awayTeamProfile };
}

const LEAGUE_LOW = Array.from({ length: 20 }, () => 2);
const LEAGUE_HIGH = Array.from({ length: 20 }, () => 4.5);
const TEAM_HIGH_10 = Array.from({ length: 10 }, () => 4.5);
const TEAM_LOW_10 = Array.from({ length: 10 }, () => 0.5);

// Escenario "todo alto" (liga baja, equipos altos): distribution.projected_mean
// ponderado ≈ 0.25*2 + 0.75*4.5 = 3.875. Para que component_total no diverja
// de eso (evitar model_coherence_warning accidental), for/conceded se fijan
// en ~1.9375 cada uno (2 componentes de ~1.9375 suman ~3.875).
const COHERENT_HIGH = { homeFor: [1.9375], homeAgainst: [1.9375], awayFor: [1.9375], awayAgainst: [1.9375] };
// Escenario "todo bajo" (liga alta, equipos bajos): projected_mean ≈
// 0.25*4.5 + 0.75*0.5 = 1.5. Componentes en ~0.75 cada uno.
const COHERENT_LOW = { homeFor: [0.75], homeAgainst: [0.75], awayFor: [0.75], awayAgainst: [0.75] };
// Escenario "sin divergencia" (todo uniforme en 2): componentes en 1 cada uno.
const COHERENT_FLAT = { homeFor: [1], homeAgainst: [1], awayFor: [1], awayAgainst: [1] };

function generatedLinesFor(profiles, extra = {}) {
  return generateCandidateLines({ marketFamily: "goals", ...profiles, ...extra });
}

// ===========================================================================
// 1-2. Convergencia real HIGH y LOW
// ===========================================================================

test("1. convergencia real hacia HIGH: recent_home/recent_away/home_role/away_role por encima de la liga producen radar_direction=high", () => {
  const profiles = buildRadarProfiles({
    leagueValues: LEAGUE_LOW,
    homeRecentValues10: TEAM_HIGH_10,
    awayRecentValues10: TEAM_HIGH_10,
    homeRoleValues: TEAM_HIGH_10,
    awayRoleValues: TEAM_HIGH_10,
    ...COHERENT_HIGH,
  });
  const generatedLines = generatedLinesFor(profiles);
  const radar = buildMarketOpportunityRadar({ generatedLines });
  assert.equal(radar.model_coherence.coherent, true, "este test prueba convergencia, no incoherencia del modelo");
  assert.equal(radar.radar_direction, "high");
  assert.ok(radar.supporting_signals.length >= 3, "al menos 3 de las 4 señales votantes deben apoyar HIGH");
  assert.equal(radar.opposing_signals.length, 0);
  assert.ok(radar.opportunity_detected);
  assert.ok(radar.adversarial_passed);
});

test("2. convergencia real hacia LOW: recent_home/recent_away/home_role/away_role por debajo de la liga producen radar_direction=low", () => {
  const profiles = buildRadarProfiles({
    leagueValues: LEAGUE_HIGH,
    homeRecentValues10: TEAM_LOW_10,
    awayRecentValues10: TEAM_LOW_10,
    homeRoleValues: TEAM_LOW_10,
    awayRoleValues: TEAM_LOW_10,
    ...COHERENT_LOW,
  });
  const generatedLines = generatedLinesFor(profiles);
  const radar = buildMarketOpportunityRadar({ generatedLines });
  assert.equal(radar.model_coherence.coherent, true, "este test prueba convergencia, no incoherencia del modelo");
  assert.equal(radar.radar_direction, "low");
  assert.ok(radar.opportunity_detected);
});

// ===========================================================================
// 3. Señales divididas => NEUTRAL
// ===========================================================================

test("3. señales divididas (home alto, away bajo) no alcanzan convergencia y quedan NEUTRAL", () => {
  const profiles = buildRadarProfiles({
    leagueValues: LEAGUE_LOW,
    homeRecentValues10: TEAM_HIGH_10,
    awayRecentValues10: TEAM_LOW_10,
    homeRoleValues: TEAM_HIGH_10,
    awayRoleValues: TEAM_LOW_10,
    homeFor: [1.5], homeAgainst: [1.5], awayFor: [1.5], awayAgainst: [1.5],
  });
  const generatedLines = generatedLinesFor(profiles);
  const radar = buildMarketOpportunityRadar({ generatedLines });
  assert.equal(radar.radar_direction, "neutral");
  assert.equal(radar.opportunity_detected, false);
});

// ===========================================================================
// 4. Un fixture duplicado en memberships no infla independent_signal_count
// ===========================================================================

test("4. un fixture_id que aparece en liga Y en home_role no se cuenta como señal independiente, pero sí como fixture único", () => {
  const sharedId = "shared-fixture-1";
  const leagueObs = taggedObs("league", LEAGUE_LOW);
  leagueObs[0] = { fixture_id: sharedId, value: 2 };
  const homeRoleObs = taggedObs("homerole", TEAM_HIGH_10);
  homeRoleObs[0] = { fixture_id: sharedId, value: 2 };

  const homeRecent = recentPair("home", TEAM_HIGH_10);
  const awayRecent = recentPair("away", TEAM_HIGH_10);
  const awayRoleObs = taggedObs("awayrole", TEAM_HIGH_10);
  const leagueProfile = { quality_status: "verified", event_samples: { goals: eventSample(leagueObs) } };
  const homeTeamProfile = {
    quality_status: "verified",
    last_5: { event_samples: { goals: eventSample(homeRecent.last5) } },
    last_10: { event_samples: { goals: eventSample(homeRecent.last10) } },
    as_home: { event_samples: { goals: { ...eventSample(homeRoleObs), for: [1.9375], conceded: [1.9375] } } },
    as_away: { event_samples: { goals: eventSample([]) } },
  };
  const awayTeamProfile = {
    quality_status: "verified",
    last_5: { event_samples: { goals: eventSample(awayRecent.last5) } },
    last_10: { event_samples: { goals: eventSample(awayRecent.last10) } },
    as_away: { event_samples: { goals: { ...eventSample(awayRoleObs), for: [1.9375], conceded: [1.9375] } } },
    as_home: { event_samples: { goals: eventSample([]) } },
  };

  // Verdad de referencia: se calcula canonicalObservations con exactamente
  // las mismas fuentes que usará el radar internamente (vía
  // generateCandidateLines), para comparar contra un total exacto, no una
  // cota aproximada que podría cumplirse aunque la deduplicación fallara.
  const canonical = buildCanonicalObservations({ marketFamily: "goals", leagueProfile, homeTeamProfile, awayTeamProfile });
  const expectedUniqueIds = new Set([
    ...leagueObs.map((o) => o.fixture_id),
    ...homeRecent.last10.map((o) => o.fixture_id), // last5 ya es subconjunto
    ...homeRoleObs.map((o) => o.fixture_id),
    ...awayRecent.last10.map((o) => o.fixture_id),
    ...awayRoleObs.map((o) => o.fixture_id),
  ]);
  assert.equal(canonical.observations.length, expectedUniqueIds.size, "canonicalObservations debe deduplicar exactamente al tamaño del conjunto de fixture_id únicos");

  const sharedObservation = canonical.observations.find((item) => item.fixture_id === sharedId);
  assert.ok(sharedObservation, "el fixture compartido debe existir en canonical.observations");
  assert.equal(canonical.observations.filter((item) => item.fixture_id === sharedId).length, 1, "no debe existir como registro duplicado");
  assert.ok(sharedObservation.memberships.length >= 2, "debe llevar membership tanto de league como de home_role");

  const generatedLines = generatedLinesFor({ leagueProfile, homeTeamProfile, awayTeamProfile });
  const radar = buildMarketOpportunityRadar({ generatedLines });

  assert.equal(radar.unique_fixture_count, expectedUniqueIds.size, "unique_fixture_count debe coincidir exactamente con el total de fixture_id únicos esperado");
  assert.equal(
    radar.independent_signal_count,
    canonical.observations.filter((item) => item.memberships.length === 1).length,
    "independent_signal_count debe coincidir exactamente con los fixtures cuya única membership es una sola perspectiva"
  );
  assert.ok(radar.independent_signal_count < radar.unique_fixture_count, "el fixture compartido (con 2+ memberships) no debe contarse como evidencia no solapada");
});

// ===========================================================================
// 5. model_coherence_warning debilita/bloquea una tesis fuerte
// ===========================================================================

test("5. model_coherence_warning hace que el adversarial rechace incluso una convergencia HIGH aparentemente fuerte", () => {
  const profiles = buildRadarProfiles({
    leagueValues: LEAGUE_LOW,
    homeRecentValues10: TEAM_HIGH_10,
    awayRecentValues10: TEAM_HIGH_10,
    homeRoleValues: TEAM_HIGH_10,
    awayRoleValues: TEAM_HIGH_10,
    homeFor: [20], homeAgainst: [20], awayFor: [1.9375], awayAgainst: [1.9375], // dispara divergencia entre component_total y distribution.projected_mean
  });
  const generatedLines = generatedLinesFor(profiles);
  const radar = buildMarketOpportunityRadar({ generatedLines });
  assert.equal(radar.radar_direction, "high", "las señales votantes (recent/role vs liga) siguen convergiendo: no se tocó su cálculo");
  assert.equal(radar.model_coherence.coherent, false);
  assert.ok(radar.critical_contradictions.includes("model_coherence_warning"));
  assert.equal(radar.adversarial_passed, false);
  assert.equal(radar.opportunity_detected, false, "una tesis fuerte pero incoherente no debe convertirse en oportunidad");
});

// ===========================================================================
// 6. Adversarial puede rechazar una oportunidad aparentemente buena
// ===========================================================================

test("6. adversarial rechaza una convergencia real cuando la evidencia Gemini compatible es contraria", () => {
  const profiles = buildRadarProfiles({
    leagueValues: LEAGUE_LOW,
    homeRecentValues10: TEAM_HIGH_10,
    awayRecentValues10: TEAM_HIGH_10,
    homeRoleValues: TEAM_HIGH_10,
    awayRoleValues: TEAM_HIGH_10,
    ...COHERENT_HIGH,
  });
  const generatedLines = generatedLinesFor(profiles);
  const contextImpacts = [
    { id: "g1", affected_markets: ["goals", "total_shots", "shots_on_goal"], direction: "decrease", magnitude_class: "high", explanation: "Delantero titular ausente." },
  ];
  const radar = buildMarketOpportunityRadar({ generatedLines, contextImpacts });
  assert.equal(radar.radar_direction, "high");
  assert.equal(radar.adversarial_passed, false);
  assert.ok(radar.critical_contradictions.some((item) => item.startsWith("gemini_contrario")));
  assert.equal(radar.opportunity_detected, false);
});

// ===========================================================================
// 7. Radar puede devolver 0 oportunidades
// ===========================================================================

test("7. el radar puede legítimamente no encontrar ninguna oportunidad (neutral, sin forzar nada)", () => {
  const flat10 = Array.from({ length: 10 }, () => 2);
  const profiles = buildRadarProfiles({
    leagueValues: LEAGUE_LOW,
    homeRecentValues10: flat10,
    awayRecentValues10: flat10,
    homeRoleValues: flat10,
    awayRoleValues: flat10,
    ...COHERENT_FLAT,
  });
  const generatedLines = generatedLinesFor(profiles);
  const radar = buildMarketOpportunityRadar({ generatedLines });
  assert.equal(radar.radar_direction, "neutral");
  assert.equal(radar.opportunity_detected, false);
});

// ===========================================================================
// 8. Usuario consulta Over pero Radar puede concluir LOW (sin sesgo de confirmación)
// ===========================================================================

test("8. el radar ignora metadatos ajenos como requested_direction/requested_line y puede concluir LOW aunque el usuario pida Over", () => {
  const profiles = buildRadarProfiles({
    leagueValues: LEAGUE_HIGH,
    homeRecentValues10: TEAM_LOW_10,
    awayRecentValues10: TEAM_LOW_10,
    homeRoleValues: TEAM_LOW_10,
    awayRoleValues: TEAM_LOW_10,
    ...COHERENT_LOW,
  });
  const generatedLines = generatedLinesFor(profiles);
  // requested_direction/requested_line simulan que el usuario pidió
  // explícitamente "Over 2.5". buildMarketOpportunityRadar no declara estos
  // parámetros en su firma (no se modifica la API para leerlos): deben ser
  // ignorados por completo, y el resultado debe seguir siendo LOW.
  const radar = buildMarketOpportunityRadar({
    generatedLines,
    requested_direction: "over",
    requested_line: 2.5,
  });
  assert.equal(radar.radar_direction, "low", "el radar ignora la selección del usuario y reporta lo que las señales muestran");
});

// ===========================================================================
// 9. Cuotas no modifican radar_direction, radar_score ni adversarial result
// ===========================================================================

test("9. buildMarketOpportunityRadar nunca lee cuotas/odds: el mismo generatedLines con o sin un campo de cuotas ajeno produce resultados idénticos", () => {
  const profiles = buildRadarProfiles({
    leagueValues: LEAGUE_LOW,
    homeRecentValues10: TEAM_HIGH_10,
    awayRecentValues10: TEAM_HIGH_10,
    homeRoleValues: TEAM_HIGH_10,
    awayRoleValues: TEAM_HIGH_10,
    ...COHERENT_HIGH,
  });
  const generatedLines = generatedLinesFor(profiles);
  const withoutOdds = buildMarketOpportunityRadar({ generatedLines });
  const generatedLinesWithOdds = { ...generatedLines, quotes: [{ decimal_odds: 1.01 }], preferredQuote: { decimal_odds: 50 } };
  const withOdds = buildMarketOpportunityRadar({ generatedLines: generatedLinesWithOdds });
  assert.deepEqual(withOdds, withoutOdds);
});

test("9b. estructural: marketOpportunityRadar.js y adversarialMarketCheck.js no referencian cuotas/odds", async () => {
  const { readFile } = await import("node:fs/promises");
  const radarSource = await readFile(new URL("../intelligence/marketOpportunityRadar.js", import.meta.url), "utf8");
  const adversarialSource = await readFile(new URL("../intelligence/adversarialMarketCheck.js", import.meta.url), "utf8");
  assert.doesNotMatch(radarSource, /decimal_odds|quote|\bodds\b/i);
  assert.doesNotMatch(adversarialSource, /decimal_odds|quote|\bodds\b/i);
});

// ===========================================================================
// 10. Evidence gating por market_family (con datos reales de corners)
// ===========================================================================

test("10. evidencia Gemini de otra familia (shots_on_goal) no afecta ni bloquea una tesis de corners con datos válidos de corners", () => {
  const cornersHigh10 = Array.from({ length: 10 }, () => 10);
  const profiles = buildRadarProfiles({
    marketFamily: "corners",
    leagueValues: Array.from({ length: 20 }, () => 6),
    homeRecentValues10: cornersHigh10,
    awayRecentValues10: cornersHigh10,
    homeRoleValues: cornersHigh10,
    awayRoleValues: cornersHigh10,
    homeFor: [4.5], homeAgainst: [4.5], awayFor: [4.5], awayAgainst: [4.5], // (0.25*6+0.75*10)=9.0 => 2 componentes de 4.5
  });
  const generatedLines = generateCandidateLines({ marketFamily: "corners", ...profiles });
  const contextImpacts = [
    { id: "g1", affected_markets: ["shots_on_goal"], direction: "decrease", magnitude_class: "high", explanation: "Menos remates a puerta esperados." },
  ];
  const withUnrelatedGemini = buildMarketOpportunityRadar({ generatedLines, contextImpacts });
  const withoutGemini = buildMarketOpportunityRadar({ generatedLines });
  assert.equal(withoutGemini.model_coherence.coherent, true);
  assert.equal(withoutGemini.radar_direction, "high");
  assert.equal(withUnrelatedGemini.radar_direction, withoutGemini.radar_direction);
  assert.equal(withUnrelatedGemini.adversarial_passed, withoutGemini.adversarial_passed);
  assert.deepEqual(withUnrelatedGemini.critical_contradictions, withoutGemini.critical_contradictions);
});

// ===========================================================================
// 11. Dos fixtures no comparten señales (pureza / aislamiento)
// ===========================================================================

test("11. dos análisis independientes (fixtures distintos) no comparten señales ni se contaminan entre sí", () => {
  const profilesA = buildRadarProfiles({
    leagueValues: LEAGUE_LOW,
    homeRecentValues10: TEAM_HIGH_10,
    awayRecentValues10: TEAM_HIGH_10,
    homeRoleValues: TEAM_HIGH_10,
    awayRoleValues: TEAM_HIGH_10,
    ...COHERENT_HIGH,
  });
  const profilesB = buildRadarProfiles({
    leagueValues: LEAGUE_HIGH,
    homeRecentValues10: TEAM_LOW_10,
    awayRecentValues10: TEAM_LOW_10,
    homeRoleValues: TEAM_LOW_10,
    awayRoleValues: TEAM_LOW_10,
    ...COHERENT_LOW,
  });
  const radarA1 = buildMarketOpportunityRadar({ generatedLines: generatedLinesFor(profilesA) });
  const radarB = buildMarketOpportunityRadar({ generatedLines: generatedLinesFor(profilesB) });
  const radarA2 = buildMarketOpportunityRadar({ generatedLines: generatedLinesFor(profilesA) });
  assert.equal(radarA1.radar_direction, "high");
  assert.equal(radarB.radar_direction, "low");
  assert.deepEqual(radarA1, radarA2, "calcular B en medio no debe alterar el resultado de A (sin estado compartido)");
});

// ===========================================================================
// 12. Radar entrega contexto a DecisionFrontier sin reemplazar su selección de línea
// ===========================================================================

test("12. attachRadarContext adjunta radar_context sin alterar la selección de línea de DecisionFrontier", () => {
  const profiles = buildRadarProfiles({
    leagueValues: LEAGUE_LOW,
    homeRecentValues10: TEAM_HIGH_10,
    awayRecentValues10: TEAM_HIGH_10,
    homeRoleValues: TEAM_HIGH_10,
    awayRoleValues: TEAM_HIGH_10,
    ...COHERENT_HIGH,
  });
  const generatedLines = generatedLinesFor(profiles);
  const radar = buildMarketOpportunityRadar({ generatedLines });

  const frontierWithoutRadar = buildDecisionFrontier(generatedLines.candidates.map((c) => ({ ...c })));
  const candidatesWithRadar = attachRadarContext(generatedLines.candidates, radar);
  const frontierWithRadar = buildDecisionFrontier(candidatesWithRadar);

  assert.ok(candidatesWithRadar.every((c) => c.radar_context?.radar_direction === radar.radar_direction));
  assert.equal(frontierWithRadar.primary?.candidate_id, frontierWithoutRadar.primary?.candidate_id, "la presencia de radar_context no debe cambiar la línea/candidato primario elegido por DecisionFrontier");
  assert.deepEqual(
    frontierWithRadar.candidates.map((c) => c.decision_frontier),
    frontierWithoutRadar.candidates.map((c) => c.decision_frontier),
    "decision_frontier de cada candidato debe ser idéntico con o sin radar_context"
  );
});

// ===========================================================================
// 13. Leave-one-out con solapamiento real (no solo fixtures disjuntos)
// ===========================================================================

test("13. leave-one-out con solapamiento real: fixtures compartidos entre recent_home y league quedan excluidos de la referencia", () => {
  const sharedIds = ["shared-h0", "shared-h1", "shared-h2", "shared-h3"];
  const homeLast10 = [
    ...sharedIds.map((id) => ({ fixture_id: id, value: 4.5 })),
    ...Array.from({ length: 6 }, (_, index) => ({ fixture_id: `home-extra-${index}`, value: 4.5 })),
  ];
  const homeLast5 = homeLast10.slice(-5);
  const leagueObs = [
    ...sharedIds.map((id) => ({ fixture_id: id, value: 4.5 })), // mismo fixture_id, mismo valor real del partido
    ...Array.from({ length: 16 }, (_, index) => ({ fixture_id: `league-extra-${index}`, value: 2 })),
  ];
  const awayRecent = recentPair("away", TEAM_HIGH_10);

  const leagueProfile = { quality_status: "verified", event_samples: { goals: eventSample(leagueObs) } };
  const homeTeamProfile = {
    quality_status: "verified",
    last_5: { event_samples: { goals: eventSample(homeLast5) } },
    last_10: { event_samples: { goals: eventSample(homeLast10) } },
    as_home: { event_samples: { goals: { ...eventSample(taggedObs("homerole", TEAM_HIGH_10)), for: [1.9375], conceded: [1.9375] } } },
    as_away: { event_samples: { goals: eventSample([]) } },
  };
  const awayTeamProfile = {
    quality_status: "verified",
    last_5: { event_samples: { goals: eventSample(awayRecent.last5) } },
    last_10: { event_samples: { goals: eventSample(awayRecent.last10) } },
    as_away: { event_samples: { goals: { ...eventSample(taggedObs("awayrole", TEAM_HIGH_10)), for: [1.9375], conceded: [1.9375] } } },
    as_home: { event_samples: { goals: eventSample([]) } },
  };

  const generatedLines = generatedLinesFor({ leagueProfile, homeTeamProfile, awayTeamProfile });
  const radar = buildMarketOpportunityRadar({ generatedLines });

  const allSignals = [...radar.supporting_signals, ...radar.opposing_signals, ...radar.neutral_signals];
  const recentHomeSignal = allSignals.find((signal) => signal.name === "recent_home");
  assert.ok(recentHomeSignal, "la señal recent_home debe existir en alguno de los buckets");
  assert.equal(recentHomeSignal.signal_fixture_count, 10, "recent_home debe seguir viendo sus 10 fixtures propios");
  assert.equal(recentHomeSignal.reference_fixture_count, 16, "la referencia de liga debe quedar en 20 - 4 compartidos = 16, no en 20");
  assert.equal(recentHomeSignal.overlap_fixture_count, 0, "tras la exclusión leave-one-out, señal y referencia no deben compartir ningún fixture_id");
  assert.equal(recentHomeSignal.valid, true, "16 observaciones de liga siguen siendo >= el mínimo de 8, la señal sigue siendo válida");
  assert.equal(recentHomeSignal.direction, "high", "4.5 (home) frente a 2 (liga sin esos 4 fixtures) debe leerse como high");
});

// ===========================================================================
// 14-15. coherence_ratio no evaluable (cards) => coherent:null y radar_score
// renormalizado; coherence_ratio evaluable => comportamiento sin cambios
// ===========================================================================

function clampTest(value, minimum = 0, maximum = 100) { return Math.max(minimum, Math.min(maximum, value)); }
function roundTest(value, decimals = 1) { return Number(Number(value).toFixed(decimals)); }
// Reconstruye convergence_ratio a partir de campos expuestos por el radar
// (nunca reimplementa decideDirection): total = señales votantes válidas,
// sin asumir cuántas de las 4 perspectivas terminaron en cada lado.
function observedConvergenceRatio(radar) {
  const validNeutralCount = radar.neutral_signals.filter((s) => s.voting && s.valid).length;
  const total = radar.supporting_signals.length + radar.opposing_signals.length + validNeutralCount;
  return total > 0 ? radar.supporting_signals.length / total : 0;
}

test("14. cards (sin modelo de componentes) reporta model_coherence.coherent=null y renormaliza radar_score excluyendo coherencia (ni 0 ni 100)", () => {
  const LEAGUE_CARDS = Array.from({ length: 20 }, () => 4);
  const TEAM_CARDS_10 = Array.from({ length: 10 }, () => 6);
  const homeRecent = recentPair("home", TEAM_CARDS_10);
  const awayRecent = recentPair("away", TEAM_CARDS_10);
  const leagueProfile = { quality_status: "verified", event_samples: { cards: eventSample(taggedObs("league", LEAGUE_CARDS)) } };
  const homeTeamProfile = {
    quality_status: "verified",
    last_5: { event_samples: { cards: eventSample(homeRecent.last5) } },
    last_10: { event_samples: { cards: eventSample(homeRecent.last10) } },
    as_home: { event_samples: { cards: { ...eventSample(taggedObs("homerole", TEAM_CARDS_10)), for: [3], conceded: [3] } } },
    as_away: { event_samples: { cards: eventSample([]) } },
  };
  const awayTeamProfile = {
    quality_status: "verified",
    last_5: { event_samples: { cards: eventSample(awayRecent.last5) } },
    last_10: { event_samples: { cards: eventSample(awayRecent.last10) } },
    as_away: { event_samples: { cards: { ...eventSample(taggedObs("awayrole", TEAM_CARDS_10)), for: [3], conceded: [3] } } },
    as_home: { event_samples: { cards: eventSample([]) } },
  };
  const refereeProfile = { status: "confirmed", quality_status: "verified", event_samples: { cards: eventSample(Array.from({ length: 10 }, (_, i) => ({ fixture_id: `ref-${i}`, value: 4 }))) } };

  const generatedLines = generateCandidateLines({ marketFamily: "cards", leagueProfile, homeTeamProfile, awayTeamProfile, refereeProfile });
  const audit = generatedLines.candidates[0].market_model_audit;
  assert.equal(audit.coherence_ratio, null, "precondición: cards no soporta el modelo de componentes (marketComponentAdapter.js)");

  const radar = buildMarketOpportunityRadar({ generatedLines });

  assert.equal(radar.model_coherence.coherent, null);
  assert.equal(radar.model_coherence.coherence_ratio, null);

  const convergenceRatio = observedConvergenceRatio(radar);
  const directionalAgreement = radar.radar_direction === "neutral" ? 0 : clampTest(convergenceRatio * 100);
  const uniqueFixtureSupport = roundTest(clampTest((radar.unique_fixture_count / RADAR_THRESHOLDS.UNIQUE_FIXTURE_REFERENCE) * 100));
  const stability = roundTest(clampTest(100 - (generatedLines.distribution.dispersion / RADAR_THRESHOLDS.STABILITY_REFERENCE) * 100));
  const activeWeightTotal =
    RADAR_SCORE_WEIGHTS.directional_agreement +
    RADAR_SCORE_WEIGHTS.sample_quality +
    RADAR_SCORE_WEIGHTS.unique_fixture_support +
    RADAR_SCORE_WEIGHTS.stability;
  assert.equal(roundTest(activeWeightTotal, 2), 0.85, "sin coherencia, la suma de pesos activos debe ser 0.85");
  const weightedSumWithoutCoherence =
    directionalAgreement * RADAR_SCORE_WEIGHTS.directional_agreement +
    radar.sample_quality * RADAR_SCORE_WEIGHTS.sample_quality +
    uniqueFixtureSupport * RADAR_SCORE_WEIGHTS.unique_fixture_support +
    stability * RADAR_SCORE_WEIGHTS.stability;
  const expected = roundTest(clampTest(weightedSumWithoutCoherence / activeWeightTotal));
  assert.equal(radar.radar_score, expected, "radar_score debe ser exactamente la renormalización sin coherencia, ni 0 ni 100 tratados como su valor");
});

test("15. cuando coherence_ratio es evaluable, las 5 dimensiones permanecen activas y radar_score conserva exactamente la fórmula anterior", () => {
  const profiles = buildRadarProfiles({
    leagueValues: LEAGUE_LOW,
    homeRecentValues10: TEAM_HIGH_10,
    awayRecentValues10: TEAM_HIGH_10,
    homeRoleValues: TEAM_HIGH_10,
    awayRoleValues: TEAM_HIGH_10,
    ...COHERENT_HIGH,
  });
  const generatedLines = generatedLinesFor(profiles);
  const audit = generatedLines.candidates[0].market_model_audit;
  assert.ok(Number.isFinite(audit.coherence_ratio), "precondición: goals sí soporta el modelo de componentes");

  const radar = buildMarketOpportunityRadar({ generatedLines });
  assert.equal(radar.model_coherence.coherent, true);
  assert.ok(Number.isFinite(radar.model_coherence.coherence_ratio));

  const convergenceRatio = observedConvergenceRatio(radar);
  const directionalAgreement = radar.radar_direction === "neutral" ? 0 : clampTest(convergenceRatio * 100);
  const uniqueFixtureSupport = roundTest(clampTest((radar.unique_fixture_count / RADAR_THRESHOLDS.UNIQUE_FIXTURE_REFERENCE) * 100));
  const stability = roundTest(clampTest(100 - (generatedLines.distribution.dispersion / RADAR_THRESHOLDS.STABILITY_REFERENCE) * 100));
  const coherenceScore = audit.model_coherence_warning ? 40 : roundTest(clampTest(100 - audit.coherence_ratio * 60));

  const activeWeightTotal =
    RADAR_SCORE_WEIGHTS.directional_agreement +
    RADAR_SCORE_WEIGHTS.sample_quality +
    RADAR_SCORE_WEIGHTS.unique_fixture_support +
    RADAR_SCORE_WEIGHTS.stability +
    RADAR_SCORE_WEIGHTS.coherence;
  assert.equal(roundTest(activeWeightTotal, 2), 1, "con coherencia evaluable, las 5 dimensiones deben sumar peso 1");

  const weightedSum =
    directionalAgreement * RADAR_SCORE_WEIGHTS.directional_agreement +
    radar.sample_quality * RADAR_SCORE_WEIGHTS.sample_quality +
    uniqueFixtureSupport * RADAR_SCORE_WEIGHTS.unique_fixture_support +
    stability * RADAR_SCORE_WEIGHTS.stability +
    coherenceScore * RADAR_SCORE_WEIGHTS.coherence;
  const expectedRadarScore = roundTest(clampTest(weightedSum / activeWeightTotal));
  assert.equal(radar.radar_score, expectedRadarScore, "con las 5 dimensiones activas, radar_score debe coincidir exactamente con la fórmula anterior (sin renormalizar)");
});
