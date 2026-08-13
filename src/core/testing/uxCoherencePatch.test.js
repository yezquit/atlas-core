import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { buildCompetitiveContext } from "../intelligence/competitiveContext.js";
import { buildSimpleSportsReasons, rankMarketCandidates } from "../intelligence/marketCandidateRanker.js";
import { createManualOdds } from "../intelligence/oddsIntelligence.js";
import { buildRedTeamAtlas } from "../intelligence/redTeamAtlas.js";
import { assessMarketSuitability } from "../intelligence/marketSuitability.js";
import { analyzeOperationalFixture } from "../services/operationalAnalysisService.js";

const clientPath = new URL("../../app/atlas-functional-client.js", import.meta.url);

function targetFixture(id = 1_600_001) {
  return {
    fixtureId: id,
    competition: { id: 239, name: "CONMEBOL Sudamericana", country: "World", season: 2026, round: "Round of 16 - 1st Leg" },
    date: { utc: "2026-08-10T23:00:00.000Z" },
    status: { isScheduled: true, isFinished: false, long: "Programado" },
    teams: { home: { id: 10, name: "Santos" }, away: { id: 20, name: "Macará" } },
    score: { goals: { home: null, away: null }, aggregate: null },
    referee: { name: "Ana Ruiz", confirmed: true },
    venue: { name: "Estadio Central", city: "Santos" },
  };
}

function historicalFixture(index) {
  return {
    ...targetFixture(7_000 + index),
    competition: { id: 239, name: "Primera A", country: "Colombia", season: 2026, round: `Jornada ${index + 1}` },
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

function staleSuperbetPayload(fixtureId = 1_600_001) {
  return {
    fixture: { id: fixtureId, date: "2026-08-10T23:00:00.000Z" },
    update: "2026-08-05T10:00:00.000Z",
    bookmakers: [{
      id: 13,
      name: "Superbet",
      bets: [{ id: 5, name: "Goals Over/Under", values: [{ value: "Over 1.5", odd: "13" }] }],
    }],
  };
}

function gateway({ withStaleOdds = true } = {}) {
  const history = Array.from({ length: 10 }, (_, index) => historicalFixture(index));
  return {
    runtime: {
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
    },
    loadCompetitionMetadata: async () => ({
      status: DATA_LOAD_STATUS.SUCCESS,
      seasonMetadata: {
        year: 2026,
        coverage: { odds: true, fixtures: { statistics_fixtures: true, lineups: false }, injuries: false, standings: false },
      },
      availableSeasons: [2026],
      verificationStatus: "verified",
    }),
    loadFixtureById: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, selectedFixtureId: 1_600_001, fixture: targetFixture() }),
    loadLeagueWindow: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: history }),
    loadTeamRecent: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: history }),
    loadFixtureStatistics: async (id) => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtureId: id, statistics: fixtureStatistics(history.find((item) => item.fixtureId === id) || history[0]) }),
    loadFixtureOdds: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, response: withStaleOdds ? [staleSuperbetPayload()] : [] }),
  };
}

const transferredCandidate = {
  fixture_id: 1_600_001,
  analysis_mode: "specific",
  market_family: "goals",
  direction: "over",
  line: 1.5,
  selection: "Over 1.5",
  preliminary_probability: 0.673,
  uncertainty: { low: 0.52, high: 0.79 },
  sports_score: 90.1,
  rank: 2,
  overall_rank: 2,
  family_rank: 1,
  line_origin: "transferred_candidate",
};

const operationalInput = {
  date: "2026-08-05",
  timezone: "America/Bogota",
  competitionKey: "colombiaPrimeraA",
  season: 2026,
  fixtureId: 1_600_001,
  marketId: "goals",
  analysisMode: "specific",
  line: "1.5",
  selection: "Over 1.5",
  manualOdds: null,
  manualCandidateOdds: [],
  transferredCandidate,
};

let staleResultPromise;
let noOddsResultPromise;
function staleResult() {
  staleResultPromise ||= analyzeOperationalFixture(operationalInput, gateway(), {
    now: () => "2026-08-05T18:00:00.000Z",
    idFactory: () => "stale-history-version",
  });
  return staleResultPromise;
}

function noOddsResult() {
  noOddsResultPromise ||= analyzeOperationalFixture(operationalInput, gateway({ withStaleOdds: false }), {
    now: () => "2026-08-05T18:00:00.000Z",
    idFactory: () => "no-odds-version",
  });
  return noOddsResultPromise;
}

function candidate(overrides = {}) {
  return {
    candidate_id: "goals:over:1.5",
    market_family: "goals",
    direction: "over",
    selection: "Over 1.5",
    line: 1.5,
    projected_mean: 2.4,
    dispersion: 1.1,
    preliminary_probability: 0.67,
    probability_status: "preliminary",
    uncertainty_low: 0.52,
    uncertainty_high: 0.79,
    sample_size_effective: 12,
    limitations: [],
    input_sources: [],
    context_adjustment: { changed_distribution: false },
    contextual_only: false,
    ...overrides,
  };
}

test("1. candidato transferido sin cuota actual no activa la histórica", async () => {
  const result = await staleResult();
  assert.equal(result.activeQuote, null);
  assert.equal(result.selectedOdds, null);
  assert.equal(result.analysisVersion.active_quote, null);
});

test("2. cotización stale queda en histórico", async () => {
  const result = await staleResult();
  assert.equal(result.historicalQuote.bookmaker_name, "Superbet");
  assert.equal(result.historicalQuote.decimal_odds, 13);
  assert.ok(result.analysisVersion.odds.some((quote) => quote.bookmaker_name === "Superbet" && quote.stale));
});

test("3. stale no participa en la decisión actual", async () => {
  const result = await staleResult();
  assert.equal(result.director.price_assessment.status, "unavailable");
  assert.equal(result.director.bookmaker, null);
  assert.equal(result.director.odds, null);
});

test("4. stale no genera probabilidad implícita activa", async () => {
  const result = await staleResult();
  assert.equal(result.director.implied_probability, null);
  assert.equal(result.director.price_assessment.implied_probability, null);
});

test("5. sin cuota conserva veredicto deportivo visible", async () => {
  const result = await staleResult();
  assert.equal(result.director.sports_verdict.selection, "Over 1.5");
  assert.match(result.director.sports_verdict.message, /respalda deportivamente|conserva respaldo deportivo/i);
});

test("6. sin cuota deja la decisión operativa pendiente", async () => {
  const result = await staleResult();
  assert.equal(result.director.price_pending, true);
  assert.equal(result.director.display_status, "Pendiente de precio");
  assert.doesNotMatch(result.director.verdict, /Todavía no/i);
});

test("7. una cuota stale no cambia la probabilidad deportiva", async () => {
  const [stale, empty] = await Promise.all([staleResult(), noOddsResult()]);
  assert.equal(stale.preliminaryProbability.point_estimate, empty.preliminaryProbability.point_estimate);
  assert.deepEqual(
    [stale.preliminaryProbability.uncertainty_low, stale.preliminaryProbability.uncertainty_high],
    [empty.preliminaryProbability.uncertainty_low, empty.preliminaryProbability.uncertainty_high]
  );
});

test("8. una cuota stale no cambia el ranking deportivo", async () => {
  const [stale, empty] = await Promise.all([staleResult(), noOddsResult()]);
  assert.deepEqual(stale.marketSelection.ranked_candidates.map((item) => item.candidate_id), empty.marketSelection.ranked_candidates.map((item) => item.candidate_id));
  assert.deepEqual(stale.marketSelection.ranked_candidates.map((item) => item.sports_score), empty.marketSelection.ranked_candidates.map((item) => item.sports_score));
});

test("9. razones sencillas priorizan evidencia deportiva del partido", () => {
  const reasons = buildSimpleSportsReasons(candidate({ input_sources: [
    { source: "home_role", hits: 4, sample_size: 5, observed_rate: 0.8 },
    { source: "away_role", hits: 3, sample_size: 4, observed_rate: 0.75 },
  ] }), {
    homeTeamProfile: { team_name: "Santos", as_home: { sample_size: 5, event_samples: { goals: { for: [2, 1, 3], conceded: [1, 0, 1] } } } },
    awayTeamProfile: { team_name: "Macará", as_away: { sample_size: 4, event_samples: { goals: { for: [1, 1], conceded: [2, 1, 2] } } } },
  });
  assert.equal(reasons.length, 3);
  assert.match(reasons.join(" "), /Santos.*como local/i);
  assert.match(reasons.join(" "), /Macará.*como visitante/i);
  assert.doesNotMatch(reasons.join(" "), /equilibrio deportivo|modelo preliminar/i);
});

test("10. limitaciones metodológicas no aparecen como Red Team del partido", () => {
  const redTeam = buildRedTeamAtlas({ candidate: candidate({ limitations: ["Distribución empírica preliminar; no representa un modelo deportivo validado."] }) });
  assert.equal(redTeam.items.length, 0);
  assert.equal(redTeam.model_limitations.length, 1);
});

test("11. Red Team conserva un riesgo deportivo o contextual real", () => {
  const redTeam = buildRedTeamAtlas({ competitiveContext: { warnings: ["No existe una muestra comparable suficiente para ambos equipos en esta competición."], rotation: { status: "reported_risk", message: "Posible rotación reportada; se conserva como riesgo, no como hecho." } } });
  assert.ok(redTeam.items.length >= 1);
  assert.match(redTeam.items.map((item) => item.text).join(" "), /muestra comparable|rotación/i);
});

test("12. ausencia de riesgo específico no inventa uno", () => {
  const redTeam = buildRedTeamAtlas({ candidate: candidate() });
  assert.deepEqual(redTeam.items, []);
  assert.deepEqual(redTeam.full_risks, []);
});

test("13. contexto competitivo internacional conserva campos disponibles", () => {
  const context = buildCompetitiveContext({ fixture: targetFixture(), competition: targetFixture().competition });
  assert.equal(context.competition.name, "CONMEBOL Sudamericana");
  assert.equal(context.competition.type, "international");
  assert.equal(context.leg, "first_leg");
  assert.equal(context.fixture_role.home_team, "Santos");
});

test("14. contexto no inventa agregado ni calendario ausentes", () => {
  const context = buildCompetitiveContext({ fixture: targetFixture(), competition: targetFixture().competition });
  assert.equal(context.aggregate, null);
  assert.equal(context.previous_fixture, null);
  assert.equal(context.next_fixture, null);
  assert.deepEqual(context.rest_days, { home_days: null, away_days: null });
});

test("15. overall_rank y family_rank quedan separados", () => {
  const ranked = rankMarketCandidates([
    candidate({ candidate_id: "goals:over:1.5", preliminary_probability: 0.68 }),
    candidate({ candidate_id: "corners:over:8.5", market_family: "corners", selection: "Over 8.5", line: 8.5, preliminary_probability: 0.67, projected_mean: 9.2 }),
    candidate({ candidate_id: "goals:under:3.5", direction: "under", selection: "Under 3.5", line: 3.5, preliminary_probability: 0.65 }),
  ]);
  assert.deepEqual(ranked.map((item) => item.overall_rank), [1, 2, 3]);
  const goals = ranked.filter((item) => item.market_family === "goals");
  assert.deepEqual(goals.map((item) => item.family_rank), [1, 2]);
});

test("16. candidato secundario no se presenta como ganador", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /Por qué Atlas destacó esta opción/);
  assert.doesNotMatch(source, /Por qué ganó este mercado/);
});

test("17. modo sencillo no usa Respaldo técnico", async () => {
  const source = await readFile(clientPath, "utf8");
  const journeyStart = source.indexOf('{mainMode === "journey" ? (');
  const journey = source.slice(journeyStart, source.indexOf(') : mainMode === "match" ? (', journeyStart));
  assert.doesNotMatch(journey, /Respaldo técnico/);
  assert.match(journey, /Respaldo deportivo/);
});

test("18. modo sencillo no duplica Equilibrio deportivo", async () => {
  const source = await readFile(clientPath, "utf8");
  const simple = source.slice(source.indexOf("function ScoutResult"), source.indexOf("function ExpertResult"));
  assert.doesNotMatch(simple, /Equilibrio deportivo/);
});

test("19. candidato transferido usa estado semántico listo", async () => {
  const source = await readFile(clientPath, "utf8");
  const transfer = source.slice(source.indexOf("function openCandidate"), source.indexOf("return (", source.indexOf("function openCandidate")));
  assert.match(transfer, /transferred_ready/);
  assert.doesNotMatch(transfer, /Candidato completo transferido|Datos no disponibles/);
});

test("20. una cuota actual válida conserva la evaluación económica", () => {
  const quote = createManualOdds({
    fixtureId: 1_600_001,
    bookmaker: "Betano",
    marketFamily: "goals",
    marketName: "Goles",
    direction: "over",
    selection: "Over 1.5",
    line: "1.5",
    decimalOdds: "2.00",
    receivedAt: "2026-08-05T17:59:00.000Z",
    analyzedAt: "2026-08-05T18:00:00.000Z",
    kickoff: "2026-08-10T23:00:00.000Z",
    timezone: "America/Bogota",
  });
  const result = assessMarketSuitability({
    fixtureVerified: true,
    marketCandidate: true,
    sampleSufficient: true,
    requiredEvidenceAvailable: true,
    line: 1.5,
    oddsQuote: quote,
    confidenceScore: 85,
    preliminaryProbability: { probability_status: "preliminary", point_estimate: 0.7, uncertainty_low: 0.62, uncertainty_high: 0.78 },
    sampleSize: 12,
  });
  assert.equal(result.price_evaluation.status, "favorable_preliminary");
  assert.equal(result.status, "suitable_under_conditions");
});

test("21. opción manual continúa disponible", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /OPCIÓN QUE QUIERES ANALIZAR/);
  assert.match(source, /user_selected/);
});

test("22. Gemini manual continúa disponible", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /function GeminiWorkflow/);
  assert.match(source, /validateGeminiContext/);
  assert.match(source, /reanalyzeWithContext/);
});

test("23. historial continúa disponible", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /function HistoryView/);
  assert.match(source, /\/api\/operational-history/);
});
