import test from "node:test";
import assert from "node:assert/strict";

import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { parseGeminiResponse } from "../intelligence/geminiManualContext.js";
import { analyzeOperationalFixture } from "../services/operationalAnalysisService.js";

// Bug real de producción: el análisis individual quedaba "esperando
// evaluación de precio" y DirectorAtlas nunca aparecía cuando el usuario
// incorporaba Gemini DESPUÉS de ya haber evaluado una cuota exacta para la
// misma línea. Causa raíz: priceOnlySnapshotResult (el atajo "solo precio"
// que reutiliza el snapshot deportivo ya calculado) siempre tomaba
// gemini_context de previousVersion, ignorando el geminiContext que llegaba
// en la solicitud actual — así que al reenviar la MISMA cuota junto con
// Gemini recién validado, el atajo se activaba de nuevo y descartaba el
// Gemini en silencio. La UI (atlas-functional-client.js) solo muestra
// DirectorResult cuando analysis.gemini.context existe
// (analysisCompleted), así que el resultado final quedaba atascado en
// InitialAnalysisResult para siempre.
const NOW = "2026-08-01T12:00:00.000Z";
const FIXTURE_ID = 92_500;

function targetFixture(id) {
  return {
    fixtureId: id,
    competition: { id: 239, name: "Primera A", country: "Colombia", season: 2026 },
    date: { utc: "2026-08-10T23:00:00.000Z" },
    status: { isScheduled: true, isFinished: false, long: "Programado" },
    teams: { home: { id: 10, name: "Local Betano" }, away: { id: 20, name: "Visitante Betano" } },
    score: { goals: { home: null, away: null }, aggregate: null },
    referee: { name: "Ana Ruiz", confirmed: true },
    venue: { name: "Estadio Central", city: "Bogotá" },
  };
}

function historicalFixture(index) {
  return {
    ...targetFixture(7_500 + index),
    date: { utc: `2026-07-${String(index + 1).padStart(2, "0")}T20:00:00.000Z` },
    status: { isScheduled: false, isFinished: true, long: "Finalizado" },
    score: { goals: { home: (index % 3) + 1, away: index % 2 }, aggregate: null },
  };
}

function fixtureStatistics(fixture) {
  return {
    teams: [fixture.teams.home, fixture.teams.away].map((team) => ({
      team,
      statistics: {
        total_shots: { value: 12 }, shots_on_goal: { value: 5 }, yellow_cards: { value: 2 },
        red_cards: { value: 0 }, fouls: { value: 12 }, corner_kicks: { value: 5 }, ball_possession: { value: 50 },
      },
    })),
  };
}

function gateway() {
  const history = Array.from({ length: 10 }, (_, index) => historicalFixture(index));
  return {
    runtime: { snapshot: () => ({ requestsUsed: 5, cacheHits: 0, cacheMisses: 5, deduplicated: 0, configuredBudget: 45, configuredBudgetRemaining: 40, budgetExhausted: false, quotaStatus: "available" }) },
    loadCompetitionMetadata: async () => ({
      status: DATA_LOAD_STATUS.SUCCESS,
      seasonMetadata: { year: 2026, coverage: { odds: true, fixtures: { statistics_fixtures: true, lineups: false }, injuries: false, standings: false } },
      availableSeasons: [2026], verificationStatus: "verified",
    }),
    loadFixtureById: async ({ fixtureId }) => ({ status: DATA_LOAD_STATUS.SUCCESS, selectedFixtureId: fixtureId, fixture: targetFixture(fixtureId) }),
    loadLeagueWindow: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: history }),
    loadTeamRecent: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: history }),
    loadFixtureStatistics: async (fixtureId) => {
      const item = history.find((candidate) => candidate.fixtureId === fixtureId);
      return { status: DATA_LOAD_STATUS.SUCCESS, fixtureId, statistics: fixtureStatistics(item || history[0]) };
    },
    loadFixturesForDate: async () => ({ status: DATA_LOAD_STATUS.EMPTY, fixtures: [], message: "Sin partidos" }),
    loadFixtureOdds: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, response: [] }),
  };
}

function baseInput(overrides = {}) {
  return {
    date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026,
    fixtureId: FIXTURE_ID, marketId: "goals", analysisMode: "specific", line: null, selection: null,
    manualCandidateOdds: [],
    ...overrides,
  };
}

async function runInitialSportsAnalysis(idFactory) {
  return analyzeOperationalFixture(
    { ...baseInput(), manualOdds: null },
    gateway(),
    { now: () => NOW, idFactory: () => idFactory }
  );
}

function quotePayloadFor(primary, sourceAnalysisId) {
  return {
    marketFamily: primary.market_family, bookmaker: "Betano", direction: primary.direction,
    selection: primary.selection, line: String(primary.line), decimalOdds: "1.75",
    consultedAt: "2026-08-01T11:45:00.000Z", timezone: "America/Bogota", analysisVersion: sourceAnalysisId,
  };
}

// isCompatiblePriceSnapshot exige que input.line/input.selection coincidan
// con el candidato — igual que hace runOperationalAnalysis en el cliente al
// enviar requestedLine/reportedSelection junto con manualOdds.
function priceRequestExtras(primary) {
  return { line: String(primary.line), selection: primary.direction, marketId: primary.market_family };
}

function geminiContextFor(text) {
  const parsed = parseGeminiResponse(text, { fixture: { fixtureId: FIXTURE_ID, teams: targetFixture(FIXTURE_ID).teams, date: targetFixture(FIXTURE_ID).date } });
  assert.equal(parsed.valid_for_reanalysis, true, "el contexto Gemini de prueba debe ser válido para reanálisis");
  return parsed;
}

test("1. manual: sports -> quote -> Gemini produce priceDecision + DirectorAtlas con Gemini incorporado (bug real corregido)", async () => {
  const sportsOnly = await runInitialSportsAnalysis("order1-sports");
  const primary = sportsOnly.marketSelection.primary;
  assert.ok(primary, "debe existir un candidato deportivo ganador");

  const withQuote = await analyzeOperationalFixture(
    { ...baseInput(), ...priceRequestExtras(primary), reanalysis: true, manualOdds: quotePayloadFor(primary, "order1-sports"), evaluatePrice: true, sourceAnalysisId: "order1-sports", geminiContext: null },
    gateway(),
    { now: () => NOW, idFactory: () => "order1-quote", previousVersion: sportsOnly.analysisVersion }
  );
  assert.equal(withQuote.analysisVersion.inputs.price_only_snapshot, true, "reenviar la cuota sin Gemini debe tomar el atajo de solo-precio");
  assert.equal(withQuote.gemini?.context, null);

  const geminiContext = geminiContextFor("HECHOS CONFIRMADOS\n- Delantero titular ausente por lesión https://dimayor.com.co/noticia 2026-08-01");
  const withGeminiAfterQuote = await analyzeOperationalFixture(
    {
      ...baseInput(), ...priceRequestExtras(primary), reanalysis: true,
      manualOdds: quotePayloadFor(primary, "order1-quote"), evaluatePrice: true, sourceAnalysisId: "order1-quote",
      geminiContext, selectedGeminiItemIds: ["gemini-1"],
    },
    gateway(),
    { now: () => NOW, idFactory: () => "order1-final", previousVersion: withQuote.analysisVersion }
  );

  assert.equal(withGeminiAfterQuote.status, DATA_LOAD_STATUS.SUCCESS);
  assert.ok(withGeminiAfterQuote.gemini?.context, "Gemini incorporado DESPUÉS de la cuota no puede perderse en silencio");
  assert.equal(withGeminiAfterQuote.gemini.applied_items.length, 1);
  assert.notEqual(withGeminiAfterQuote.director.price_assessment.status, "unavailable", "DirectorAtlas debe seguir teniendo evaluación de precio");
  assert.equal(withGeminiAfterQuote.marketSelection.primary.market_family, primary.market_family);
  assert.equal(withGeminiAfterQuote.marketSelection.primary.direction, primary.direction);
  assert.equal(Number(withGeminiAfterQuote.marketSelection.primary.line), Number(primary.line));
});

test("2. manual: sports -> Gemini -> quote produce EXACTAMENTE lo mismo (Gemini incorporado + priceDecision)", async () => {
  const sportsOnly = await runInitialSportsAnalysis("order2-sports");
  const primary = sportsOnly.marketSelection.primary;

  const geminiContext = geminiContextFor("HECHOS CONFIRMADOS\n- Delantero titular ausente por lesión https://dimayor.com.co/noticia 2026-08-01");
  const withGemini = await analyzeOperationalFixture(
    { ...baseInput(), reanalysis: true, manualOdds: null, geminiContext, selectedGeminiItemIds: ["gemini-1"] },
    gateway(),
    { now: () => NOW, idFactory: () => "order2-gemini", previousVersion: sportsOnly.analysisVersion }
  );
  assert.ok(withGemini.gemini?.context, "Gemini debe incorporarse antes de cualquier cuota");

  const withQuoteAfterGemini = await analyzeOperationalFixture(
    {
      ...baseInput(), ...priceRequestExtras(primary), reanalysis: true,
      manualOdds: quotePayloadFor(primary, "order2-gemini"), evaluatePrice: true, sourceAnalysisId: "order2-gemini",
      geminiContext, selectedGeminiItemIds: ["gemini-1"],
    },
    gateway(),
    { now: () => NOW, idFactory: () => "order2-final", previousVersion: withGemini.analysisVersion }
  );

  assert.equal(withQuoteAfterGemini.status, DATA_LOAD_STATUS.SUCCESS);
  assert.ok(withQuoteAfterGemini.gemini?.context, "Gemini ya incorporado no debe perderse al añadir la cuota");
  assert.equal(withQuoteAfterGemini.gemini.applied_items.length, 1);
  assert.notEqual(withQuoteAfterGemini.director.price_assessment.status, "unavailable");
});

test("5. cambiar una cuota después de Gemini recalcula solo economía y conserva estimated_probability/sports_score exactos", async () => {
  const sportsOnly = await runInitialSportsAnalysis("order5-sports");
  const primary = sportsOnly.marketSelection.primary;
  const geminiContext = geminiContextFor("SIN EVIDENCIA RELEVANTE\n- No se encontró información adicional para este partido.");

  const withGemini = await analyzeOperationalFixture(
    { ...baseInput(), reanalysis: true, manualOdds: null, geminiContext, selectedGeminiItemIds: [] },
    gateway(),
    { now: () => NOW, idFactory: () => "order5-gemini", previousVersion: sportsOnly.analysisVersion }
  );

  const firstQuote = await analyzeOperationalFixture(
    { ...baseInput(), ...priceRequestExtras(primary), reanalysis: true, manualOdds: quotePayloadFor(primary, "order5-gemini"), evaluatePrice: true, sourceAnalysisId: "order5-gemini", geminiContext, selectedGeminiItemIds: [] },
    gateway(),
    { now: () => NOW, idFactory: () => "order5-quote-1", previousVersion: withGemini.analysisVersion }
  );
  assert.equal(firstQuote.analysisVersion.inputs.price_only_snapshot, true, "misma Gemini que previousVersion: debe tomar el atajo de solo-precio");

  const updatedQuote = { ...quotePayloadFor(primary, "order5-quote-1"), decimalOdds: "2.10" };
  const secondQuote = await analyzeOperationalFixture(
    { ...baseInput(), ...priceRequestExtras(primary), reanalysis: true, manualOdds: updatedQuote, evaluatePrice: true, sourceAnalysisId: "order5-quote-1", geminiContext, selectedGeminiItemIds: [] },
    gateway(),
    { now: () => NOW, idFactory: () => "order5-quote-2", previousVersion: firstQuote.analysisVersion }
  );

  assert.equal(secondQuote.analysisVersion.inputs.price_only_snapshot, true, "Gemini sin cambios: sigue tomando el atajo de solo-precio");
  assert.equal(secondQuote.marketSelection.primary.estimated_probability, firstQuote.marketSelection.primary.estimated_probability);
  assert.equal(secondQuote.marketSelection.primary.sports_score, firstQuote.marketSelection.primary.sports_score);
  assert.equal(secondQuote.director.price_assessment.decimal_odds, 2.1);
  assert.notEqual(secondQuote.director.price_assessment.decimal_odds, firstQuote.director.price_assessment.decimal_odds);
});

test("7. Gemini presente y cuota ausente: el análisis espera correctamente, sin evaluación de precio inventada", async () => {
  const sportsOnly = await runInitialSportsAnalysis("order7-sports");
  const geminiContext = geminiContextFor("HECHOS CONFIRMADOS\n- Delantero titular ausente por lesión https://dimayor.com.co/noticia 2026-08-01");

  const withGeminiOnly = await analyzeOperationalFixture(
    { ...baseInput(), reanalysis: true, manualOdds: null, geminiContext, selectedGeminiItemIds: ["gemini-1"] },
    gateway(),
    { now: () => NOW, idFactory: () => "order7-gemini", previousVersion: sportsOnly.analysisVersion }
  );

  assert.equal(withGeminiOnly.status, DATA_LOAD_STATUS.SUCCESS);
  assert.ok(withGeminiOnly.gemini?.context, "Gemini debe quedar incorporado aunque no exista cuota todavía");
  assert.equal(withGeminiOnly.director.price_assessment.status, "unavailable", "sin cuota, Atlas no inventa una evaluación de precio");
});

test("9. Gemini y cuota presentes en la misma solicitud nunca quedan indefinidamente en evaluación pendiente", async () => {
  const sportsOnly = await runInitialSportsAnalysis("order9-sports");
  const primary = sportsOnly.marketSelection.primary;
  const geminiContext = geminiContextFor("HECHOS CONFIRMADOS\n- Delantero titular ausente por lesión https://dimayor.com.co/noticia 2026-08-01");

  const combined = await analyzeOperationalFixture(
    {
      ...baseInput(), ...priceRequestExtras(primary), reanalysis: true,
      manualOdds: quotePayloadFor(primary, "order9-sports"), evaluatePrice: true, sourceAnalysisId: "order9-sports",
      geminiContext, selectedGeminiItemIds: ["gemini-1"],
    },
    gateway(),
    { now: () => NOW, idFactory: () => "order9-combined", previousVersion: sportsOnly.analysisVersion }
  );

  assert.equal(combined.status, DATA_LOAD_STATUS.SUCCESS);
  assert.ok(combined.gemini?.context, "Gemini y cuota juntos en una sola solicitud deben incorporarse ambos");
  assert.notEqual(combined.director.price_assessment.status, "unavailable");
});
