import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeLiveMatch } from "../intelligence/liveMatchAnalysisEngine.js";
import { assessLiveMarketViability } from "../intelligence/liveMarketViability.js";

const NOW = "2026-08-24T01:53:10.000Z";
const FETCHED = "2026-08-24T01:53:00.000Z";
const testingDirectory = path.dirname(fileURLToPath(import.meta.url));

function exactQuote(overrides = {}) {
  return {
    quote_id: "live-quote",
    mode: "live",
    fixture_id: 8053,
    market_family: "corners",
    direction: "over",
    line: 8.5,
    decimal_odds: 1.91,
    observed_at: FETCHED,
    fetched_at: FETCHED,
    freshness: "fresh",
    market_status: "open",
    source_status: "verified_live_current",
    ...overrides,
  };
}

function viability(overrides = {}) {
  return assessLiveMarketViability({
    fixtureId: 8053,
    marketFamily: "corners",
    direction: "over",
    line: 8.5,
    currentValue: 8,
    matchMinute: 53,
    matchStatus: "2H",
    quote: exactQuote(),
    quoteTimestamp: FETCHED,
    providerStatus: "success",
    now: NOW,
    ...overrides,
  });
}

function sportFixture() {
  return {
    fixtureId: 8053,
    competition: { id: 71, name: "Serie B", season: 2026, round: "Jornada" },
    date: { kickoff_utc: "2026-08-24T00:45:00.000Z" },
    status: { short: "2H", long: "Second Half", elapsed: 53, isLive: true, isFinished: false, isScheduled: false },
    teams: { home: { id: 1, name: "Sport Recife" }, away: { id: 2, name: "América Mineiro" } },
    score: { goals: { home: 2, away: 0 } },
  };
}

function sportStatistics() {
  const team = (id, name, corners, cards) => ({
    team: { id, name },
    statistics: {
      total_shots: { value: 12 }, shots_on_goal: { value: 5 }, corner_kicks: { value: corners },
      yellow_cards: { value: cards }, red_cards: { value: 0 }, fouls: { value: 9 }, ball_possession: { value: id === 1 ? 54 : 46 },
    },
  });
  return {
    availableStats: ["total_shots", "shots_on_goal", "corner_kicks", "yellow_cards", "red_cards", "fouls", "ball_possession"],
    teams: [team(1, "Sport Recife", 5, 2), team(2, "América Mineiro", 3, 1)],
  };
}

function livePayload(line = 12.5, overrides = {}) {
  return [{
    fixture: { id: 8053 },
    status: { stopped: false, blocked: false, ...(overrides.status || {}) },
    update: overrides.update || FETCHED,
    bookmakers: [{ id: 9, name: "Casa LIVE", bets: [{ id: 5, name: "Total Corners Over Under", values: [{ value: `Over ${line}`, odd: "1.91", main: true, ...(overrides.value || {}) }] }] }],
  }];
}

function sportAnalysis(payload = [], providerStatus = "success") {
  return analyzeLiveMatch({
    analysisId: "sport-live-53",
    competitionKey: "brazilSerieB",
    fixture: sportFixture(),
    statistics: sportStatistics(),
    liveOddsPayload: payload,
    liveOddsProviderStatus: providerStatus,
    fixtureFetchedAt: FETCHED,
    statisticsFetchedAt: FETCHED,
    oddsFetchedAt: FETCHED,
    analyzedAt: NOW,
  });
}

test("LIVE HOTFIX 1. ocho córners ya cruzaron Over 7.5", () => {
  const result = viability({ line: 7.5, quote: null });
  assert.equal(result.viable, false);
  assert.equal(result.status, "already_crossed");
});

test("LIVE HOTFIX 2. Over 8.5 con cotización exacta vigente permanece pendiente", () => {
  const result = viability();
  assert.equal(result.viable, true);
  assert.equal(result.status, "pending");
});

test("LIVE HOTFIX 3. Over 8.5 sin línea exacta no es accionable", () => {
  const result = viability({ quote: null });
  assert.equal(result.viable, false);
  assert.equal(result.status, "line_not_live");
});

test("LIVE HOTFIX 4. Over 12.5 vigente se crea como candidato independiente", () => {
  const result = sportAnalysis(livePayload(12.5));
  const corners = result.market_assessments.find((item) => item.market_family === "corners");
  assert.equal(corners.candidate.line, 8.5);
  assert.equal(corners.operational_candidate.line, 12.5);
  assert.equal(corners.operational_candidate.candidate_origin, "exact_live_line_reanalysis");
});

test("LIVE HOTFIX 5. Over 12.5 recalcula y no hereda el score de Over 8.5", () => {
  const corners = sportAnalysis(livePayload(12.5)).market_assessments.find((item) => item.market_family === "corners");
  assert.notEqual(corners.operational_candidate.sports_score, corners.candidate.sports_score);
  assert.notEqual(corners.operational_candidate.candidate_id, corners.candidate.candidate_id);
});

test("LIVE HOTFIX 6. una cotización vencida queda rechazada", () => {
  assert.equal(viability({ quote: exactQuote({ freshness: "stale" }) }).status, "stale");
});

test("LIVE HOTFIX 7. una cotización bloqueada queda rechazada", () => {
  assert.equal(viability({ quote: exactQuote({ market_status: "blocked" }) }).status, "blocked");
});

test("LIVE HOTFIX 8. fixture incorrecto queda rechazado", () => {
  assert.equal(viability({ quote: exactQuote({ fixture_id: 9999 }) }).status, "fixture_mismatch");
});

test("LIVE HOTFIX 9. familia incorrecta queda rechazada", () => {
  assert.equal(viability({ quote: exactQuote({ market_family: "goals" }) }).status, "market_mismatch");
});

test("LIVE HOTFIX 10. dirección incorrecta queda rechazada", () => {
  assert.equal(viability({ quote: exactQuote({ direction: "under" }) }).status, "direction_mismatch");
});

test("LIVE HOTFIX 11. línea incorrecta queda rechazada", () => {
  assert.equal(viability({ quote: exactQuote({ line: 12.5 }) }).status, "line_mismatch");
});

test("LIVE HOTFIX 12. proveedor no disponible produce estado seguro", () => {
  const result = viability({ providerStatus: "provider_unavailable", quote: null });
  assert.equal(result.viable, false);
  assert.equal(result.status, "provider_unavailable");
});

test("LIVE HOTFIX 13. ausencia de cotización no fabrica precio", () => {
  const result = sportAnalysis([]);
  assert.equal(result.live_odds.length, 0);
  assert.equal(result.active_quote, null);
  assert.equal(result.director.price_assessment.decimal_odds, undefined);
});

test("LIVE HOTFIX 14. una cuota manual no rehabilita una línea ya resuelta", () => {
  const manualQuote = exactQuote({ verification_status: "user_reported", source_status: "user_reported_live_current" });
  const result = viability({ line: 7.5, quote: manualQuote });
  assert.equal(result.viable, false);
  assert.equal(result.status, "already_crossed");
});

test("LIVE HOTFIX 15. las reglas LIVE no se importan en el motor pregame", async () => {
  const source = await readFile(path.resolve(testingDirectory, "../intelligence/marketSuitability.js"), "utf8");
  assert.doesNotMatch(source, /liveMarketViability/);
});

test("LIVE HOTFIX 16. goles acumulativos pendientes aceptan su línea exacta", () => {
  const quote = exactQuote({ market_family: "goals", line: 2.5 });
  const result = viability({ marketFamily: "goals", currentValue: 2, line: 2.5, quote });
  assert.equal(result.status, "pending");
  assert.equal(result.viable, true);
});

test("LIVE HOTFIX 17. tarjetas acumuladas ya cruzadas no son accionables", () => {
  const quote = exactQuote({ market_family: "cards", line: 3.5 });
  const result = viability({ marketFamily: "cards", currentValue: 4, line: 3.5, quote });
  assert.equal(result.status, "already_crossed");
  assert.equal(result.viable, false);
});

test("LIVE HOTFIX 18. caso Sport Recife no recomienda Over 8.5 sin esa línea vigente", () => {
  const result = sportAnalysis(livePayload(12.5));
  const corners = result.market_assessments.find((item) => item.market_family === "corners");
  assert.equal(corners.candidate.selection, "Over 8.5");
  assert.equal(corners.candidate.live_viability.status, "line_not_live");
  assert.equal(result.director.analysis_decision.status === "yes" && result.director.selection === "Over 8.5", false);
});

test("LIVE HOTFIX 19. payload bloqueado conserva diagnóstico explícito", () => {
  const result = sportAnalysis(livePayload(8.5, { status: { blocked: true } }));
  const corners = result.market_assessments.find((item) => item.market_family === "corners");
  assert.equal(corners.candidate.live_viability.status, "blocked");
  assert.equal(result.director.analysis_decision.status, "wait");
});

test("LIVE HOTFIX 20. provider unavailable impide un sí aunque la lectura sea favorable", () => {
  const result = sportAnalysis([], "provider_unavailable");
  assert.notEqual(result.director.analysis_decision.status, "yes");
  assert.equal(result.director.market_viability.status, "provider_unavailable");
});

test("LIVE HOTFIX 21. línea exacta sin precio no se confunde con mercado ausente", () => {
  const result = sportAnalysis(livePayload(8.5, { value: { odd: null } }));
  const corners = result.market_assessments.find((item) => item.market_family === "corners");
  assert.equal(corners.candidate.live_viability.status, "quote_unavailable");
  assert.equal(result.active_quote, null);
});
