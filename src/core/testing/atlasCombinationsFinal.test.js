import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildAtlasCombination,
  combinationSelectionKey,
  deriveCombinationStabilityScore,
  inspectCombinationCandidate,
  normalizeCombinationTarget,
} from "../intelligence/atlasCombinationEngine.js";
import { createManualOdds } from "../intelligence/oddsIntelligence.js";
import { deriveJourneyOutcome, recoverJourneyCandidateOdds } from "../services/sportsIntelligenceService.js";

function candidate(index, overrides = {}) {
  const fixtureId = overrides.fixtureId ?? 4000 + index;
  const marketId = overrides.marketId ?? "goals";
  const direction = overrides.direction ?? "over";
  const line = overrides.line ?? 1.5;
  const quote = overrides.quote === undefined ? {
    fixture_id: fixtureId, market_family: marketId, direction, selection: `Over ${line}`, line,
    decimal_odds: 1.5, verification_status: "verified_provider", source_status: "verified_current",
    freshness: "fresh", stale: false, bookmaker_name: "Prueba",
  } : overrides.quote;
  return {
    fixtureId, fixture: `A ${index} vs B ${index}`, marketId, market: marketId, direction, line,
    selection: `${direction === "over" ? "Over" : "Under"} ${line}`,
    sportsScore: overrides.sportsScore ?? 80 - index / 10,
    probability: overrides.probability ?? 0.68,
    uncertaintyLow: overrides.uncertaintyLow ?? 0.55,
    uncertaintyHigh: overrides.uncertaintyHigh ?? 0.75,
    sampleSize: overrides.sampleSize ?? 20,
    technicalSupport: overrides.technicalSupport ?? 75,
    lineStabilityScore: overrides.lineStabilityScore ?? 75,
    limitations: overrides.limitations || [], generalRank: index, familyRank: 1,
    status: "sports_candidate_pending_price", active_quote: quote,
    ranking_eligible: overrides.ranking_eligible ?? true,
    estimated_probability: overrides.estimated_probability ?? 0.68,
  };
}

for (const target of [2, 3, 4]) test(`${target}. Parlay conserva target ${target}`, () => {
  assert.equal(normalizeCombinationTarget(String(target), "parlay", 4), target);
});

test("4. Soñadora conserva todos los targets 5–15", () => {
  for (let target = 5; target <= 15; target += 1) assert.equal(normalizeCombinationTarget(target, "dream"), target);
});

test("5. automático respeta target_count", () => {
  assert.equal(buildAtlasCombination({ candidates: [1, 2, 3, 4].map(candidate), product: "parlay", mode: "automatic", selections: 3 }).selections.length, 3);
});

test("6. manual respeta target_count", () => {
  const items = [1, 2, 3].map(candidate);
  const result = buildAtlasCombination({ candidates: items, product: "parlay", mode: "manual", selections: 3, selectedKeys: items.map(combinationSelectionKey) });
  assert.equal(result.selections.length, 3);
});

test("7. mixto respeta target_count", () => {
  const items = [1, 2, 3, 4].map(candidate);
  const result = buildAtlasCombination({ candidates: items, product: "parlay", mode: "mixed", selections: 4, selectedKeys: [combinationSelectionKey(items[0])] });
  assert.equal(result.selections.length, 4);
});

test("8. la cuota no modifica sports_score", () => {
  assert.equal(inspectCombinationCandidate(candidate(1, { quote: null })).candidate.sports_score, inspectCombinationCandidate(candidate(1)).candidate.sports_score);
});

test("9. la cuota no modifica preliminary_probability", () => {
  assert.equal(inspectCombinationCandidate(candidate(1, { quote: null })).candidate.probability, 0.68);
});

test("10. un candidato sin cuota sigue elegible", () => {
  assert.equal(inspectCombinationCandidate(candidate(1, { quote: null })).sports_eligible, true);
});

test("11. stale no es price_usable", () => {
  const item = candidate(1); item.active_quote = { ...item.active_quote, stale: true, freshness: "stale" };
  assert.equal(inspectCombinationCandidate(item).price_usable, false);
});

for (const [number, field, value, expected] of [
  [12, "fixture_id", 999, "incompatible_fixture"],
  [13, "market_family", "corners", "incompatible_market"],
  [14, "direction", "under", "incompatible_direction"],
  [15, "line", 2.5, "incompatible_line"],
]) test(`${number}. rechaza quote con ${field} incompatible`, () => {
  const item = candidate(number); item.active_quote = { ...item.active_quote, [field]: value, selection: field === "direction" ? "Under 1.5" : item.active_quote.selection };
  assert.equal(inspectCombinationCandidate(item).economic_price_status, expected);
});

test("16. una quote válida se asocia exactamente", () => {
  assert.equal(inspectCombinationCandidate(candidate(1)).price_usable, true);
});

test("17. el fallback manual produce user_reported_current", () => {
  const quote = createManualOdds({ fixtureId: 1, bookmaker: "Manual", marketFamily: "goals", selection: "Over 1.5", direction: "over", line: 1.5, decimalOdds: 1.7, receivedAt: "2026-08-24T12:00:00Z", analyzedAt: "2026-08-24T12:00:00Z", timezone: "America/Bogota" });
  assert.equal(quote.source_status, "user_reported_current");
});

test("18. una quote manual no contamina otra pata", () => {
  const first = candidate(1, { quote: null });
  const second = candidate(2, { quote: null });
  first.active_quote = createManualOdds({ fixtureId: first.fixtureId, bookmaker: "Manual", marketFamily: first.marketId, selection: first.selection, direction: first.direction, line: first.line, decimalOdds: 1.8, receivedAt: "2026-08-24T12:00:00Z", analyzedAt: "2026-08-24T12:00:00Z", timezone: "America/Bogota" });
  assert.equal(inspectCombinationCandidate(first).price_usable, true);
  assert.equal(inspectCombinationCandidate(second).price_usable, false);
});

test("19. la cobertura X/N es exacta", () => {
  const result = buildAtlasCombination({ candidates: [candidate(1), candidate(2, { quote: null })], product: "parlay", mode: "automatic", selections: 2 });
  assert.deepEqual([result.price_coverage.available, result.price_coverage.total], [1, 2]);
});

test("20. la cuota combinada existe solo con N/N", () => {
  const partial = buildAtlasCombination({ candidates: [candidate(1), candidate(2, { quote: null })], product: "parlay", mode: "automatic", selections: 2 });
  const complete = buildAtlasCombination({ candidates: [candidate(1), candidate(2)], product: "parlay", mode: "automatic", selections: 2 });
  assert.equal(partial.combined_decimal_odds, null);
  assert.equal(complete.combined_decimal_odds, 2.25);
});

test("21. Soñadora larga favorece una línea más estable cuando los datos lo justifican", () => {
  const aggressive = candidate(1, { fixtureId: 500, line: 2.5, sportsScore: 82, lineStabilityScore: 5, uncertaintyLow: 0.4, uncertaintyHigh: 0.9 });
  const conservative = candidate(2, { fixtureId: 500, line: 0.5, sportsScore: 79, lineStabilityScore: 98, uncertaintyLow: 0.6, uncertaintyHigh: 0.72, sampleSize: 30 });
  assert.ok(deriveCombinationStabilityScore(conservative) > deriveCombinationStabilityScore(aggressive));
  const result = buildAtlasCombination({ candidates: [aggressive, conservative, ...Array.from({ length: 13 }, (_, index) => candidate(index + 10))], product: "dream", mode: "automatic", selections: 12 });
  assert.ok(result.selections.some((item) => item.fixture_id === 500 && item.line === 0.5));
  assert.ok(!result.selections.some((item) => item.fixture_id === 500 && item.line === 2.5));
});

test("22. la interfaz no llama fija a una pata", async () => {
  const source = await readFile(new URL("../../app/atlas-combination-builder.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bfija\b/i);
});

test("23. automático conserva diversidad de fixtures", () => {
  const result = buildAtlasCombination({ candidates: [candidate(1), candidate(2), candidate(3)], product: "parlay", mode: "automatic", selections: 3 });
  assert.equal(new Set(result.selections.map((item) => item.fixture_id)).size, 3);
});

test("24. el modo manual bloquea el mismo fixture y familia", () => {
  const items = [candidate(1, { fixtureId: 9, line: 1.5 }), candidate(2, { fixtureId: 9, line: 2.5 })];
  const result = buildAtlasCombination({ candidates: items, product: "parlay", mode: "manual", selections: 2, selectedKeys: items.map(combinationSelectionKey) });
  assert.equal(result.status, "insufficient_candidates");
});

test("25. Soporte Atlas es visible y las cuotas automáticas usan identidad exacta", async () => {
  const source = await readFile(new URL("../../app/atlas-combination-builder.js", import.meta.url), "utf8");
  assert.match(source, /Soporte Atlas:/);
  const journeyCandidate = { fixtureId: 55, marketId: "goals", direction: "over", line: 1.5, kickoff: "2026-08-24T18:00:00Z" };
  const gateway = { loadFixtureOdds: async () => ({ status: "success", response: [{ fixture: { id: 55, date: journeyCandidate.kickoff }, update: "2026-08-24T12:00:00Z", bookmakers: [{ id: 1, name: "Casa", bets: [{ id: 5, name: "Goals Over/Under", values: [{ value: "Over 1.5", handicap: "1.5", odd: "1.66" }] }] }] }] }) };
  const [priced] = await recoverJourneyCandidateOdds([journeyCandidate], gateway, "2026-08-24T12:00:00Z");
  assert.equal(priced.activeQuote.decimal_odds, 1.66);
});

test("los fallos de universo exponen razones seguras y no detalles internos", async () => {
  assert.equal(deriveJourneyOutcome({ fixturesFound: 0, candidates: [] }).reason, "no_fixtures");
  assert.equal(deriveJourneyOutcome({ fixturesFound: 2, candidates: [] }).reason, "no_sports_candidates");
  assert.equal(deriveJourneyOutcome({ fixturesFound: 2, candidates: [], telemetry: { budgetExhausted: true } }).reason, "provider_quota_or_budget");
  const source = await readFile(new URL("../../app/atlas-combination-builder.js", import.meta.url), "utf8");
  for (const reason of ["provider_unavailable", "unsupported_competition", "insufficient_coverage", "timeout", "internal_safe_error"]) assert.match(source, new RegExp(reason));
  assert.doesNotMatch(source, /stack\s*trace|API_FOOTBALL_KEY/);
});
