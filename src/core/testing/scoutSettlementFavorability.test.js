import test from "node:test";
import assert from "node:assert/strict";

import { buildScoutAtlas } from "../intelligence/scoutAtlas.js";

function candidate({
  id,
  family = "goals",
  rank,
  probability,
  favorability,
  semantics,
  odds,
} = {}) {
  return {
    candidate_id: id,
    market_family: family,
    direction: "over",
    line: rank + 0.5,
    selection: `Over ${rank + 0.5}`,
    probability_status: "preliminary",
    probability_semantics: semantics,
    preliminary_probability: probability,
    sports_favorability: favorability,
    sports_score: 70,
    rank,
    decimal_odds: odds,
    simple_sports_reasons: [],
    limitations: [],
  };
}

function scout(candidates) {
  return buildScoutAtlas({ marketSelection: { ranked_candidates: candidates } });
}

test("Scout clásico conserva highest_probability para la mayor probabilidad", () => {
  const result = scout([
    candidate({ id: "goals:over:1.5", rank: 1, probability: 0.62 }),
    candidate({ id: "goals:over:2.5", rank: 2, probability: 0.74 }),
  ]);

  assert.ok(result.candidates.find((item) => item.candidate_id === "goals:over:2.5").labels.includes("highest_probability"));
});

test("Scout Asian etiqueta la mayor Favorabilidad sin llamarla probabilidad", () => {
  const result = scout([
    candidate({ id: "asian:over:2.25", family: "asian_total_goals", rank: 1, probability: 0.61, favorability: 0.61, semantics: "settlement_favorability" }),
    candidate({ id: "asian:over:2.75", family: "asian_total_goals", rank: 2, probability: 0.78, favorability: 0.78, semantics: "settlement_favorability" }),
  ]);
  const highest = result.candidates.find((item) => item.candidate_id === "asian:over:2.75");

  assert.ok(highest.labels.includes("highest_favorability"));
  assert.ok(result.candidates.every((item) => !item.labels.includes("highest_probability")));
});

test("Scout reconoce un candidato Asian antiguo por market_family", () => {
  const result = scout([
    candidate({ id: "asian:legacy:2.25", family: "asian_total_goals", rank: 1, probability: 0.64 }),
    candidate({ id: "asian:legacy:2.75", family: "asian_total_goals", rank: 2, probability: 0.7 }),
  ]);

  assert.ok(result.candidates.find((item) => item.candidate_id === "asian:legacy:2.75").labels.includes("highest_favorability"));
  assert.ok(result.candidates.every((item) => !item.labels.includes("highest_probability")));
});

test("Scout no compara Favorabilidad Asian con probabilidad clásica", () => {
  const result = scout([
    candidate({ id: "goals:over:1.5", rank: 1, probability: 0.55 }),
    candidate({ id: "asian:over:2.25", family: "asian_total_goals", rank: 2, probability: 0.85, favorability: 0.85, semantics: "settlement_favorability" }),
  ]);

  assert.ok(result.candidates.find((item) => item.candidate_id === "goals:over:1.5").labels.includes("highest_probability"));
  assert.ok(result.candidates.find((item) => item.candidate_id === "asian:over:2.25").labels.includes("highest_favorability"));
});

test("Scout Asian ordena solo por Favorabilidad y no depende de economía", () => {
  const first = scout([
    candidate({ id: "asian:over:2.25", family: "asian_total_goals", rank: 1, probability: 0.63, favorability: 0.63, semantics: "settlement_favorability", odds: 9 }),
    candidate({ id: "asian:over:2.75", family: "asian_total_goals", rank: 2, probability: 0.72, favorability: 0.72, semantics: "settlement_favorability", odds: 1.1 }),
  ]);
  const second = scout(first.candidates.map((item) => ({ ...item, decimal_odds: item.decimal_odds === 9 ? 1.01 : 20 })));

  assert.equal(first.candidates.find((item) => item.labels.includes("highest_favorability")).candidate_id, "asian:over:2.75");
  assert.equal(second.candidates.find((item) => item.labels.includes("highest_favorability")).candidate_id, "asian:over:2.75");
  assert.equal(first.price_inputs_used, false);
  assert.equal(second.price_inputs_used, false);
});
