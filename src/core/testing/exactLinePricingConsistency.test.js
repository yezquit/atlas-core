import test from "node:test";
import assert from "node:assert/strict";

import { buildOperationalDirectorVerdict } from "../modules/directorAtlas.js";
import { analyzeOperationalFixture, isCompatiblePriceSnapshot, selectExactRequestedCandidate } from "../services/operationalAnalysisService.js";

const fixture = { fixtureId: 7, date: { utc: "2026-09-01T20:00:00Z" }, teams: { home: { name: "A" }, away: { name: "B" } } };
const candidate = {
  candidate_id: "total_shots:over:28.5", market_family: "total_shots", direction: "over", selection: "Over 28.5", line: 28.5,
  probability_status: "preliminary", preliminary_probability: 0.62, estimated_probability: 0.62,
  uncertainty_low: 0.5, uncertainty_high: 0.7, sample_size_effective: 12, sports_score: 70, ranking_eligible: true,
};
const suitability = { status: "review_only", price_evaluation: { status: "unavailable", message: "Precio pendiente", price_gap: null } };
const confidence = { analysis_confidence_score: 70, confidence_label: "alta" };

function verdict(marketCandidate, marketSelection) {
  return buildOperationalDirectorVerdict({ fixture, competition: { localName: "Liga" }, analyzedAt: "2026-08-29T00:00:00Z", phase: "early_review", marketAssessment: { market_family: "total_shots", market_label: "Remates totales" }, marketCandidate, marketSelection, suitability, confidence, preliminaryProbability: marketCandidate ? { probability_status: "preliminary", point_estimate: 0.62, uncertainty_low: 0.5, uncertainty_high: 0.7, sample_size_effective: 12 } : null });
}

test("línea exacta calculada queda pendiente de cuota y conserva su identidad", () => {
  const director = verdict(candidate, { exact_requested_line_unavailable: false });
  assert.equal(director.price_pending, true);
  assert.equal(director.sports_verdict.market_family, "total_shots");
  assert.equal(director.sports_verdict.direction, "over");
  assert.equal(director.sports_verdict.line, 28.5);
  assert.equal(director.estimated_probability, 0.62);
  assert.equal(director.sports_verdict.sports_score, 70);
});

test("línea exacta unavailable no solicita cuota", () => {
  const director = verdict(null, { exact_requested_line_unavailable: true });
  assert.equal(director.price_pending, false);
  assert.doesNotMatch(director.conditions.join(" "), /cuota actual/i);
  assert.doesNotMatch(director.next_action, /introducir una cuota/i);
});

test("reanálisis exacto reemplaza la selección previa y no deja estado unavailable", () => {
  const selection = { ranked_candidates: [{ ...candidate }, { ...candidate, candidate_id: "total_shots:over:27.5", line: 27.5, selection: "Over 27.5" }], primary: candidate };
  const result = selectExactRequestedCandidate(selection, { marketFamily: "total_shots", requestedLine: 28.5, requestedSelection: "over", lineOrigin: "user_selected" });
  assert.equal(result.exact_requested_line_unavailable, false);
  assert.equal(result.primary.line, 28.5);
  assert.equal(result.primary.direction, "over");
});

function sourceVersion() {
  return {
    analysis_id: "sports-source-29-5",
    fixture_id: 77,
    phase: "hours_before",
    line_origin: "user_selected",
    preliminary_probability: { probability_status: "preliminary", point_estimate: 0.62, uncertainty_low: 0.5, uncertainty_high: 0.7, sample_size_effective: 12, methodology_version: "preliminary-market-v1" },
    analysis_confidence: { analysis_confidence_score: 70, confidence_label: "alta" },
    director: {
      fixture: { fixture_id: 77, home_team: "Real Madrid", away_team: "Malaga", kickoff: "2026-09-01T20:00:00.000Z", kickoff_utc: "2026-09-01T20:00:00.000Z", competition: "Liga", season: 2026, timezone: "America/Bogota" },
      market_evaluated: { family: "total_shots", label: "Remates totales" },
      selection: "Over 29.5", line: 29.5, technical_support: 70,
      sports_verdict: { status: "sports_candidate", selection: "Over 29.5", direction: "over", line: 29.5, sports_score: 70 },
      reasons: ["Snapshot deportivo válido."], risks: [], missing_data: [], context_summary: {},
    },
    evidence: [], odds: [], gemini_context: { valid_for_reanalysis: true, selected_items: [] },
  };
}

function priceInput(overrides = {}) {
  return {
    fixtureId: 77,
    marketId: "total_shots",
    analysisMode: "specific",
    line: "29.5",
    selection: "Más de 29.5",
    sourceAnalysisId: "sports-source-29-5",
    evaluatePrice: true,
    intendedUse: "individual",
    manualOdds: { bookmaker: "Betano", marketFamily: "total_shots", direction: "over", selection: "Más de 29.5", line: "29.5", decimalOdds: "1.83", consultedAt: "2026-08-30T12:00:00.000Z", timezone: "America/Bogota", analysisVersion: "sports-source-29-5" },
    ...overrides,
  };
}

test("evaluar cuota reutiliza el snapshot exacto sin reconstruir deporte", async () => {
  const noSportsGateway = new Proxy({}, { get() { throw new Error("sports_reconstruction_must_not_run"); } });
  const result = await analyzeOperationalFixture(priceInput(), noSportsGateway, { previousVersion: sourceVersion(), now: () => "2026-08-30T12:00:00.000Z", idFactory: () => "priced-version" });
  assert.equal(result.status, "success");
  assert.equal(result.exactSelection.market_family, "total_shots");
  assert.equal(result.exactSelection.direction, "over");
  assert.equal(result.exactSelection.line, 29.5);
  assert.equal(result.exactSelection.estimated_probability, 0.62);
  assert.equal(result.exactSelection.sports_score, 70);
  assert.equal(result.selectedOdds.decimal_odds, 1.83);
  assert.ok(Number.isFinite(result.director.implied_probability));
  assert.notEqual(result.director.price_assessment.status, "unavailable");
});

test("snapshot económico exige identidad exacta y no reutiliza otra línea", () => {
  const source = sourceVersion();
  assert.equal(isCompatiblePriceSnapshot(priceInput(), source), true);
  assert.equal(isCompatiblePriceSnapshot(priceInput({ sourceAnalysisId: null }), source), false);
  for (const changed of [
    { fixtureId: 78 },
    { manualOdds: { ...priceInput().manualOdds, marketFamily: "corners" } },
    { selection: "Menos de 29.5", manualOdds: { ...priceInput().manualOdds, direction: "under", selection: "Menos de 29.5" } },
    { line: "30.5", selection: "Más de 30.5", manualOdds: { ...priceInput().manualOdds, line: "30.5", selection: "Más de 30.5" } },
  ]) assert.equal(isCompatiblePriceSnapshot(priceInput(changed), source), false);
});
