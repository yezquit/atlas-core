import test from "node:test";
import assert from "node:assert/strict";

import {
  PROBABILITY_CLASSIFICATION,
  classifyProbability,
  isCalibratedModel,
  isValidProbability,
  toProbabilityPercent,
} from "../intelligence/probabilityClassification.js";
import { OVERALL_STATUS, rankMarketCandidates } from "../intelligence/marketCandidateRanker.js";

function assessments(overridesByFamily = {}) {
  return ["goals", "corners", "cards", "total_shots", "shots_on_goal"].map((family) => ({
    market_family: family,
    market_label: family,
    technical_support_score: overridesByFamily[family] ?? 80,
  }));
}

function candidate(overrides = {}) {
  return {
    candidate_id: `${overrides.market_family || "goals"}:${overrides.direction || "over"}:${overrides.line ?? 2.5}`,
    market_family: "goals",
    direction: "over",
    selection: "Over 2.5",
    line: 2.5,
    projected_mean: 3,
    dispersion: 1.5,
    probability_status: "preliminary",
    preliminary_probability: 0.68,
    uncertainty_low: 0.63,
    uncertainty_high: 0.73,
    sample_size_effective: 20,
    limitations: [],
    input_sources: [],
    context_adjustment: { changed_distribution: false },
    contextual_only: false,
    model_validation_status: "preliminary_unvalidated",
    ...overrides,
  };
}

function quote(candidateValue, decimalOdds) {
  return {
    market_family: candidateValue.market_family,
    selection: candidateValue.selection,
    direction: candidateValue.direction,
    line: String(candidateValue.line),
    decimal_odds: decimalOdds,
    implied_probability: 1 / decimalOdds,
    verification_status: "verified_provider",
    freshness: "fresh",
  };
}

test("1. estimated_probability queda en la convención 0-1", () => {
  const [ranked] = rankMarketCandidates([candidate({ preliminary_probability: 0.85 })], { marketAssessments: assessments() });
  assert.ok(ranked.estimated_probability >= 0 && ranked.estimated_probability <= 1);
});

test("2. probability_percent convierte 0.85 a 85.0", () => {
  assert.equal(toProbabilityPercent(0.85), 85);
});

for (const [probability, expected] of [
  [0.90, PROBABILITY_CLASSIFICATION.VERY_HIGH],
  [0.80, PROBABILITY_CLASSIFICATION.HIGH],
  [0.70, PROBABILITY_CLASSIFICATION.GOOD],
  [0.60, PROBABILITY_CLASSIFICATION.MODERATE],
  [0.50, PROBABILITY_CLASSIFICATION.RISKY],
  [0.40, PROBABILITY_CLASSIFICATION.VERY_RISKY],
]) {
  test(`3. clasificación de ${probability} es ${expected}`, () => assert.equal(classifyProbability(probability), expected));
}

for (const [probability, expected] of [
  [0.85, PROBABILITY_CLASSIFICATION.VERY_HIGH],
  [0.84, PROBABILITY_CLASSIFICATION.HIGH],
  [0.75, PROBABILITY_CLASSIFICATION.HIGH],
  [0.74, PROBABILITY_CLASSIFICATION.GOOD],
  [0.65, PROBABILITY_CLASSIFICATION.GOOD],
  [0.64, PROBABILITY_CLASSIFICATION.MODERATE],
  [0.55, PROBABILITY_CLASSIFICATION.MODERATE],
  [0.54, PROBABILITY_CLASSIFICATION.RISKY],
  [0.45, PROBABILITY_CLASSIFICATION.RISKY],
  [0.44, PROBABILITY_CLASSIFICATION.VERY_RISKY],
]) {
  test(`4. frontera de clasificación en ${probability} es ${expected}`, () => assert.equal(classifyProbability(probability), expected));
}

test("5. candidato no evaluable no recibe estimated_probability=0", () => {
  const [ranked] = rankMarketCandidates([candidate({ probability_status: "unavailable", preliminary_probability: null })], { marketAssessments: assessments() });
  assert.equal(ranked.estimated_probability, null);
  assert.notEqual(ranked.estimated_probability, 0);
  assert.equal(ranked.overall_status, OVERALL_STATUS.INSUFFICIENT);
  assert.equal(ranked.ranking_eligible, false);
});

test("6. estimated_probability presente pero inválida no cae silenciosamente a preliminary_probability", () => {
  const [ranked] = rankMarketCandidates([candidate({ estimated_probability: 1.5, preliminary_probability: 0.80 })], { marketAssessments: assessments() });
  assert.equal(ranked.estimated_probability, null);
  assert.equal(ranked.probability_percent, null);
  assert.equal(ranked.probability_classification, null);
});

test("7. candidato legado sin estimated_probability usa preliminary_probability como fuente", () => {
  const [ranked] = rankMarketCandidates([candidate({ preliminary_probability: 0.80 })], { marketAssessments: assessments() });
  assert.equal(ranked.estimated_probability, 0.80);
  assert.equal(ranked.probability_percent, 80);
  assert.equal(ranked.probability_classification, PROBABILITY_CLASSIFICATION.HIGH);
});

test("8. con evidencia equivalente, mayor probabilidad manda en el ranking", () => {
  const shared = { uncertainty_low: 0.6, uncertainty_high: 0.7, sample_size_effective: 20 };
  const ranked = rankMarketCandidates([
    candidate({ candidate_id: "p68", preliminary_probability: 0.68, ...shared }),
    candidate({ candidate_id: "p80", preliminary_probability: 0.80, ...shared }),
    candidate({ candidate_id: "p85", preliminary_probability: 0.85, ...shared }),
    candidate({ candidate_id: "p90", preliminary_probability: 0.90, ...shared }),
  ], { marketAssessments: assessments() });
  assert.deepEqual(ranked.map((item) => item.candidate_id), ["p90", "p85", "p80", "p68"]);
});

test("9. sports_score legacy mayor no gana el ranking PREMATCH frente a mayor probabilidad", () => {
  const highProbability = candidate({
    candidate_id: "high-probability", market_family: "goals",
    preliminary_probability: 0.90, uncertainty_low: 0.85, uncertainty_high: 0.95, sample_size_effective: 20,
  });
  const highLegacyScore = candidate({
    candidate_id: "high-legacy-score", market_family: "corners", selection: "Over 2.5",
    preliminary_probability: 0.68, uncertainty_low: 0.63, uncertainty_high: 0.73, sample_size_effective: 20,
  });
  const ranked = rankMarketCandidates([highProbability, highLegacyScore], { marketAssessments: assessments() });
  const byId = Object.fromEntries(ranked.map((item) => [item.candidate_id, item]));
  assert.ok(byId["high-legacy-score"].sports_score > byId["high-probability"].sports_score);
  assert.equal(ranked[0].candidate_id, "high-probability");
});

test("10. cambiar la cuota no cambia estimated_probability ni el ranking deportivo", () => {
  const low = candidate({ candidate_id: "low-prob", market_family: "goals", preliminary_probability: 0.65 });
  const mid = candidate({ candidate_id: "mid-prob", market_family: "corners", selection: "Over 2.5", preliminary_probability: 0.75 });
  const high = candidate({ candidate_id: "high-prob", market_family: "cards", selection: "Over 2.5", preliminary_probability: 0.85 });
  const noOdds = rankMarketCandidates([low, mid, high], { marketAssessments: assessments() });
  const oddsFavorLow = rankMarketCandidates([low, mid, high], {
    marketAssessments: assessments(),
    quotes: [quote(low, 5.0), quote(mid, 1.5), quote(high, 1.1)],
  });
  const oddsFavorHigh = rankMarketCandidates([low, mid, high], {
    marketAssessments: assessments(),
    quotes: [quote(low, 1.1), quote(mid, 1.5), quote(high, 5.0)],
  });
  const order = (ranked) => ranked.map((item) => item.candidate_id);
  assert.deepEqual(order(noOdds), ["high-prob", "mid-prob", "low-prob"]);
  assert.deepEqual(order(oddsFavorLow), order(noOdds));
  assert.deepEqual(order(oddsFavorHigh), order(noOdds));
  const probabilityById = (ranked) => Object.fromEntries(ranked.map((item) => [item.candidate_id, item.estimated_probability]));
  assert.deepEqual(probabilityById(oddsFavorLow), probabilityById(noOdds));
  assert.deepEqual(probabilityById(oddsFavorHigh), probabilityById(noOdds));
});

test("11. desempate: entre elegibles con igual probabilidad, gana menor ancho de incertidumbre", () => {
  const narrow = candidate({ candidate_id: "narrow", market_family: "goals", preliminary_probability: 0.75, uncertainty_low: 0.60, uncertainty_high: 0.70, sample_size_effective: 20 });
  const wide = candidate({ candidate_id: "wide", market_family: "corners", selection: "Over 2.5", preliminary_probability: 0.75, uncertainty_low: 0.55, uncertainty_high: 0.80, sample_size_effective: 20 });
  const ranked = rankMarketCandidates([wide, narrow], { marketAssessments: assessments() });
  assert.deepEqual(ranked.map((item) => item.candidate_id), ["narrow", "wide"]);
});

test("12. desempate: con igual probabilidad e igual ancho, gana mayor sample_size_effective", () => {
  const sampleHigh = candidate({ candidate_id: "sample-high", market_family: "goals", preliminary_probability: 0.75, uncertainty_low: 0.60, uncertainty_high: 0.75, sample_size_effective: 25 });
  const sampleLow = candidate({ candidate_id: "sample-low", market_family: "corners", selection: "Over 2.5", preliminary_probability: 0.75, uncertainty_low: 0.60, uncertainty_high: 0.75, sample_size_effective: 10 });
  const ranked = rankMarketCandidates([sampleLow, sampleHigh], { marketAssessments: assessments() });
  assert.deepEqual(ranked.map((item) => item.candidate_id), ["sample-high", "sample-low"]);
});

test("13. desempate: con igual probabilidad, ancho y muestra, gana mayor technical_support_score", () => {
  const supportHigh = candidate({ candidate_id: "support-high", market_family: "goals", preliminary_probability: 0.75, uncertainty_low: 0.60, uncertainty_high: 0.75, sample_size_effective: 20 });
  const supportLow = candidate({ candidate_id: "support-low", market_family: "corners", selection: "Over 2.5", preliminary_probability: 0.75, uncertainty_low: 0.60, uncertainty_high: 0.75, sample_size_effective: 20 });
  const ranked = rankMarketCandidates([supportLow, supportHigh], { marketAssessments: assessments({ goals: 90, corners: 60 }) });
  assert.deepEqual(ranked.map((item) => item.candidate_id), ["support-high", "support-low"]);
});

test("14. SPORTS_PENDING_PRICE y REVIEW_ONLY (elegibles reales, sin cuota) no se tratan como ineligibles", () => {
  // spp-68: probabilidad cercana a 0.68 con muestra e incertidumbre buenas -> sports_score >=58 sin cuota.
  const pendingPrice = candidate({ candidate_id: "spp-68", market_family: "goals", preliminary_probability: 0.68, uncertainty_low: 0.63, uncertainty_high: 0.73, sample_size_effective: 20 });
  // review-85: probabilidad alta pero con muestra pequeña, intervalo ancho y línea contextual -> sports_score entre 45 y 58 sin cuota.
  const reviewOnly = candidate({
    candidate_id: "review-85", market_family: "corners", selection: "Over 2.5",
    preliminary_probability: 0.85, uncertainty_low: 0.5, uncertainty_high: 0.95, sample_size_effective: 5,
    contextual_only: true, limitations: ["a", "b"],
  });
  const ranked = rankMarketCandidates([pendingPrice, reviewOnly], { marketAssessments: assessments({ goals: 80, corners: 50 }) });
  const byId = Object.fromEntries(ranked.map((item) => [item.candidate_id, item]));
  assert.equal(byId["spp-68"].overall_status, OVERALL_STATUS.SPORTS_PENDING_PRICE);
  assert.equal(byId["review-85"].overall_status, OVERALL_STATUS.REVIEW_ONLY);
  assert.equal(byId["spp-68"].ranking_eligible, true);
  assert.equal(byId["review-85"].ranking_eligible, true);
  // Ninguno de los dos estados es tratado como NOT_VIABLE/BLOCKED/INSUFFICIENT: manda la probabilidad mayor.
  assert.equal(ranked[0].candidate_id, "review-85");
});

test("15. un candidato NOT_VIABLE nunca rankea sobre uno elegible aunque tenga mayor probabilidad", () => {
  // Construido con inputs reales (muestra=1, intervalo muy ancho, soporte técnico bajo,
  // línea contextual lejos de la media) para que sports_score < 45 de forma genuina.
  const notViable = candidate({
    candidate_id: "not-viable-91", market_family: "goals",
    preliminary_probability: 0.91, uncertainty_low: 0.2, uncertainty_high: 0.95, sample_size_effective: 1,
    contextual_only: true, limitations: ["l1", "l2", "l3", "l4"], line: 6, projected_mean: 3, dispersion: 0.75,
  });
  const eligible = candidate({
    candidate_id: "eligible-82", market_family: "corners", selection: "Over 2.5",
    preliminary_probability: 0.82, uncertainty_low: 0.77, uncertainty_high: 0.87, sample_size_effective: 20,
  });
  const ranked = rankMarketCandidates([notViable, eligible], { marketAssessments: assessments({ goals: 40, corners: 80 }) });
  const byId = Object.fromEntries(ranked.map((item) => [item.candidate_id, item]));
  assert.ok(byId["not-viable-91"].sports_score < 45);
  assert.equal(byId["not-viable-91"].overall_status, OVERALL_STATUS.NOT_VIABLE);
  assert.equal(byId["not-viable-91"].ranking_eligible, false);
  assert.equal(byId["eligible-82"].ranking_eligible, true);
  assert.equal(ranked[0].candidate_id, "eligible-82");
});

test("16. metadata declara que el modelo no está calibrado", () => {
  const [ranked] = rankMarketCandidates([candidate()], { marketAssessments: assessments() });
  assert.equal(ranked.estimated_probability_represents, "estimated_event_probability");
  assert.equal(ranked.estimated_probability_is_calibrated, false);
  assert.equal(ranked.model_validation_status, "preliminary_unvalidated");
  for (const status of ["preliminary_unvalidated", "eligible_for_manual_validation_review", "preliminary_insufficient_history", undefined, null]) {
    assert.equal(isCalibratedModel(status), false);
  }
});

test("17. sports_score sigue disponible para compatibilidad", () => {
  const [ranked] = rankMarketCandidates([candidate()], { marketAssessments: assessments() });
  assert.equal(typeof ranked.sports_score, "number");
  assert.ok(ranked.sports_score > 0);
});

test("18. isValidProbability exige el dominio [0,1] y un número real ya normalizado", () => {
  assert.equal(isValidProbability(0.5), true);
  assert.equal(isValidProbability(0), true);
  assert.equal(isValidProbability(1), true);
  assert.equal(isValidProbability(1.01), false);
  assert.equal(isValidProbability(-0.01), false);
  assert.equal(isValidProbability(null), false);
  assert.equal(isValidProbability(undefined), false);
  assert.equal(isValidProbability("0.5"), false);
  assert.equal(isValidProbability(true), false);
  assert.equal(isValidProbability(NaN), false);
});

test("19. probabilidades fuera de rango no se clasifican silenciosamente", () => {
  assert.equal(classifyProbability(1.2), null);
  assert.equal(classifyProbability(-0.1), null);
  assert.equal(toProbabilityPercent(1.2), null);
  assert.equal(toProbabilityPercent(null), null);
});
