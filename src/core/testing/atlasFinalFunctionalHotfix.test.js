import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  COMBINATION_MODE,
  COMBINATION_PRODUCT,
  addCombinationSelection,
  buildAtlasCombination,
  combinationSelectionKey,
  inspectCombinationCandidate,
  removeCombinationSelection,
} from "../intelligence/atlasCombinationEngine.js";
import { analyzeLiveMatch } from "../intelligence/liveMatchAnalysisEngine.js";
import { assessLiveMarketViability } from "../intelligence/liveMarketViability.js";

const NOW = "2026-08-25T18:00:10.000Z";
const FETCHED = "2026-08-25T18:00:00.000Z";

function liveFixture() {
  return {
    fixtureId: 4401,
    competition: { id: 1, name: "Liga de prueba", season: 2026, round: "Jornada" },
    date: { kickoff_utc: "2026-08-25T17:00:00.000Z" },
    status: { short: "2H", long: "Second Half", elapsed: 53, isLive: true, isFinished: false, isScheduled: false },
    teams: { home: { id: 10, name: "Local" }, away: { id: 20, name: "Visitante" } },
    score: { goals: { home: 1, away: 0 } },
  };
}

function liveStatistics(corners = 8) {
  const homeCorners = Math.ceil(corners / 2);
  const awayCorners = corners - homeCorners;
  const team = (id, name, cornerKicks) => ({
    team: { id, name },
    statistics: {
      total_shots: { value: 10 },
      shots_on_goal: { value: 4 },
      corner_kicks: { value: cornerKicks },
      yellow_cards: { value: 1 },
      red_cards: { value: 0 },
      fouls: { value: 7 },
      ball_possession: { value: id === 10 ? 52 : 48 },
    },
  });
  return {
    availableStats: ["total_shots", "shots_on_goal", "corner_kicks", "yellow_cards", "red_cards", "fouls", "ball_possession"],
    teams: [team(10, "Local", homeCorners), team(20, "Visitante", awayCorners)],
  };
}

function liveOdds(line, overrides = {}) {
  return [{
    fixture: { id: overrides.fixtureId ?? 4401 },
    status: { stopped: false, blocked: false, ...(overrides.status || {}) },
    update: overrides.update || FETCHED,
    bookmakers: [{
      id: 7,
      name: "Proveedor LIVE",
      bets: [{
        id: 70,
        name: overrides.betName || "Total Corners Over Under",
        values: [{ value: `${overrides.direction || "Over"} ${line}`, odd: overrides.odd ?? "1.80", main: true }],
      }],
    }],
  }];
}

function liveAnalysis({ corners = 8, line = null, payload = null } = {}) {
  return analyzeLiveMatch({
    analysisId: "live-final-hotfix",
    competitionKey: "testLeague",
    fixture: liveFixture(),
    statistics: liveStatistics(corners),
    liveOddsPayload: payload ?? (line === null ? [] : liveOdds(line)),
    fixtureFetchedAt: FETCHED,
    statisticsFetchedAt: FETCHED,
    oddsFetchedAt: FETCHED,
    analyzedAt: NOW,
  });
}

function combinationCandidate(index, overrides = {}) {
  const fixtureId = overrides.fixtureId ?? 6000 + index;
  const marketFamily = overrides.marketFamily || "goals";
  const direction = overrides.direction || "over";
  const line = overrides.line ?? 1.5;
  const quote = overrides.withoutQuote ? null : {
    fixture_id: fixtureId,
    market_family: marketFamily,
    direction,
    line,
    selection: `${direction === "over" ? "Over" : "Under"} ${line}`,
    decimal_odds: overrides.decimalOdds ?? 1.5,
    verification_status: "verified_provider",
    source_status: "verified_current",
    freshness: "fresh",
    bookmaker_name: "Proveedor",
    ...(overrides.quote || {}),
  };
  return {
    fixtureId,
    fixture: `Local ${index} vs Visitante ${index}`,
    marketId: marketFamily,
    market: marketFamily,
    direction,
    line,
    selection: `${direction === "over" ? "Over" : "Under"} ${line}`,
    sportsScore: overrides.sportsScore ?? 90 - index,
    uncertaintyLow: 0.55,
    uncertaintyHigh: 0.7,
    sampleSize: 20,
    generalRank: index,
    familyRank: 1,
    status: "sports_candidate_pending_price",
    technicalSupport: overrides.sportsScore ?? 90 - index,
    lineStabilityScore: 75,
    ranking_eligible: overrides.ranking_eligible ?? true,
    estimated_probability: overrides.estimated_probability ?? 0.62,
    active_quote: quote,
  };
}

function buildCombination(size, product = COMBINATION_PRODUCT.DREAM, overrides = {}) {
  const candidates = Array.from({ length: size }, (_, index) => combinationCandidate(index + 1, overrides[index + 1] || {}));
  return {
    candidates,
    result: buildAtlasCombination({ candidates, product, mode: COMBINATION_MODE.AUTOMATIC, selections: size }),
  };
}

test("HOTFIX FINAL 1. lectura exacta disponible y vigente puede ser accionable", () => {
  const result = liveAnalysis({ corners: 8, line: 8.5 });
  assert.equal(result.director.analysis_decision.status, "yes");
  assert.equal(result.director.selection, "Over 8.5");
  assert.equal(result.director.market_viability.viable, true);
});

test("HOTFIX FINAL 2. una lectura exacta ausente nunca se recomienda", () => {
  const result = liveAnalysis({ corners: 8, line: 12.5 });
  assert.equal(result.director.original_sports_reading.selection, "Over 8.5");
  assert.notEqual(result.director.analysis_decision.status === "yes" && result.director.selection === "Over 8.5", true);
});

test("HOTFIX FINAL 3. línea alternativa con soporte insuficiente no es recomendada", () => {
  const result = liveAnalysis({ corners: 2, line: 8.5 });
  assert.equal(result.director.live_market_verdict.selection, "Over 8.5");
  assert.ok(result.director.live_market_verdict.sports_score < 68);
  assert.notEqual(result.director.analysis_decision.status, "yes");
});

test("HOTFIX FINAL 4. DirectorAtlas puede promover una alternativa fuerte reanalizada", () => {
  const result = liveAnalysis({ corners: 8, line: 10.5 });
  assert.equal(result.director.analysis_decision.status, "yes");
  assert.equal(result.director.selection, "Over 10.5");
  assert.equal(result.director.live_market_verdict.candidate_origin, "exact_live_line_reanalysis");
  assert.ok(result.director.live_market_verdict.sports_score >= 68);
  assert.notEqual(result.director.live_market_verdict.candidate_id, result.director.original_sports_reading.candidate_id);
});

test("HOTFIX FINAL 5. línea alternativa stale nunca es accionable", () => {
  const result = liveAnalysis({ corners: 8, payload: liveOdds(12.5, { update: "2026-08-25T17:50:00.000Z" }) });
  assert.notEqual(result.director.analysis_decision.status, "yes");
  assert.equal(result.live_odds.length, 0);
});

test("HOTFIX FINAL 6. fixture mismatch nunca es accionable", () => {
  const viability = assessLiveMarketViability({ fixtureId: 4401, marketFamily: "corners", direction: "over", line: 12.5, currentValue: 8, matchMinute: 53, matchStatus: "2H", quote: { mode: "live", fixture_id: 999, market_family: "corners", direction: "over", line: 12.5 }, now: NOW });
  assert.equal(viability.status, "fixture_mismatch");
  assert.equal(viability.viable, false);
});

test("HOTFIX FINAL 7. market family mismatch nunca es accionable", () => {
  const viability = assessLiveMarketViability({ fixtureId: 4401, marketFamily: "corners", direction: "over", line: 12.5, currentValue: 8, matchMinute: 53, matchStatus: "2H", quote: { mode: "live", fixture_id: 4401, market_family: "goals", direction: "over", line: 12.5 }, now: NOW });
  assert.equal(viability.status, "market_mismatch");
  assert.equal(viability.viable, false);
});

test("HOTFIX FINAL 8. direction mismatch nunca es accionable", () => {
  const viability = assessLiveMarketViability({ fixtureId: 4401, marketFamily: "corners", direction: "over", line: 12.5, currentValue: 8, matchMinute: 53, matchStatus: "2H", quote: { mode: "live", fixture_id: 4401, market_family: "corners", direction: "under", line: 12.5 }, now: NOW });
  assert.equal(viability.status, "direction_mismatch");
  assert.equal(viability.viable, false);
});

test("HOTFIX FINAL 9. línea ya superada nunca es accionable", () => {
  const viability = assessLiveMarketViability({ fixtureId: 4401, marketFamily: "corners", direction: "over", line: 7.5, currentValue: 8, matchMinute: 53, matchStatus: "2H" });
  assert.equal(viability.status, "already_crossed");
  assert.equal(viability.viable, false);
});

test("HOTFIX FINAL 10. proveedor sin línea utilizable devuelve estado seguro", () => {
  const result = liveAnalysis({ corners: 8 });
  assert.equal(result.director.analysis_decision.status, "wait");
  assert.equal(result.director.analysis_decision.operationally_actionable, false);
  assert.equal(result.director.live_market_verdict.status, "unavailable");
});

test("HOTFIX FINAL 11. quitar la pata 6 de una Soñadora 10 conserva las otras nueve y su orden", () => {
  const { result } = buildCombination(10);
  const originalKeys = result.selections.map((item) => item.selection_key);
  const edited = removeCombinationSelection(result, originalKeys[5]);
  assert.deepEqual(edited.selections.map((item) => item.selection_key), originalKeys.filter((_, index) => index !== 5));
  assert.equal(edited.selections.length, 9);
});

test("HOTFIX FINAL 12. quitar no cambia automáticamente el modo", () => {
  const { result } = buildCombination(10);
  const edited = removeCombinationSelection(result, result.selections[5].selection_key);
  assert.equal(edited.mode, COMBINATION_MODE.AUTOMATIC);
});

test("HOTFIX FINAL 13. quitar no reinicia ni vuelve a ejecutar Journey Scan", async () => {
  const source = await readFile(new URL("../../app/atlas-combination-builder.js", import.meta.url), "utf8");
  const removeBody = source.match(/function removePreparedSelection\(key\) \{([\s\S]*?)\n  \}/)?.[1] || "";
  assert.doesNotMatch(removeBody, /findCandidates|setJourney|setCombination\(null\)|setMode/);
});

test("HOTFIX FINAL 14. las cuotas manuales o vigentes de las otras patas permanecen", () => {
  const { result } = buildCombination(5, COMBINATION_PRODUCT.DREAM, { 1: { decimalOdds: 1.21 }, 2: { decimalOdds: 1.32 }, 3: { decimalOdds: 1.43 }, 4: { decimalOdds: 1.54 }, 5: { decimalOdds: 1.65 } });
  const removed = result.selections[2].selection_key;
  const expected = result.selections.filter((item) => item.selection_key !== removed).map((item) => item.decimal_odds);
  const edited = removeCombinationSelection(result, removed);
  assert.deepEqual(edited.selections.map((item) => item.decimal_odds), expected);
});

test("HOTFIX FINAL 15. al quitar la única pata sin cuota se recalcula cobertura N/N", () => {
  const { result } = buildCombination(5, COMBINATION_PRODUCT.DREAM, { 3: { withoutQuote: true } });
  const missing = result.selections.find((item) => !item.price_usable);
  const edited = removeCombinationSelection(result, missing.selection_key);
  assert.deepEqual(edited.price_coverage, { status: "complete", available: 4, missing: 0, total: 4 });
  assert.ok(Number.isFinite(edited.combined_decimal_odds));
});

test("HOTFIX FINAL 16. si queda una pata sin cuota la cuota combinada sigue null", () => {
  const { result } = buildCombination(5, COMBINATION_PRODUCT.DREAM, { 2: { withoutQuote: true } });
  const priced = result.selections.find((item) => item.price_usable);
  const edited = removeCombinationSelection(result, priced.selection_key);
  assert.equal(edited.price_coverage.status, "partial");
  assert.equal(edited.combined_decimal_odds, null);
});

test("HOTFIX FINAL 17. una Soñadora 9/10 puede completarse manualmente a 10/10", () => {
  const { candidates, result } = buildCombination(10);
  const removed = result.selections[5];
  const edited = removeCombinationSelection(result, removed.selection_key);
  const completed = addCombinationSelection(edited, candidates.find((item) => combinationSelectionKey(item) === removed.selection_key));
  assert.equal(completed.status, "ready");
  assert.equal(completed.selections.length, 10);
  assert.equal(completed.target_complete, true);
  assert.equal(completed.mode, COMBINATION_MODE.AUTOMATIC);
});

test("HOTFIX FINAL 18. Parlay 3/3 queda 2/3 y sigue siendo confirmable", () => {
  const { result } = buildCombination(3, COMBINATION_PRODUCT.PARLAY);
  const edited = removeCombinationSelection(result, result.selections[1].selection_key);
  assert.equal(edited.selections.length, 2);
  assert.equal(edited.can_confirm, true);
  assert.equal(edited.confirmation_status, "valid_reduced");
});

test("HOTFIX FINAL 19. Parlay 2 queda temporalmente en 1 y bloquea confirmación", () => {
  const { result } = buildCombination(2, COMBINATION_PRODUCT.PARLAY);
  const edited = removeCombinationSelection(result, result.selections[1].selection_key);
  assert.equal(edited.selections.length, 1);
  assert.equal(edited.can_confirm, false);
  assert.equal(edited.confirmation_status, "blocked_minimum");
});

test("HOTFIX FINAL 20. Soñadora 5 queda temporalmente en 4 y bloquea confirmación", () => {
  const { result } = buildCombination(5);
  const edited = removeCombinationSelection(result, result.selections[1].selection_key);
  assert.equal(edited.selections.length, 4);
  assert.equal(edited.can_confirm, false);
  assert.equal(edited.confirmation_status, "blocked_minimum");
});

test("HOTFIX FINAL 21. quitar una pata no modifica el target_count original", () => {
  const { result } = buildCombination(10);
  const edited = removeCombinationSelection(result, result.selections[5].selection_key);
  assert.equal(result.requested_selections, 10);
  assert.equal(edited.requested_selections, 10);
  assert.equal(edited.target_selections, 10);
});

test("HOTFIX FINAL 22. una cuota de línea diferente no puede asociarse a la pata", () => {
  const inspection = inspectCombinationCandidate(combinationCandidate(1, { quote: { line: 2.5 } }));
  assert.equal(inspection.economic_price_status, "incompatible_line");
  assert.equal(inspection.price_usable, false);
});
