import test from "node:test";
import assert from "node:assert/strict";

import {
  asianExpectedValue,
  asianFairOdds,
  asianPriceEquivalentProbability,
  buildAsianSettlementProfile,
} from "../intelligence/asianTotalGoals.js";
import { evaluateValueOpportunity, rankValueOpportunities, VALUE_RADAR_STATUS } from "../intelligence/valueRadar.js";

const TOLERANCE = 1e-4;
function closeTo(actual, expected, tolerance = TOLERANCE, message = "") {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message} esperado≈${expected}, recibido=${actual}`);
}

// -----------------------------------------------------------------------
// Fixtures realizables con settleAsianTotalGoals real (no inventadas): cada
// una produce, mediante observaciones históricas reales, exactamente la
// combinación de estados pedida en el enunciado para cada tipo de línea.
// -----------------------------------------------------------------------

function canonical(weightedValues) {
  const observations = weightedValues.map(([value, weight], index) => ({ fixture_id: index + 1, value, effective_weight: weight }));
  const totalWeight = weightedValues.reduce((sum, [, weight]) => sum + weight, 0);
  const sumSquares = weightedValues.reduce((sum, [, weight]) => sum + (weight / totalWeight) ** 2, 0);
  return { observations, fixture_ids: observations.map((o) => o.fixture_id), effective_sample_size: 1 / sumSquares };
}

// Línea .0 (2.0, over) con push: solo FW/Push/FL son alcanzables (sin partes
// medias posibles en una línea entera). FW=0.45, Push=0.20, FL=0.35.
function profileLineWhole() {
  const data = canonical([[3, 0.45], [2, 0.20], [1, 0.35]]);
  return buildAsianSettlementProfile({ canonicalObservations: data, line: 2.0, direction: "over" });
}

// Línea .25 (2.25, over): solo FW/HL/FL son alcanzables (push cae en la
// mitad entera, que aquí es la parte perdedora del split). FW=0.50, HL=0.25, FL=0.25.
function profileLineQuarter() {
  const data = canonical([[3, 0.50], [2, 0.25], [1, 0.25]]);
  return buildAsianSettlementProfile({ canonicalObservations: data, line: 2.25, direction: "over" });
}

// Línea .5 (2.5, over) pura: binaria, sin push ni medios posibles. FW=0.60, FL=0.40.
function profileLineHalf() {
  const data = canonical([[3, 0.60], [2, 0.40]]);
  return buildAsianSettlementProfile({ canonicalObservations: data, line: 2.5, direction: "over" });
}

// Línea .75 (2.75, over): solo FW/HW/FL son alcanzables. FW=0.40, HW=0.15, FL=0.45.
function profileLineThreeQuarter() {
  const data = canonical([[4, 0.40], [3, 0.15], [1, 0.45]]);
  return buildAsianSettlementProfile({ canonicalObservations: data, line: 2.75, direction: "over" });
}

const LINE_PROFILES = [
  ["línea .0 (push)", profileLineWhole],
  ["línea .25 (half_loss)", profileLineQuarter],
  ["línea .5 (binaria pura)", profileLineHalf],
  ["línea .75 (half_win)", profileLineThreeQuarter],
];

// -----------------------------------------------------------------------
// A. Equivalencia price_equivalent_probability == 1/asianFairOdds
// -----------------------------------------------------------------------

for (const [label, build] of LINE_PROFILES) {
  test(`A. ${label}: price_equivalent_probability ≈ 1/asianFairOdds`, () => {
    const profile = build();
    assert.ok(profile, `perfil no construido para ${label}`);
    closeTo(profile.price_equivalent_probability, 1 / asianFairOdds(profile), 1e-6);
  });
}

// -----------------------------------------------------------------------
// B. Precio justo implica EV≈0 y raw_edge_pp≈0
// -----------------------------------------------------------------------

function quote(odds, overrides = {}) {
  return { fixture_id: 1, market_family: "asian_total_goals", direction: "over", line: overrides.line, decimal_odds: odds, bookmaker_name: "Betano", quote_id: "q" };
}
function asianCandidate(profile, overrides = {}) {
  return {
    fixture_id: 1, market_family: "asian_total_goals", direction: "over", line: profile.line,
    estimated_probability: profile.sports_favorability, uncertainty_low: profile.sports_favorability_uncertainty_low,
    uncertainty_high: profile.sports_favorability_uncertainty_high, sports_score: 65, ...overrides,
  };
}

for (const [label, build] of LINE_PROFILES) {
  test(`B. ${label}: a cuota = fair_odds, EV≈0 y raw_edge_pp≈0`, () => {
    const profile = build();
    const fairOdds = asianFairOdds(profile);
    const result = evaluateValueOpportunity({
      candidate: asianCandidate(profile),
      quote: quote(fairOdds, { line: profile.line }),
      asianSettlementProfile: profile,
    });
    closeTo(result.expected_roi, 0, 5e-3, "expected_roi");
    closeTo(result.raw_edge_pp, 0, 0.5, "raw_edge_pp");
  });
}

// -----------------------------------------------------------------------
// C. El signo de raw_edge_pp coincide con el signo de expected_roi
// -----------------------------------------------------------------------

for (const [label, build] of LINE_PROFILES) {
  test(`C. ${label}: cuota > fair_odds -> EV>0 y raw_edge_pp>0`, () => {
    const profile = build();
    const fairOdds = asianFairOdds(profile);
    const result = evaluateValueOpportunity({
      candidate: asianCandidate(profile), quote: quote(fairOdds + 0.3, { line: profile.line }), asianSettlementProfile: profile,
    });
    assert.ok(result.expected_roi > 0, `expected_roi debería ser >0, fue ${result.expected_roi}`);
    assert.ok(result.raw_edge_pp > 0, `raw_edge_pp debería ser >0, fue ${result.raw_edge_pp}`);
  });

  test(`C. ${label}: cuota < fair_odds -> EV<0 y raw_edge_pp<0`, () => {
    const profile = build();
    const fairOdds = asianFairOdds(profile);
    const lowerOdds = Math.max(1.01, fairOdds - 0.3);
    const result = evaluateValueOpportunity({
      candidate: asianCandidate(profile), quote: quote(lowerOdds, { line: profile.line }), asianSettlementProfile: profile,
    });
    assert.ok(result.expected_roi < 0, `expected_roi debería ser <0, fue ${result.expected_roi}`);
    assert.ok(result.raw_edge_pp < 0, `raw_edge_pp debería ser <0, fue ${result.raw_edge_pp}`);
  });
}

// -----------------------------------------------------------------------
// D. Caso numérico de referencia (FW=0.50, HL=0.25, FL=0.25 -> línea .25)
// -----------------------------------------------------------------------

test("D. caso de referencia -0.25 conceptual: W=0.50, L=0.375, FairOdds=1.75, price_equivalent≈0.5714286", () => {
  const profile = profileLineQuarter();
  assert.equal(profile.probabilities.full_win, 0.5);
  assert.equal(profile.probabilities.half_loss, 0.25);
  assert.equal(profile.probabilities.full_loss, 0.25);
  closeTo(profile.weighted_win_probability, 0.5, 1e-6);
  closeTo(profile.weighted_loss_probability, 0.375, 1e-6);
  closeTo(asianFairOdds(profile), 1.75, 1e-4);
  closeTo(profile.price_equivalent_probability, 0.5714286, 1e-4);

  const result = evaluateValueOpportunity({ candidate: asianCandidate(profile), quote: quote(2.00, { line: profile.line }), asianSettlementProfile: profile });
  closeTo(result.implied_probability, 0.5, 1e-6);
  closeTo(result.raw_edge_pp, 7.14, 0.05);
  closeTo(result.expected_roi, 0.125, 1e-3);
  // No debe coincidir con el cálculo antiguo (weighted_win - implied = 0).
  assert.notEqual(result.raw_edge_pp, 0);
});

// -----------------------------------------------------------------------
// E. Caso con push: no debe reproducir el viejo -11.25 pp al precio justo
// -----------------------------------------------------------------------

test("E. caso con push: FairOdds≈1.7778, price_equivalent≈0.5625, EV≈0 y raw_edge_pp≈0 al precio justo (no -11.25pp)", () => {
  const profile = profileLineWhole();
  assert.equal(profile.probabilities.full_win, 0.45);
  assert.equal(profile.probabilities.push, 0.20);
  assert.equal(profile.probabilities.full_loss, 0.35);
  closeTo(asianFairOdds(profile), 1.7778, 1e-3);
  closeTo(profile.price_equivalent_probability, 0.5625, 1e-4);

  const fairOdds = asianFairOdds(profile);
  const result = evaluateValueOpportunity({ candidate: asianCandidate(profile), quote: quote(fairOdds, { line: profile.line }), asianSettlementProfile: profile });
  closeTo(result.expected_roi, 0, 5e-3);
  closeTo(result.raw_edge_pp, 0, 0.3);
  // La fórmula vieja (weighted_win_probability - implied) daría -11.25pp aquí.
  const oldFormulaEdge = (profile.weighted_win_probability - result.implied_probability) * 100;
  closeTo(oldFormulaEdge, -11.25, 0.5, "control: la fórmula vieja sí daba -11.25pp en este caso");
  assert.ok(Math.abs(result.raw_edge_pp - oldFormulaEdge) > 5, "raw_edge_pp actual no debe coincidir con la fórmula vieja");
});

// -----------------------------------------------------------------------
// F. Caso .5 puro: se reduce exactamente al binario simple
// -----------------------------------------------------------------------

test("F. línea .5 pura: weighted_win_probability == price_equivalent_probability == 0.60, FairOdds≈1.6667", () => {
  const profile = profileLineHalf();
  assert.equal(profile.probabilities.full_win, 0.6);
  assert.equal(profile.probabilities.full_loss, 0.4);
  closeTo(profile.weighted_win_probability, 0.6, 1e-9);
  closeTo(profile.price_equivalent_probability, 0.6, 1e-9);
  closeTo(profile.weighted_win_probability, profile.price_equivalent_probability, 1e-9, "en línea .5 pura ambas magnitudes deben coincidir exactamente");
  closeTo(asianFairOdds(profile), 1.6667, 1e-3);
});

// -----------------------------------------------------------------------
// 3. conservative_edge_pp <= raw_edge_pp (con tolerancia mínima de redondeo)
// -----------------------------------------------------------------------

for (const [label, build] of LINE_PROFILES) {
  test(`conservative_edge_pp <= raw_edge_pp para ${label} (cuando exista intervalo válido)`, () => {
    const profile = build();
    const result = evaluateValueOpportunity({
      candidate: asianCandidate(profile), quote: quote(asianFairOdds(profile) + 0.2, { line: profile.line }), asianSettlementProfile: profile,
    });
    if (result.conservative_edge_pp === null) {
      assert.equal(profile.price_equivalent_probability_low, null, `${label}: conservative null pero low no es null`);
      return;
    }
    assert.ok(result.conservative_edge_pp <= result.raw_edge_pp + 0.01, `${label}: conservative(${result.conservative_edge_pp}) > raw(${result.raw_edge_pp})`);
  });
}

// -----------------------------------------------------------------------
// 4. Invariantes estructurales del intervalo económico
// -----------------------------------------------------------------------

test("intervalo económico: low>=0, high<=1, low<=central<=high, cuando existe", () => {
  for (const [, build] of LINE_PROFILES) {
    const profile = build();
    if (profile.price_equivalent_probability_low === null) continue;
    assert.ok(profile.price_equivalent_probability_low >= 0);
    assert.ok(profile.price_equivalent_probability_high <= 1);
    assert.ok(profile.price_equivalent_probability_low <= profile.price_equivalent_probability + 1e-9);
    assert.ok(profile.price_equivalent_probability <= profile.price_equivalent_probability_high + 1e-9);
  }
});

test("intervalo económico: muestra mayor con la misma proporción produce un intervalo más estrecho", () => {
  const small = canonical([[3, 0.6], [2, 0.4]]); // n_eff=2
  const large = canonical(Array.from({ length: 40 }, (_, i) => [i % 2 === 0 ? 3 : 2, i % 2 === 0 ? 0.6 / 20 : 0.4 / 20])); // misma proporción, n_eff mayor
  const profileSmall = buildAsianSettlementProfile({ canonicalObservations: small, line: 2.5, direction: "over" });
  const profileLarge = buildAsianSettlementProfile({ canonicalObservations: large, line: 2.5, direction: "over" });
  assert.ok(profileLarge.effective_sample_size > profileSmall.effective_sample_size, "la muestra efectiva grande debe ser mayor");
  if (profileSmall.price_equivalent_probability_low === null) {
    // La muestra pequeña puede caer en el fallback; solo verificamos que la
    // grande sí produce un intervalo válido y más informativo.
    assert.notEqual(profileLarge.price_equivalent_probability_low, null);
    return;
  }
  const widthSmall = profileSmall.price_equivalent_probability_high - profileSmall.price_equivalent_probability_low;
  const widthLarge = profileLarge.price_equivalent_probability_high - profileLarge.price_equivalent_probability_low;
  assert.ok(widthLarge < widthSmall, `esperaba intervalo más estrecho con más muestra: pequeña=${widthSmall}, grande=${widthLarge}`);
});

test("intervalo económico: muestra decisiva insuficiente (n_decisive<=2) produce low/high=null, no un valor inventado", () => {
  // n_eff=4 total, pero decisive_weight muy bajo (mucho push) reduce n_decisive por debajo del umbral.
  const data = canonical([[2, 0.90], [3, 0.05], [1, 0.05]]); // FW=0.05, Push=0.90, FL=0.05 -> decisive_weight=0.10, n_eff=4*algo bajo
  const profile = buildAsianSettlementProfile({ canonicalObservations: data, line: 2.0, direction: "over" });
  if (profile.effective_sample_size * (profile.weighted_win_probability + profile.weighted_loss_probability) <= 2) {
    assert.equal(profile.price_equivalent_probability_low, null);
    assert.equal(profile.price_equivalent_probability_high, null);
    assert.equal(profile.price_equivalent_probability_method, null);
  }
});

test("intervalo económico: W+L<=0 (100% push) produce price_equivalent_probability y el intervalo en null, sin NaN", () => {
  const data = canonical([[2, 0.5], [2, 0.3], [2, 0.2]]); // todas las observaciones exactamente en la línea -> 100% push
  const profile = buildAsianSettlementProfile({ canonicalObservations: data, line: 2.0, direction: "over" });
  assert.equal(profile.probabilities.push, 1);
  assert.equal(profile.price_equivalent_probability, null);
  assert.equal(profile.price_equivalent_probability_low, null);
  assert.equal(profile.price_equivalent_probability_high, null);
  assert.ok(!Number.isNaN(profile.weighted_win_probability));
});

test("comentarios: el método del intervalo se documenta como aproximación, no como calibración empírica", async () => {
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const source = await readFile(path.default.resolve("src/core/intelligence/asianTotalGoals.js"), "utf8");
  assert.match(source, /intervalo aproximado|aproximación normal/i);
  assert.doesNotMatch(source, /calibrad[oa] emp[ií]ricamente/i);
});

// -----------------------------------------------------------------------
// 5. Clasificación del Radar
// -----------------------------------------------------------------------

test("Radar: EV negativo -> NO_VALUE aunque conservative_edge_pp sea positivo por coincidencia numérica", () => {
  const profile = profileLineHalf(); // FW=0.6, FL=0.4, fair_odds≈1.6667
  const result = evaluateValueOpportunity({ candidate: asianCandidate(profile), quote: quote(1.2, { line: profile.line }), asianSettlementProfile: profile });
  assert.ok(result.expected_roi < 0);
  assert.equal(result.status, VALUE_RADAR_STATUS.NO_VALUE);
});

test("Radar: EV positivo + conservative_edge_pp>0 -> INTERESTING", () => {
  const profile = profileLineHalf();
  const result = evaluateValueOpportunity({ candidate: asianCandidate(profile), quote: quote(asianFairOdds(profile) + 0.5, { line: profile.line }), asianSettlementProfile: profile });
  if (result.expected_roi > 0 && result.conservative_edge_pp > 0) {
    assert.equal(result.status, VALUE_RADAR_STATUS.INTERESTING);
  }
});

test("Radar: EV positivo + conservative_edge_pp<=0 -> WATCH, nunca INTERESTING", () => {
  const profile = profileLineHalf();
  const marginalOdds = asianFairOdds(profile) + 0.001;
  const result = evaluateValueOpportunity({ candidate: asianCandidate(profile), quote: quote(marginalOdds, { line: profile.line }), asianSettlementProfile: profile });
  if (result.expected_roi > 0 && (result.conservative_edge_pp === null || result.conservative_edge_pp <= 0)) {
    assert.equal(result.status, VALUE_RADAR_STATUS.WATCH);
  }
});

test("Radar: EV positivo + conservative_edge_pp=null -> WATCH, nunca INTERESTING por ausencia de intervalo", () => {
  // Perfil con n_decisive insuficiente para intervalo, pero con EV positivo posible.
  const data = canonical([[3, 0.5], [2, 0.5]]); // n_eff=2, decisive_weight=1 -> n_decisive=2, por debajo del umbral (>2)
  const profile = buildAsianSettlementProfile({ canonicalObservations: data, line: 2.5, direction: "over" });
  assert.equal(profile.price_equivalent_probability_low, null);
  const result = evaluateValueOpportunity({ candidate: asianCandidate(profile), quote: quote(asianFairOdds(profile) + 0.5, { line: profile.line }), asianSettlementProfile: profile });
  assert.equal(result.conservative_edge_pp, null);
  if (result.expected_roi > 0) assert.equal(result.status, VALUE_RADAR_STATUS.WATCH);
});

// -----------------------------------------------------------------------
// 6. Ranking sin NaN ni coerciones accidentales con conservative_edge_pp=null
// -----------------------------------------------------------------------

test("rankValueOpportunities no produce NaN y no prioriza null por encima de valores reales", () => {
  const profile = profileLineHalf();
  const withInterval = evaluateValueOpportunity({ candidate: asianCandidate(profile), quote: quote(asianFairOdds(profile) + 0.5, { line: profile.line }), asianSettlementProfile: profile });
  const nullIntervalProfile = buildAsianSettlementProfile({ canonicalObservations: canonical([[3, 0.5], [2, 0.5]]), line: 2.5, direction: "over" });
  const withoutInterval = evaluateValueOpportunity({ candidate: asianCandidate(nullIntervalProfile), quote: quote(asianFairOdds(nullIntervalProfile) + 0.5, { line: nullIntervalProfile.line }), asianSettlementProfile: nullIntervalProfile });
  assert.equal(withoutInterval.conservative_edge_pp, null);
  const ranked = rankValueOpportunities([withoutInterval, withInterval]);
  assert.equal(ranked.length, 2);
  for (const item of ranked) {
    assert.ok(!Number.isNaN(item.raw_edge_pp ?? 0));
    assert.ok(!Number.isNaN(item.conservative_edge_pp ?? 0));
  }
  // El que sí tiene intervalo válido (conservative_edge_pp real) no debe
  // quedar sistemáticamente después del que tiene null solo por la coerción.
  if (withInterval.status === withoutInterval.status && withInterval.expected_roi === withoutInterval.expected_roi) {
    assert.equal(ranked[0], withInterval);
  }
});

// -----------------------------------------------------------------------
// 7. Regresión clásica: fórmulas de goals sin cambios
// -----------------------------------------------------------------------

test("regresión clásica: raw_edge_pp/conservative_edge_pp de goals no cambiaron de fórmula", () => {
  const classicQuote = { fixture_id: 1, market_family: "goals", direction: "over", line: 2.5, decimal_odds: 2.4, bookmaker_name: "Betano", quote_id: "q" };
  const classicCandidate = { fixture_id: 1, market_family: "goals", direction: "over", line: 2.5, estimated_probability: 0.485, uncertainty_low: 0.445, uncertainty_high: 0.565, sports_score: 61 };
  const result = evaluateValueOpportunity({ candidate: classicCandidate, quote: classicQuote });
  const implied = 1 / 2.4;
  closeTo(result.raw_edge_pp, (0.485 - implied) * 100, 1e-2);
  closeTo(result.conservative_edge_pp, (0.445 - implied) * 100, 1e-2);
});

// -----------------------------------------------------------------------
// 10. Compatibilidad con perfiles asiáticos antiguos (sin los campos nuevos)
// -----------------------------------------------------------------------

test("perfil asiático antiguo sin price_equivalent_probability: no se reinterpreta Favorabilidad/weighted_win, campos económicos nuevos quedan null, sin NaN", () => {
  const legacyProfile = {
    contract: "AsianSettlementProfile", version: 1, market_family: "asian_total_goals",
    direction: "over", line: 2.5,
    probabilities: { full_win: 0.6, half_win: 0, push: 0, half_loss: 0, full_loss: 0.4 },
    weighted_win_probability: 0.6, weighted_loss_probability: 0.4, push_probability: 0,
    sports_favorability: 0.6, sports_favorability_uncertainty_low: 0.5, sports_favorability_uncertainty_high: 0.7,
    fixture_ids: [1, 2], effective_sample_size: 5,
    // NO price_equivalent_probability / _low / _high / _method — perfil "de antes" de esta fase.
  };
  const legacyCandidate = { fixture_id: 1, market_family: "asian_total_goals", direction: "over", line: 2.5, estimated_probability: 0.6, uncertainty_low: 0.5, uncertainty_high: 0.7, sports_score: 65 };
  const result = evaluateValueOpportunity({ candidate: legacyCandidate, quote: quote(1.8, { line: 2.5 }), asianSettlementProfile: legacyProfile });
  assert.equal(result.raw_edge_pp, null);
  assert.equal(result.conservative_edge_pp, null);
  assert.equal(result.price_equivalent_probability, null);
  assert.ok(!Number.isNaN(result.expected_roi));
  assert.ok(!Number.isNaN(result.fair_odds_atlas));
  // Hallazgo a reportar: aunque weighted_win_probability(0.6) y
  // weighted_loss_probability(0.4) SÍ están presentes y serían matemáticamente
  // suficientes para reconstruir price_equivalent_probability=0.6/(0.6+0.4)=0.6,
  // el código actual NO hace esa reconstrucción — exige el campo ya calculado.
});
