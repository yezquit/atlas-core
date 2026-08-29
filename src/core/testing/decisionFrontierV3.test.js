import test from "node:test";
import assert from "node:assert/strict";

import { buildDecisionFrontier, calculateDecisionEconomics } from "../intelligence/decisionFrontier.js";
import { rankMarketCandidates, selectCandidateQuote } from "../intelligence/marketCandidateRanker.js";
import { buildAtlasCombination, COMBINATION_MODE, COMBINATION_PRODUCT } from "../intelligence/atlasCombinationEngine.js";

function candidate(line, overrides = {}) {
  return {
    candidate_id: `goals:over:${line}`,
    fixture_id: 41,
    market_family: "goals",
    direction: "over",
    selection: `Over ${line}`,
    line,
    estimated_probability: 0.9,
    preliminary_probability: 0.9,
    probability_status: "preliminary",
    uncertainty_low: 0.84,
    uncertainty_high: 0.94,
    sample_size_effective: 20,
    sports_score: 80,
    technical_support_score: 80,
    line_stability_score: 80,
    ranking_eligible: true,
    ...overrides,
  };
}

function exactQuote(line, odds = 2) {
  return { market_family: "goals", direction: "over", line, decimal_odds: odds };
}

test("A-B: el catálogo conserva líneas y la frontera puede preferir una línea más útil con P comparable", () => {
  const result = buildDecisionFrontier([candidate(0.5, { estimated_probability: 0.95, preliminary_probability: 0.95 }), candidate(1.5)], {});
  assert.equal(result.candidates.length, 2);
  assert.equal(result.primary.line, 1.5);
  assert.equal(result.candidates.find((item) => item.line === 0.5).estimated_probability, 0.95);
});

test("C: una caída material de soporte deja la línea exigente fuera de la frontera", () => {
  const result = buildDecisionFrontier([candidate(0.5), candidate(2.5, { sports_score: 30, line_stability_score: 20, uncertainty_low: 0.3, uncertainty_high: 0.9 })]);
  assert.equal(result.primary.line, 0.5);
  assert.equal(result.candidates.find((item) => item.line === 2.5).decision_frontier.status, "outside_sports_frontier");
});

test("D: economía exacta expone implícita, edge y EV sin prometer resultado", () => {
  const economics = calculateDecisionEconomics(candidate(1.5, { price_status: "verified_current", price_quote: exactQuote(1.5, 2) }));
  assert.deepEqual(economics, { status: "available", implied_probability: 0.5, edge: 0.4, expected_value: 0.8, quote_exact: true });
});

test("E-F: una cuota alta no reemplaza respaldo y una línea comparable puede superar a la de mayor P", () => {
  const result = buildDecisionFrontier([
    candidate(0.5, { estimated_probability: 0.95, preliminary_probability: 0.95, price_status: "verified_current", price_quote: exactQuote(0.5, 1.1) }),
    candidate(1.5, { price_status: "verified_current", price_quote: exactQuote(1.5, 2) }),
    candidate(2.5, { sports_score: 20, price_status: "verified_current", price_quote: exactQuote(2.5, 15) }),
  ]);
  assert.equal(result.primary.line, 1.5);
  assert.equal(result.candidates.find((item) => item.line === 2.5).decision_frontier.status, "outside_sports_frontier");
});

test("G: una cuota de otra línea no se acepta ni genera economía", () => {
  const selection = selectCandidateQuote(candidate(1.5), [exactQuote(0.5, 4)]);
  assert.equal(selection.status, "incompatible_line");
  assert.equal(calculateDecisionEconomics(candidate(1.5, { price_status: "verified_current", price_quote: exactQuote(0.5, 4) })).status, "unavailable");
});

test("H-L: precio manual exacto no cambia métricas deportivas y los perfiles Parlay/Soñadora siguen siendo explícitos", () => {
  const source = candidate(1.5);
  const before = rankMarketCandidates([source])[0];
  const after = rankMarketCandidates([source], { quotes: [{ ...exactQuote(1.5, 2.1), verification_status: "verified_provider", freshness: "fresh" }] })[0];
  assert.equal(after.estimated_probability, before.estimated_probability);
  assert.equal(after.sports_score, before.sports_score);
  assert.equal(after.price_status, "verified_current");

  const candidates = [
    candidate(1.5, { fixture_id: 1, active_quote: { ...exactQuote(1.5, 1.8), fixture_id: 1, verification_status: "verified_provider", freshness: "fresh" } }),
    { ...candidate(8.5, { fixture_id: 2, market_family: "corners", candidate_id: "corners:over:8.5" }), active_quote: { fixture_id: 2, market_family: "corners", direction: "over", line: 8.5, decimal_odds: 1.9, verification_status: "verified_provider", freshness: "fresh" } },
  ];
  const parlay = buildAtlasCombination({ candidates, product: COMBINATION_PRODUCT.PARLAY, mode: COMBINATION_MODE.AUTOMATIC, selections: 2 });
  assert.equal(parlay.status, "ready");
  assert.equal(parlay.selections.length, 2);
  assert.equal(parlay.decision_frontier.product, "parlay");
  const noOdds = buildDecisionFrontier([candidate(0.5), candidate(1.5)]);
  assert.equal(noOdds.primary.line, 1.5);
  const dream = buildDecisionFrontier([candidate(0.5), candidate(1.5)], { product: "dream" });
  assert.equal(dream.primary.line, 1.5);
});
