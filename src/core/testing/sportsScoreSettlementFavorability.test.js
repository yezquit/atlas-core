import test from "node:test";
import assert from "node:assert/strict";

import { calculateSportsScore } from "../intelligence/marketCandidateRanker.js";
import { isSettlementFavorabilityCandidate } from "../intelligence/probabilityClassification.js";

// Copia de referencia de la fórmula histórica (pre-existente antes de esta
// tarea), usada exclusivamente para bloquear regresión en candidatos
// clásicos. No es la implementación real — es un espejo independiente para
// comparar contra ella.
function historicalCalculateSportsScore(candidate, { marketAssessment = null, confidenceScore = null } = {}) {
  const clamp = (value, minimum = 0, maximum = 100) => Math.max(minimum, Math.min(maximum, value));
  const round = (value, decimals = 1) => Number(Number(value).toFixed(decimals));
  if (candidate?.probability_status !== "preliminary") return 0;
  const probability = Number(candidate.preliminary_probability);
  const intervalWidth = Math.max(0, Number(candidate.uncertainty_high) - Number(candidate.uncertainty_low));
  const probabilityBalance = clamp(100 - Math.abs(probability - 0.68) * 180);
  const uncertainty = clamp(100 - intervalWidth * 125);
  const effectiveSample = clamp((Number(candidate.sample_size_effective) / 20) * 100);
  const coverage = clamp(Number(marketAssessment?.technical_support_score ?? 70));
  const confidence = clamp(Number(confidenceScore ?? coverage));
  const distance = Math.abs(Number(candidate.line) - Number(candidate.projected_mean)) / Math.max(0.75, Number(candidate.dispersion) || 0.75);
  const lineStability = round(clamp(100 - distance * 18 - (candidate.contextual_only ? 28 : 0)));
  const sensitivity = clamp(100 - (candidate.limitations?.length || 0) * 3 - (candidate.context_adjustment?.changed_distribution ? 8 : 0));
  return round(probabilityBalance * 0.3 + uncertainty * 0.2 + effectiveSample * 0.15 + coverage * 0.15 + confidence * 0.05 + lineStability * 0.1 + sensitivity * 0.05);
}

function classicCandidate(preliminary_probability, overrides = {}) {
  return {
    probability_status: "preliminary",
    preliminary_probability,
    uncertainty_low: 0.6,
    uncertainty_high: 0.7,
    sample_size_effective: 15,
    line: 2.5,
    projected_mean: 2.4,
    dispersion: 1,
    limitations: ["a", "b"],
    context_adjustment: { changed_distribution: false },
    ...overrides,
  };
}

function neutralComponents(overrides = {}) {
  return {
    probability_status: "preliminary",
    uncertainty_low: 0.55,
    uncertainty_high: 0.62,
    sample_size_effective: 12,
    line: 1.75,
    projected_mean: 2,
    dispersion: 1.2,
    limitations: ["x"],
    context_adjustment: { changed_distribution: false },
    ...overrides,
  };
}

// -----------------------------------------------------------------------
// A. Helper semántico
// -----------------------------------------------------------------------

test("isSettlementFavorabilityCandidate: true para probability_semantics settlement_favorability", () => {
  assert.equal(isSettlementFavorabilityCandidate({ probability_semantics: "settlement_favorability" }), true);
});

test("isSettlementFavorabilityCandidate: true para market_family asian_total_goals aunque falte semantics", () => {
  assert.equal(isSettlementFavorabilityCandidate({ market_family: "asian_total_goals" }), true);
});

test("isSettlementFavorabilityCandidate: false para goals", () => {
  assert.equal(isSettlementFavorabilityCandidate({ market_family: "goals" }), false);
});

test("isSettlementFavorabilityCandidate: false para corners", () => {
  assert.equal(isSettlementFavorabilityCandidate({ market_family: "corners", probability_semantics: undefined }), false);
});

test("isSettlementFavorabilityCandidate: false para objeto vacío/undefined", () => {
  assert.equal(isSettlementFavorabilityCandidate({}), false);
  assert.equal(isSettlementFavorabilityCandidate(undefined), false);
});

// -----------------------------------------------------------------------
// B. Regresión clásica: probabilityBalance sigue vivo e idéntico
// -----------------------------------------------------------------------

for (const probability of [0.5, 0.68, 0.85]) {
  test(`clásico probability=${probability}: calculateSportsScore coincide con la fórmula histórica`, () => {
    const candidate = classicCandidate(probability);
    const marketAssessment = { technical_support_score: 80 };
    const actual = calculateSportsScore(candidate, { marketAssessment });
    const expected = historicalCalculateSportsScore(candidate, { marketAssessment });
    assert.equal(actual, expected);
  });
}

test("clásico: probabilityBalance sigue centrado en 0.68 (score máximo entre las tres probabilidades)", () => {
  const marketAssessment = { technical_support_score: 80 };
  const scores = [0.5, 0.68, 0.85].map((probability) => calculateSportsScore(classicCandidate(probability), { marketAssessment }));
  assert.ok(scores[1] > scores[0]);
  assert.ok(scores[1] > scores[2]);
});

test("candidato sin probability_semantics ni asian_total_goals usa la rama clásica (probabilidad 0.30 penalizada por distancia a 0.68)", () => {
  const marketAssessment = { technical_support_score: 80 };
  const candidate = classicCandidate(0.3);
  const actual = calculateSportsScore(candidate, { marketAssessment });
  const expected = historicalCalculateSportsScore(candidate, { marketAssessment });
  assert.equal(actual, expected);
  assert.notEqual(actual, calculateSportsScore(classicCandidate(0.68), { marketAssessment }));
});

// -----------------------------------------------------------------------
// C. Settlement favorability: Favorabilidad muy distinta, mismo score
// -----------------------------------------------------------------------

test("dos candidatos settlement_favorability con componentes neutrales idénticos y Favorabilidad muy distinta producen el mismo sports_score", () => {
  const marketAssessment = { technical_support_score: 75 };
  const candidateHighFavorability = neutralComponents({
    market_family: "asian_total_goals",
    probability_semantics: "settlement_favorability",
    preliminary_probability: 0.85,
    sports_favorability: 0.85,
  });
  const candidateLowFavorability = neutralComponents({
    market_family: "asian_total_goals",
    probability_semantics: "settlement_favorability",
    preliminary_probability: 0.3,
    sports_favorability: 0.3,
  });
  const scoreHigh = calculateSportsScore(candidateHighFavorability, { marketAssessment });
  const scoreLow = calculateSportsScore(candidateLowFavorability, { marketAssessment });
  assert.equal(scoreHigh, scoreLow);
});

test("settlement_favorability: el score coincide con la fórmula renormalizada de seis componentes (sin probabilityBalance)", () => {
  const marketAssessment = { technical_support_score: 75 };
  const candidate = neutralComponents({ market_family: "asian_total_goals", probability_semantics: "settlement_favorability", preliminary_probability: 0.9 });
  const clamp = (value, minimum = 0, maximum = 100) => Math.max(minimum, Math.min(maximum, value));
  const round = (value, decimals = 1) => Number(Number(value).toFixed(decimals));
  const intervalWidth = Math.max(0, candidate.uncertainty_high - candidate.uncertainty_low);
  const uncertainty = clamp(100 - intervalWidth * 125);
  const effectiveSample = clamp((candidate.sample_size_effective / 20) * 100);
  const coverage = clamp(marketAssessment.technical_support_score);
  const confidence = clamp(coverage);
  const distance = Math.abs(candidate.line - candidate.projected_mean) / Math.max(0.75, candidate.dispersion || 0.75);
  const lineStability = round(clamp(100 - distance * 18));
  const sensitivity = clamp(100 - (candidate.limitations?.length || 0) * 3);
  const expected = round((uncertainty * 0.2 + effectiveSample * 0.15 + coverage * 0.15 + confidence * 0.05 + lineStability * 0.1 + sensitivity * 0.05) / 0.7);
  assert.equal(calculateSportsScore(candidate, { marketAssessment }), expected);
});

// -----------------------------------------------------------------------
// D. Extremos
// -----------------------------------------------------------------------

test("settlement_favorability: los seis componentes en su máximo producen sports_score 100", () => {
  const candidate = {
    probability_status: "preliminary",
    market_family: "asian_total_goals",
    probability_semantics: "settlement_favorability",
    preliminary_probability: 0.99,
    uncertainty_low: 0.5,
    uncertainty_high: 0.5,
    sample_size_effective: 40,
    line: 2.5,
    projected_mean: 2.5,
    dispersion: 1,
    limitations: [],
    context_adjustment: { changed_distribution: false },
  };
  const marketAssessment = { technical_support_score: 100 };
  assert.equal(calculateSportsScore(candidate, { marketAssessment, confidenceScore: 100 }), 100);
});

test("settlement_favorability: los seis componentes en su mínimo producen sports_score 0", () => {
  const candidate = {
    probability_status: "preliminary",
    market_family: "asian_total_goals",
    probability_semantics: "settlement_favorability",
    preliminary_probability: 0.5,
    uncertainty_low: 0,
    uncertainty_high: 1,
    sample_size_effective: 0,
    line: 10,
    projected_mean: 0,
    dispersion: 0.75,
    limitations: Array(34).fill("limitación"),
    context_adjustment: { changed_distribution: false },
  };
  const marketAssessment = { technical_support_score: 0 };
  assert.equal(calculateSportsScore(candidate, { marketAssessment, confidenceScore: 0 }), 0);
});

// -----------------------------------------------------------------------
// E. Independencia económica
// -----------------------------------------------------------------------

test("settlement_favorability: cambiar price_equivalent_probability/decimal_odds/implied_probability no altera sports_score", () => {
  const marketAssessment = { technical_support_score: 75 };
  const base = neutralComponents({ market_family: "asian_total_goals", probability_semantics: "settlement_favorability", preliminary_probability: 0.72 });
  const withEconomics = {
    ...base,
    price_equivalent_probability: 0.91,
    decimal_odds: 1.35,
    implied_probability: 0.74,
  };
  assert.equal(calculateSportsScore(withEconomics, { marketAssessment }), calculateSportsScore(base, { marketAssessment }));
});

// -----------------------------------------------------------------------
// F. Compatibilidad: candidato antiguo sin probability_semantics
// -----------------------------------------------------------------------

test("candidato asian_total_goals antiguo sin probability_semantics usa la rama settlement por market_family", () => {
  const marketAssessment = { technical_support_score: 75 };
  const withoutSemantics = neutralComponents({ market_family: "asian_total_goals", preliminary_probability: 0.9 });
  const withSemantics = neutralComponents({ market_family: "asian_total_goals", probability_semantics: "settlement_favorability", preliminary_probability: 0.2 });
  assert.equal(calculateSportsScore(withoutSemantics, { marketAssessment }), calculateSportsScore(withSemantics, { marketAssessment }));
});
