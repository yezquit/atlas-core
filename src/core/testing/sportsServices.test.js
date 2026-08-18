import test from "node:test";
import assert from "node:assert/strict";

import { DATA_LOAD_STATUS, DIRECTOR_STATUS } from "../contracts/atlasContracts.js";
import {
  analyzeSportsFixture,
  scanSportsJourney,
} from "../services/sportsIntelligenceService.js";

function targetFixture(id = 5_000) {
  return {
    fixtureId: id,
    competition: {
      id: 239,
      name: "Primera A",
      country: "Colombia",
      season: 2026,
    },
    date: { utc: "2026-08-01T20:00:00Z" },
    status: { isScheduled: true, isFinished: false },
    teams: {
      home: { id: 10, name: "Equipo Local" },
      away: { id: 20, name: "Equipo Visitante" },
    },
    score: { goals: { home: null, away: null } },
    referee: { name: "Ana Ruiz", confirmed: true },
    venue: { name: "Estadio Central", city: "Bogotá" },
  };
}

function historicalFixture(index) {
  const homeId = index % 2 === 0 ? 10 : 20;
  const awayId = homeId === 10 ? 20 : 10;
  return {
    ...targetFixture(6_000 + index),
    date: { utc: `2026-07-${String(index + 1).padStart(2, "0")}T20:00:00Z` },
    status: { isScheduled: false, isFinished: true },
    teams: {
      home: { id: homeId, name: homeId === 10 ? "Equipo Local" : "Equipo Visitante" },
      away: { id: awayId, name: awayId === 10 ? "Equipo Local" : "Equipo Visitante" },
    },
    score: { goals: { home: (index % 3) + 1, away: index % 2 } },
  };
}

function fixtureStatistics(item) {
  const makeTeam = (team) => ({
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
  });
  return { teams: [makeTeam(item.teams.home), makeTeam(item.teams.away)] };
}

function gateway({ fixturesForDate = [], budgetExhausted = false } = {}) {
  const history = Array.from({ length: 10 }, (_, index) => historicalFixture(index));
  const runtime = {
    snapshot: () => ({
      requestsUsed: 12,
      cacheHits: 2,
      cacheMisses: 10,
      deduplicated: 1,
      configuredBudget: 45,
      configuredBudgetRemaining: budgetExhausted ? 0 : 33,
      budgetExhausted,
    }),
  };
  return {
    runtime,
    loadCompetitionMetadata: async () => ({
      status: DATA_LOAD_STATUS.SUCCESS,
      seasonMetadata: { year: 2026, coverage: { fixtures: { statistics_fixtures: true } } },
      availableSeasons: [2025, 2026],
      verificationStatus: "verified",
    }),
    loadFixtureById: async ({ fixtureId }) => ({
      status: DATA_LOAD_STATUS.SUCCESS,
      selectedFixtureId: fixtureId,
      fixture: targetFixture(fixtureId),
    }),
    loadLeagueWindow: async () => ({
      status: DATA_LOAD_STATUS.SUCCESS,
      fixtures: history,
    }),
    loadTeamRecent: async () => ({
      status: DATA_LOAD_STATUS.SUCCESS,
      fixtures: history,
    }),
    loadFixtureStatistics: async (fixtureId) => {
      const item = history.find((candidate) => candidate.fixtureId === fixtureId);
      return {
        status: DATA_LOAD_STATUS.SUCCESS,
        fixtureId,
        statistics: fixtureStatistics(item || history[0]),
      };
    },
    loadFixturesForDate: async () => ({
      status: fixturesForDate.length ? DATA_LOAD_STATUS.SUCCESS : DATA_LOAD_STATUS.EMPTY,
      fixtures: fixturesForDate,
      message: fixturesForDate.length ? "Partidos disponibles" : "Sin partidos",
    }),
  };
}

const analysisInput = {
  date: "2026-08-01",
  competitionKey: "colombiaPrimeraA",
  season: 2026,
  fixtureId: 5_000,
  marketId: "goals",
};

test("análisis integrado conserva fixture ID y construye perfiles", async () => {
  const result = await analyzeSportsFixture(analysisInput, gateway());

  assert.equal(result.status, DATA_LOAD_STATUS.SUCCESS);
  assert.equal(result.selectedFixtureId, 5_000);
  assert.equal(result.fixture.fixtureId, 5_000);
  assert.equal(result.leagueProfile.sample_size, 10);
  assert.equal(result.homeTeamProfile.last_5.sample_size, 5);
  assert.equal(result.awayTeamProfile.last_10.sample_size, 10);
  assert.equal(result.director.status, DIRECTOR_STATUS.CANDIDATE_FOR_MARKET_REVIEW);
});

test("el servicio rechaza una sustitución silenciosa del fixture ID", async () => {
  const mock = gateway();
  mock.loadFixtureById = async () => ({
    status: DATA_LOAD_STATUS.SUCCESS,
    selectedFixtureId: 5_000,
    fixture: targetFixture(5_001),
  });
  const result = await analyzeSportsFixture(analysisInput, mock);

  assert.equal(result.status, DATA_LOAD_STATUS.BLOCKED);
  assert.equal(result.errorCode, "fixture_selection_mismatch");
  assert.equal(result.selectedFixtureId, 5_000);
  assert.equal(result.fixture, null);
});

test("explorador sin partidos retorna empty", async () => {
  const result = await scanSportsJourney(
    {
      date: "2026-08-01",
      competitionKeys: ["colombiaPrimeraA"],
      marketIds: ["goals"],
      maximumFixtures: 5,
    },
    gateway()
  );

  assert.equal(result.status, DATA_LOAD_STATUS.EMPTY);
  assert.deepEqual(result.candidates, []);
});

test("explorador respeta el máximo de candidatos solicitado", async () => {
  const dayFixtures = Array.from({ length: 7 }, (_, index) => targetFixture(7_000 + index));
  const result = await scanSportsJourney(
    {
      date: "2026-08-01",
      competitionKeys: ["colombiaPrimeraA"],
      marketIds: ["goals"],
      maximumFixtures: 7,
      maximumCandidates: 7,
    },
    gateway({ fixturesForDate: dayFixtures })
  );

  assert.equal(result.status, DATA_LOAD_STATUS.SUCCESS);
  assert.equal(result.fixturesReviewed, 7);
  assert.equal(result.candidates.length, 7);
  assert.ok(result.candidates.every((candidate) => candidate.fixtureId));
});

test("límite de cuota detiene el escaneo", async () => {
  const result = await scanSportsJourney(
    {
      date: "2026-08-01",
      competitionKeys: ["colombiaPrimeraA"],
      marketIds: ["goals"],
      maximumFixtures: 5,
    },
    gateway({ fixturesForDate: [targetFixture()], budgetExhausted: true })
  );

  assert.equal(result.status, DATA_LOAD_STATUS.BLOCKED);
  assert.equal(result.fixturesReviewed, 0);
  assert.equal(result.telemetry.budgetExhausted, true);
});

test("respuesta integrada no contiene API key ni datos de cuenta", async () => {
  const serialized = JSON.stringify(await analyzeSportsFixture(analysisInput, gateway()));

  assert.doesNotMatch(serialized, /API_FOOTBALL_KEY|x-apisports-key|account/i);
});
