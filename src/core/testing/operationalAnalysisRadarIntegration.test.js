import assert from "node:assert/strict";
import test from "node:test";

import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { analyzeOperationalFixture } from "../services/operationalAnalysisService.js";
import { buildRankedMarketSelection } from "../intelligence/marketCandidateRanker.js";
import { mapGeminiImpacts } from "../intelligence/geminiImpactMapper.js";

// ---------------------------------------------------------------------------
// Gateway de integración Fase 3B: a diferencia de otros gateways de prueba de
// este repo (que reutilizan la MISMA lista de fixtures para liga y para
// ambos equipos), aquí liga/local/visitante usan RANGOS DE fixture_id
// DISJUNTOS a propósito. Con fixture_id compartidos entre liga y equipo, la
// exclusión leave-one-out del Radar (Fase 3A) dejaría la referencia de liga
// sin muestra y todas las señales quedarían inválidas: no se podría
// controlar HIGH/LOW/NEUTRAL de extremo a extremo. Esto no es un ajuste al
// motor: es un dato de prueba más realista (liga = partidos de OTROS
// equipos, distintos de los fixtures propios de cada plantilla).
// ---------------------------------------------------------------------------

const HOME_TEAM_ID = 10;
const AWAY_TEAM_ID = 20;

function finishedFixture({ id, homeId, awayId, homeGoals, awayGoals, dayOffset }) {
  return {
    fixtureId: id,
    competition: { id: 239, name: "Primera A", country: "Colombia", season: 2026 },
    date: { utc: `2026-07-${String((dayOffset % 27) + 1).padStart(2, "0")}T20:00:00.000Z` },
    status: { isScheduled: false, isFinished: true, long: "Finalizado" },
    teams: { home: { id: homeId, name: `Equipo ${homeId}` }, away: { id: awayId, name: `Equipo ${awayId}` } },
    score: { goals: { home: homeGoals, away: awayGoals }, aggregate: null },
    referee: { name: "Ana Ruiz", confirmed: true },
    venue: { name: "Estadio Central", city: "Bogotá" },
  };
}

function targetFixture(id) {
  return {
    fixtureId: id,
    competition: { id: 239, name: "Primera A", country: "Colombia", season: 2026 },
    date: { utc: "2026-08-10T23:00:00.000Z" },
    status: { isScheduled: true, isFinished: false, long: "Programado" },
    teams: { home: { id: HOME_TEAM_ID, name: "Local Betano" }, away: { id: AWAY_TEAM_ID, name: "Visitante Betano" } },
    score: { goals: { home: null, away: null }, aggregate: null },
    referee: { name: "Ana Ruiz", confirmed: true },
    venue: { name: "Estadio Central", city: "Bogotá" },
  };
}

function fixtureStatistics(fixture, { yellowHome = 2, yellowAway = 2 } = {}) {
  return {
    teams: [
      { team: fixture.teams.home, statistics: { total_shots: { value: 12 }, shots_on_goal: { value: 5 }, yellow_cards: { value: yellowHome }, red_cards: { value: 0 }, fouls: { value: 12 }, corner_kicks: { value: 5 }, ball_possession: { value: 50 } } },
      { team: fixture.teams.away, statistics: { total_shots: { value: 12 }, shots_on_goal: { value: 5 }, yellow_cards: { value: yellowAway }, red_cards: { value: 0 }, fouls: { value: 12 }, corner_kicks: { value: 5 }, ball_possession: { value: 50 } } },
    ],
  };
}

// pairs: array de { home, away } goles. Liga usa equipos ajenos (800+i /
// 850+i); el equipo local objetivo SIEMPRE juega de local en su propio
// historial, el visitante SIEMPRE juega de visitante en el suyo — así
// home_role/away_role terminan siendo el mismo conjunto que
// recent_home/recent_away (subconjunto físico real, no un artificio).
function buildRadarPipelineGateway({ leaguePairs, homePairs, awayPairs, statsOverride = null }) {
  const leagueFixtures = leaguePairs.map((pair, i) => finishedFixture({ id: 9_000 + i, homeId: 800 + i, awayId: 850 + i, homeGoals: pair.home, awayGoals: pair.away, dayOffset: i }));
  const homeFixtures = homePairs.map((pair, i) => finishedFixture({ id: 9_100 + i, homeId: HOME_TEAM_ID, awayId: 750 + i, homeGoals: pair.home, awayGoals: pair.away, dayOffset: i }));
  const awayFixtures = awayPairs.map((pair, i) => finishedFixture({ id: 9_200 + i, homeId: 700 + i, awayId: AWAY_TEAM_ID, homeGoals: pair.home, awayGoals: pair.away, dayOffset: i }));
  const allHistorical = [...leagueFixtures, ...homeFixtures, ...awayFixtures];
  const statsById = new Map(allHistorical.map((fixture) => [fixture.fixtureId, (statsOverride ? statsOverride(fixture) : fixtureStatistics(fixture))]));
  return {
    runtime: { snapshot: () => ({ requestsUsed: 5, cacheHits: 0, cacheMisses: 5, deduplicated: 0, configuredBudget: 2500, configuredBudgetRemaining: 2495, budgetExhausted: false, quotaStatus: "available" }) },
    loadCompetitionMetadata: async () => ({
      status: DATA_LOAD_STATUS.SUCCESS,
      seasonMetadata: { year: 2026, coverage: { odds: true, fixtures: { statistics_fixtures: true, lineups: false }, injuries: false, standings: false } },
      availableSeasons: [2026],
      verificationStatus: "verified",
    }),
    loadFixtureById: async ({ fixtureId }) => ({ status: DATA_LOAD_STATUS.SUCCESS, selectedFixtureId: fixtureId, fixture: targetFixture(fixtureId) }),
    loadLeagueWindow: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: leagueFixtures }),
    loadTeamRecent: async ({ teamId }) => ({
      status: DATA_LOAD_STATUS.SUCCESS,
      fixtures: Number(teamId) === HOME_TEAM_ID ? homeFixtures : Number(teamId) === AWAY_TEAM_ID ? awayFixtures : [],
    }),
    loadFixtureStatistics: async (fixtureId) => {
      const fixture = allHistorical.find((item) => item.fixtureId === fixtureId);
      return { status: DATA_LOAD_STATUS.SUCCESS, fixtureId, statistics: fixture ? statsById.get(fixtureId) : fixtureStatistics(targetFixture(fixtureId)) };
    },
    loadFixturesForDate: async () => ({ status: DATA_LOAD_STATUS.EMPTY, fixtures: [], message: "ok" }),
    loadFixtureOdds: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, response: [] }),
  };
}

const LOW_20 = Array.from({ length: 20 }, () => ({ home: 1, away: 1 })); // total 2 por partido
const HIGH_20 = Array.from({ length: 20 }, () => ({ home: 3, away: 2 })); // total 5 por partido
const HIGH_10 = Array.from({ length: 10 }, () => ({ home: 3, away: 2 })); // total 5 por partido
const LOW_10 = Array.from({ length: 10 }, () => ({ home: 0, away: 1 })); // total 1 por partido

const NOW = "2026-08-01T12:00:00.000Z";
const goalsInput = (overrides = {}) => ({
  date: "2026-08-01",
  timezone: "America/Bogota",
  competitionKey: "colombiaPrimeraA",
  season: 2026,
  fixtureId: 9_300,
  marketId: "goals",
  analysisMode: "specific",
  line: null,
  selection: null,
  manualCandidateOdds: [],
  manualOdds: null,
  ...overrides,
});

// ===========================================================================
// A. Radar se ejecuta dentro del pipeline operativo
// ===========================================================================

test("A. el Radar corre dentro de analyzeOperationalFixture: marketOpportunityRadar y primaryMarketOpportunityRadar quedan presentes", async () => {
  const gateway = buildRadarPipelineGateway({ leaguePairs: LOW_20, homePairs: HIGH_10, awayPairs: HIGH_10 });
  const result = await analyzeOperationalFixture(goalsInput(), gateway, { now: () => NOW, idFactory: () => "a" });
  assert.equal(result.status, DATA_LOAD_STATUS.SUCCESS);
  assert.ok(Array.isArray(result.marketOpportunityRadar));
  assert.ok(result.marketOpportunityRadar.length > 0);
  assert.equal(result.marketOpportunityRadar[0].contract, "MarketOpportunityRadar");
  assert.ok(result.primaryMarketOpportunityRadar, "debe existir el radar de la familia primaria (goals)");
  assert.equal(result.primaryMarketOpportunityRadar.market_family, "goals");
});

// ===========================================================================
// B/C. HIGH y LOW válidos pueden avanzar con contexto Radar
// ===========================================================================

test("B. convergencia HIGH real avanza como oportunidad, con marketSelection.primary anotado con radar_context", async () => {
  const gateway = buildRadarPipelineGateway({ leaguePairs: LOW_20, homePairs: HIGH_10, awayPairs: HIGH_10 });
  const result = await analyzeOperationalFixture(goalsInput(), gateway, { now: () => NOW, idFactory: () => "b" });
  assert.equal(result.primaryMarketOpportunityRadar.radar_direction, "high");
  assert.ok(result.primaryMarketOpportunityRadar.opportunity_detected);
  assert.ok(result.marketSelection.primary, "DecisionFrontier debe seguir eligiendo una línea");
  assert.equal(result.marketSelection.primary.radar_context.radar_direction, "high");
  assert.equal(result.marketSelection.primary.radar_context.opportunity_detected, true);
});

test("C. convergencia LOW real avanza como oportunidad, con marketSelection.primary anotado con radar_context", async () => {
  const gateway = buildRadarPipelineGateway({ leaguePairs: HIGH_20, homePairs: LOW_10, awayPairs: LOW_10 });
  const result = await analyzeOperationalFixture(goalsInput(), gateway, { now: () => NOW, idFactory: () => "c" });
  assert.equal(result.primaryMarketOpportunityRadar.radar_direction, "low");
  assert.ok(result.primaryMarketOpportunityRadar.opportunity_detected);
  assert.ok(result.marketSelection.primary);
  assert.equal(result.marketSelection.primary.radar_context.radar_direction, "low");
});

// ===========================================================================
// D. NEUTRAL no se convierte artificialmente en oportunidad
// ===========================================================================

test("D. señales divididas (home alto, away bajo) quedan NEUTRAL y opportunity_detected=false, sin ocultar el candidato del catálogo", async () => {
  const gateway = buildRadarPipelineGateway({ leaguePairs: LOW_20, homePairs: HIGH_10, awayPairs: LOW_10 });
  const result = await analyzeOperationalFixture(goalsInput(), gateway, { now: () => NOW, idFactory: () => "d" });
  assert.equal(result.primaryMarketOpportunityRadar.radar_direction, "neutral");
  assert.equal(result.primaryMarketOpportunityRadar.opportunity_detected, false);
  // El catálogo NO se vacía silenciosamente por ser neutral: se comprueban
  // ambos campos del contrato (ranked_candidates y catalog_candidates), no
  // solo uno.
  assert.ok(result.marketSelection.ranked_candidates.length > 0);
  assert.ok(result.marketSelection.catalog_candidates.length > 0);
  assert.ok(result.marketSelection.primary, "DecisionFrontier sigue pudiendo elegir una línea aunque el radar sea neutral");
});

// ===========================================================================
// E. adversarial failure bloquea la oportunidad (sin ocultar el candidato)
// ===========================================================================

test("E. una convergencia HIGH con evidencia Gemini compatible y contraria queda bloqueada por el adversarial, sin eliminar el candidato del catálogo", async () => {
  const gateway = buildRadarPipelineGateway({ leaguePairs: LOW_20, homePairs: HIGH_10, awayPairs: HIGH_10 });
  const geminiContext = {
    valid_for_reanalysis: true,
    items: [{ id: "g1", kind: "fact", impact: "unfavorable", text: "Delantero titular ausente por lesion", selected: true }],
    selected_items: [{ id: "g1", kind: "fact", impact: "unfavorable", text: "Delantero titular ausente por lesion", selected: true }],
  };
  const result = await analyzeOperationalFixture(
    goalsInput({ geminiContext, selectedGeminiItemIds: ["g1"] }),
    gateway,
    { now: () => NOW, idFactory: () => "e" }
  );
  assert.equal(result.primaryMarketOpportunityRadar.radar_direction, "high");
  assert.equal(result.primaryMarketOpportunityRadar.adversarial_passed, false);
  assert.equal(result.primaryMarketOpportunityRadar.opportunity_detected, false);
  assert.ok(result.primaryMarketOpportunityRadar.critical_contradictions.some((item) => item.startsWith("gemini_contrario")));
  // El candidato sigue disponible en AMBOS campos del catálogo, no solo en
  // primary — el bloqueo adversarial es una anotación, nunca una remoción.
  assert.ok(result.marketSelection.primary, "el candidato sigue disponible pese al bloqueo adversarial");
  assert.ok(result.marketSelection.ranked_candidates.length > 0);
  assert.ok(result.marketSelection.catalog_candidates.length > 0);
  assert.ok(result.marketSelection.catalog_candidates.some((candidate) => candidate.candidate_id === result.marketSelection.primary.candidate_id));
});

// ===========================================================================
// F. evidencia de shots_on_goal no contamina corners
// ===========================================================================

test("F. evidencia Gemini mapeada realmente a shots_on_goal (nunca a corners) no contamina el Radar de corners", async () => {
  const gateway = buildRadarPipelineGateway({
    leaguePairs: Array.from({ length: 20 }, () => ({ home: 1, away: 1 })),
    homePairs: Array.from({ length: 10 }, () => ({ home: 3, away: 2 })),
    awayPairs: Array.from({ length: 10 }, () => ({ home: 3, away: 2 })),
    statsOverride: (fixture) => ({
      teams: [
        { team: fixture.teams.home, statistics: { total_shots: { value: 12 }, shots_on_goal: { value: 5 }, yellow_cards: { value: 2 }, red_cards: { value: 0 }, fouls: { value: 12 }, corner_kicks: { value: 8 }, ball_possession: { value: 50 } } },
        { team: fixture.teams.away, statistics: { total_shots: { value: 12 }, shots_on_goal: { value: 5 }, yellow_cards: { value: 2 }, red_cards: { value: 0 }, fouls: { value: 12 }, corner_kicks: { value: 8 }, ball_possession: { value: 50 } } },
      ],
    }),
  });

  // Precondición explícita, contra el mecanismo real de gating (no una
  // inferencia sobre el texto): se revisan TODOS los impacts generados para
  // el ítem g1 (mapGeminiImpacts puede producir varios por ítem), no solo
  // uno — así queda demostrado que NINGUNO de ellos afecta corners, y que
  // al menos uno sí afecta shots_on_goal.
  const evidenceText = "Delantero titular ausente por lesion";
  const impacts = mapGeminiImpacts([{ id: "g1", kind: "fact", text: evidenceText }]);
  const sourceImpacts = impacts.filter((impact) => impact.source_item_id === "g1");
  assert.ok(
    sourceImpacts.some((impact) => impact.affected_markets?.includes("shots_on_goal")),
    "precondición: g1 debe afectar shots_on_goal"
  );
  assert.ok(
    sourceImpacts.every((impact) => !impact.affected_markets?.includes("corners")),
    "precondición: ningún impacto de g1 puede afectar corners"
  );

  const geminiContext = {
    valid_for_reanalysis: true,
    items: [{ id: "g1", kind: "fact", impact: "unfavorable", text: evidenceText, selected: true }],
    selected_items: [{ id: "g1", kind: "fact", impact: "unfavorable", text: evidenceText, selected: true }],
  };

  const resultWithGemini = await analyzeOperationalFixture(
    goalsInput({ marketId: "corners", geminiContext, selectedGeminiItemIds: ["g1"] }),
    gateway,
    { now: () => NOW, idFactory: () => "f-with" }
  );
  const resultWithoutGemini = await analyzeOperationalFixture(
    goalsInput({ marketId: "corners" }),
    gateway,
    { now: () => NOW, idFactory: () => "f-without" }
  );

  const cornersRadarWith = resultWithGemini.marketOpportunityRadar.find((radar) => radar.market_family === "corners");
  const cornersRadarWithout = resultWithoutGemini.marketOpportunityRadar.find((radar) => radar.market_family === "corners");
  assert.ok(cornersRadarWith);
  assert.ok(cornersRadarWithout);
  assert.equal(cornersRadarWith.radar_direction, cornersRadarWithout.radar_direction);
  assert.equal(cornersRadarWith.adversarial_passed, cornersRadarWithout.adversarial_passed);
  assert.equal(cornersRadarWith.opportunity_detected, cornersRadarWithout.opportunity_detected);
  assert.deepEqual(cornersRadarWith.critical_contradictions, cornersRadarWithout.critical_contradictions);
  assert.ok(
    !cornersRadarWith.critical_contradictions.some((item) => item.includes("shots_on_goal") || item.startsWith("gemini_contrario")),
    "la evidencia de shots_on_goal no debe aparecer como contradicción/evidencia aplicada a corners"
  );
});

// ===========================================================================
// G. attachRadarContext no altera estimated_probability/sports_score/línea
// ===========================================================================

test("G. la anotación del Radar no cambia estimated_probability, sports_score, probability_classification ni la línea elegida por DecisionFrontier", async () => {
  const gateway = buildRadarPipelineGateway({ leaguePairs: LOW_20, homePairs: HIGH_10, awayPairs: HIGH_10 });
  const result = await analyzeOperationalFixture(goalsInput(), gateway, { now: () => NOW, idFactory: () => "g" });

  // Referencia independiente: llamar a buildRankedMarketSelection directamente
  // con los mismos datos deportivos base que analyzeOperationalFixture ya
  // calculó (result.marketAssessments/leagueProfile/homeTeamProfile/
  // awayTeamProfile), SIN pasar por el Radar en absoluto.
  const reference = buildRankedMarketSelection({
    analysisMode: "specific",
    requestedMarketId: "goals",
    marketAssessments: result.marketAssessments,
    leagueProfile: result.leagueProfile,
    homeTeamProfile: result.homeTeamProfile,
    awayTeamProfile: result.awayTeamProfile,
    refereeProfile: result.refereeProfile,
    contextItems: [],
    contextImpacts: [],
  });

  assert.ok(result.marketSelection.primary.radar_context, "el resultado del pipeline SÍ debe llevar radar_context");
  assert.equal(result.marketSelection.primary.candidate_id, reference.primary.candidate_id);
  assert.equal(result.marketSelection.primary.estimated_probability, reference.primary.estimated_probability);
  assert.equal(result.marketSelection.primary.sports_score, reference.primary.sports_score);
  assert.equal(result.marketSelection.primary.probability_classification, reference.primary.probability_classification);
  assert.equal(result.marketSelection.primary.line, reference.primary.line);
  assert.equal(result.marketSelection.primary.direction, reference.primary.direction);
  assert.equal(result.director.line, reference.primary.line);
  assert.equal(result.director.selection, reference.primary.selection);
});

// ===========================================================================
// H. análisis de un fixture no comparte estado con otro
// ===========================================================================

test("H. dos análisis con datos distintos no comparten estado del Radar entre sí", async () => {
  const gatewayHigh = buildRadarPipelineGateway({ leaguePairs: LOW_20, homePairs: HIGH_10, awayPairs: HIGH_10 });
  const gatewayLow = buildRadarPipelineGateway({ leaguePairs: HIGH_20, homePairs: LOW_10, awayPairs: LOW_10 });
  const resultA1 = await analyzeOperationalFixture(goalsInput(), gatewayHigh, { now: () => NOW, idFactory: () => "h-a1" });
  const resultB = await analyzeOperationalFixture(goalsInput({ fixtureId: 9_301 }), gatewayLow, { now: () => NOW, idFactory: () => "h-b" });
  const resultA2 = await analyzeOperationalFixture(goalsInput(), gatewayHigh, { now: () => NOW, idFactory: () => "h-a2" });
  assert.equal(resultA1.primaryMarketOpportunityRadar.radar_direction, "high");
  assert.equal(resultB.primaryMarketOpportunityRadar.radar_direction, "low");
  assert.equal(resultA2.primaryMarketOpportunityRadar.radar_direction, "high");
  assert.equal(resultA1.primaryMarketOpportunityRadar.radar_score, resultA2.primaryMarketOpportunityRadar.radar_score, "calcular B en medio no debe alterar el resultado de A");
});

// ===========================================================================
// I. odds presentes o ausentes no cambian el resultado del Radar
// ===========================================================================

test("I. una cuota manual presente no cambia radar_direction/radar_score/adversarial_passed frente a no tener ninguna cuota", async () => {
  const gateway = buildRadarPipelineGateway({ leaguePairs: LOW_20, homePairs: HIGH_10, awayPairs: HIGH_10 });
  const withoutOdds = await analyzeOperationalFixture(goalsInput(), gateway, { now: () => NOW, idFactory: () => "i-without" });
  const withOdds = await analyzeOperationalFixture(
    goalsInput({
      manualOdds: {
        marketFamily: "goals",
        bookmaker: "Betano",
        direction: withoutOdds.marketSelection.primary.direction,
        selection: withoutOdds.marketSelection.primary.selection,
        line: String(withoutOdds.marketSelection.primary.line),
        decimalOdds: "1.75",
        consultedAt: NOW,
        timezone: "America/Bogota",
      },
    }),
    gateway,
    { now: () => NOW, idFactory: () => "i-with" }
  );
  assert.notEqual(withOdds.director.price_assessment.status, "unavailable", "precondición: la cuota manual sí se evaluó");
  assert.equal(withOdds.primaryMarketOpportunityRadar.radar_direction, withoutOdds.primaryMarketOpportunityRadar.radar_direction);
  assert.equal(withOdds.primaryMarketOpportunityRadar.radar_score, withoutOdds.primaryMarketOpportunityRadar.radar_score);
  assert.equal(withOdds.primaryMarketOpportunityRadar.adversarial_passed, withoutOdds.primaryMarketOpportunityRadar.adversarial_passed);
  assert.equal(withOdds.primaryMarketOpportunityRadar.opportunity_detected, withoutOdds.primaryMarketOpportunityRadar.opportunity_detected);
});

// ===========================================================================
// J. cards con coherence_ratio null siguen representándose como coherencia
// desconocida (no perfecta), dentro del pipeline completo
// ===========================================================================

test("J. cards en el pipeline completo reporta model_coherence.coherent=null (no true) para la familia primaria", async () => {
  const gateway = buildRadarPipelineGateway({
    leaguePairs: LOW_20,
    homePairs: HIGH_10,
    awayPairs: HIGH_10,
    statsOverride: (fixture) => fixtureStatistics(fixture, { yellowHome: 3, yellowAway: 3 }),
  });
  const result = await analyzeOperationalFixture(
    goalsInput({ marketId: "cards" }),
    gateway,
    { now: () => NOW, idFactory: () => "j" }
  );
  const cardsRadar = result.marketOpportunityRadar.find((radar) => radar.market_family === "cards");
  assert.ok(cardsRadar, "debe existir un radar para la familia cards");
  assert.equal(cardsRadar.model_coherence.coherent, null, "cards no soporta el modelo de componentes: coherencia desconocida, no perfecta");
  assert.equal(cardsRadar.model_coherence.coherence_ratio, null);
});
