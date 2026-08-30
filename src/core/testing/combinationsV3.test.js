import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAtlasCombination,
  combinationSelectionKey,
  inspectCombinationCandidate,
} from "../intelligence/atlasCombinationEngine.js";
import { selectCombinationJourneyCandidates } from "../services/sportsIntelligenceService.js";

function candidate(index, overrides = {}) {
  const fixtureId = overrides.fixtureId ?? 8000 + index;
  const marketId = overrides.marketId ?? "goals";
  const direction = overrides.direction ?? "over";
  const line = overrides.line ?? 1.5;
  const quote = overrides.activeQuote === null ? null : {
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
    marketId,
    market: marketId,
    direction,
    line,
    selection: quote ? quote.selection : `${direction === "under" ? "Under" : "Over"} ${line}`,
    sportsScore: overrides.sportsScore ?? 75,
    ranking_eligible: overrides.ranking_eligible ?? true,
    estimated_probability: overrides.estimated_probability ?? 0.6,
    uncertaintyLow: overrides.uncertaintyLow ?? 0.5,
    uncertaintyHigh: overrides.uncertaintyHigh ?? 0.7,
    sampleSize: overrides.sampleSize ?? 20,
    technicalSupport: overrides.technicalSupport ?? 60,
    status: overrides.status ?? "sports_candidate_pending_price",
    active_quote: quote,
    ...overrides,
  };
}

function journeyEntry(fixtureId, candidateId, overrides = {}) {
  return {
    analysis: { fixture: { fixtureId } },
    candidate: {
      candidate_id: candidateId,
      market_family: overrides.market_family ?? "goals",
      direction: overrides.direction ?? "over",
      line: overrides.line ?? 1.5,
      ranking_eligible: overrides.ranking_eligible ?? true,
      estimated_probability: overrides.estimated_probability ?? 0.6,
      uncertainty_low: overrides.uncertainty_low ?? 0.5,
      uncertainty_high: overrides.uncertainty_high ?? 0.7,
      sample_size_effective: overrides.sample_size_effective ?? 20,
      technical_support_score: overrides.technical_support_score ?? 70,
      sports_score: overrides.sports_score ?? 80,
    },
  };
}

test("1. Parlay con exactamente 2 candidatos válidos genera 2", () => {
  const result = buildAtlasCombination({ candidates: [candidate(1), candidate(2)], product: "parlay", mode: "automatic", selections: 2 });
  assert.equal(result.status, "ready");
  assert.equal(result.selections.length, 2);
});

test("2. Parlay con 3 candidatos válidos genera 3", () => {
  const result = buildAtlasCombination({ candidates: [candidate(1), candidate(2), candidate(3)], product: "parlay", mode: "automatic", selections: 3 });
  assert.equal(result.status, "ready");
  assert.equal(result.selections.length, 3);
});

test("3. Parlay rechaza solicitar más de 4 selecciones en vez de recortar automáticamente", () => {
  const result = buildAtlasCombination({
    candidates: [1, 2, 3, 4, 5, 6].map((index) => candidate(index)),
    product: "parlay",
    mode: "automatic",
    selections: 6,
  });
  assert.equal(result.status, "invalid_request");
  assert.equal(result.errorCode, "invalid_selection_count");
});

test("4. menos de 2 candidatos válidos no fabrica Parlay", () => {
  const result = buildAtlasCombination({ candidates: [candidate(1)], product: "parlay", mode: "automatic", selections: 2 });
  assert.equal(result.status, "insufficient_candidates");
  assert.match(result.director_message, /no forzará/i);
});

test("5. Soñadora con exactamente 5 candidatos válidos genera 5", () => {
  const result = buildAtlasCombination({ candidates: [1, 2, 3, 4, 5].map((index) => candidate(index)), product: "dream", mode: "automatic", selections: 5 });
  assert.equal(result.status, "ready");
  assert.equal(result.selections.length, 5);
});

test("6. Soñadora con entre 5 y 15 conserva todos los válidos hasta el objetivo", () => {
  const result = buildAtlasCombination({ candidates: Array.from({ length: 10 }, (_, index) => candidate(index + 1)), product: "dream", mode: "automatic", selections: 10 });
  assert.equal(result.status, "ready");
  assert.equal(result.selections.length, 10);
});

test("7. Soñadora rechaza solicitar más de 15 selecciones en vez de recortar automáticamente", () => {
  const result = buildAtlasCombination({
    candidates: Array.from({ length: 20 }, (_, index) => candidate(index + 1)),
    product: "dream",
    mode: "automatic",
    selections: 16,
  });
  assert.equal(result.status, "invalid_request");
  assert.equal(result.errorCode, "invalid_selection_count");
});

test("8. menos de 5 candidatos válidos no fabrica Soñadora", () => {
  const result = buildAtlasCombination({ candidates: [1, 2, 3, 4].map((index) => candidate(index)), product: "dream", mode: "automatic", selections: 5 });
  assert.equal(result.status, "insufficient_candidates");
});

test("9. la frontera de decisión puede preferir mejor calidad deportiva sin cambiar probabilities", () => {
  const result = buildAtlasCombination({
    candidates: [
      candidate(1, { sportsScore: 95, estimated_probability: 0.5 }),
      candidate(2, { sportsScore: 55, estimated_probability: 0.88 }),
      candidate(3, { sportsScore: 70, estimated_probability: 0.75 }),
    ],
    product: "parlay",
    mode: "automatic",
    selections: 2,
  });
  assert.deepEqual(result.selections.map((item) => item.estimated_probability), [0.75, 0.88]);
  assert.deepEqual(result.selections.map((item) => item.sports_score), [70, 55]);
});

test("10. empate de estimated_probability lo resuelve la incertidumbre más estrecha", () => {
  const result = buildAtlasCombination({
    candidates: [
      candidate(1, { fixtureId: 9001, estimated_probability: 0.7, uncertaintyLow: 0.4, uncertaintyHigh: 1.0 }),
      candidate(2, { fixtureId: 9002, estimated_probability: 0.7, uncertaintyLow: 0.65, uncertaintyHigh: 0.75 }),
      candidate(3, { fixtureId: 9003, estimated_probability: 0.6 }),
    ],
    product: "parlay",
    mode: "automatic",
    selections: 2,
  });
  assert.equal(result.selections[0].fixture_id, 9002);
});

test("11. tras empatar probabilidad e incertidumbre gana mayor sample_size_effective", () => {
  const result = buildAtlasCombination({
    candidates: [
      candidate(1, { fixtureId: 9101, estimated_probability: 0.7, uncertaintyLow: 0.6, uncertaintyHigh: 0.8, sampleSize: 10 }),
      candidate(2, { fixtureId: 9102, estimated_probability: 0.7, uncertaintyLow: 0.6, uncertaintyHigh: 0.8, sampleSize: 40 }),
      candidate(3, { fixtureId: 9103, estimated_probability: 0.5 }),
    ],
    product: "parlay",
    mode: "automatic",
    selections: 2,
  });
  assert.equal(result.selections[0].fixture_id, 9102);
});

test("12. tras empatar probabilidad, incertidumbre y muestra gana mayor technical_support_score", () => {
  const result = buildAtlasCombination({
    candidates: [
      candidate(1, { fixtureId: 9201, estimated_probability: 0.7, uncertaintyLow: 0.6, uncertaintyHigh: 0.8, sampleSize: 20, technicalSupport: 40 }),
      candidate(2, { fixtureId: 9202, estimated_probability: 0.7, uncertaintyLow: 0.6, uncertaintyHigh: 0.8, sampleSize: 20, technicalSupport: 90 }),
      candidate(3, { fixtureId: 9203, estimated_probability: 0.5 }),
    ],
    product: "parlay",
    mode: "automatic",
    selections: 2,
  });
  assert.equal(result.selections[0].fixture_id, 9202);
});

test("13. no puede haber dos selecciones con el mismo fixture_id y market_family", () => {
  const result = buildAtlasCombination({
    candidates: [
      candidate(1, { fixtureId: 9301, marketId: "goals", line: 1.5 }),
      candidate(2, { fixtureId: 9301, marketId: "goals", line: 2.5 }),
      candidate(3, { fixtureId: 9302 }),
    ],
    product: "parlay",
    mode: "automatic",
    selections: 2,
  });
  assert.equal(result.selections.filter((item) => item.fixture_id === 9301).length, 1);
});

test("14. dos líneas de la misma familia del mismo fixture no pueden coexistir", () => {
  const items = [candidate(1, { fixtureId: 9401, line: 1.5 }), candidate(2, { fixtureId: 9401, line: 2.5 })];
  const result = buildAtlasCombination({ candidates: items, product: "parlay", mode: "manual", selections: 2, selectedKeys: items.map(combinationSelectionKey) });
  assert.equal(result.status, "insufficient_candidates");
});

test("15. la cuota no altera probability ni sports_score", () => {
  const result = buildAtlasCombination({
    candidates: [
      candidate(1, { fixtureId: 9501, estimated_probability: 0.9, activeQuote: null }),
      candidate(2, { fixtureId: 9502, estimated_probability: 0.5, decimalOdds: 5 }),
    ],
    product: "parlay",
    mode: "automatic",
    selections: 2,
  });
  assert.deepEqual([...result.selections.map((item) => item.estimated_probability)].sort((a, b) => b - a), [0.9, 0.5]);
  assert.equal(result.selections.find((item) => item.fixture_id === 9501).sports_score, 75);
});

test("16. la cuota exacta exige coincidencia total de fixture + market_family + direction + line", () => {
  const differentFixture = inspectCombinationCandidate(candidate(1, { quote: { fixture_id: 9999 } }));
  assert.equal(differentFixture.economic_price_status, "incompatible_fixture");
  assert.equal(differentFixture.price_usable, false);

  const differentFamily = inspectCombinationCandidate(candidate(1, { quote: { market_family: "corners" } }));
  assert.equal(differentFamily.economic_price_status, "incompatible_market");
  assert.equal(differentFamily.price_usable, false);

  const differentDirection = inspectCombinationCandidate(candidate(1, { quote: { direction: "under", selection: "Under 1.5" } }));
  assert.equal(differentDirection.economic_price_status, "incompatible_direction");
  assert.equal(differentDirection.price_usable, false);

  const differentLine = inspectCombinationCandidate(candidate(1, { quote: { line: 2.5 } }));
  assert.equal(differentLine.economic_price_status, "incompatible_line");
  assert.equal(differentLine.price_usable, false);
});

test("17. una cuota de otra línea no se transfiere a la línea del candidato", () => {
  const item = candidate(1, { line: 1.5, quote: { line: 2.5 } });
  const inspection = inspectCombinationCandidate(item);
  assert.equal(inspection.candidate.decimal_odds, null);
  assert.equal(inspection.candidate.active_quote, null);
});

test("18. la combinación deportiva existe aunque falte la cuota", () => {
  const result = buildAtlasCombination({
    candidates: [candidate(1, { activeQuote: null }), candidate(2, { activeQuote: null })],
    product: "parlay",
    mode: "automatic",
    selections: 2,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.price_coverage.available, 0);
});

test("19. combined_decimal_odds es el producto decimal exacto", () => {
  const result = buildAtlasCombination({
    candidates: [candidate(1, { decimalOdds: 1.5 }), candidate(2, { decimalOdds: 1.8 }), candidate(3, { decimalOdds: 2 })],
    product: "parlay",
    mode: "automatic",
    selections: 3,
  });
  assert.equal(result.combined_decimal_odds, 5.4);
});

test("20. si falta una cuota la combinación existe pero la economía queda incompleta", () => {
  const result = buildAtlasCombination({
    candidates: [candidate(1, { decimalOdds: 1.5 }), candidate(2, { activeQuote: null })],
    product: "parlay",
    mode: "automatic",
    selections: 2,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.combined_decimal_odds, null);
  assert.equal(result.price_coverage.status, "partial");
});

test("21. cero candidatos válidos es un resultado aceptable", () => {
  const result = buildAtlasCombination({ candidates: [], product: "parlay", mode: "automatic", selections: 2 });
  assert.equal(result.status, "insufficient_candidates");
  assert.equal(result.selections.length, 0);
});

test("22. muchos candidatos elegibles producen Parlay cuando al menos 2 sobreviven diversidad", () => {
  const entries = Array.from({ length: 50 }, (_, index) => journeyEntry(2000 + index, `cand-${index}`, {
    estimated_probability: 0.5 + (index % 10) / 100,
    sports_score: index % 2 === 0 ? 50 : 80,
  }));
  const selected = selectCombinationJourneyCandidates(entries, 50);
  assert.ok(selected.length >= 2);
  const flatCandidates = selected.map((entry) => ({
    fixtureId: entry.analysis.fixture.fixtureId,
    fixture: `Local ${entry.analysis.fixture.fixtureId} vs Visitante ${entry.analysis.fixture.fixtureId}`,
    marketId: entry.candidate.market_family,
    direction: entry.candidate.direction,
    line: entry.candidate.line,
    selection: `Over ${entry.candidate.line}`,
    ranking_eligible: entry.candidate.ranking_eligible,
    estimated_probability: entry.candidate.estimated_probability,
    sportsScore: entry.candidate.sports_score,
    uncertaintyLow: entry.candidate.uncertainty_low,
    uncertaintyHigh: entry.candidate.uncertainty_high,
    sampleSize: entry.candidate.sample_size_effective,
    technicalSupport: entry.candidate.technical_support_score,
  }));
  const result = buildAtlasCombination({ candidates: flatCandidates, product: "parlay", mode: "automatic", selections: 2 });
  assert.equal(result.status, "ready");
  assert.equal(result.selections.length, 2);
});

test("23. Journey ordena el selector de combinaciones por estimated_probability DESC", () => {
  const entries = [
    journeyEntry(3001, "alto-score-baja-prob", { sports_score: 95, estimated_probability: 0.5 }),
    journeyEntry(3002, "bajo-score-alta-prob", { sports_score: 60, estimated_probability: 0.9 }),
  ];
  const selected = selectCombinationJourneyCandidates(entries, 10);
  assert.equal(selected[0].candidate.candidate_id, "bajo-score-alta-prob");
});

test("24. estimated_probability no cambia después de asociar una cuota", () => {
  const raw = candidate(1, { estimated_probability: 0.77, activeQuote: null });
  const before = inspectCombinationCandidate(raw).candidate.estimated_probability;
  const withQuote = candidate(1, { estimated_probability: 0.77, decimalOdds: 1.8 });
  const after = inspectCombinationCandidate(withQuote).candidate.estimated_probability;
  assert.equal(before, 0.77);
  assert.equal(after, 0.77);
});

test("25. preliminary_probability no sustituye a estimated_probability ausente", () => {
  const raw = candidate(1, { ranking_eligible: true });
  delete raw.estimated_probability;
  raw.preliminary_probability = 0.8;
  const inspection = inspectCombinationCandidate(raw);
  assert.equal(inspection.candidate.estimated_probability, null);
});
