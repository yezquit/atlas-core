import test from "node:test";
import assert from "node:assert/strict";

import { buildOperationalDirectorVerdict } from "../modules/directorAtlas.js";
import { selectExactRequestedCandidate } from "../services/operationalAnalysisService.js";

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
