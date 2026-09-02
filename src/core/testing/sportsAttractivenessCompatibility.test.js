import test from "node:test";
import assert from "node:assert/strict";

import { rankMarketCandidates } from "../intelligence/marketCandidateRanker.js";

function assessment(marketFamily = "goals") {
  return [{ market_family: marketFamily, market_label: marketFamily, technical_support_score: 80 }];
}

function candidate(id, overrides = {}) {
  const marketFamily = overrides.market_family || "goals";
  return {
    candidate_id: id,
    market_family: marketFamily,
    direction: "over",
    selection: `Over ${overrides.line ?? 2.5}`,
    line: overrides.line ?? 2.5,
    projected_mean: 3,
    dispersion: 1.5,
    probability_status: "preliminary",
    preliminary_probability: 0.6,
    uncertainty_low: 0.5,
    uncertainty_high: 0.7,
    sample_size_effective: 20,
    limitations: [],
    input_sources: [],
    context_adjustment: { changed_distribution: false },
    contextual_only: false,
    model_validation_status: "preliminary_unvalidated",
    ...overrides,
  };
}

function rankedIds(targetOverrides = {}, marketFamily = "goals") {
  const control = candidate("control", {
    market_family: marketFamily,
    line: 3.5,
    estimated_probability: 0.6,
    preliminary_probability: 0.6,
    ...(marketFamily === "asian_total_goals"
      ? { probability_semantics: "settlement_favorability", sports_favorability: 0.6 }
      : {}),
  });
  const target = candidate("target", {
    market_family: marketFamily,
    line: 2.5,
    preliminary_probability: 0.9,
    ...targetOverrides,
  });
  return rankMarketCandidates([target, control], { marketAssessments: assessment(marketFamily) })
    .map((item) => item.candidate_id);
}

test("A. estimated_probability clásica válida conserva prioridad histórica", () => {
  assert.deepEqual(rankedIds({ estimated_probability: 0.8 }), ["target", "control"]);
});

test("B/F. estimated_probability undefined usa el fallback legado válido", () => {
  assert.deepEqual(rankedIds({ estimated_probability: undefined, preliminary_probability: 0.8 }), ["target", "control"]);
});

for (const [label, invalidValue] of [
  ["C. mayor que 1", 1.01],
  ["D. menor que 0", -0.01],
  ["E. NaN", Number.NaN],
  ["F. null", null],
]) {
  test(`${label}: no cae silenciosamente a preliminary_probability`, () => {
    assert.deepEqual(rankedIds({ estimated_probability: invalidValue, preliminary_probability: 0.9 }), ["control", "target"]);
  });
}

test("G. clásico normal sigue ordenado por probabilidad válida", () => {
  assert.deepEqual(rankedIds({ estimated_probability: 0.7, preliminary_probability: 0.7 }), ["target", "control"]);
});

test("H. asian_total_goals usa sports_favorability válida", () => {
  assert.deepEqual(rankedIds({
    probability_semantics: "settlement_favorability",
    sports_favorability: 0.8,
    estimated_probability: 0.2,
    preliminary_probability: 0.2,
  }, "asian_total_goals"), ["target", "control"]);
});
