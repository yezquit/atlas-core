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
  removeCombinationSelection,
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
    uncertaintyLow: 0.48,
    uncertaintyHigh: 0.72,
    sampleSize: 24,
    generalRank: index,
    familyRank: 1,
    status: "sports_candidate_pending_price",
    ranking_eligible: overrides.ranking_eligible ?? true,
    estimated_probability: overrides.estimated_probability ?? 0.6,
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

test("cuota stale no elimina elegibilidad deportiva y no se usa económicamente", () => {
  const inspection = inspectCombinationCandidate(candidate(1, { quote: { freshness: "stale", stale: true, verification_status: "stale", source_status: "stale" } }));
  assert.equal(inspection.sports_eligible, true);
  assert.equal(inspection.economic_price_status, "stale");
  assert.equal(inspection.price_usable, false);
});

test("cuota decimal inválida no elimina elegibilidad deportiva", () => {
  const inspection = inspectCombinationCandidate(candidate(1, { decimalOdds: 1 }));
  assert.equal(inspection.sports_eligible, true);
  assert.equal(inspection.economic_price_status, "invalid");
  assert.equal(inspection.price_usable, false);
});

test("línea incompatible se separa de la elegibilidad deportiva", () => {
  const inspection = inspectCombinationCandidate(candidate(1, { quote: { line: 2.5 } }));
  assert.equal(inspection.sports_eligible, true);
  assert.equal(inspection.economic_price_status, "incompatible_line");
  assert.equal(inspection.price_usable, false);
});

test("familia incompatible no se utiliza económicamente", () => {
  const inspection = inspectCombinationCandidate(candidate(1, { quote: { market_family: "corners" } }));
  assert.equal(inspection.sports_eligible, true);
  assert.equal(inspection.economic_price_status, "incompatible_market");
  assert.equal(inspection.price_usable, false);
});

test("dirección incompatible no se utiliza económicamente", () => {
  const inspection = inspectCombinationCandidate(candidate(1, { quote: { direction: "under", selection: "Under 1.5" } }));
  assert.equal(inspection.sports_eligible, true);
  assert.equal(inspection.economic_price_status, "incompatible_direction");
  assert.equal(inspection.price_usable, false);
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

test("Soñadora permite varias familias del mismo fixture", () => {
  const result = buildAtlasCombination({
    candidates: [
      candidate(1, { fixtureId: 77, marketId: "goals", sportsScore: 95, estimated_probability: 0.95 }),
      candidate(2, { fixtureId: 77, marketId: "corners", line: 8.5, sportsScore: 94, estimated_probability: 0.94 }),
      candidate(3, { sportsScore: 90, estimated_probability: 0.9 }),
      candidate(4, { sportsScore: 89, estimated_probability: 0.89 }),
      candidate(5, { sportsScore: 88, estimated_probability: 0.88 }),
      candidate(6, { sportsScore: 87, estimated_probability: 0.87 }),
    ],
    product: "dream",
    mode: "automatic",
    selections: 5,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.selections.filter((item) => item.fixture_id === 77).length, 2);
});

test("modo manual conserva exactamente las selecciones elegidas", () => {
  const candidates = [candidate(1), candidate(2), candidate(3)];
  const keys = candidates.slice(1).map(combinationSelectionKey);
  const result = buildAtlasCombination({ candidates, product: "parlay", mode: "manual", selections: 2, selectedKeys: keys });
  assert.deepEqual(result.selections.map((item) => item.selection_key).sort(), keys.sort());
});

test("modo manual impide dos líneas de la misma familia y fixture", () => {
  const candidates = [candidate(1, { fixtureId: 77, line: 1.5 }), candidate(2, { fixtureId: 77, line: 2.5 })];
  const result = buildAtlasCombination({ candidates, product: "parlay", mode: "manual", selections: 2, selectedKeys: candidates.map(combinationSelectionKey) });
  assert.equal(result.status, "insufficient_candidates");
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

test("modo mixto acepta una selección deportiva fija aunque su cuota esté stale", () => {
  const stale = candidate(1, { quote: { freshness: "stale", stale: true, verification_status: "stale" } });
  const result = buildAtlasCombination({ candidates: [stale, candidate(2), candidate(3)], product: "parlay", mode: "mixed", selections: 2, selectedKeys: [combinationSelectionKey(stale)] });
  assert.equal(result.status, "ready");
  assert.ok(result.selections.some((item) => item.selection_key === combinationSelectionKey(stale)));
  assert.equal(result.combined_decimal_odds, null);
  assert.equal(result.price_coverage.status, "partial");
});

test("calcula la cuota combinada sin presentarla como probabilidad", () => {
  const result = buildAtlasCombination({ candidates: [candidate(1, { decimalOdds: 1.5 }), candidate(2, { decimalOdds: 2 })], product: "parlay", mode: "automatic", selections: 2 });
  assert.equal(result.combined_decimal_odds, 3);
  assert.equal(result.combined_odds_is_probability, false);
});

test("decisión individual de Director no es requisito para sports eligibility", () => {
  const inspection = inspectCombinationCandidate(candidate(1, { directorDecision: "NO APOSTAR" }));
  assert.equal(inspection.sports_eligible, true);
});

test("precio desfavorable no modifica el soporte deportivo", () => {
  const inspection = inspectCombinationCandidate(candidate(1, { priceStatus: "unfavorable" }));
  assert.equal(inspection.sports_eligible, true);
  assert.equal(inspection.price_usable, true);
  assert.equal(inspection.candidate.economic_evaluation_status, "unfavorable");
});

test("precio marginal sin brecha positiva no altera elegibilidad deportiva", () => {
  const inspection = inspectCombinationCandidate(candidate(1, { priceStatus: "marginal", priceGap: 0 }));
  assert.equal(inspection.sports_eligible, true);
  assert.equal(inspection.price_usable, true);
});

test("candidato deportivo sin cuota puede ser elegible", () => {
  const inspection = inspectCombinationCandidate(candidate(1, { activeQuote: null }));
  assert.equal(inspection.sports_eligible, true);
  assert.equal(inspection.economic_price_status, "unavailable");
  assert.equal(inspection.price_usable, false);
});

test("automático construye sin análisis individual ni official_prediction", () => {
  const candidates = [candidate(1, { activeQuote: null }), candidate(2, { activeQuote: null })].map((item) => {
    const { director_decision, parlay_eligibility, official_prediction_id, ...sportsOnly } = item;
    void director_decision;
    void parlay_eligibility;
    void official_prediction_id;
    return sportsOnly;
  });
  const result = buildAtlasCombination({ candidates, product: "parlay", mode: "automatic", selections: 2 });
  assert.equal(result.status, "ready");
  assert.equal(result.selections.length, 2);
  assert.equal(result.price_coverage.status, "unavailable");
});

test("ranking automático es global y prioriza estimated_probability aunque el sports_score sea inferior", () => {
  const result = buildAtlasCombination({
    candidates: [
      candidate(1, { sportsScore: 95, estimated_probability: 0.5 }),
      candidate(2, { sportsScore: 60, estimated_probability: 0.88 }),
      candidate(3, { sportsScore: 75, estimated_probability: 0.7 }),
    ],
    product: "parlay",
    mode: "automatic",
    selections: 2,
  });
  assert.deepEqual(result.selections.map((item) => item.estimated_probability), [0.88, 0.7]);
  assert.deepEqual(result.selections.map((item) => item.sports_score), [60, 75]);
});

test("cuotas parciales nunca se presentan como cuota combinada completa", () => {
  const result = buildAtlasCombination({ candidates: [candidate(1, { decimalOdds: 2 }), candidate(2, { activeQuote: null })], product: "parlay", mode: "automatic", selections: 2 });
  assert.equal(result.status, "ready");
  assert.equal(result.combined_decimal_odds, null);
  assert.deepEqual(result.price_coverage, { status: "partial", available: 1, missing: 1, total: 2 });
});

test("modo manual conserva selecciones deportivas aunque falte cuota", () => {
  const candidates = [candidate(1, { activeQuote: null }), candidate(2)];
  const result = buildAtlasCombination({ candidates, product: "parlay", mode: "manual", selections: 2, selectedKeys: candidates.map(combinationSelectionKey) });
  assert.equal(result.status, "ready");
  assert.equal(result.price_coverage.status, "partial");
});

test("insuficiencia deportiva real (ranking_eligible false) impide formar una combinación", () => {
  const weak = candidate(1, { ranking_eligible: false, status: "not_viable", activeQuote: null });
  const inspection = inspectCombinationCandidate(weak);
  assert.equal(inspection.sports_eligible, false);
  assert.ok(inspection.reasons.includes("sports_status_not_viable"));
  const result = buildAtlasCombination({ candidates: [weak, candidate(2)], product: "parlay", mode: "automatic", selections: 2 });
  assert.equal(result.status, "insufficient_candidates");
});

test("un candidato sin señal explícita de ranking_eligible no es elegible para combinaciones", () => {
  const { ranking_eligible, status, ...withoutSignal } = candidate(1, { activeQuote: null });
  void ranking_eligible;
  void status;
  const inspection = inspectCombinationCandidate(withoutSignal);
  assert.equal(inspection.sports_eligible, false);
  assert.ok(inspection.reasons.includes("sports_not_ranking_eligible"));
});

test("Soñadora se construye con soporte deportivo aunque ninguna pata tenga cuota", () => {
  const result = buildAtlasCombination({
    candidates: [1, 2, 3, 4, 5].map((index) => candidate(index, { activeQuote: null })),
    product: "dream",
    mode: "automatic",
    selections: 5,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.price_coverage.available, 0);
  assert.equal(result.combined_decimal_odds, null);
  assert.equal(result.risk.level, "high");
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

test("Parlay de cuatro permite cuatro familias distintas del mismo fixture", () => {
  const result = buildAtlasCombination({
    candidates: [
      candidate(1, { fixtureId: 77, marketId: "goals", line: 2.5, sportsScore: 92 }),
      candidate(2, { fixtureId: 77, marketId: "corners", line: 8.5, sportsScore: 91 }),
      candidate(3, { fixtureId: 77, marketId: "cards", line: 4.5, sportsScore: 90 }),
      candidate(4, { fixtureId: 77, marketId: "total_shots", line: 24.5, sportsScore: 89 }),
    ],
    product: "parlay",
    mode: "automatic",
    selections: 4,
  });

  assert.equal(result.status, "ready");
  assert.equal(result.selections.length, 4);
  assert.deepEqual(
    new Set(result.selections.map((item) => item.market_family)),
    new Set(["goals", "corners", "cards", "total_shots"]),
  );
  assert.deepEqual(new Set(result.selections.map((item) => item.fixture_id)), new Set([77]));
});

test("automático rechaza dos líneas goals del mismo fixture", () => {
  const result = buildAtlasCombination({
    candidates: [
      candidate(1, { fixtureId: 77, marketId: "goals", line: 1.5, sportsScore: 92 }),
      candidate(2, { fixtureId: 77, marketId: "goals", line: 2.5, sportsScore: 91 }),
    ],
    product: "parlay",
    mode: "automatic",
    selections: 2,
  });

  assert.equal(result.status, "insufficient_candidates");
  assert.equal(result.selections.length, 1);
});

test("Soñadora permite las cinco familias reales del mismo fixture", () => {
  const families = ["goals", "corners", "cards", "total_shots", "shots_on_goal"];
  const result = buildAtlasCombination({
    candidates: families.map((marketId, index) => candidate(index + 1, {
      fixtureId: 77,
      marketId,
      line: index + 1.5,
      sportsScore: 92 - index,
    })),
    product: "dream",
    mode: "automatic",
    selections: 5,
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(new Set(result.selections.map((item) => item.market_family)), new Set(families));
  assert.deepEqual(new Set(result.selections.map((item) => item.fixture_id)), new Set([77]));
});

test("modo mixto respeta la familia ya ocupada dentro del fixture", () => {
  const fixedGoal = candidate(1, { fixtureId: 77, marketId: "goals", line: 1.5, sportsScore: 86 });
  const repeatedGoal = candidate(2, { fixtureId: 77, marketId: "goals", line: 2.5, sportsScore: 94 });
  const corners = candidate(3, { fixtureId: 77, marketId: "corners", line: 8.5, sportsScore: 92 });
  const cards = candidate(4, { fixtureId: 77, marketId: "cards", line: 4.5, sportsScore: 91 });
  const result = buildAtlasCombination({
    candidates: [fixedGoal, repeatedGoal, corners, cards],
    product: "parlay",
    mode: "mixed",
    selections: 3,
    selectedKeys: [combinationSelectionKey(fixedGoal)],
  });

  assert.equal(result.status, "ready");
  assert.ok(!result.selections.some((item) => item.selection_key === combinationSelectionKey(repeatedGoal)));
  assert.deepEqual(new Set(result.selections.map((item) => item.market_family)), new Set(["goals", "corners", "cards"]));
});

test("Parlay automático diversifica familias cuando el soporte es comparable", () => {
  const result = buildAtlasCombination({
    candidates: [
      candidate(1, { marketId: "goals", sportsScore: 91 }),
      candidate(2, { marketId: "goals", sportsScore: 90 }),
      candidate(3, { marketId: "corners", line: 8.5, sportsScore: 89 }),
      candidate(4, { marketId: "total_shots", line: 24.5, sportsScore: 88 }),
    ],
    product: "parlay",
    mode: "automatic",
    selections: 3,
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(new Set(result.selections.map((item) => item.market_family)), new Set(["goals", "corners", "total_shots"]));
});

test("Parlay automático no fuerza diversidad con alternativas claramente peores", () => {
  const result = buildAtlasCombination({
    candidates: [
      candidate(1, { marketId: "goals", sportsScore: 94 }),
      candidate(2, { marketId: "goals", sportsScore: 93 }),
      candidate(3, { marketId: "goals", sportsScore: 92 }),
      candidate(4, { marketId: "corners", line: 8.5, sportsScore: 75 }),
      candidate(5, { marketId: "total_shots", line: 24.5, sportsScore: 70 }),
    ],
    product: "parlay",
    mode: "automatic",
    selections: 3,
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(new Set(result.selections.map((item) => item.market_family)), new Set(["goals"]));
});

test("la diversidad admite otra familia válida del mismo fixture", () => {
  const result = buildAtlasCombination({
    candidates: [
      candidate(1, { fixtureId: 77, marketId: "goals", sportsScore: 91 }),
      candidate(2, { fixtureId: 88, marketId: "goals", sportsScore: 90 }),
      candidate(3, { fixtureId: 77, marketId: "corners", line: 8.5, sportsScore: 89 }),
      candidate(4, { fixtureId: 99, marketId: "total_shots", line: 24.5, sportsScore: 88 }),
    ],
    product: "parlay",
    mode: "automatic",
    selections: 2,
  });

  assert.equal(result.status, "ready");
  assert.ok(result.selections.some((item) => item.fixture_id === 77 && item.market_family === "corners"));
});

test("modo mixto cuenta la familia de una pata fija al diversificar", () => {
  const fixed = candidate(1, { marketId: "goals", sportsScore: 86 });
  const leadingGoal = candidate(2, { marketId: "goals", sportsScore: 94 });
  const corners = candidate(3, { marketId: "corners", line: 8.5, sportsScore: 92 });
  const shots = candidate(4, { marketId: "total_shots", line: 24.5, sportsScore: 91 });
  const result = buildAtlasCombination({
    candidates: [fixed, leadingGoal, corners, shots],
    product: "parlay",
    mode: "mixed",
    selections: 3,
    selectedKeys: [combinationSelectionKey(fixed)],
  });

  assert.equal(result.status, "ready");
  assert.deepEqual(new Set(result.selections.map((item) => item.market_family)), new Set(["goals", "corners", "total_shots"]));
  assert.ok(!result.selections.some((item) => item.selection_key === combinationSelectionKey(leadingGoal)));
});

test("modo manual no aplica diversidad automática", () => {
  const firstGoal = candidate(1, { marketId: "goals", sportsScore: 91 });
  const secondGoal = candidate(2, { marketId: "goals", sportsScore: 90 });
  const corners = candidate(3, { marketId: "corners", line: 8.5, sportsScore: 89 });
  const selectedKeys = [combinationSelectionKey(firstGoal), combinationSelectionKey(secondGoal)];
  const result = buildAtlasCombination({ candidates: [firstGoal, secondGoal, corners], product: "parlay", mode: "manual", selections: 2, selectedKeys });

  assert.equal(result.status, "ready");
  assert.deepEqual(result.selections.map((item) => item.selection_key), selectedKeys);
  assert.deepEqual(new Set(result.selections.map((item) => item.market_family)), new Set(["goals"]));
});

test("Soñadora larga conserva el ranking de estabilidad y no altera datos deportivos", () => {
  const aggressive = candidate(1, { fixtureId: 500, marketId: "goals", sportsScore: 88, lineStabilityScore: 0, uncertaintyLow: 0.3, uncertaintyHigh: 0.9, sampleSize: 5 });
  const stable = candidate(2, { fixtureId: 500, marketId: "corners", line: 8.5, sportsScore: 86, lineStabilityScore: 100, uncertaintyLow: 0.58, uncertaintyHigh: 0.68, sampleSize: 30 });
  const rest = Array.from({ length: 7 }, (_, index) => candidate(index + 10, { sportsScore: 84 - index }));
  const candidates = [aggressive, stable, ...rest];
  const before = JSON.stringify(candidates);
  const result = buildAtlasCombination({ candidates, product: "dream", mode: "automatic", selections: 8 });

  assert.equal(result.status, "ready");
  assert.ok(result.selections.some((item) => item.selection_key === combinationSelectionKey(stable)));
  assert.ok(!result.selections.some((item) => item.selection_key === combinationSelectionKey(aggressive)));
  assert.equal(JSON.stringify(candidates), before);
  for (const selected of result.selections) {
    const source = candidates.find((item) => combinationSelectionKey(item) === selected.selection_key);
    assert.equal(selected.sports_score, source.sportsScore);
    assert.equal(selected.probability, source.probability);
  }
});

test("quitar una pata conserva exactamente el orden relativo restante", () => {
  const result = buildAtlasCombination({
    candidates: [
      candidate(1, { marketId: "goals", sportsScore: 91 }),
      candidate(2, { marketId: "goals", sportsScore: 90 }),
      candidate(3, { marketId: "corners", line: 8.5, sportsScore: 89 }),
      candidate(4, { marketId: "total_shots", line: 24.5, sportsScore: 88 }),
    ],
    product: "parlay",
    mode: "automatic",
    selections: 4,
  });
  const originalKeys = result.selections.map((item) => item.selection_key);
  const edited = removeCombinationSelection(result, originalKeys[1]);

  assert.deepEqual(edited.selections.map((item) => item.selection_key), originalKeys.filter((_, index) => index !== 1));
  assert.equal(edited.mode, "automatic");
  assert.equal(edited.requested_selections, 4);
});
