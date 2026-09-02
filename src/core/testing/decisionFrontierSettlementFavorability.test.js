import test from "node:test";
import assert from "node:assert/strict";

import { calculateDecisionEconomics } from "../intelligence/decisionFrontier.js";

// Perfil de settlement con Favorabilidad (0.6375) deliberadamente muy
// distinta de price_equivalent_probability (~0.8235) — FW=0.30, HW=0.10,
// Push=0.50, HL=0.05, FL=0.05 (suma 1.00). W=FW+0.5HW=0.35, L=FL+0.5HL=0.075.
// price_equivalent_probability = W/(W+L) = 0.35/0.425 ≈ 0.8235294117647059.
// FairOdds = 1 + L/W = 1 + 0.075/0.35 = 17/14 ≈ 1.2142857142857142.
const PROBABILITIES = { full_win: 0.3, half_win: 0.1, push: 0.5, half_loss: 0.05, full_loss: 0.05 };
const FAVORABILITY = 0.6375;
const PRICE_EQUIVALENT_PROBABILITY = 0.35 / 0.425;
const FAIR_ODDS = 1 + 0.075 / 0.35;

function asianProfile(overrides = {}) {
  return {
    probabilities: PROBABILITIES,
    price_equivalent_probability: PRICE_EQUIVALENT_PROBABILITY,
    price_equivalent_probability_low: 0.7,
    ...overrides,
  };
}

function asianCandidate(line, overrides = {}) {
  return {
    candidate_id: `asian_total_goals:over:${line}`,
    fixture_id: 41,
    market_family: "asian_total_goals",
    probability_semantics: "settlement_favorability",
    direction: "over",
    selection: `Over ${line}`,
    line,
    estimated_probability: FAVORABILITY,
    preliminary_probability: FAVORABILITY,
    sports_favorability: FAVORABILITY,
    probability_status: "preliminary",
    uncertainty_low: 0.55,
    uncertainty_high: 0.72,
    sample_size_effective: 14,
    sports_score: 70,
    technical_support_score: 75,
    line_stability_score: 80,
    ranking_eligible: true,
    asian_settlement_profile: asianProfile(),
    ...overrides,
  };
}

function classicCandidate(line, overrides = {}) {
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

function asianExactQuote(line, odds) {
  return { market_family: "asian_total_goals", direction: "over", line, decimal_odds: odds };
}

function exactQuote(line, odds = 2) {
  return { market_family: "goals", direction: "over", line, decimal_odds: odds };
}

function withQuote(candidate, quote) {
  return { ...candidate, price_status: "verified_current", price_quote: quote };
}

// -----------------------------------------------------------------------
// A. price_equivalent_probability válida: edge usa esa magnitud, no Favorabilidad
// -----------------------------------------------------------------------

test("A. Asian con price_equivalent_probability válida: edge usa price_equivalent_probability, no Favorabilidad", () => {
  const odds = 1.5;
  const economics = calculateDecisionEconomics(withQuote(asianCandidate(1.5), asianExactQuote(1.5, odds)));
  const implied = 1 / odds;
  const correctEdge = Number((PRICE_EQUIVALENT_PROBABILITY - implied).toFixed(4));
  const buggyEdge = Number((FAVORABILITY - implied).toFixed(4));
  assert.equal(economics.status, "available");
  assert.equal(economics.edge, correctEdge);
  assert.notEqual(economics.edge, buggyEdge);
  // Demuestra el bug conceptualmente: la magnitud correcta da signo positivo
  // (la cuota paga mejor que el precio justo), la fórmula antigua (Favorabilidad
  // - implied) daría signo negativo para este mismo perfil y cuota.
  assert.ok(correctEdge > 0);
  assert.ok(buggyEdge < 0);
});

// -----------------------------------------------------------------------
// B. Cuota justa: edge ≈ 0, EV ≈ 0
// -----------------------------------------------------------------------

test("B. Asian a cuota justa (decimal_odds = FairOdds): edge≈0 y expected_value≈0", () => {
  const economics = calculateDecisionEconomics(withQuote(asianCandidate(1.5), asianExactQuote(1.5, FAIR_ODDS)));
  assert.equal(economics.status, "available");
  assert.ok(Math.abs(economics.edge) < 1e-4, `edge esperado ≈0, obtenido ${economics.edge}`);
  assert.ok(Math.abs(economics.expected_value) < 1e-3, `expected_value esperado ≈0, obtenido ${economics.expected_value}`);
});

// -----------------------------------------------------------------------
// C. Asian favorable: odds > FairOdds -> edge>0, EV>0
// -----------------------------------------------------------------------

test("C. Asian favorable (odds > FairOdds): edge>0 y expected_value>0", () => {
  const economics = calculateDecisionEconomics(withQuote(asianCandidate(1.5), asianExactQuote(1.5, 1.5)));
  assert.equal(economics.status, "available");
  assert.ok(economics.edge > 0);
  assert.ok(economics.expected_value > 0);
});

// -----------------------------------------------------------------------
// D. Asian desfavorable: odds < FairOdds -> edge<0, EV<0
// -----------------------------------------------------------------------

test("D. Asian desfavorable (odds < FairOdds): edge<0 y expected_value<0", () => {
  const economics = calculateDecisionEconomics(withQuote(asianCandidate(1.5), asianExactQuote(1.5, 1.1)));
  assert.equal(economics.status, "available");
  assert.ok(economics.edge < 0);
  assert.ok(economics.expected_value < 0);
});

// -----------------------------------------------------------------------
// E. Asian sin price_equivalent_probability: sin fallback a Favorabilidad
// -----------------------------------------------------------------------

test("E. Asian sin price_equivalent_probability: economía no evaluable, sin fallback a Favorabilidad, sin edge fabricado", () => {
  const candidateWithoutProfile = asianCandidate(1.5, { asian_settlement_profile: null });
  const economics = calculateDecisionEconomics(withQuote(candidateWithoutProfile, asianExactQuote(1.5, 1.5)));
  assert.deepEqual(economics, { status: "unavailable", implied_probability: null, edge: null, expected_value: null, quote_exact: false });
});

test("E2. Asian con perfil presente pero sin price_equivalent_probability finito: mismo resultado no evaluable", () => {
  const candidateWithIncompleteProfile = asianCandidate(1.5, { asian_settlement_profile: { probabilities: PROBABILITIES } });
  const economics = calculateDecisionEconomics(withQuote(candidateWithIncompleteProfile, asianExactQuote(1.5, 1.5)));
  assert.equal(economics.status, "unavailable");
  assert.equal(economics.edge, null);
  assert.equal(economics.expected_value, null);
});

// -----------------------------------------------------------------------
// F. Clásico: sin cambios
// -----------------------------------------------------------------------

test("F. Clásico (goals): calculateDecisionEconomics produce exactamente el mismo resultado que antes", () => {
  const economics = calculateDecisionEconomics(withQuote(classicCandidate(1.5), exactQuote(1.5, 2)));
  assert.deepEqual(economics, { status: "available", implied_probability: 0.5, edge: 0.4, expected_value: 0.8, quote_exact: true });
});

test("F2. Clásico sin cuota exacta compatible: sigue unavailable, sin cambios", () => {
  const economics = calculateDecisionEconomics(classicCandidate(1.5));
  assert.deepEqual(economics, { status: "unavailable", implied_probability: null, edge: null, expected_value: null, quote_exact: false });
});

// -----------------------------------------------------------------------
// G. Compatibilidad: candidato asian antiguo sin probability_semantics
// -----------------------------------------------------------------------

test("G. Candidato asian_total_goals antiguo sin probability_semantics usa igual la referencia económica settlement-aware", () => {
  const legacyCandidate = asianCandidate(1.5, { probability_semantics: undefined });
  const modernCandidate = asianCandidate(1.5);
  const legacyEconomics = calculateDecisionEconomics(withQuote(legacyCandidate, asianExactQuote(1.5, 1.5)));
  const modernEconomics = calculateDecisionEconomics(withQuote(modernCandidate, asianExactQuote(1.5, 1.5)));
  assert.deepEqual(legacyEconomics, modernEconomics);
  assert.equal(legacyEconomics.status, "available");
});
