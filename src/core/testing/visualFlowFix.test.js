import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { buildAnalysisVersion } from "../intelligence/analysisVersions.js";
import { rankMarketCandidates } from "../intelligence/marketCandidateRanker.js";
import {
  createManualOdds,
  impliedProbability,
  normalizeProviderOdds,
} from "../intelligence/oddsIntelligence.js";
import { buildOperationalDirectorVerdict } from "../modules/directorAtlas.js";
import { analyzeOperationalFixture } from "../services/operationalAnalysisService.js";
import {
  buildJourneyFamilyComparison,
  deriveJourneyOutcome,
} from "../services/sportsIntelligenceService.js";

const clientPath = new URL("../../app/atlas-functional-client.js", import.meta.url);
const routePath = new URL("../../app/api/football/operational-analysis/route.js", import.meta.url);
const serverPath = new URL("../services/operationalAnalysisServer.js", import.meta.url);

function sportsCandidate(overrides = {}) {
  return {
    candidate_id: "goals:over:1.5",
    market_family: "goals",
    direction: "over",
    selection: "Over 1.5",
    line: 1.5,
    projected_mean: 2.4,
    dispersion: 1.1,
    preliminary_probability: 0.731,
    probability_status: "preliminary",
    uncertainty_low: 0.574,
    uncertainty_high: 0.846,
    sample_size_effective: 26.619,
    sports_score: 88.5,
    input_sources: [],
    limitations: ["Modelo preliminar no calibrado."],
    methodology_version: "test-method-v1",
    context_adjustment: { changed_distribution: false },
    contextual_only: false,
    ...overrides,
  };
}

function betanoQuote(overrides = {}) {
  return createManualOdds({
    fixtureId: 1_498_650,
    bookmaker: "Betano",
    marketFamily: "goals",
    marketName: "Goles",
    direction: "over",
    selection: "Over 1.5",
    line: "1.5",
    decimalOdds: "1.65",
    receivedAt: "2026-08-05T17:52:00.000Z",
    analyzedAt: "2026-08-05T17:53:00.000Z",
    timezone: "America/Bogota",
    analysisVersion: "old-version",
    ...overrides,
  });
}

function operationalDirector(overrides = {}) {
  const candidate = overrides.marketCandidate || sportsCandidate({ price_status: "user_reported_current" });
  const quote = overrides.oddsQuote === undefined ? betanoQuote() : overrides.oddsQuote;
  return buildOperationalDirectorVerdict({
    fixture: {
      fixtureId: 1_498_650,
      date: { utc: "2026-08-10T23:00:00.000Z", timezone: "America/Bogota" },
      teams: { home: { name: "Almagro" }, away: { name: "Gimnasia Y Tiro" } },
      competition: { season: 2026 },
    },
    competition: { localName: "Argentina Primera Nacional" },
    analyzedAt: "2026-08-05T17:53:00.000Z",
    phase: "early_review",
    marketAssessment: { market_family: "goals", market_label: "Goles" },
    marketCandidate: candidate,
    marketSelection: { analysis_mode: "specific", explanation: "Over 1.5 lidera el ranking deportivo.", alternatives: [], line_profiles: {} },
    oddsQuote: quote,
    confidence: { analysis_confidence_score: 81, confidence_label: "alta" },
    suitability: { status: "viable_with_caution", conditions: [] },
    supportingEvidence: ["Frecuencia y estabilidad observadas"],
    missingData: overrides.missingData || ["Cuota actual para la línea exacta"],
    risks: ["Modelo preliminar no calibrado."],
    preliminaryProbability: {
      probability_status: "preliminary",
      point_estimate: 0.731,
      uncertainty_low: 0.574,
      uncertainty_high: 0.846,
      sample_size_effective: 26.619,
      methodology_version: "test-method-v1",
    },
  });
}

function targetFixture(id = 1_498_650) {
  return {
    fixtureId: id,
    competition: { id: 239, name: "Primera A", country: "Colombia", season: 2026 },
    date: { utc: "2026-08-10T23:00:00.000Z" },
    status: { isScheduled: true, isFinished: false, long: "Programado" },
    teams: { home: { id: 10, name: "Equipo Local" }, away: { id: 20, name: "Equipo Visitante" } },
    score: { goals: { home: null, away: null } },
    referee: { name: "Ana Ruiz", confirmed: true },
    venue: { name: "Estadio Central", city: "Bogotá" },
  };
}

function historicalFixture(index) {
  return {
    ...targetFixture(6_000 + index),
    date: { utc: `2026-07-${String(index + 1).padStart(2, "0")}T20:00:00.000Z` },
    status: { isScheduled: false, isFinished: true, long: "Finalizado" },
    score: { goals: { home: (index % 3) + 1, away: index % 2 } },
  };
}

function fixtureStatistics(fixture) {
  return {
    teams: [fixture.teams.home, fixture.teams.away].map((team) => ({
      team,
      statistics: {
        total_shots: { value: 12 },
        shots_on_goal: { value: 5 },
        yellow_cards: { value: 2 },
        red_cards: { value: 0 },
        fouls: { value: 12 },
        corner_kicks: { value: 5 },
        ball_possession: { value: 50 },
      },
    })),
  };
}

function marathonPayload(fixtureId = 1_498_650, value = { value: "Over 1.5", odd: "10.5" }) {
  return {
    fixture: { id: fixtureId, date: "2026-08-10T23:00:00.000Z" },
    update: "2026-08-05T10:00:00.000Z",
    bookmakers: [{
      id: 11,
      name: "Marathonbet",
      bets: [{ id: 5, name: "Goals Over/Under", values: [value] }],
    }],
  };
}

function gateway(fixtureId = 1_498_650) {
  const history = Array.from({ length: 10 }, (_, index) => historicalFixture(index));
  const runtime = {
    snapshot: () => ({
      requestsUsed: 10,
      cacheHits: 0,
      cacheMisses: 10,
      deduplicated: 0,
      configuredBudget: 45,
      configuredBudgetRemaining: 35,
      budgetExhausted: false,
      quotaStatus: "available",
    }),
  };
  return {
    runtime,
    loadCompetitionMetadata: async () => ({
      status: DATA_LOAD_STATUS.SUCCESS,
      seasonMetadata: {
        year: 2026,
        coverage: { odds: true, fixtures: { statistics_fixtures: true, lineups: false }, injuries: false, standings: false },
      },
      availableSeasons: [2026],
      verificationStatus: "verified",
    }),
    loadFixtureById: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, selectedFixtureId: fixtureId, fixture: targetFixture(fixtureId) }),
    loadLeagueWindow: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: history }),
    loadTeamRecent: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: history }),
    loadFixtureStatistics: async (id) => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtureId: id, statistics: fixtureStatistics(history.find((item) => item.fixtureId === id) || history[0]) }),
    loadFixtureOdds: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, response: [marathonPayload(fixtureId)] }),
  };
}

const operationalInput = {
  date: "2026-08-05",
  timezone: "America/Bogota",
  competitionKey: "colombiaPrimeraA",
  season: 2026,
  fixtureId: 1_498_650,
  marketId: "goals",
  analysisMode: "specific",
  line: "1.5",
  selection: "Over 1.5",
  odds: "1.65",
  manualOdds: {
    bookmaker: "Betano",
    marketFamily: "goals",
    direction: "over",
    selection: "Over 1.5",
    line: "1.5",
    decimalOdds: "1.65",
    consultedAt: "2026-08-05T17:52:00.000Z",
    timezone: "America/Bogota",
    analysisVersion: "marathon-old",
  },
};

let integratedResultPromise;
function integratedResult() {
  integratedResultPromise ||= analyzeOperationalFixture(operationalInput, gateway(), {
    now: () => "2026-08-05T17:53:00.000Z",
    idFactory: () => "betano-version",
  });
  return integratedResultPromise;
}

test("1. jornada con candidatos no muestra Análisis bloqueado", () => {
  const result = deriveJourneyOutcome({ fixturesFound: 4, candidates: [{ priceStatus: "unavailable" }], telemetry: { budgetExhausted: true } });
  assert.equal(result.status, DATA_LOAD_STATUS.SUCCESS);
  assert.doesNotMatch(result.message, /bloqueado/i);
});

test("2. jornada pendiente de cuotas muestra estado amarillo", () => {
  const result = deriveJourneyOutcome({ fixturesFound: 4, candidates: [{ priceStatus: "unavailable" }] });
  assert.equal(result.displayTone, "warning");
  assert.equal(result.message, "Candidatos deportivos encontrados — evaluación de precio pendiente");
});

test("3. comparación de familias visible", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /Por qué Atlas destacó esta opción/);
  assert.match(source, /Ver comparación de mercados/);
});

test("4. mensaje de ganador refleja la frontera de decisión V3", () => {
  const corners = sportsCandidate({ candidate_id: "corners:over:8.5", market_family: "corners", line: 8.5, selection: "Over 8.5", sports_score: 50, rank: 2 });
  const goals = sportsCandidate({ sports_score: 88.5, rank: 1 });
  const comparison = buildJourneyFamilyComparison({ primary: goals, generated: [{ market_family: "corners", candidates: [corners] }, { market_family: "goals", candidates: [goals] }], ranked_candidates: [goals, corners] }, [{ market_family: "corners", market_label: "Córners" }, { market_family: "goals", market_label: "Goles" }]);
  assert.equal(comparison.best_by_family[1].best_score, 88.5);
  assert.match(
    comparison.why_market_won,
    /frontera de decisión v3/i
  );
});

test("5. formato de muestra efectiva 26.6", async () => {
  assert.equal(new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(26.619), "26,6");
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /Muestra efectiva ponderada/);
  assert.match(source, /submuestras pueden solaparse/);
});

test("6. Abrir análisis profundo transfiere candidato completo", async () => {
  const source = await readFile(clientPath, "utf8");
  for (const field of ["fixture_id", "analysis_mode", "market_family", "direction", "line", "selection", "preliminary_probability", "uncertainty", "sports_score", "rank", "reasons", "risks", "methodology_version"]) assert.match(source, new RegExp(field));
});

test("7. candidato transferido conserva mercado y línea", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /setMarketId\(transferred\.market_family\)/);
  assert.match(source, /setLine\(String\(transferred\.line\)\)/);
  assert.match(source, /transferred_candidate_changed/);
});

test("8. texto de cinco familias no aparece pegado", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /Atlas comparará las cinco familias\.<\/strong><small>La cuota no participa/);
  assert.doesNotMatch(source, /familiasLa cuota/);
});

test("9. payload proveedor no confunde línea 10.5 con cuota", () => {
  const result = normalizeProviderOdds({ response: [marathonPayload(1_498_650, { value: "Over 10.5", odd: "1.65" })], fixtureId: 1_498_650, now: "2026-08-05T10:01:00.000Z" });
  assert.equal(result.quotes[0].line, "10.5");
  assert.equal(result.quotes[0].decimal_odds, 1.65);
  assert.equal(result.quotes[0].provider_odd_field, "odd");
});

test("10. cuota y línea provienen del mismo objeto", () => {
  const result = normalizeProviderOdds({ response: [marathonPayload()], fixtureId: 1_498_650, now: "2026-08-05T10:01:00.000Z" });
  assert.equal(result.quotes[0].provider_value_index, 0);
  assert.equal(result.quotes[0].provider_raw_selection, "Over 1.5");
  assert.equal(result.quotes[0].decimal_odds, 10.5);
});

test("11. objeto de odds inconsistente se descarta", () => {
  const result = normalizeProviderOdds({ response: [marathonPayload(1_498_650, { value: "Over 1.5", handicap: "2.5", odd: "1.65" })], fixtureId: 1_498_650, now: "2026-08-05T10:01:00.000Z" });
  assert.equal(result.quotes.length, 0);
  assert.deepEqual(result.warnings, ["provider_selection_handicap_mismatch"]);
  assert.equal(result.discarded[0].provider_bet_id, "5");
});

test("12. Betano 1.65 reemplaza active_quote Marathonbet 10.5", async () => {
  const result = await integratedResult();
  assert.equal(result.activeQuote.bookmaker_name, "Betano");
  assert.equal(result.activeQuote.decimal_odds, 1.65);
  assert.equal(result.activeQuote.source_status, "user_reported_current");
});

test("13. Marathonbet antigua se conserva en historial", async () => {
  const result = await integratedResult();
  assert.ok(result.analysisVersion.odds.some((quote) => quote.bookmaker_name === "Marathonbet" && quote.decimal_odds === 10.5 && quote.stale));
  assert.equal(result.analysisVersion.active_quote.bookmaker_name, "Betano");
});

test("14. implied_probability 1/1.65 es aproximadamente 60.61%", () => {
  assert.ok(Math.abs(impliedProbability(1.65) - 0.6060606) < 0.000001);
});

test("15. Director muestra Betano", () => assert.equal(operationalDirector().bookmaker, "Betano"));

test("16. Director muestra 1.65", () => assert.equal(operationalDirector().odds, 1.65));

test("17. Director no muestra cuota vencida", () => {
  const director = operationalDirector();
  assert.notEqual(director.price_assessment.status, "stale");
  assert.equal(director.odds_freshness, "fresh");
});

test("18. Director no dice que falta evaluar la cuota", () => {
  const director = operationalDirector();
  assert.doesNotMatch(`${director.verdict} ${director.price_assessment.message} ${director.next_action}`, /falta evaluar la cuota/i);
});

test("19. cuota manual permanece user_reported", () => {
  const quote = betanoQuote();
  assert.equal(quote.verification_status, "user_reported");
  assert.notEqual(quote.verification_status, "verified_provider");
});

test("20. se crea una versión nueva", () => {
  const first = buildAnalysisVersion({ fixture: targetFixture(), activeQuote: betanoQuote() }, { idFactory: () => "v1", now: () => "2026-08-05T17:53:00.000Z" });
  const second = buildAnalysisVersion({ fixture: targetFixture(), activeQuote: betanoQuote({ analysisVersion: "v1" }) }, { idFactory: () => "v2", now: () => "2026-08-05T17:54:00.000Z" });
  assert.notEqual(first.analysis_id, second.analysis_id);
  assert.equal(second.active_quote.bookmaker_name, "Betano");
});

test("21. caché diferencia payloads de cuota", () => {
  const first = betanoQuote();
  const second = betanoQuote({ decimalOdds: "1.66" });
  assert.notEqual(first.request_key, second.request_key);
});

test("22. 1.65 y 1,65 se normalizan correctamente", () => {
  assert.equal(betanoQuote({ decimalOdds: "1.65" }).decimal_odds, 1.65);
  assert.equal(betanoQuote({ decimalOdds: "1,65" }).decimal_odds, 1.65);
});

test("23. missing_data se actualiza", () => {
  const director = operationalDirector({ missingData: ["Cuota actual para la línea exacta"] });
  assert.doesNotMatch(director.missing_data.join(" "), /cuota actual/i);
});

test("24. pronóstico deportivo se mantiene", () => {
  const withoutPrice = operationalDirector({ oddsQuote: null, marketCandidate: sportsCandidate({ price_status: "unavailable" }) });
  const withPrice = operationalDirector();
  assert.equal(withoutPrice.sports_verdict.selection, withPrice.sports_verdict.selection);
  assert.equal(withoutPrice.sports_verdict.preliminary_probability, withPrice.sports_verdict.preliminary_probability);
});

test("25. evaluación de precio se actualiza", () => {
  const withoutPrice = operationalDirector({ oddsQuote: null, marketCandidate: sportsCandidate({ price_status: "unavailable" }) });
  assert.equal(withoutPrice.price_assessment.status, "unavailable");
  assert.equal(operationalDirector().price_assessment.status, "user_reported_current");
});

test("26. Gemini conserva la cuota manual", async () => {
  const first = await integratedResult();
  const next = await analyzeOperationalFixture({
    ...operationalInput,
    odds: null,
    manualOdds: null,
    reanalysis: true,
    geminiContext: {
      valid_for_reanalysis: true,
      items: [{ id: "gemini-1", text: "Contexto general sin cambio material", selected: true, verification_status: "user_reported", kind: "confirmed", impact: "neutral" }],
    },
  }, gateway(), { now: () => "2026-08-05T17:54:00.000Z", idFactory: () => "gemini-version", previousVersion: first.analysisVersion });
  assert.equal(next.activeQuote.bookmaker_name, "Betano");
  assert.equal(next.activeQuote.decimal_odds, 1.65);
});

test("27. Nueva búsqueda limpia cuota temporal", async () => {
  const source = await readFile(clientPath, "utf8");
  const block = source.slice(source.indexOf("function startNewSearch"), source.indexOf("function changeDate"));
  assert.match(block, /clearTemporaryQuote\(\)/);
  assert.match(block, /setTransferredCandidate\(null\)/);
});

test("28. Nueva búsqueda conserva historial", async () => {
  const source = await readFile(clientPath, "utf8");
  const block = source.slice(source.indexOf("function startNewSearch"), source.indexOf("function changeDate"));
  assert.doesNotMatch(block, /operational-history|deleteSelectedVersion|setHistory/);
});

test("29. cuotas no se mezclan entre fixtures", async () => {
  const first = await integratedResult();
  const nextFixtureId = 1_498_651;
  const next = await analyzeOperationalFixture({ ...operationalInput, fixtureId: nextFixtureId, odds: null, manualOdds: null, reanalysis: true }, gateway(nextFixtureId), { now: () => "2026-08-05T17:54:00.000Z", idFactory: () => "other-fixture", previousVersion: first.analysisVersion });
  assert.notEqual(next.activeQuote?.bookmaker_name, "Betano");
  assert.equal(next.analysisVersion.fixture_id, nextFixtureId);
});

test("30. integración UI → endpoint → orquestador → Director", async () => {
  const [clientSource, routeSource, serverSource, result] = await Promise.all([
    readFile(clientPath, "utf8"),
    readFile(routePath, "utf8"),
    readFile(serverPath, "utf8"),
    integratedResult(),
  ]);
  assert.match(clientSource, /fetch\("\/api\/football\/operational-analysis"/);
  assert.match(clientSource, /bookmaker: bookmaker\.trim\(\)/);
  assert.match(routeSource, /analyzeOperationalFixtureOnServer/);
  assert.match(serverSource, /analyzeOperationalFixture\(/);
  assert.equal(result.director.bookmaker, "Betano");
  assert.equal(result.director.odds, 1.65);
  assert.equal(result.director.implied_probability, 0.606061);
  assert.equal(result.director.odds_source_status, "user_reported");
  assert.equal(result.director.price_assessment.expected_value_claimed, false);
});
