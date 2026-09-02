import test from "node:test";
import assert from "node:assert/strict";

import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { buildJourneyAsianRecommendationShortlist, scanSportsJourney } from "../services/sportsIntelligenceService.js";

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

// -----------------------------------------------------------------------
// Team AH aparece cuando se selecciona; Asian Total sigue apareciendo;
// mixta clásica + Asian + Team AH funciona.
// -----------------------------------------------------------------------

test("Jornada solicitando solo team_asian_handicap produce candidatos de ambos equipos", async () => {
  const result = await scanSportsJourney(journeyInput(["team_asian_handicap"]), gateway());
  assert.ok(result.candidates.length > 0);
  assert.ok(result.candidates.every((candidate) => candidate.marketId === "team_asian_handicap"));
  const teamIds = new Set(result.candidates.map((candidate) => candidate.teamId));
  assert.deepEqual([...teamIds].sort(), [10, 20]);
});

test("Jornada sin solicitar team_asian_handicap no lo genera (opt-in explícito, igual que asian_total_goals)", async () => {
  const result = await scanSportsJourney(journeyInput(["goals"]), gateway());
  assert.ok(result.candidates.every((candidate) => candidate.marketId !== "team_asian_handicap"));
});

test("Jornada mixta: clásicas, asian_total_goals y team_asian_handicap conviven en el catálogo", async () => {
  const result = await scanSportsJourney(journeyInput(["goals", "asian_total_goals", "team_asian_handicap"]), gateway());
  const families = new Set(result.candidates.map((candidate) => candidate.marketId));
  assert.ok(families.has("goals"));
  assert.ok(families.has("asian_total_goals"));
  assert.ok(families.has("team_asian_handicap"));
});

// -----------------------------------------------------------------------
// Team AH entra en asianRecommendedCandidates (compartida con Asian Total);
// no entra en recommendedCandidates clásico; no entra en combinationCandidates.
// -----------------------------------------------------------------------

test("team_asian_handicap entra en asianRecommendedCandidates, no en recommendedCandidates clásico", async () => {
  const result = await scanSportsJourney(journeyInput(["goals", "team_asian_handicap"]), gateway());
  assert.ok(result.recommendedCandidates.every((candidate) => candidate.marketId !== "team_asian_handicap"));
  assert.ok(result.asianRecommendedCandidates.some((candidate) => candidate.marketId === "team_asian_handicap"));
});

test("asianRecommendedCandidates puede mezclar asian_total_goals y team_asian_handicap (misma shortlist settlement)", async () => {
  const result = await scanSportsJourney(journeyInput(["asian_total_goals", "team_asian_handicap"]), gateway());
  const families = new Set(result.asianRecommendedCandidates.map((candidate) => candidate.marketId));
  assert.ok(families.has("asian_total_goals") || families.has("team_asian_handicap"));
  assert.ok(result.asianRecommendedCandidates.every((candidate) => candidate.probabilitySemantics === "settlement_favorability"));
  assert.ok(result.asianRecommendedCandidates.length <= 10);
});

test("team_asian_handicap queda fuera de combinationCandidates sin desaparecer del catálogo", async () => {
  const result = await scanSportsJourney(journeyInput(["goals", "team_asian_handicap"]), gateway());
  assert.ok(result.candidates.some((candidate) => candidate.marketId === "team_asian_handicap"));
  assert.ok(result.combinationCandidates.every((candidate) => candidate.marketId !== "team_asian_handicap"));
});

// -----------------------------------------------------------------------
// Orden settlement semántico correcto: sports_favorability -> sports_score
// -> desempate determinista.
// -----------------------------------------------------------------------

test("shortlist Asian compartida ordena por Favorabilidad DESC y Solidez como desempate, mezclando ambas familias", () => {
  const item = (id, marketId, favorability, score) => ({
    fixtureId: id,
    marketId,
    direction: marketId === "team_asian_handicap" ? "home" : "over",
    line: 1.5,
    probabilitySemantics: "settlement_favorability",
    sportsFavorability: favorability,
    estimatedProbability: favorability,
    sportsScore: score,
    decisionFrontier: { recommended: true, status: "eligible" },
  });
  const result = buildJourneyAsianRecommendationShortlist([
    item(1, "asian_total_goals", 0.7, 90),
    item(2, "team_asian_handicap", 0.8, 60),
    item(3, "team_asian_handicap", 0.8, 85),
  ]);
  assert.deepEqual(result.map((candidate) => candidate.fixtureId), [3, 2, 1]);
});

// -----------------------------------------------------------------------
// Identidad: fixture_id + market_family + team_id + line; nunca probabilidad
// falsa; clásicos y Asian Total intactos.
// -----------------------------------------------------------------------

test("identidad Team AH: teamId/side presentes, sin usar over/under como concepto de selección", async () => {
  const result = await scanSportsJourney(journeyInput(["team_asian_handicap"]), gateway());
  for (const candidate of result.candidates) {
    assert.ok(candidate.teamId === 10 || candidate.teamId === 20);
    assert.ok(candidate.side === "home" || candidate.side === "away");
    assert.doesNotMatch(candidate.selection, /over|under/i);
  }
});

test("Favorabilidad Team AH nunca se expone como probabilidad literal (probabilitySemantics correcto)", async () => {
  const result = await scanSportsJourney(journeyInput(["team_asian_handicap"]), gateway());
  assert.ok(result.candidates.length > 0);
  for (const candidate of result.candidates) {
    assert.equal(candidate.probabilitySemantics, "settlement_favorability");
    assert.ok(Number.isFinite(candidate.sportsFavorability));
  }
});

test("añadir team_asian_handicap no altera salida de candidatos clásicos", async () => {
  const classic = await scanSportsJourney(journeyInput(["goals"]), gateway());
  const mixed = await scanSportsJourney(journeyInput(["goals", "team_asian_handicap"]), gateway());
  const signature = (candidate) => ({
    marketId: candidate.marketId, direction: candidate.direction, line: candidate.line,
    probability: candidate.estimatedProbability, sportsScore: candidate.sportsScore,
  });
  assert.deepEqual(mixed.candidates.filter((candidate) => candidate.marketId === "goals").map(signature), classic.candidates.map(signature));
  assert.deepEqual(mixed.recommendedCandidates.map(signature), classic.recommendedCandidates.map(signature));
});

test("añadir team_asian_handicap no altera el catálogo de asian_total_goals", async () => {
  const asianOnly = await scanSportsJourney(journeyInput(["asian_total_goals"]), gateway());
  const mixed = await scanSportsJourney(journeyInput(["asian_total_goals", "team_asian_handicap"]), gateway());
  const signature = (candidate) => `${candidate.fixtureId}:${candidate.marketId}:${candidate.direction}:${candidate.line}:${candidate.sportsFavorability}`;
  assert.deepEqual(
    mixed.candidates.filter((candidate) => candidate.marketId === "asian_total_goals").map(signature),
    asianOnly.candidates.map(signature),
  );
});

test("diagnóstico distingue team_asian_handicap sin candidatos cuando no hay historial suficiente", async () => {
  const evaluated = await scanSportsJourney(journeyInput(["team_asian_handicap"]), gateway());
  const unavailable = await scanSportsJourney(journeyInput(["team_asian_handicap"]), gateway({ history: [] }));
  assert.ok(evaluated.candidates.length > 0);
  assert.equal(unavailable.candidates.filter((candidate) => candidate.marketId === "team_asian_handicap").length, 0);
});
