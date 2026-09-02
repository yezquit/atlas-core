import test from "node:test";
import assert from "node:assert/strict";

import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import {
  analyzeSportsFixture,
  buildJourneyAsianRecommendationShortlist,
  buildJourneyRecommendationShortlist,
  scanSportsJourney,
} from "../services/sportsIntelligenceService.js";
import { generateCandidateLines } from "../intelligence/candidateLineGenerator.js";
import { rankMarketCandidates } from "../intelligence/marketCandidateRanker.js";

function targetFixture(id = 81_000) {
  return {
    fixtureId: id,
    competition: { id: 239, name: "Primera A", country: "Colombia", season: 2026 },
    date: { utc: "2026-08-01T20:00:00Z" },
    status: { isScheduled: true, isFinished: false },
    teams: { home: { id: 10, name: "Local" }, away: { id: 20, name: "Visitante" } },
    score: { goals: { home: null, away: null } },
    referee: { name: "Ana Ruiz", confirmed: true },
    venue: { name: "Estadio Central", city: "Bogotá" },
  };
}

function historicalFixture(index) {
  const homeId = index % 2 === 0 ? 10 : 20;
  const awayId = homeId === 10 ? 20 : 10;
  return {
    ...targetFixture(82_000 + index),
    date: { utc: `2026-07-${String(index + 1).padStart(2, "0")}T20:00:00Z` },
    status: { isScheduled: false, isFinished: true },
    teams: {
      home: { id: homeId, name: homeId === 10 ? "Local" : "Visitante" },
      away: { id: awayId, name: awayId === 10 ? "Local" : "Visitante" },
    },
    score: { goals: { home: (index % 4) + 1, away: index % 2 } },
  };
}

function fixtureStatistics(item) {
  const team = (value) => ({
    team: value,
    statistics: {
      total_shots: { value: 12 }, shots_on_goal: { value: 5 },
      yellow_cards: { value: 2 }, red_cards: { value: 0 }, fouls: { value: 12 },
      corner_kicks: { value: 5 }, ball_possession: { value: 50 },
    },
  });
  return { teams: [team(item.teams.home), team(item.teams.away)] };
}

function gateway({ fixture = targetFixture(), history = Array.from({ length: 10 }, (_, index) => historicalFixture(index)) } = {}) {
  return {
    runtime: { snapshot: () => ({ configuredBudgetRemaining: 100, budgetExhausted: false }) },
    loadCompetitionMetadata: async () => ({
      status: DATA_LOAD_STATUS.SUCCESS,
      seasonMetadata: { year: 2026, coverage: { fixtures: { statistics_fixtures: true } } },
      availableSeasons: [2026], verificationStatus: "verified",
    }),
    loadFixturesForDate: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: [fixture], message: "ok" }),
    loadFixtureById: async ({ fixtureId }) => ({ status: DATA_LOAD_STATUS.SUCCESS, selectedFixtureId: fixtureId, fixture }),
    loadLeagueWindow: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: history }),
    loadTeamRecent: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: history }),
    loadFixtureStatistics: async (fixtureId) => ({
      status: DATA_LOAD_STATUS.SUCCESS,
      fixtureId,
      statistics: fixtureStatistics(history.find((item) => item.fixtureId === fixtureId) || history[0]),
    }),
  };
}

function journeyInput(marketIds) {
  return {
    date: "2026-08-01",
    competitionKeys: ["colombiaPrimeraA"],
    marketIds,
    timezone: "America/Bogota",
  };
}

function shortlistCandidate(overrides = {}) {
  return {
    fixtureId: 81_000,
    marketId: "goals",
    direction: "over",
    line: 1.5,
    estimatedProbability: 0.7,
    probabilityClassification: "BUENA",
    sportsScore: 80,
    technicalSupport: 80,
    uncertaintyLow: 0.58,
    uncertaintyHigh: 0.79,
    selectionQuality: 80,
    priceStatus: "unavailable",
    decisionFrontier: { recommended: true, status: "eligible" },
    fixtureEvidence: { reasons: ["Evidencia deportiva disponible."] },
    ...overrides,
  };
}

test("gap: Jornada solicitando solo Asian Total produce candidatos Asian", async () => {
  const result = await scanSportsJourney(journeyInput(["asian_total_goals"]), gateway());

  assert.ok(result.candidates.length > 0);
  assert.ok(result.candidates.every((candidate) => candidate.marketId === "asian_total_goals"));
});

test("gap: Jornada mixta conserva clásicos y Asian en el catálogo", async () => {
  const result = await scanSportsJourney(journeyInput(["goals", "asian_total_goals"]), gateway());
  const families = new Set(result.candidates.map((candidate) => candidate.marketId));

  assert.ok(families.has("goals"));
  assert.ok(families.has("asian_total_goals"));
});

test("gap: la shortlist clásica no trata Favorabilidad Asian como probabilidad", () => {
  const classic = shortlistCandidate();
  const asian = shortlistCandidate({
    marketId: "asian_total_goals",
    probabilitySemantics: "settlement_favorability",
    sportsFavorability: 0.86,
    estimatedProbability: 0.86,
  });

  assert.deepEqual(buildJourneyRecommendationShortlist([classic, asian]).map((candidate) => candidate.marketId), ["goals"]);
});

test("generación Asian es sports-first y no depende de odds ni magnitudes económicas", async () => {
  const analysis = await analyzeSportsFixture({
    date: "2026-08-01", competitionKey: "colombiaPrimeraA", season: 2026,
    fixtureId: 81_000, marketId: "asian_total_goals",
  }, gateway());
  const context = {
    marketFamily: "asian_total_goals",
    leagueProfile: analysis.leagueProfile,
    homeTeamProfile: analysis.homeTeamProfile,
    awayTeamProfile: analysis.awayTeamProfile,
    refereeProfile: analysis.refereeProfile,
  };
  const baseline = generateCandidateLines(context);
  const economicNoise = generateCandidateLines({
    ...context,
    odds: 9.99,
    bookmaker: "Casa de prueba",
    price_equivalent_probability: 0.01,
    implied_probability: 0.99,
  });
  const signature = (result) => result.candidates.map((candidate) => ({
    id: candidate.candidate_id,
    direction: candidate.direction,
    line: candidate.line,
    favorability: candidate.sports_favorability,
    score: candidate.sports_score,
  }));

  assert.deepEqual(signature(economicNoise), signature(baseline));
  assert.ok(baseline.candidates.length > 0);
});

test("candidates conserva el catálogo Asian completo y la shortlist aplica cap 10 solo a presentación", async () => {
  const result = await scanSportsJourney(journeyInput(["asian_total_goals"]), gateway());
  const lines = new Set(result.candidates.map((candidate) => candidate.line));

  assert.equal(result.candidates.length, lines.size * 2);
  assert.ok(result.candidates.length > result.asianRecommendedCandidates.length);
  assert.equal(result.asianRecommendedCandidates.length, 10);
  assert.ok(result.candidates.every((candidate) => candidate.probabilitySemantics === "settlement_favorability"));
});

test("shortlists clásica y Asian permanecen separadas", async () => {
  const result = await scanSportsJourney(journeyInput(["goals", "asian_total_goals"]), gateway());

  assert.ok(result.recommendedCandidates.every((candidate) => candidate.marketId !== "asian_total_goals"));
  assert.ok(result.asianRecommendedCandidates.length > 0);
  assert.ok(result.asianRecommendedCandidates.every((candidate) => candidate.marketId === "asian_total_goals"));
});

test("shortlist Asian ordena Favorabilidad DESC y usa Solidez como desempate", () => {
  const asian = (id, favorability, score) => shortlistCandidate({
    fixtureId: id,
    marketId: "asian_total_goals",
    probabilitySemantics: "settlement_favorability",
    sportsFavorability: favorability,
    estimatedProbability: favorability,
    sportsScore: score,
  });
  const result = buildJourneyAsianRecommendationShortlist([
    asian(1, 0.7, 90), asian(2, 0.8, 60), asian(3, 0.8, 85),
  ]);

  assert.deepEqual(result.map((candidate) => candidate.fixtureId), [3, 2, 1]);
});

test("Asian queda fuera de combinationCandidates sin desaparecer del catálogo", async () => {
  const asianOnly = await scanSportsJourney(journeyInput(["asian_total_goals"]), gateway());
  const mixed = await scanSportsJourney(journeyInput(["goals", "asian_total_goals"]), gateway());

  assert.ok(asianOnly.candidates.length > 0);
  assert.deepEqual(asianOnly.combinationCandidates, []);
  assert.ok(mixed.combinationCandidates.length > 0);
  assert.ok(mixed.combinationCandidates.every((candidate) => candidate.marketId !== "asian_total_goals"));
});

test("añadir Asian no altera salida ni orden de candidatos clásicos", async () => {
  const classic = await scanSportsJourney(journeyInput(["goals"]), gateway());
  const mixed = await scanSportsJourney(journeyInput(["goals", "asian_total_goals"]), gateway());
  const signature = (candidate) => ({
    marketId: candidate.marketId,
    direction: candidate.direction,
    line: candidate.line,
    probability: candidate.estimatedProbability,
    sportsScore: candidate.sportsScore,
    recommended: candidate.decisionFrontier?.recommended,
  });

  assert.deepEqual(mixed.candidates.filter((candidate) => candidate.marketId === "goals").map(signature), classic.candidates.map(signature));
  assert.deepEqual(mixed.recommendedCandidates.map(signature), classic.recommendedCandidates.map(signature));
});

test("diagnóstico distingue Asian evaluado de Asian no evaluable", async () => {
  const evaluated = await scanSportsJourney(journeyInput(["asian_total_goals"]), gateway());
  const unavailable = await scanSportsJourney(journeyInput(["asian_total_goals"]), gateway({ history: [] }));
  const asianStatus = (result) => result.analysisDiagnostics[0].marketStatuses.find((item) => item.marketFamily === "asian_total_goals");

  assert.equal(asianStatus(evaluated).evaluationStatus, "evaluated");
  assert.ok(asianStatus(evaluated).candidateCount > 0);
  assert.equal(asianStatus(unavailable).evaluationStatus, "not_evaluable");
  assert.equal(asianStatus(unavailable).candidateCount, 0);
});

test("mismo fixture y contexto producen el mismo catálogo y shortlist Asian", async () => {
  const first = await scanSportsJourney(journeyInput(["asian_total_goals"]), gateway());
  const second = await scanSportsJourney(journeyInput(["asian_total_goals"]), gateway());
  const signature = (candidate) => `${candidate.fixtureId}:${candidate.marketId}:${candidate.direction}:${candidate.line}:${candidate.sportsFavorability}:${candidate.sportsScore}`;

  assert.deepEqual(second.candidates.map(signature), first.candidates.map(signature));
  assert.deepEqual(second.asianRecommendedCandidates.map(signature), first.asianRecommendedCandidates.map(signature));
});

test("rankMarketCandidates ordena dentro de semántica y nunca compara Asian contra clásico", () => {
  const base = {
    direction: "over", probability_status: "preliminary", uncertainty_low: 0.5,
    uncertainty_high: 0.7, sample_size_effective: 12, projected_mean: 2.5,
    dispersion: 1, limitations: [], model_validation_status: "preliminary_unvalidated",
  };
  const classic = { ...base, candidate_id: "goals:over:1.5", market_family: "goals", line: 1.5, preliminary_probability: 0.2 };
  const asianLowProbabilityHighFavorability = {
    ...base, candidate_id: "asian:over:2.25", market_family: "asian_total_goals", line: 2.25,
    preliminary_probability: 0.1, estimated_probability: 0.1,
    probability_semantics: "settlement_favorability", sports_favorability: 0.9,
  };
  const asianHighProbabilityLowFavorability = {
    ...base, candidate_id: "asian:over:2.75", market_family: "asian_total_goals", line: 2.75,
    preliminary_probability: 0.8, estimated_probability: 0.8,
    probability_semantics: "settlement_favorability", sports_favorability: 0.4,
  };
  const ranked = rankMarketCandidates([classic, asianLowProbabilityHighFavorability, asianHighProbabilityLowFavorability]);

  assert.equal(ranked[0].candidate_id, classic.candidate_id);
  assert.deepEqual(ranked.slice(1).map((candidate) => candidate.candidate_id), [asianLowProbabilityHighFavorability.candidate_id, asianHighProbabilityLowFavorability.candidate_id]);
});

test("shortlist Asian ignora price_equivalent_probability para su orden deportivo", () => {
  const candidates = [
    shortlistCandidate({ fixtureId: 1, marketId: "asian_total_goals", probabilitySemantics: "settlement_favorability", sportsFavorability: 0.75, estimatedProbability: 0.75, sportsScore: 80, price_equivalent_probability: 0.1 }),
    shortlistCandidate({ fixtureId: 2, marketId: "asian_total_goals", probabilitySemantics: "settlement_favorability", sportsFavorability: 0.7, estimatedProbability: 0.7, sportsScore: 80, price_equivalent_probability: 0.99 }),
  ];

  assert.deepEqual(buildJourneyAsianRecommendationShortlist(candidates).map((candidate) => candidate.fixtureId), [1, 2]);
});
