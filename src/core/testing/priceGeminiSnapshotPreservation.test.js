import test from "node:test";
import assert from "node:assert/strict";

import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { analyzeOperationalFixture, resolveManualExactSelection } from "../services/operationalAnalysisService.js";
import { parseGeminiResponse } from "../intelligence/geminiManualContext.js";

// Bug real de producción (Tigre vs Barracas Central, corners/over/7.5): el
// fix anterior (priceGeminiOrderIndependence) evita que se descarte Gemini
// en silencio, pero forzó el camino de reanálisis completo cada vez que
// Gemini difiere de previousVersion. Ese reanálisis completo VUELVE A
// CALCULAR la línea exacta desde cero (resolveManualExactSelection ->
// evaluateExactMarketLine); si esa segunda reconstrucción no logra
// calcularla (insufficient_underlying_market_data), el snapshot deportivo
// válido que YA existía (transferido desde Jornada o de un análisis previo)
// se perdía por completo: estimated_probability/sports_score quedaban null,
// "Línea exacta no disponible", precio nunca se evaluaba y DirectorAtlas se
// quedaba en ESPERAR. Este archivo fija la corrección: un snapshot deportivo
// previo para la MISMA identidad exacta (fixture_id+market_family+direction+
// line) se preserva íntegro cuando el reanálisis no logra recalcularla.
const NOW = "2026-08-01T12:00:00.000Z";
const FIXTURE_ID = 93_100;

function previousSnapshotVersion(overrides = {}) {
  return {
    analysis_id: "prev-tigre-barracas",
    fixture_id: FIXTURE_ID,
    phase: "day_before",
    line_origin: "transferred_candidate",
    gemini_context: null,
    analysis_confidence: { analysis_confidence_score: 88, confidence_label: "alta" },
    evidence: [],
    odds: [],
    active_quote: null,
    preliminary_probability: {
      point_estimate: 0.693,
      probability_status: "preliminary",
      uncertainty_low: 0.58,
      uncertainty_high: 0.79,
      sample_size_effective: 22,
      limitations: [],
      inputs_used: [{ source: "league", observed_rate: 0.6 }],
      methodology_version: "distribution-v1",
    },
    director: {
      market_evaluated: { family: "corners", label: "Córners" },
      selection: "Más de 7.5",
      line: 7.5,
      fixture: {
        fixture_id: FIXTURE_ID, home_team: "Tigre", away_team: "Barracas Central",
        kickoff_utc: "2026-08-10T20:00:00.000Z", kickoff_local: null, timezone: "America/Argentina/Buenos_Aires",
        local_calendar_date: "2026-08-10", competition: "Torneo Clausura", season: 2026,
      },
      sports_verdict: { direction: "over", selection: "Más de 7.5", sports_score: 90.7, technical_support_score: 88 },
      side_comparison: null,
      reasons: [], risks: [], missing_data: [],
    },
    ...overrides,
  };
}

test("1. resolveManualExactSelection preserva el snapshot previo cuando el reanálisis no logra recalcular la misma línea exacta", () => {
  const previousVersion = previousSnapshotVersion();
  const result = resolveManualExactSelection({
    marketSelection: { ranked_candidates: [], catalog_candidates: [], generated: [] },
    marketFamily: "corners",
    requestedLine: 7.5,
    requestedSelection: "over",
    lineOrigin: "transferred_candidate",
    // Sin perfiles reales: evaluateExactMarketLine no puede recalcular nada,
    // reproduciendo exactamente insufficient_underlying_market_data.
    leagueProfile: null, homeTeamProfile: null, awayTeamProfile: null, refereeProfile: null,
    contextItems: [], contextImpacts: [],
    previousVersion, fixtureId: FIXTURE_ID,
  });

  assert.equal(result.exact_requested_line_unavailable, false, "no debe mostrarse 'línea exacta no disponible' si ya había un snapshot válido");
  assert.equal(result.ready_for_pricing, true);
  assert.equal(result.preserved_from_previous_snapshot, true);
  assert.equal(result.primary.market_family, "corners");
  assert.equal(result.primary.direction, "over");
  assert.equal(result.primary.line, 7.5);
  assert.equal(result.primary.estimated_probability, 0.693);
  assert.equal(result.primary.probability_percent, 69.3);
  assert.equal(result.primary.sports_score, 90.7);
  assert.equal(result.primary.technical_support_score, 88);
});

test("2. sin snapshot previo compatible, sigue mostrando línea exacta no disponible (comportamiento original intacto)", () => {
  const result = resolveManualExactSelection({
    marketSelection: { ranked_candidates: [], catalog_candidates: [], generated: [] },
    marketFamily: "corners", requestedLine: 7.5, requestedSelection: "over", lineOrigin: "user_selected",
    leagueProfile: null, homeTeamProfile: null, awayTeamProfile: null, refereeProfile: null,
    contextItems: [], contextImpacts: [],
    previousVersion: null, fixtureId: FIXTURE_ID,
  });
  assert.equal(result.exact_requested_line_unavailable, true);
  assert.equal(result.primary, null);
  assert.equal(result.preserved_from_previous_snapshot, undefined);
});

test("3. identidad cambia de línea (7.5 -> 8.5): NO reutiliza el snapshot de 7.5", () => {
  const previousVersion = previousSnapshotVersion();
  const result = resolveManualExactSelection({
    marketSelection: { ranked_candidates: [], catalog_candidates: [], generated: [] },
    marketFamily: "corners", requestedLine: 8.5, requestedSelection: "over", lineOrigin: "user_selected",
    leagueProfile: null, homeTeamProfile: null, awayTeamProfile: null, refereeProfile: null,
    contextItems: [], contextImpacts: [],
    previousVersion, fixtureId: FIXTURE_ID,
  });
  assert.equal(result.exact_requested_line_unavailable, true, "una línea distinta nunca hereda la probabilidad de otra línea");
  assert.equal(result.primary, null);
});

test("4. identidad cambia de dirección (over -> under): NO reutiliza el snapshot de over", () => {
  const previousVersion = previousSnapshotVersion();
  const result = resolveManualExactSelection({
    marketSelection: { ranked_candidates: [], catalog_candidates: [], generated: [] },
    marketFamily: "corners", requestedLine: 7.5, requestedSelection: "under", lineOrigin: "user_selected",
    leagueProfile: null, homeTeamProfile: null, awayTeamProfile: null, refereeProfile: null,
    contextItems: [], contextImpacts: [],
    previousVersion, fixtureId: FIXTURE_ID,
  });
  assert.equal(result.exact_requested_line_unavailable, true);
  assert.equal(result.primary, null);
});

test("5. identidad cambia de familia (corners -> total_shots): NO reutiliza el snapshot de corners", () => {
  const previousVersion = previousSnapshotVersion();
  const result = resolveManualExactSelection({
    marketSelection: { ranked_candidates: [], catalog_candidates: [], generated: [] },
    marketFamily: "total_shots", requestedLine: 7.5, requestedSelection: "over", lineOrigin: "user_selected",
    leagueProfile: null, homeTeamProfile: null, awayTeamProfile: null, refereeProfile: null,
    contextItems: [], contextImpacts: [],
    previousVersion, fixtureId: FIXTURE_ID,
  });
  assert.equal(result.exact_requested_line_unavailable, true);
  assert.equal(result.primary, null);
});

test("6. previousVersion de otro fixture: NO se reutiliza aunque family/direction/line coincidan", () => {
  const previousVersion = previousSnapshotVersion({ fixture_id: FIXTURE_ID + 1 });
  const result = resolveManualExactSelection({
    marketSelection: { ranked_candidates: [], catalog_candidates: [], generated: [] },
    marketFamily: "corners", requestedLine: 7.5, requestedSelection: "over", lineOrigin: "user_selected",
    leagueProfile: null, homeTeamProfile: null, awayTeamProfile: null, refereeProfile: null,
    contextItems: [], contextImpacts: [],
    previousVersion, fixtureId: FIXTURE_ID,
  });
  assert.equal(result.exact_requested_line_unavailable, true);
  assert.equal(result.primary, null);
});

function targetFixture(id) {
  return {
    fixtureId: id,
    competition: { id: 155, name: "Torneo Clausura", country: "Argentina", season: 2026 },
    date: { utc: "2026-08-10T20:00:00.000Z" },
    status: { isScheduled: true, isFinished: false, long: "Programado" },
    teams: { home: { id: 10, name: "Tigre" }, away: { id: 20, name: "Barracas Central" } },
    score: { goals: { home: null, away: null }, aggregate: null },
    referee: { name: "Facundo Tello", confirmed: true },
    venue: { name: "José Dellagiovanna", city: "Victoria" },
  };
}

function sparseGateway() {
  return {
    runtime: { snapshot: () => ({ requestsUsed: 3, cacheHits: 0, cacheMisses: 3, deduplicated: 0, configuredBudget: 45, configuredBudgetRemaining: 42, budgetExhausted: false, quotaStatus: "available" }) },
    loadCompetitionMetadata: async () => ({
      status: DATA_LOAD_STATUS.SUCCESS,
      seasonMetadata: { year: 2026, coverage: { odds: true, fixtures: { statistics_fixtures: true, lineups: false }, injuries: false, standings: false } },
      availableSeasons: [2026], verificationStatus: "verified",
    }),
    loadFixtureById: async ({ fixtureId }) => ({ status: DATA_LOAD_STATUS.SUCCESS, selectedFixtureId: fixtureId, fixture: targetFixture(fixtureId) }),
    // Sin histórico: ni la liga ni los equipos tienen muestra suficiente,
    // así que evaluateExactMarketLine no puede recalcular NINGUNA línea
    // exacta en este reanálisis (reproduce insufficient_underlying_market_data).
    loadLeagueWindow: async () => ({ status: DATA_LOAD_STATUS.EMPTY, fixtures: [] }),
    loadTeamRecent: async () => ({ status: DATA_LOAD_STATUS.EMPTY, fixtures: [] }),
    loadFixtureStatistics: async () => ({ status: DATA_LOAD_STATUS.EMPTY, statistics: null }),
    loadFixturesForDate: async () => ({ status: DATA_LOAD_STATUS.EMPTY, fixtures: [], message: "Sin partidos" }),
    loadFixtureOdds: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, response: [] }),
  };
}

test("7. reanálisis completo (Gemini nuevo) con datos insuficientes para recalcular: DirectorAtlas conserva probabilidad/Solidez y evalúa la cuota", async () => {
  const previousVersion = previousSnapshotVersion();
  const geminiContext = parseGeminiResponse(
    "HECHOS CONFIRMADOS\n- Facundo Tello es el árbitro designado para el partido https://barracascentral.com/nota 2026-08-30",
    { fixture: { fixtureId: FIXTURE_ID, teams: targetFixture(FIXTURE_ID).teams, date: targetFixture(FIXTURE_ID).date } }
  );
  assert.equal(geminiContext.valid_for_reanalysis, true);

  const result = await analyzeOperationalFixture(
    {
      date: "2026-08-01", timezone: "America/Argentina/Buenos_Aires", competitionKey: "argentinaPrimeraDivision", season: 2026,
      fixtureId: FIXTURE_ID, marketId: "corners", analysisMode: "specific", line: "7.5", selection: "over",
      reanalysis: true, manualCandidateOdds: [],
      manualOdds: { bookmaker: "Betano", marketFamily: "corners", direction: "over", selection: "Más de 7.5", line: "7.5", decimalOdds: "2.25", consultedAt: NOW, timezone: "America/Argentina/Buenos_Aires" },
      evaluatePrice: true, sourceAnalysisId: previousVersion.analysis_id,
      geminiContext, selectedGeminiItemIds: ["gemini-1"],
    },
    sparseGateway(),
    { now: () => NOW, idFactory: () => "tigre-barracas-final", previousVersion }
  );

  assert.equal(result.status, DATA_LOAD_STATUS.SUCCESS);
  assert.ok(result.gemini?.context, "Gemini debe quedar incorporado");
  assert.equal(result.marketSelection.exact_requested_line_unavailable, false, "no debe caer a 'línea exacta no disponible' teniendo un snapshot previo válido");
  assert.equal(result.marketSelection.primary.market_family, "corners");
  assert.equal(result.marketSelection.primary.direction, "over");
  assert.equal(result.marketSelection.primary.line, 7.5);
  assert.equal(result.marketSelection.primary.estimated_probability, 0.693);
  assert.equal(result.marketSelection.primary.probability_percent, 69.3);
  assert.equal(result.marketSelection.primary.sports_score, 90.7);
  assert.notEqual(result.director.price_assessment.status, "unavailable", "la cuota 2.25 debe evaluarse sobre la probabilidad preservada");
  assert.equal(result.director.price_assessment.decimal_odds, 2.25);
  assert.equal(result.director.price_assessment.implied_probability, 0.444444);
});

test("8. si el reanálisis SÍ logra recalcular la línea con datos suficientes, usa el nuevo cálculo y no congela el snapshot viejo", () => {
  // Perfiles reales (misma construcción que manualExactLineEvaluation.test.js)
  // con muestra suficiente para que evaluateExactMarketLine SÍ tenga éxito.
  const cornerSamples = [8, 10, 11, 9, 10, 12, 9, 11, 10, 8];
  const eventSamples = { corners: { match_totals: cornerSamples } };
  const teamProfile = { quality_status: "verified", event_samples: eventSamples, last_5: { event_samples: eventSamples }, last_10: { event_samples: eventSamples }, as_home: { event_samples: eventSamples }, as_away: { event_samples: eventSamples } };
  const previousVersion = previousSnapshotVersion();

  const result = resolveManualExactSelection({
    marketSelection: { ranked_candidates: [], catalog_candidates: [], generated: [] },
    marketFamily: "corners", requestedLine: 7.5, requestedSelection: "over", lineOrigin: "user_selected",
    leagueProfile: { quality_status: "verified", event_samples: eventSamples },
    homeTeamProfile: teamProfile, awayTeamProfile: teamProfile, refereeProfile: null,
    contextItems: [], contextImpacts: [], quotes: [], preferredQuote: null,
    previousVersion, fixtureId: FIXTURE_ID,
  });

  assert.equal(result.exact_requested_line_unavailable, false);
  assert.notEqual(result.preserved_from_previous_snapshot, true, "con datos suficientes, el motor recalcula de nuevo en vez de reutilizar el snapshot congelado");
  assert.notEqual(result.primary?.candidate_id, `snapshot:${previousVersion.analysis_id}`);
  assert.ok(Number.isFinite(result.primary.estimated_probability));
});
