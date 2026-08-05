import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { phaseForKickoff } from "../contracts/operationalContracts.js";
import { buildAnalysisVersion, compareAnalysisVersions } from "../intelligence/analysisVersions.js";
import { assessMarketSuitability, evaluateMarketPrice } from "../intelligence/marketSuitability.js";
import { createManualOdds } from "../intelligence/oddsIntelligence.js";
import { buildOperationalDirectorVerdict } from "../modules/directorAtlas.js";
import {
  buildGeminiEconomicReanalysisMessage,
  exactLineExplanation,
} from "../services/operationalAnalysisService.js";

const clientPath = new URL("../../app/atlas-functional-client.js", import.meta.url);

function manualQuote({ odds = 1.25, receivedAt = "2026-08-05T17:52:00.000Z", analyzedAt = "2026-08-05T17:53:00.000Z" } = {}) {
  return createManualOdds({
    fixtureId: 1_498_650,
    bookmaker: "Betano",
    marketFamily: "goals",
    marketName: "Goles",
    direction: "under",
    selection: "Under 3.5",
    line: "3.5",
    decimalOdds: odds,
    receivedAt,
    analyzedAt,
    timezone: "America/Bogota",
    analysisVersion: "base-version",
  });
}

function probability({ point = 0.674, low = 0.514, high = 0.801 } = {}) {
  return {
    contract: "PreliminaryMarketProbability",
    probability_status: "preliminary",
    point_estimate: point,
    uncertainty_low: low,
    uncertainty_high: high,
    sample_size_effective: 26.6,
    methodology_version: "preliminary-market-v1",
  };
}

function candidate(preliminary) {
  return {
    candidate_id: "goals:under:3.5",
    market_family: "goals",
    direction: "under",
    selection: "Under 3.5",
    line: 3.5,
    probability_status: "preliminary",
    preliminary_probability: preliminary.point_estimate,
    uncertainty_low: preliminary.uncertainty_low,
    uncertainty_high: preliminary.uncertainty_high,
    sample_size_effective: preliminary.sample_size_effective,
    sports_score: 88,
    limitations: ["Modelo preliminar no calibrado."],
    context_adjustment: { applied_impacts: [] },
  };
}

function pipeline({ preliminary = probability(), quote = manualQuote(), confidenceScore = 87, contextMessage = null } = {}) {
  const suitability = assessMarketSuitability({
    fixtureVerified: true,
    marketCandidate: true,
    sampleSufficient: true,
    requiredEvidenceAvailable: true,
    line: 3.5,
    oddsQuote: quote,
    confidenceScore,
    preliminaryProbability: preliminary,
    sampleSize: preliminary.sample_size_effective,
    phase: "hours_before",
  });
  const director = buildOperationalDirectorVerdict({
    fixture: {
      fixtureId: 1_498_650,
      date: { utc: "2026-08-06T01:00:00.000Z", timezone: "America/Bogota" },
      teams: { home: { name: "Once Caldas" }, away: { name: "América de Cali" } },
      competition: { season: 2026 },
    },
    competition: { localName: "Colombia Primera A" },
    analyzedAt: "2026-08-05T17:53:00.000Z",
    phase: "hours_before",
    marketAssessment: { market_family: "goals", market_label: "Goles" },
    marketCandidate: candidate(preliminary),
    marketSelection: { analysis_mode: "specific", explanation: "Under 3.5 lidera el ranking deportivo.", alternatives: [], line_profiles: {} },
    oddsQuote: quote,
    confidence: { analysis_confidence_score: confidenceScore, confidence_label: "muy_alta" },
    suitability,
    supportingEvidence: ["Frecuencia y estabilidad observadas"],
    preliminaryProbability: preliminary,
    contextReanalysisMessage: contextMessage,
  });
  return { quote, preliminary, suitability, director, parlayCandidate: ["eligible", "eligible_with_caution"].includes(director.parlay_eligibility) ? { fixture_id: 1_498_650 } : null };
}

function version(id, result, geminiContext = null, at = "2026-08-05T17:53:00.000Z") {
  return buildAnalysisVersion({
    fixture: { fixtureId: 1_498_650, date: { utc: "2026-08-06T01:00:00.000Z" } },
    activeQuote: result.quote,
    preliminaryProbability: result.preliminary,
    analysisConfidence: { analysis_confidence_score: result.director.analysis_confidence_score },
    director: result.director,
    geminiContext,
  }, { idFactory: () => id, now: () => at });
}

test("1. 67.4% vs 80% produce price_status unfavorable", () => {
  assert.equal(pipeline().director.price_assessment.status, "unfavorable");
});

test("2. price_gap es -12.6 puntos porcentuales", () => {
  const price = evaluateMarketPrice({ oddsQuote: manualQuote(), preliminaryProbability: probability(), confidenceScore: 87, sampleSize: 26.6 });
  assert.equal(price.price_gap_percentage_points, -12.6);
});

test("3. aptitud individual es no viable", () => {
  assert.equal(pipeline().director.individual_eligibility, "not_viable_at_this_price");
});

test("4. parlay es no elegible", () => {
  assert.equal(pipeline().director.parlay_eligibility, "not_eligible");
});

test("5. no aparece el botón Agregar como candidato a parlay", async () => {
  const result = pipeline();
  const source = await readFile(clientPath, "utf8");
  assert.equal(result.parlayCandidate, null);
  assert.match(source, /analysis\.parlayCandidate \? <button/);
});

test("6. encabezado, respuesta directa, aptitud y parlay son coherentes", () => {
  const director = pipeline().director;
  assert.equal(director.display_status, "NO — LA CUOTA NO COMPENSA LA INCERTIDUMBRE");
  assert.equal(director.decision_code, "no");
  assert.equal(director.individual_eligibility, "not_viable_at_this_price");
  assert.equal(director.parlay_eligibility, "not_eligible");
  assert.match(director.sports_verdict.message, /conserva respaldo deportivo provisional/);
});

test("7. una cuota baja no activa elegibilidad automáticamente", () => {
  const result = pipeline({ preliminary: probability({ point: 0.8, low: 0.7, high: 0.88 }), quote: manualQuote({ odds: 1.1 }) });
  assert.equal(result.director.price_assessment.status, "unfavorable");
  assert.equal(result.director.parlay_eligibility, "not_eligible");
});

test("8. una estimación superior a la implícita puede producir eligible_with_caution", () => {
  const result = pipeline({ preliminary: probability({ point: 0.72, low: 0.57, high: 0.87 }), quote: manualQuote({ odds: 1.428571 }) });
  assert.equal(result.director.price_assessment.status, "marginal");
  assert.equal(result.director.parlay_eligibility, "eligible_with_caution");
});

test("9. una cuota vencida mantiene solo revisión", () => {
  const quote = manualQuote({ receivedAt: "2026-08-05T10:00:00.000Z", analyzedAt: "2026-08-05T17:53:00.000Z" });
  const director = pipeline({ quote }).director;
  assert.equal(director.price_assessment.status, "stale");
  assert.equal(director.individual_eligibility, "review_only");
  assert.equal(director.parlay_eligibility, "review_only");
});

test("10. una cuota ausente mantiene evaluación de precio pendiente", () => {
  const director = pipeline({ quote: null }).director;
  assert.equal(director.price_assessment.status, "unavailable");
  assert.equal(director.individual_eligibility, "review_only");
});

test("11. la línea elegida por Atlas no se etiqueta como reportada por usuario", () => {
  const explanation = exactLineExplanation("Under 3.5", { transferredCandidate: { line: 3.5 }, manualOdds: null });
  assert.match(explanation, /seleccionada por Atlas/);
  assert.doesNotMatch(explanation, /reportada por el usuario/);
});

test("12. provider odd invalid se traduce", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /provider_odd_invalid: "La cotización del proveedor presentó datos inválidos\."/);
});

test("13. fase temporal usa distancia real", () => {
  const kickoff = "2026-08-06T01:00:00.000Z";
  assert.equal(phaseForKickoff(kickoff, "2026-08-05T18:00:00.000Z").phase, "hours_before");
  assert.equal(phaseForKickoff(kickoff, "2026-08-05T23:30:00.000Z").phase, "one_hour_before");
  assert.equal(phaseForKickoff(kickoff, "2026-08-06T01:01:00.000Z").phase, "pre_match_closed");
});

test("14. Gemini conserva Betano 1.25", () => {
  const base = pipeline();
  const updated = pipeline({ preliminary: probability({ point: 0.71, low: 0.55, high: 0.83 }), quote: base.quote });
  assert.equal(updated.quote.quote_id, base.quote.quote_id);
  assert.equal(updated.director.bookmaker, "Betano");
  assert.equal(updated.director.odds, 1.25);
});

test("15. Gemini 67.4% a 71% con implícita 80% sigue unfavorable", () => {
  const message = buildGeminiEconomicReanalysisMessage({ selectedItems: [{ id: "g1" }], impacts: [{ id: "i1" }], previousProbability: 0.674, currentProbability: 0.71, impliedProbability: 0.8, decimalOdds: 1.25, currentPriceStatus: "unfavorable" });
  const updated = pipeline({ preliminary: probability({ point: 0.71, low: 0.55, high: 0.83 }), contextMessage: message });
  assert.equal(updated.director.price_assessment.status, "unfavorable");
  assert.match(updated.director.context_reanalysis_message, /67\.4% a 71%.*80% implícito/s);
});

test("16. Gemini no relevante conserva dictamen y lo explica", () => {
  const message = buildGeminiEconomicReanalysisMessage({ selectedItems: [{ id: "g1" }], impacts: [], previousProbability: 0.674, currentProbability: 0.674, impliedProbability: 0.8, decimalOdds: 1.25 });
  assert.match(message, /no fue suficiente para modificar el dictamen ni la evaluación económica/);
  assert.equal(pipeline({ contextMessage: message }).director.decision_code, "no");
});

test("17. Gemini contrario refuerza estado no viable", () => {
  const message = buildGeminiEconomicReanalysisMessage({ selectedItems: [{ id: "g1" }], impacts: [{ id: "i1" }], previousProbability: 0.674, currentProbability: 0.62, impliedProbability: 0.8, decimalOdds: 1.25 });
  const updated = pipeline({ preliminary: probability({ point: 0.62, low: 0.46, high: 0.76 }), contextMessage: message });
  assert.equal(updated.director.price_assessment.status, "unfavorable");
  assert.match(message, /refuerza el estado no viable/);
});

test("18. Gemini no modifica fixture, línea, casa ni cuota", () => {
  const base = pipeline();
  const updated = pipeline({ preliminary: probability({ point: 0.71, low: 0.55, high: 0.83 }), quote: base.quote });
  assert.equal(updated.director.fixture.fixture_id, base.director.fixture.fixture_id);
  assert.equal(updated.director.line, base.director.line);
  assert.equal(updated.director.bookmaker, base.director.bookmaker);
  assert.equal(updated.director.odds, base.director.odds);
});

test("19. comparación de versiones muestra cambios económicos", () => {
  const base = pipeline();
  const favorable = pipeline({ preliminary: probability({ point: 0.84, low: 0.75, high: 0.9 }) });
  const diff = compareAnalysisVersions(version("base", base), version("new", favorable, { selected_items: [{ id: "g1" }] }, "2026-08-05T17:54:00.000Z"));
  assert.deepEqual(diff.changes.price_evaluation, { previous: "unfavorable", current: "favorable_preliminary" });
  assert.deepEqual(diff.changes.individual_eligibility, { previous: "not_viable_at_this_price", current: "eligible_under_conditions" });
  assert.deepEqual(diff.changes.parlay_eligibility, { previous: "not_eligible", current: "eligible" });
  assert.ok(diff.changes.uncertainty_interval.previous.low !== null);
});

test("20. integración cuota manual → Director → Gemini → nuevo Director", () => {
  const base = pipeline();
  const contextMessage = buildGeminiEconomicReanalysisMessage({ selectedItems: [{ id: "g1" }], impacts: [{ id: "i1" }], previousProbability: 0.674, currentProbability: 0.71, impliedProbability: base.quote.implied_probability, decimalOdds: base.quote.decimal_odds, currentPriceStatus: "unfavorable" });
  const updated = pipeline({ preliminary: probability({ point: 0.71, low: 0.55, high: 0.83 }), quote: base.quote, contextMessage });
  const diff = compareAnalysisVersions(version("base", base), version("gemini", updated, { selected_items: [{ id: "g1" }] }, "2026-08-05T17:54:00.000Z"));
  assert.equal(updated.director.price_assessment.status, "unfavorable");
  assert.equal(updated.director.parlay_eligibility, "not_eligible");
  assert.equal(updated.director.odds, 1.25);
  assert.equal(updated.director.bookmaker, "Betano");
  assert.equal(diff.changes.probability_change, true);
  assert.match(updated.director.context_reanalysis_message, /sigue sin ser viable a este precio/);
});
