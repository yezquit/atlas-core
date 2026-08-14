import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { buildSimpleDirectorPresentation } from "../modules/directorAtlas.js";
import { analyzeOperationalFixture } from "../services/operationalAnalysisService.js";

const clientPath = new URL("../../app/atlas-functional-client.js", import.meta.url);
const FIXTURE_ID = 1_520_819;
const ANALYZED_AT = "2026-08-14T16:00:00.000Z";

const fixture = {
  fixtureId: FIXTURE_ID,
  competition: { id: 72, name: "Serie B", country: "Brazil", season: 2026, round: "Regular Season - 22" },
  date: { utc: "2026-08-16T22:00:00.000Z" },
  status: { isScheduled: true, isFinished: false, isLive: false, long: "Programado", short: "NS" },
  teams: { home: { id: 10, name: "Sport Recife" }, away: { id: 20, name: "Londrina" } },
  score: { goals: { home: null, away: null }, aggregate: null },
  referee: { name: null, confirmed: false },
  venue: { name: "Ilha do Retiro", city: "Recife" },
};

function historicalFixture(index) {
  return {
    ...fixture,
    fixtureId: 8_500 + index,
    date: { utc: `2026-07-${String(index + 1).padStart(2, "0")}T20:00:00.000Z` },
    status: { isScheduled: false, isFinished: true, isLive: false, long: "Finalizado", short: "FT" },
    score: { goals: { home: index % 3, away: index % 2 }, aggregate: null },
  };
}

function statisticsFor(item) {
  return {
    teams: [item.teams.home, item.teams.away].map((team) => ({
      team,
      statistics: {
        total_shots: { value: 10 },
        shots_on_goal: { value: 4 },
        yellow_cards: { value: 2 },
        red_cards: { value: 0 },
        fouls: { value: 11 },
        corner_kicks: { value: 4 },
        ball_possession: { value: 50 },
      },
    })),
  };
}

function sboPayload(fixtureId = FIXTURE_ID, values = [
  { value: "Under 2.5", odd: "1.93" },
  { value: "Under 3.5", odd: "2.05" },
]) {
  return {
    fixture: { id: fixtureId, date: fixture.date.utc },
    update: "2026-08-14T15:59:00.000Z",
    bookmakers: [{
      id: 20,
      name: "SBO",
      bets: [{ id: 5, name: "Goals Over/Under", values }],
    }],
  };
}

function gateway() {
  const history = Array.from({ length: 10 }, (_, index) => historicalFixture(index));
  return {
    runtime: { snapshot: () => ({ requestsUsed: 6, cacheHits: 0, cacheMisses: 6, deduplicated: 0, configuredBudget: 45, configuredBudgetRemaining: 39, budgetExhausted: false, quotaStatus: "available" }) },
    loadCompetitionMetadata: async () => ({
      status: DATA_LOAD_STATUS.SUCCESS,
      seasonMetadata: { year: 2026, coverage: { odds: true, fixtures: { statistics_fixtures: true, lineups: false }, injuries: false, standings: false } },
      availableSeasons: [2026],
      verificationStatus: "verified",
    }),
    loadFixtureById: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, selectedFixtureId: FIXTURE_ID, fixture }),
    loadLeagueWindow: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: history }),
    loadTeamRecent: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: history }),
    loadFixtureStatistics: async (fixtureId) => {
      const item = history.find((candidate) => candidate.fixtureId === fixtureId) || history[0];
      return { status: DATA_LOAD_STATUS.SUCCESS, fixtureId, statistics: statisticsFor(item) };
    },
    loadFixtureOdds: async () => ({
      status: DATA_LOAD_STATUS.SUCCESS,
      response: [sboPayload(), sboPayload(FIXTURE_ID + 1, [{ value: "Under 2.5", odd: "2.40" }])],
    }),
  };
}

function manualOdds(decimalOdds = "1.83", consultedAt = "2026-08-14T15:58:00.000Z") {
  return {
    bookmaker: "Betano",
    marketFamily: "goals",
    direction: "under",
    selection: "Under 2.5",
    line: "2.5",
    decimalOdds,
    consultedAt,
    timezone: "America/Bogota",
    analysisVersion: "sport-londrina-before-update",
  };
}

const baseInput = {
  date: "2026-08-14",
  timezone: "America/Bogota",
  competitionKey: "brasilSerieB",
  season: 2026,
  fixtureId: FIXTURE_ID,
  marketId: "goals",
  analysisMode: "specific",
  line: "2.5",
  selection: "Under 2.5",
  evaluatePrice: true,
};

function analyzeWithManual({ decimalOdds = "1.83", consultedAt, now = ANALYZED_AT, previousVersion = null } = {}) {
  return analyzeOperationalFixture({
    ...baseInput,
    odds: decimalOdds,
    manualOdds: manualOdds(decimalOdds, consultedAt),
    reanalysis: true,
  }, gateway(), { now: () => now, idFactory: () => `manual-${decimalOdds}`, previousVersion });
}

let manualResultPromise;
function manualResult() {
  manualResultPromise ||= analyzeWithManual();
  return manualResultPromise;
}

let providerOnlyResultPromise;
function providerOnlyResult() {
  providerOnlyResultPromise ||= analyzeOperationalFixture({ ...baseInput, odds: null, manualOdds: null }, gateway(), {
    now: () => ANALYZED_AT,
    idFactory: () => "provider-only",
  });
  return providerOnlyResultPromise;
}

test("1. Betano 1.83 manual vence a SBO 1.93 durante la actualización explícita", async () => {
  const result = await manualResult();
  assert.deepEqual([result.activeQuote.bookmaker_name, result.activeQuote.decimal_odds], ["Betano", 1.83]);
});

test("2. active_quote conserva el bookmaker Betano", async () => {
  assert.equal((await manualResult()).analysisVersion.active_quote.bookmaker_name, "Betano");
});

test("3. active_quote conserva exactamente 1.83", async () => {
  assert.equal((await manualResult()).analysisVersion.active_quote.decimal_odds, 1.83);
});

test("4. la probabilidad implícita se calcula con 1.83", async () => {
  const result = await manualResult();
  assert.equal(result.activeQuote.implied_probability, 0.546448);
  assert.equal(result.director.implied_probability, 0.546448);
});

test("5. la evaluación económica recibe 1.83", async () => {
  const price = (await manualResult()).suitability.price_evaluation;
  assert.equal(price.decimal_odds, 1.83);
  assert.equal(price.bookmaker, "Betano");
  assert.equal(price.implied_probability, 0.546448);
});

test("6. la decisión final se construye con Betano 1.83", async () => {
  const result = await manualResult();
  assert.equal(result.director.odds, 1.83);
  assert.equal(result.director.price_assessment.decimal_odds, 1.83);
  assert.equal(result.individualPick.decimal_odds, 1.83);
});

test("7. el modo sencillo presenta Betano 1.83", async () => {
  const [result, source] = await Promise.all([manualResult(), readFile(clientPath, "utf8")]);
  const presentation = buildSimpleDirectorPresentation(result.director);
  const simple = source.slice(source.indexOf("function DirectorResult"), source.indexOf("function MarketAssessment"));
  assert.equal(presentation.has_current_price, true);
  assert.deepEqual([result.director.price_assessment.bookmaker, result.director.price_assessment.decimal_odds], ["Betano", 1.83]);
  assert.match(simple, /\$\{price\.bookmaker\} @\$\{price\.decimal_odds\}/);
});

test("8. el modo experto identifica Betano 1.83 como cuota activa", async () => {
  const [result, source] = await Promise.all([manualResult(), readFile(clientPath, "utf8")]);
  const expertOdds = source.slice(source.indexOf('<Accordion id="expert-odds"'), source.indexOf('<Accordion id="expert-context"'));
  assert.deepEqual([result.selectedOdds.bookmaker_name, result.selectedOdds.decimal_odds], ["Betano", 1.83]);
  assert.match(expertOdds, /Casa activa/);
  assert.match(expertOdds, /Cuota activa/);
  assert.match(expertOdds, /analysis\.selectedOdds\?\.decimal_odds/);
});

test("9. SBO 1.93 queda como referencia sin ser la cuota activa", async () => {
  const result = await manualResult();
  const sbo = result.odds.quotes.find((quote) => quote.bookmaker_name === "SBO" && quote.line === "2.5");
  assert.equal(sbo.decimal_odds, 1.93);
  assert.equal(result.bestComparableOdds.quote_id, sbo.quote_id);
  assert.notEqual(result.activeQuote.quote_id, sbo.quote_id);
});

test("10. una actualización posterior a Betano 1.85 reemplaza la active_quote", async () => {
  const first = await manualResult();
  const updated = await analyzeWithManual({
    decimalOdds: "1.85",
    consultedAt: "2026-08-14T16:03:00.000Z",
    now: "2026-08-14T16:04:00.000Z",
    previousVersion: first.analysisVersion,
  });
  assert.deepEqual([updated.activeQuote.bookmaker_name, updated.activeQuote.decimal_odds], ["Betano", 1.85]);
  assert.equal(updated.changesSincePrevious.changes.active_quote.previous.decimal_odds, 1.83);
  assert.equal(updated.changesSincePrevious.changes.active_quote.current.decimal_odds, 1.85);
});

test("11. una cotización de línea distinta no contamina Under 2.5", async () => {
  const result = await manualResult();
  assert.ok(result.odds.quotes.some((quote) => quote.bookmaker_name === "SBO" && quote.line === "3.5" && quote.decimal_odds === 2.05));
  assert.equal(result.activeQuote.line, "2.5");
  assert.equal(result.activeQuote.selection, "Under 2.5");
});

test("12. una cotización de fixture distinto se descarta sin contaminar", async () => {
  const result = await manualResult();
  assert.ok(result.odds.warnings.includes("provider_fixture_mismatch"));
  assert.equal(result.activeQuote.fixture_id, FIXTURE_ID);
  assert.ok(result.odds.quotes.every((quote) => quote.fixture_id === FIXTURE_ID));
});

test("13. una cuota manual vencida no permanece activa", async () => {
  const result = await analyzeWithManual({ consultedAt: "2026-08-14T15:00:00.000Z" });
  const staleManual = result.odds.quotes.find((quote) => quote.source === "manual_user_input");
  assert.equal(staleManual.freshness, "stale");
  assert.equal(result.activeQuote.bookmaker_name, "SBO");
  assert.notEqual(result.activeQuote.quote_id, staleManual.quote_id);
});

test("14. cambiar la cuota activa no cambia la lógica deportiva", async () => {
  const [manual, provider] = await Promise.all([manualResult(), providerOnlyResult()]);
  const sportsFields = (result) => ({
    candidate_id: result.marketSelection.primary.candidate_id,
    selection: result.marketSelection.primary.selection,
    line: result.marketSelection.primary.line,
    preliminary_probability: result.marketSelection.primary.preliminary_probability,
    uncertainty_low: result.marketSelection.primary.uncertainty_low,
    uncertainty_high: result.marketSelection.primary.uncertainty_high,
    sports_score: result.marketSelection.primary.sports_score,
    scout_primary_candidate_id: result.scout.primary_candidate_id,
  });
  assert.deepEqual(sportsFields(manual), sportsFields(provider));
});
