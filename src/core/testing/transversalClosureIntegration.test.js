import assert from "node:assert/strict";
import test from "node:test";

import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { analyzeOperationalFixture } from "../services/operationalAnalysisService.js";
import { officialPredictionEligibility } from "../intelligence/officialPrediction.js";

// Cierre transversal: confirma que un análisis Individual REAL (no un
// director sintético a mano, como usan otras suites) produce un
// director.sports_verdict/market_evaluated con la forma que Memoria y Bet
// Tracker realmente leen. Detectó un hueco real: para team_asian_handicap,
// director.market_evaluated quedaba en null (el candidato nunca pasa por
// base.marketAssessments, a diferencia de asian_total_goals), lo que
// bloqueaba officialPredictionEligibility incluso después de que esa función
// ya soportara side/team_id.

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

function fixtureStatistics(fixture) {
  return {
    teams: [
      { team: fixture.teams.home, statistics: { total_shots: { value: 12 }, shots_on_goal: { value: 5 }, yellow_cards: { value: 2 }, red_cards: { value: 0 }, fouls: { value: 12 }, corner_kicks: { value: 5 }, ball_possession: { value: 50 } } },
      { team: fixture.teams.away, statistics: { total_shots: { value: 12 }, shots_on_goal: { value: 5 }, yellow_cards: { value: 2 }, red_cards: { value: 0 }, fouls: { value: 12 }, corner_kicks: { value: 5 }, ball_possession: { value: 50 } } },
    ],
  };
}

function buildGateway({ leaguePairs, homePairs, awayPairs }) {
  const leagueFixtures = leaguePairs.map((pair, i) => finishedFixture({ id: 9_000 + i, homeId: 800 + i, awayId: 850 + i, homeGoals: pair.home, awayGoals: pair.away, dayOffset: i }));
  const homeFixtures = homePairs.map((pair, i) => finishedFixture({ id: 9_100 + i, homeId: HOME_TEAM_ID, awayId: 750 + i, homeGoals: pair.home, awayGoals: pair.away, dayOffset: i }));
  const awayFixtures = awayPairs.map((pair, i) => finishedFixture({ id: 9_200 + i, homeId: 700 + i, awayId: AWAY_TEAM_ID, homeGoals: pair.home, awayGoals: pair.away, dayOffset: i }));
  const allHistorical = [...leagueFixtures, ...homeFixtures, ...awayFixtures];
  const statsById = new Map(allHistorical.map((fixture) => [fixture.fixtureId, fixtureStatistics(fixture)]));
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

const HOME_STRONG = Array.from({ length: 12 }, () => ({ home: 3, away: 0 }));
const AWAY_WEAK = Array.from({ length: 12 }, () => ({ home: 0, away: 3 }));
const LEAGUE_MID = Array.from({ length: 20 }, () => ({ home: 1, away: 1 }));

const NOW = "2026-08-01T12:00:00.000Z";

function baseInput(overrides = {}) {
  return {
    date: "2026-08-01",
    timezone: "America/Bogota",
    competitionKey: "colombiaPrimeraA",
    season: 2026,
    fixtureId: 9_300,
    analysisMode: "specific",
    manualCandidateOdds: [],
    manualOdds: null,
    ...overrides,
  };
}

const GATEWAY_FACTORY = () => buildGateway({ leaguePairs: LEAGUE_MID, homePairs: HOME_STRONG, awayPairs: AWAY_WEAK });

// -----------------------------------------------------------------------
// director.market_evaluated / director.sports_verdict deben quedar
// correctos para un análisis REAL de las tres familias, con la identidad
// exacta que Memoria y Bet Tracker leen productivamente.
// -----------------------------------------------------------------------

test("Individual real: goals produce director.market_evaluated.family correcto", async () => {
  const result = await analyzeOperationalFixture(
    baseInput({ marketId: "goals", line: "1.5", selection: "over" }),
    GATEWAY_FACTORY(),
    { now: () => NOW, idFactory: () => "v-goals" },
  );
  assert.equal(result.status, DATA_LOAD_STATUS.SUCCESS);
  assert.equal(result.director.market_evaluated?.family, "goals");
});

test("Individual real: asian_total_goals produce director.market_evaluated.family correcto", async () => {
  const result = await analyzeOperationalFixture(
    baseInput({ marketId: "asian_total_goals", line: "2.5", selection: "over" }),
    GATEWAY_FACTORY(),
    { now: () => NOW, idFactory: () => "v-asian" },
  );
  assert.equal(result.status, DATA_LOAD_STATUS.SUCCESS);
  assert.equal(result.director.market_evaluated?.family, "asian_total_goals");
});

test("Individual real: team_asian_handicap produce director.market_evaluated.family correcto (hueco real corregido)", async () => {
  const result = await analyzeOperationalFixture(
    baseInput({ marketId: "team_asian_handicap", line: "-0.75", selection: "home" }),
    GATEWAY_FACTORY(),
    { now: () => NOW, idFactory: () => "v-team-ah" },
  );
  assert.equal(result.status, DATA_LOAD_STATUS.SUCCESS);
  assert.equal(result.director.market_evaluated?.family, "team_asian_handicap");
  assert.equal(result.director.market_evaluated?.label, "Asiático — Hándicap por equipo");
  assert.equal(result.director.sports_verdict?.team_id, HOME_TEAM_ID);
});

// -----------------------------------------------------------------------
// Un análisis Individual REAL de team_asian_handicap debe poder registrarse
// como pronóstico oficial en Memoria — no solo un director sintético
// construido a mano en la suite de Memoria.
// -----------------------------------------------------------------------

async function reanalyzedWithManualOdds(marketId, { line, selection, teamId = null }) {
  const gateway = GATEWAY_FACTORY();
  const sportsOnly = await analyzeOperationalFixture(
    baseInput({ marketId, line, selection }),
    gateway,
    { now: () => NOW, idFactory: () => `v-${marketId}-sports` },
  );
  const primary = sportsOnly.marketSelection.primary;
  const manualOdds = {
    marketFamily: marketId,
    bookmaker: "Betano",
    direction: primary?.direction ?? selection,
    teamId: teamId ?? primary?.team_id ?? null,
    selection: primary?.direction ?? selection,
    line: String(primary?.line ?? line),
    decimalOdds: "3.0",
    consultedAt: "2026-08-01T11:45:00.000Z",
    timezone: "America/Bogota",
    analysisVersion: `v-${marketId}-sports`,
  };
  return analyzeOperationalFixture(
    baseInput({ marketId, line, selection, reanalysis: true, manualOdds, geminiContext: { valid_for_reanalysis: true, selected_items: [] } }),
    gateway,
    { now: () => NOW, idFactory: () => `v-${marketId}-priced` },
  );
}

// officialPredictionEligibility se alimenta productivamente de
// result.analysisVersion (la misma forma que predictionMemoryService.js lee
// del historial guardado), no del objeto crudo de analyzeOperationalFixture
// — se reproduce exactamente ese camino real, con cuota y decisión de precio
// reales (no un wrapper sintético).

test("un análisis Individual real de team_asian_handicap es elegible para Memoria (fixture directorAtlas.market_evaluated)", async () => {
  const result = await reanalyzedWithManualOdds("team_asian_handicap", { line: "-0.75", selection: "home" });
  assert.equal(result.status, DATA_LOAD_STATUS.SUCCESS);
  const eligibility = officialPredictionEligibility(result.analysisVersion);
  assert.equal(eligibility.eligible, true, `debería ser elegible con un análisis real: ${eligibility.reasons.join(", ")}`);
});

test("un análisis Individual real de asian_total_goals sigue siendo elegible para Memoria (regresión)", async () => {
  const result = await reanalyzedWithManualOdds("asian_total_goals", { line: "2.5", selection: "over" });
  assert.equal(result.status, DATA_LOAD_STATUS.SUCCESS);
  const eligibility = officialPredictionEligibility(result.analysisVersion);
  assert.equal(eligibility.eligible, true, `debería ser elegible: ${eligibility.reasons.join(", ")}`);
});
