import test from "node:test";
import assert from "node:assert/strict";

import { calculateCalibration } from "../intelligence/resultCalibration.js";
import {
  calculateOfficialPredictionCalibration,
  createOfficialPredictionSnapshot,
  resolveOfficialPrediction,
} from "../intelligence/officialPrediction.js";

const ISSUED_AT = "2026-08-14T16:00:00.000Z";

function baseAnalysis({ family, selection, direction, line, probability, fixtureId, marketFamilyForQuote }) {
  const quoteFamily = marketFamilyForQuote || family;
  return {
    contract: "OperationalAnalysisVersion",
    analysis_id: `analysis-${fixtureId}`,
    fixture_id: fixtureId,
    created_at: ISSUED_AT,
    phase: "day_before",
    engine_version: "atlas-operational-v2",
    inputs: { reanalysis: true, competitionKey: "brasilSerieB", season: 2026, date: "2026-08-16", timezone: "America/Bogota" },
    evidence: [{ source_ref: `fixture:${fixtureId}` }],
    gemini_context: { context_id: `gemini-${fixtureId}`, selected_items: [] },
    active_quote: { quote_id: `q-${fixtureId}`, fixture_id: fixtureId, market_family: quoteFamily, selection, direction, line, bookmaker_name: "Betano", decimal_odds: 1.9, freshness: "fresh", verification_status: "user_reported", consulted_at: ISSUED_AT },
    analysis_confidence: { analysis_confidence_score: 74 },
    preliminary_probability: { point_estimate: probability, uncertainty_low: probability - 0.1, uncertainty_high: probability + 0.1, methodology_version: "distribution-v1" },
    director: {
      contract: "DirectorVerdict",
      version: 3,
      decision_code: "yes",
      display_status: "SÍ — CON CONDICIONES",
      fixture: { fixture_id: fixtureId, home_team: "Equipo A", away_team: "Equipo B", competition: "Brasil Serie B", season: 2026, kickoff_utc: "2026-08-16T22:00:00.000Z", timezone: "America/Bogota" },
      analysis_phase: "day_before",
      market_evaluated: { family, label: family },
      selection,
      line,
      analysis_confidence_score: 74,
      estimated_probability: probability,
      probability_status: "preliminary",
      probability_uncertainty_low: probability - 0.1,
      probability_uncertainty_high: probability + 0.1,
      probability_methodology: "distribution-v1",
      sports_verdict: { status: "sports_candidate", selection, direction, line, sports_score: 78, estimated_probability: probability, message: "Atlas respalda deportivamente la selección." },
      price_assessment: { status: "favorable_preliminary", freshness: "fresh", source_status: "user_reported_current", bookmaker: "Betano", decimal_odds: 1.9 },
      market_suitability: "suitable_under_conditions",
      simple_reasons: ["Distribución reciente compatible."],
      reasons: ["Muestra verificada."],
      primary_supporting_evidence: "Distribución reciente compatible.",
      scout: { primary_candidate_id: `${family}:${direction}:${line}` },
    },
  };
}

function classicAnalysis(fixtureId, probability = 0.7) {
  return baseAnalysis({ family: "goals", selection: "Over 2.5", direction: "over", line: 2.5, probability, fixtureId });
}

// Favorabilidad deliberadamente alta (0.82) y distinta de lo que produciría
// una probabilidad literal calibrada, para hacer evidente la contaminación
// si no se excluye.
function asianAnalysis(fixtureId, { line = 5, direction = "over", probability = 0.82 } = {}) {
  return baseAnalysis({ family: "asian_total_goals", selection: `Over ${line}`, direction, line, probability, fixtureId });
}

function snapshot(analysis, predictionId) {
  return createOfficialPredictionSnapshot(analysis, { predictionId, registeredAt: ISSUED_AT });
}

function resolved(analysis, predictionId, actualTotal) {
  return resolveOfficialPrediction(snapshot(analysis, predictionId), { source: "api_football", resolvedAt: ISSUED_AT, actualTotal });
}

// -----------------------------------------------------------------------
// A-C. Registros OfficialPrediction asian: HIT, MISS, VOID/push
// -----------------------------------------------------------------------

test("A. Asian OfficialPrediction HIT queda fuera del Brier/hit-rate/buckets clásicos", () => {
  const asianHit = resolved(asianAnalysis(2001, { line: 5, direction: "over" }), "asian-hit", 7);
  assert.equal(asianHit.resolution.status, "hit");
  const calibration = calculateOfficialPredictionCalibration([asianHit]);
  assert.equal(calibration.resolved_count, 0);
  assert.equal(calibration.hit_rate, null);
  assert.equal(calibration.brier_score, null);
  assert.equal(Object.prototype.hasOwnProperty.call(calibration.by_market_family, "asian_total_goals"), false);
});

test("B. Asian OfficialPrediction MISS también queda fuera", () => {
  const asianMiss = resolved(asianAnalysis(2002, { line: 5, direction: "over" }), "asian-miss", 1);
  assert.equal(asianMiss.resolution.status, "miss");
  const calibration = calculateOfficialPredictionCalibration([asianMiss]);
  assert.equal(calibration.resolved_count, 0);
  assert.equal(calibration.hit_rate, null);
  assert.equal(calibration.brier_score, null);
});

test("C. Asian VOID/push sigue excluido como antes (ya lo estaba, se conserva)", () => {
  const asianPush = resolved(asianAnalysis(2003, { line: 3, direction: "over" }), "asian-push", 3);
  assert.equal(asianPush.resolution.status, "void");
  const calibration = calculateOfficialPredictionCalibration([asianPush]);
  assert.equal(calibration.resolved_count, 0);
  assert.equal(calibration.hit_rate, null);
});

// -----------------------------------------------------------------------
// D. Dataset mixto: 2 clásicos + 1 Asian -> métricas Bernoulli iguales a
//    las calculadas solo con los 2 clásicos.
// -----------------------------------------------------------------------

test("D. Dataset mixto (2 clásicos + 1 Asian): hit_rate/brier/bands iguales a solo-clásicos", () => {
  const classicHit = resolved(classicAnalysis(3001, 0.7), "classic-hit", 4);
  const classicMiss = resolved(classicAnalysis(3002, 0.7), "classic-miss", 1);
  const asianHit = resolved(asianAnalysis(3003, { line: 5, direction: "over", probability: 0.82 }), "asian-mixed", 9);
  assert.equal(asianHit.resolution.status, "hit");

  const classicOnly = calculateOfficialPredictionCalibration([classicHit, classicMiss]);
  const mixed = calculateOfficialPredictionCalibration([classicHit, classicMiss, asianHit]);

  assert.equal(mixed.resolved_count, classicOnly.resolved_count);
  assert.equal(mixed.hit_rate, classicOnly.hit_rate);
  assert.equal(mixed.brier_score, classicOnly.brier_score);
  assert.deepEqual(mixed.bands, classicOnly.bands);
  assert.deepEqual(mixed.by_market_family, classicOnly.by_market_family);
});

// -----------------------------------------------------------------------
// E. by_market_family no reporta una calibración Bernoulli engañosa
// -----------------------------------------------------------------------

test("E. by_market_family omite asian_total_goals en vez de reportar un Brier/hit-rate engañoso", () => {
  const asianHit = resolved(asianAnalysis(4001, { line: 5, direction: "over" }), "asian-family", 8);
  const classicHit = resolved(classicAnalysis(4002, 0.7), "classic-family", 4);
  const calibration = calculateOfficialPredictionCalibration([asianHit, classicHit]);
  assert.ok(Object.prototype.hasOwnProperty.call(calibration.by_market_family, "goals"));
  assert.equal(Object.prototype.hasOwnProperty.call(calibration.by_market_family, "asian_total_goals"), false);
});

// -----------------------------------------------------------------------
// F. Clásicos: regresión exacta
// -----------------------------------------------------------------------

test("F. Clásicos: calculateOfficialPredictionCalibration produce el mismo resultado con o sin excluir asian (regresión)", () => {
  const classicHit = resolved(classicAnalysis(5001, 0.7), "classic-reg-hit", 4);
  const classicMiss = resolved(classicAnalysis(5002, 0.7), "classic-reg-miss", 1);
  const calibration = calculateOfficialPredictionCalibration([classicHit, classicMiss]);
  assert.equal(calibration.resolved_count, 2);
  assert.equal(calibration.hit_rate, 0.5);
  assert.ok(Number.isFinite(calibration.brier_score));
  const band7079 = calibration.bands.find((band) => band.label === "70–79%");
  assert.ok(band7079);
  assert.equal(band7079.average_predicted_probability, 0.7);
});

test("F2. calculateCalibration (resultCalibration.js) directo: clásicos sin cambios, dataset mixto igual a solo-clásicos", () => {
  const classicHitRecord = { outcome: "hit", preliminary_probability: 0.7, market_family: "goals", competition: "Brasil Serie B", phase: "day_before" };
  const classicMissRecord = { outcome: "miss", preliminary_probability: 0.7, market_family: "goals", competition: "Brasil Serie B", phase: "day_before" };
  const asianRecord = { outcome: "hit", preliminary_probability: 0.82, market_family: "asian_total_goals", competition: "Brasil Serie B", phase: "day_before" };
  const classicOnly = calculateCalibration([classicHitRecord, classicMissRecord]);
  const mixed = calculateCalibration([classicHitRecord, classicMissRecord, asianRecord]);
  assert.equal(mixed.resolved_count, classicOnly.resolved_count);
  assert.equal(mixed.hit_rate, classicOnly.hit_rate);
  assert.equal(mixed.brier_score, classicOnly.brier_score);
  assert.deepEqual(mixed.by_market_family, classicOnly.by_market_family);
  // prediction_count sí refleja el total bruto recibido (no se borra del dataset).
  assert.equal(mixed.prediction_count, 3);
  assert.equal(classicOnly.prediction_count, 2);
});

// -----------------------------------------------------------------------
// G. Historial antiguo: market_family asian sin probability_semantics
// -----------------------------------------------------------------------

test("G. Registro histórico con market_family asian_total_goals pero sin probability_semantics también queda excluido", () => {
  const legacyAsianRecord = { outcome: "hit", preliminary_probability: 0.82, market_family: "asian_total_goals", competition: "Brasil Serie B", phase: "day_before" };
  assert.equal("probability_semantics" in legacyAsianRecord, false);
  const calibration = calculateCalibration([legacyAsianRecord]);
  assert.equal(calibration.resolved_count, 0);
  assert.equal(calibration.hit_rate, null);
});
