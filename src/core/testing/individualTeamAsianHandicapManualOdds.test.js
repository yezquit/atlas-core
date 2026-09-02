import assert from "node:assert/strict";
import test from "node:test";

import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { analyzeOperationalFixture } from "../services/operationalAnalysisService.js";
import { validateManualOddsInput } from "../intelligence/oddsIntelligence.js";

// Mismo patrón de gateway ya usado en individualTeamAsianHandicap.test.js /
// matchEconomicsV3.test.js: liga/local/visitante con rangos de fixture_id
// disjuntos, y un flujo en dos pasos (deportivo puro -> reanalysis con
// manualOdds), igual que hace la UI real.

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
const CONSULTED_AT = "2026-08-01T11:45:00.000Z";

function baseInput(overrides = {}) {
  return {
    date: "2026-08-01",
    timezone: "America/Bogota",
    competitionKey: "colombiaPrimeraA",
    season: 2026,
    fixtureId: 9_300,
    marketId: "team_asian_handicap",
    analysisMode: "specific",
    manualCandidateOdds: [],
    ...overrides,
  };
}

async function sportsThenPriced({ line, selection, manualOddsOverrides = {}, gateway = buildGateway({ leaguePairs: LEAGUE_MID, homePairs: HOME_STRONG, awayPairs: AWAY_WEAK }) }) {
  const sportsOnly = await analyzeOperationalFixture(
    baseInput({ line, selection, manualOdds: null }),
    gateway,
    { now: () => NOW, idFactory: () => "v-sports-only" },
  );
  const primary = sportsOnly.marketSelection.primary;
  const manualOddsPayload = {
    marketFamily: "team_asian_handicap",
    bookmaker: "Betano",
    direction: primary?.side ?? selection,
    teamId: primary?.team_id ?? null,
    selection: primary?.side ?? selection,
    line: String(primary?.line ?? line),
    decimalOdds: "2.10",
    consultedAt: CONSULTED_AT,
    timezone: "America/Bogota",
    analysisVersion: "v-sports-only",
    ...manualOddsOverrides,
  };
  const priced = await analyzeOperationalFixture(
    baseInput({ line, selection, reanalysis: true, manualOdds: manualOddsPayload }),
    gateway,
    { now: () => NOW, idFactory: () => "v-priced" },
  );
  return { sportsOnly, priced, primary, manualOddsPayload };
}

// -----------------------------------------------------------------------
// A / B. home -0.75 y away +0.25 con cuota manual válida.
// -----------------------------------------------------------------------

test("A. Local -0.75 con cuota manual válida queda evaluada económicamente", async () => {
  const { priced } = await sportsThenPriced({ line: "-0.75", selection: "home" });
  assert.equal(priced.status, DATA_LOAD_STATUS.SUCCESS);
  assert.notEqual(priced.director.price_assessment.status, "unavailable");
  assert.equal(priced.director.price_assessment.bookmaker, "Betano");
  assert.equal(priced.director.price_assessment.decimal_odds, 2.1);
  assert.equal(priced.selectedOdds.team_id, HOME_TEAM_ID);
  assert.equal(priced.selectedOdds.line, "-0.75");
});

test("B. Visitante +0.25 con cuota manual válida queda evaluada económicamente", async () => {
  const { priced } = await sportsThenPriced({ line: "0.25", selection: "away" });
  assert.equal(priced.status, DATA_LOAD_STATUS.SUCCESS);
  assert.notEqual(priced.director.price_assessment.status, "unavailable");
  assert.equal(priced.selectedOdds.team_id, AWAY_TEAM_ID);
  assert.equal(priced.selectedOdds.line, "0.25");
});

// -----------------------------------------------------------------------
// C. No exige over/under.
// -----------------------------------------------------------------------

test("C. la cuota manual de Team AH no exige direction=over/under", () => {
  const valid = validateManualOddsInput({
    fixtureId: 9300, marketFamily: "team_asian_handicap", side: "home", teamId: HOME_TEAM_ID,
    line: "-0.75", decimalOdds: "2.1", bookmaker: "Betano", consultedAt: CONSULTED_AT, timezone: "America/Bogota",
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.errors, []);
});

// -----------------------------------------------------------------------
// D. team_id incorrecto no se reutiliza; E. línea distinta no reutiliza precio.
// -----------------------------------------------------------------------

test("D. una cuota manual de OTRO team_id no se vincula al candidato", async () => {
  const gateway = buildGateway({ leaguePairs: LEAGUE_MID, homePairs: HOME_STRONG, awayPairs: AWAY_WEAK });
  const { priced } = await sportsThenPriced({ line: "-0.75", selection: "home", gateway, manualOddsOverrides: { teamId: AWAY_TEAM_ID } });
  // El servidor rechaza la cuota en el gate de validación (team_id no
  // pertenece al equipo elegido no se detecta ahí — se detecta al no
  // encontrar coincidencia exacta): el precio queda pendiente, nunca se
  // reutiliza la cuota del otro equipo.
  assert.equal(priced.director.price_pending ?? priced.director.price_assessment?.status === "unavailable", true);
});

test("E. una cuota de candidato para OTRA línea del mismo equipo no se reutiliza como precio de la línea pedida", async () => {
  const gateway = buildGateway({ leaguePairs: LEAGUE_MID, homePairs: HOME_STRONG, awayPairs: AWAY_WEAK });
  const sportsOnly = await analyzeOperationalFixture(
    baseInput({ line: "-0.75", selection: "home", manualOdds: null }),
    gateway,
    { now: () => NOW, idFactory: () => "v-sports-only-e" },
  );
  const primary = sportsOnly.marketSelection.primary;
  const priced = await analyzeOperationalFixture(
    baseInput({
      line: "-0.75",
      selection: "home",
      reanalysis: true,
      manualOdds: {
        marketFamily: "team_asian_handicap", bookmaker: "Betano", direction: "home", teamId: primary.team_id,
        selection: "home", line: "-0.75", decimalOdds: "2.10", consultedAt: CONSULTED_AT, timezone: "America/Bogota", analysisVersion: "v-sports-only-e",
      },
      // Cuota de candidato para la MISMA identidad de equipo pero OTRA línea
      // (-1.5) — no debe contaminar la cuota activa de -0.75.
      manualCandidateOdds: [{
        marketFamily: "team_asian_handicap", bookmaker: "OtraCasa", direction: "home", teamId: primary.team_id,
        selection: "home", line: "-1.5", decimalOdds: "5.0", consultedAt: CONSULTED_AT, timezone: "America/Bogota",
      }],
    }),
    gateway,
    { now: () => NOW, idFactory: () => "v-priced-e" },
  );
  assert.equal(priced.selectedOdds.line, "-0.75");
  assert.equal(priced.selectedOdds.decimal_odds, 2.1);
  assert.notEqual(priced.selectedOdds.decimal_odds, 5.0);
});

// -----------------------------------------------------------------------
// F. cuota inválida se rechaza.
// -----------------------------------------------------------------------

test("F. cuota manual inválida (sin equipo, sin team_id, odds<=1) se rechaza explícitamente", () => {
  const noSide = validateManualOddsInput({ fixtureId: 9300, marketFamily: "team_asian_handicap", side: "over", teamId: HOME_TEAM_ID, line: "-0.75", decimalOdds: "2.1", bookmaker: "Betano", consultedAt: CONSULTED_AT, timezone: "America/Bogota" });
  assert.equal(noSide.valid, false);
  assert.ok(noSide.errors.includes("invalid_side"));

  const noTeamId = validateManualOddsInput({ fixtureId: 9300, marketFamily: "team_asian_handicap", side: "home", line: "-0.75", decimalOdds: "2.1", bookmaker: "Betano", consultedAt: CONSULTED_AT, timezone: "America/Bogota" });
  assert.equal(noTeamId.valid, false);
  assert.ok(noTeamId.errors.includes("invalid_team_id"));

  const badOdds = validateManualOddsInput({ fixtureId: 9300, marketFamily: "team_asian_handicap", side: "home", teamId: HOME_TEAM_ID, line: "-0.75", decimalOdds: "0.9", bookmaker: "Betano", consultedAt: CONSULTED_AT, timezone: "America/Bogota" });
  assert.equal(badOdds.valid, false);
  assert.ok(badOdds.errors.includes("invalid_decimal_odds"));
});

test("F. analyzeOperationalFixture rechaza manualOdds inválidas de Team AH sin tocar el fixture", async () => {
  const gateway = new Proxy({}, { get() { throw new Error("sports_reconstruction_must_not_run"); } });
  const result = await analyzeOperationalFixture(
    baseInput({
      line: "-0.75", selection: "home", reanalysis: true,
      manualOdds: { marketFamily: "team_asian_handicap", bookmaker: "Betano", side: "home", line: "-0.75", decimalOdds: "0.9", consultedAt: CONSULTED_AT, timezone: "America/Bogota" },
    }),
    gateway,
    { now: () => NOW, idFactory: () => "v-invalid" },
  );
  assert.equal(result.status, DATA_LOAD_STATUS.UNAVAILABLE);
  assert.equal(result.errorCode, "invalid_manual_odds");
  assert.ok(result.validationErrors.includes("invalid_decimal_odds") || result.validationErrors.includes("invalid_team_id"));
});

// -----------------------------------------------------------------------
// G. EV / fair odds / price equivalent funcionan con la cuota manual.
// -----------------------------------------------------------------------

test("G. la cuota manual habilita EV, fair odds y probabilidad equivalente por precio (settlement genérico)", async () => {
  const { priced } = await sportsThenPriced({ line: "-0.75", selection: "home" });
  const assessment = priced.director.price_assessment;
  assert.ok(Number.isFinite(assessment.fair_odds_atlas));
  assert.ok(Number.isFinite(assessment.expected_roi));
  assert.ok(Number.isFinite(assessment.price_equivalent_probability));
  assert.equal(assessment.implied_probability, Number((1 / 2.1).toFixed(6)));
});

// -----------------------------------------------------------------------
// H. Favorabilidad no se usa como probabilidad económica.
// -----------------------------------------------------------------------

test("H. Favorabilidad Atlas (sports_favorability) no se usa como probabilidad implícita/edge económico", async () => {
  const { priced, primary } = await sportsThenPriced({ line: "-0.75", selection: "home" });
  const assessment = priced.director.price_assessment;
  assert.notEqual(assessment.price_equivalent_probability, primary.sports_favorability);
  assert.match(
    priced.director.parlay_eligibility_reason || "",
    /probabilidad equivalente Atlas por precio|Buscar o introducir/,
  );
});

// -----------------------------------------------------------------------
// I / J. clásicos y Asian Total intactos.
// -----------------------------------------------------------------------

test("I. un mercado clásico (goals) sigue exigiendo direction=over/under como siempre", () => {
  const missingDirection = validateManualOddsInput({ fixtureId: 9300, marketFamily: "goals", line: "2.5", decimalOdds: "1.9", bookmaker: "Betano", consultedAt: CONSULTED_AT, timezone: "America/Bogota" });
  assert.equal(missingDirection.valid, false);
  assert.ok(missingDirection.errors.includes("invalid_direction"));

  const valid = validateManualOddsInput({ fixtureId: 9300, marketFamily: "goals", direction: "over", line: "2.5", decimalOdds: "1.9", bookmaker: "Betano", consultedAt: CONSULTED_AT, timezone: "America/Bogota" });
  assert.equal(valid.valid, true);
});

test("J. asian_total_goals conserva su contrato de cuota manual (over/under, sin team_id)", () => {
  const valid = validateManualOddsInput({ fixtureId: 9300, marketFamily: "asian_total_goals", direction: "over", line: "2.25", decimalOdds: "1.9", bookmaker: "Betano", consultedAt: CONSULTED_AT, timezone: "America/Bogota" });
  assert.equal(valid.valid, true);
  const missingDirection = validateManualOddsInput({ fixtureId: 9300, marketFamily: "asian_total_goals", line: "2.25", decimalOdds: "1.9", bookmaker: "Betano", consultedAt: CONSULTED_AT, timezone: "America/Bogota" });
  assert.equal(missingDirection.valid, false);
  assert.ok(missingDirection.errors.includes("invalid_direction"));
});
