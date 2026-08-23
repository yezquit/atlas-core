import assert from "node:assert/strict";
import test from "node:test";

import {
  COMBINATION_MODE,
  COMBINATION_PRODUCT,
  assessCombinationCorrelation,
  buildAtlasCombination,
  classifyCombinationSize,
  combinationSelectionKey,
  inspectCombinationCandidate,
  mergeJourneyExplorations,
  validateCombinationRequest,
} from "../intelligence/atlasCombinationEngine.js";
import { buildDreamParlays } from "../intelligence/dreamParlayEngine.js";

function candidate(index, overrides = {}) {
  const fixtureId = overrides.fixtureId ?? 1000 + index;
  const marketId = overrides.marketId ?? "goals";
  const direction = overrides.direction ?? "over";
  const line = overrides.line ?? 1.5;
  const quote = {
    fixture_id: fixtureId,
    market_family: marketId,
    direction,
    selection: `${direction === "under" ? "Under" : "Over"} ${line}`,
    line,
    decimal_odds: overrides.decimalOdds ?? 1.5,
    verification_status: "verified_provider",
    source_status: "verified_current",
    freshness: "fresh",
    stale: false,
    bookmaker_name: "Test",
    ...(overrides.quote || {}),
  };
  return {
    fixtureId,
    fixture: `Local ${index} vs Visitante ${index}`,
    localCalendarDate: overrides.date || "2026-08-19",
    marketId,
    market: marketId,
    direction,
    line,
    selection: quote.selection,
    sportsScore: overrides.sportsScore ?? 80 - index,
    probability: 0.6,
    active_quote: overrides.activeQuote === null ? null : quote,
    price_status: overrides.priceStatus ?? "favorable_preliminary",
    price_gap: overrides.priceGap ?? 0.05,
    market_suitability: overrides.marketSuitability ?? "viable_with_caution",
    parlay_eligibility: overrides.parlayEligibility ?? "eligible",
    director_decision: overrides.directorDecision ?? "yes",
    ...overrides,
  };
}

test("una selección no es Parlay ni Soñadora", () => {
  assert.equal(classifyCombinationSize(1), "single_or_invalid");
});

for (const size of [2, 3, 4]) {
  test(`${size} selecciones corresponden a Parlay Atlas`, () => {
    assert.equal(classifyCombinationSize(size), "parlay");
  });
}

for (const size of [5, 15]) {
  test(`${size} selecciones corresponden a Soñadora Atlas`, () => {
    assert.equal(classifyCombinationSize(size), "dream");
  });
}

test("más de quince selecciones es inválido", () => {
  assert.equal(classifyCombinationSize(16), "single_or_invalid");
});

test("Parlay rechaza más de cuatro selecciones", () => {
  assert.equal(validateCombinationRequest({ product: "parlay", mode: "automatic", selections: 5 }).errorCode, "invalid_selection_count");
});

test("Soñadora rechaza menos de cinco selecciones", () => {
  assert.equal(validateCombinationRequest({ product: "dream", mode: "automatic", selections: 4 }).errorCode, "invalid_selection_count");
});

test("modo automático construye Parlay de dos fixtures", () => {
  const result = buildAtlasCombination({ candidates: [candidate(1), candidate(2)], product: "parlay", mode: "automatic", selections: 2 });
  assert.equal(result.status, "ready");
  assert.equal(result.selections.length, 2);
  assert.notEqual(result.selections[0].fixture_id, result.selections[1].fixture_id);
});

test("modo automático admite Parlay de cuatro", () => {
  const result = buildAtlasCombination({ candidates: [1, 2, 3, 4].map(candidate), product: "parlay", mode: "automatic", selections: 4 });
  assert.equal(result.status, "ready");
  assert.equal(result.selections.length, 4);
});

test("modo automático construye Soñadora mínima de cinco", () => {
  const result = buildAtlasCombination({ candidates: [1, 2, 3, 4, 5].map(candidate), product: "dream", mode: "automatic", selections: 5 });
  assert.equal(result.status, "ready");
  assert.equal(result.risk.level, "high");
});

test("modo automático construye Soñadora máxima de quince", () => {
  const result = buildAtlasCombination({ candidates: Array.from({ length: 15 }, (_, index) => candidate(index + 1)), product: "dream", mode: "automatic", selections: 15 });
  assert.equal(result.status, "ready");
  assert.equal(result.selections.length, 15);
});

test("no fuerza combinación con candidatos insuficientes", () => {
  const result = buildAtlasCombination({ candidates: [candidate(1)], product: "parlay", mode: "automatic", selections: 2 });
  assert.equal(result.status, "insufficient_candidates");
  assert.match(result.director_message, /no forzará/i);
});

test("cuota stale no es elegible", () => {
  const inspection = inspectCombinationCandidate(candidate(1, { quote: { freshness: "stale", stale: true, verification_status: "stale", source_status: "stale" } }));
  assert.equal(inspection.eligible, false);
  assert.ok(inspection.reasons.includes("quote_not_current"));
});

test("cuota decimal inválida no es elegible", () => {
  const inspection = inspectCombinationCandidate(candidate(1, { decimalOdds: 1 }));
  assert.equal(inspection.eligible, false);
  assert.ok(inspection.reasons.includes("invalid_decimal_odds"));
});

test("línea incompatible no es elegible", () => {
  const inspection = inspectCombinationCandidate(candidate(1, { quote: { line: 2.5 } }));
  assert.equal(inspection.eligible, false);
  assert.ok(inspection.reasons.includes("missing_or_incompatible_quote"));
});

test("familia incompatible no es elegible", () => {
  const inspection = inspectCombinationCandidate(candidate(1, { quote: { market_family: "corners" } }));
  assert.equal(inspection.eligible, false);
});

test("elimina selecciones duplicadas exactas", () => {
  const first = candidate(1);
  const result = buildAtlasCombination({ candidates: [first, { ...first, sportsScore: 10 }, candidate(2)], product: "parlay", mode: "automatic", selections: 2 });
  assert.equal(result.status, "ready");
  assert.equal(new Set(result.selections.map((item) => item.selection_key)).size, 2);
});

test("detecta alta correlación en mismo fixture y familia", () => {
  const left = candidate(1, { fixtureId: 77, line: 1.5 });
  const right = candidate(2, { fixtureId: 77, line: 2.5 });
  assert.equal(assessCombinationCorrelation(left, right).level, "high");
});

test("detecta correlación media en mercados distintos del mismo fixture", () => {
  const left = candidate(1, { fixtureId: 77, marketId: "goals" });
  const right = candidate(2, { fixtureId: 77, marketId: "corners", line: 8.5 });
  assert.equal(assessCombinationCorrelation(left, right).level, "medium");
});

test("automático evita líneas redundantes del mismo fixture", () => {
  const result = buildAtlasCombination({
    candidates: [candidate(1, { fixtureId: 77, line: 1.5 }), candidate(2, { fixtureId: 77, line: 2.5 }), candidate(3)],
    product: "parlay",
    mode: "automatic",
    selections: 2,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.selections.filter((item) => item.fixture_id === 77).length, 1);
});

test("modo manual conserva exactamente las selecciones elegidas", () => {
  const candidates = [candidate(1), candidate(2), candidate(3)];
  const keys = candidates.slice(1).map(combinationSelectionKey);
  const result = buildAtlasCombination({ candidates, product: "parlay", mode: "manual", selections: 2, selectedKeys: keys });
  assert.deepEqual(result.selections.map((item) => item.selection_key).sort(), keys.sort());
});

test("modo manual exige el número exacto", () => {
  const candidates = [candidate(1), candidate(2)];
  const result = buildAtlasCombination({ candidates, product: "parlay", mode: "manual", selections: 2, selectedKeys: [combinationSelectionKey(candidates[0])] });
  assert.equal(result.status, "insufficient_candidates");
});

test("modo mixto completa las selecciones fijadas", () => {
  const candidates = [candidate(1), candidate(2), candidate(3)];
  const fixed = combinationSelectionKey(candidates[2]);
  const result = buildAtlasCombination({ candidates, product: "parlay", mode: "mixed", selections: 3, selectedKeys: [fixed] });
  assert.equal(result.status, "ready");
  assert.ok(result.selections.some((item) => item.selection_key === fixed));
});

test("modo mixto no acepta una selección fija stale", () => {
  const stale = candidate(1, { quote: { freshness: "stale", stale: true, verification_status: "stale" } });
  const result = buildAtlasCombination({ candidates: [stale, candidate(2), candidate(3)], product: "parlay", mode: "mixed", selections: 2, selectedKeys: [combinationSelectionKey(stale)] });
  assert.equal(result.status, "insufficient_candidates");
});

test("calcula la cuota combinada sin presentarla como probabilidad", () => {
  const result = buildAtlasCombination({ candidates: [candidate(1, { decimalOdds: 1.5 }), candidate(2, { decimalOdds: 2 })], product: "parlay", mode: "automatic", selections: 2 });
  assert.equal(result.combined_decimal_odds, 3);
  assert.equal(result.combined_odds_is_probability, false);
});

test("Director puede bloquear una selección aunque tenga cuota vigente", () => {
  const inspection = inspectCombinationCandidate(candidate(1, { directorDecision: "NO APOSTAR" }));
  assert.equal(inspection.eligible, false);
  assert.ok(inspection.reasons.includes("director_blocks_selection"));
});

test("precio desfavorable excluye al candidato", () => {
  const inspection = inspectCombinationCandidate(candidate(1, { priceStatus: "unfavorable" }));
  assert.equal(inspection.eligible, false);
  assert.ok(inspection.reasons.includes("price_not_acceptable"));
});

test("marginal sin brecha positiva queda excluido", () => {
  const inspection = inspectCombinationCandidate(candidate(1, { priceStatus: "marginal", priceGap: 0 }));
  assert.equal(inspection.eligible, false);
});

test("une candidatos de múltiples fechas y fixtures", () => {
  const result = mergeJourneyExplorations([
    { status: "success", candidates: [candidate(1, { date: "2026-08-19" })], fixturesFound: 3, fixturesReviewed: 2 },
    { status: "success", candidates: [candidate(2, { date: "2026-08-20" })], fixturesFound: 4, fixturesReviewed: 3 },
  ], ["2026-08-19", "2026-08-20"]);
  assert.equal(result.status, "success");
  assert.equal(result.candidates.length, 2);
  assert.equal(result.fixturesFound, 7);
});

test("la unión multidía elimina el mismo candidato repetido", () => {
  const repeated = candidate(1);
  const result = mergeJourneyExplorations([
    { status: "success", candidates: [repeated] },
    { status: "success", candidates: [repeated] },
  ], ["2026-08-19", "2026-08-20"]);
  assert.equal(result.candidates.length, 1);
});

test("Soñadora no tiene tope artificial de cuota total objetivo", () => {
  const results = buildDreamParlays(Array.from({ length: 5 }, (_, index) => ({ id: index, decimalOdds: 3 })), { selections: 5 });
  assert.equal(results[0].totalOdds, 243);
});
