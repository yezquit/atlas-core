import assert from "node:assert/strict";
import test from "node:test";

import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { analyzeOperationalFixture } from "../services/operationalAnalysisService.js";

// Mismo patrón de gateway de integración ya usado en
// operationalAnalysisRadarIntegration.test.js: liga/local/visitante con
// rangos de fixture_id disjuntos, para que la exclusión leave-one-out del
// modelo deportivo tenga muestra propia en cada fuente.

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

function teamAhInput(overrides = {}) {
  return {
    date: "2026-08-01",
    timezone: "America/Bogota",
    competitionKey: "colombiaPrimeraA",
    season: 2026,
    fixtureId: 9_300,
    marketId: "team_asian_handicap",
    analysisMode: "specific",
    line: null,
    selection: null,
    manualCandidateOdds: [],
    manualOdds: null,
    ...overrides,
  };
}

// -----------------------------------------------------------------------
// Home con línea negativa; Away con línea positiva.
// -----------------------------------------------------------------------

test("Individual: Local con línea negativa produce un candidato real Team AH", async () => {
  const gateway = buildGateway({ leaguePairs: LEAGUE_MID, homePairs: HOME_STRONG, awayPairs: AWAY_WEAK });
  const result = await analyzeOperationalFixture(teamAhInput({ line: "-1.5", selection: "home" }), gateway, { now: () => NOW, idFactory: () => "team-ah-home" });
  assert.equal(result.status, DATA_LOAD_STATUS.SUCCESS);
  const primary = result.marketSelection.primary;
  assert.ok(primary, "debe existir un candidato principal");
  assert.equal(primary.market_family, "team_asian_handicap");
  assert.equal(primary.side, "home");
  assert.equal(primary.team_id, HOME_TEAM_ID);
  assert.equal(primary.line, -1.5);
  assert.equal(result.marketSelection.exact_line_available, true);
  assert.equal(result.marketSelection.ready_for_pricing, true);
});

test("Individual: Visitante con línea positiva produce un candidato real Team AH", async () => {
  const gateway = buildGateway({ leaguePairs: LEAGUE_MID, homePairs: HOME_STRONG, awayPairs: AWAY_WEAK });
  const result = await analyzeOperationalFixture(teamAhInput({ line: "1.5", selection: "away" }), gateway, { now: () => NOW, idFactory: () => "team-ah-away" });
  assert.equal(result.status, DATA_LOAD_STATUS.SUCCESS);
  const primary = result.marketSelection.primary;
  assert.ok(primary, "debe existir un candidato principal");
  assert.equal(primary.market_family, "team_asian_handicap");
  assert.equal(primary.side, "away");
  assert.equal(primary.team_id, AWAY_TEAM_ID);
  assert.equal(primary.line, 1.5);
});

// -----------------------------------------------------------------------
// Identidad: fixture_id + market_family + team_id + line (nunca
// direction=over|under como concepto público).
// -----------------------------------------------------------------------

test("Individual: identidad exacta del candidato es fixture_id + team_id + line, no over/under", async () => {
  const gateway = buildGateway({ leaguePairs: LEAGUE_MID, homePairs: HOME_STRONG, awayPairs: AWAY_WEAK });
  const result = await analyzeOperationalFixture(teamAhInput({ line: "-0.5", selection: "home" }), gateway, { now: () => NOW, idFactory: () => "team-ah-identity" });
  const primary = result.marketSelection.primary;
  assert.equal(primary.fixture_id, 9_300);
  assert.equal(primary.team_id, HOME_TEAM_ID);
  assert.equal(primary.line, -0.5);
  assert.doesNotMatch(primary.selection, /over|under/i);
  assert.equal(result.exactSelection.market_family, "team_asian_handicap");
  assert.equal(result.exactSelection.line, -0.5);
});

// -----------------------------------------------------------------------
// Favorabilidad Atlas y Solidez presentes; nunca etiquetadas como
// probabilidad literal.
// -----------------------------------------------------------------------

test("Individual: expone Favorabilidad Atlas (sports_favorability) y Solidez (sports_score), con semántica settlement_favorability", async () => {
  const gateway = buildGateway({ leaguePairs: LEAGUE_MID, homePairs: HOME_STRONG, awayPairs: AWAY_WEAK });
  const result = await analyzeOperationalFixture(teamAhInput({ line: "-1.5", selection: "home" }), gateway, { now: () => NOW, idFactory: () => "team-ah-favorability" });
  const primary = result.marketSelection.primary;
  assert.ok(Number.isFinite(primary.sports_favorability));
  assert.equal(primary.probability_semantics, "settlement_favorability");
  assert.ok(Number.isFinite(primary.sports_score), "Solidez (sports_score) debe calcularse vía rankMarketCandidates");
  assert.ok(primary.team_asian_handicap_settlement_profile);
  assert.equal(primary.team_asian_handicap_settlement_profile.market_family, "team_asian_handicap");
  // Alias genérico para consumidores family-agnostic (ver teamAsianHandicap.js).
  assert.equal(primary.asian_settlement_profile, primary.team_asian_handicap_settlement_profile);
});

test("Individual: preliminary_probability/estimated_probability de Team AH nunca se etiquetan como probabilidad literal de ganar", async () => {
  const gateway = buildGateway({ leaguePairs: LEAGUE_MID, homePairs: HOME_STRONG, awayPairs: AWAY_WEAK });
  const result = await analyzeOperationalFixture(teamAhInput({ line: "-1.5", selection: "home" }), gateway, { now: () => NOW, idFactory: () => "team-ah-no-false-probability" });
  const primary = result.marketSelection.primary;
  assert.ok(primary.limitations.some((text) => /Favorabilidad Atlas.*no una probabilidad literal de ganar/i.test(text)));
  assert.equal(primary.model_validation_status, "preliminary_unvalidated");
});

// -----------------------------------------------------------------------
// Línea exacta imposible de recalcular: se declara indisponible, nunca se
// sustituye en silencio por otra línea/equipo.
// -----------------------------------------------------------------------

test("Individual: sin historial suficiente, Team AH declara indisponible en vez de sustituir la línea", async () => {
  const gateway = buildGateway({ leaguePairs: [], homePairs: [], awayPairs: [] });
  const result = await analyzeOperationalFixture(teamAhInput({ line: "-1.5", selection: "home" }), gateway, { now: () => NOW, idFactory: () => "team-ah-unavailable" });
  assert.equal(result.status, DATA_LOAD_STATUS.SUCCESS);
  assert.equal(result.marketSelection.exact_requested_line_unavailable, true);
  assert.equal(result.marketSelection.primary, null);
  assert.ok(result.marketSelection.unavailable_reason);
});

test("Individual: sin equipo (side) reconocible, Team AH declara indisponible sin fabricar un candidato", async () => {
  const gateway = buildGateway({ leaguePairs: LEAGUE_MID, homePairs: HOME_STRONG, awayPairs: AWAY_WEAK });
  const result = await analyzeOperationalFixture(teamAhInput({ line: "-1.5", selection: "over" }), gateway, { now: () => NOW, idFactory: () => "team-ah-invalid-side" });
  assert.equal(result.marketSelection.primary, null);
  assert.equal(result.marketSelection.exact_requested_line_unavailable, true);
});
