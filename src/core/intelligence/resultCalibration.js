import { isSettlementFavorabilityCandidate } from "./probabilityClassification.js";

export const CALIBRATION_MINIMUM_RESOLVED = 200;

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function resultForLine({ selection, line, actualTotal } = {}) {
  const numericLine = Number(String(line ?? selection ?? "").replace(",", ".").match(/-?\d+(?:\.\d+)?/)?.[0]);
  const actual = Number(actualTotal);
  const candidate = normalize(selection);
  const direction = /\b(over|mas de|superior)\b/.test(candidate)
    ? "over"
    : /\b(under|menos de|inferior)\b/.test(candidate)
      ? "under"
      : null;
  if (!direction || !Number.isFinite(numericLine) || !Number.isFinite(actual)) {
    return { status: "unresolved", direction, exact_line: Number.isFinite(numericLine) ? numericLine : null, actual_total: Number.isFinite(actual) ? actual : null };
  }
  if (actual === numericLine) return { status: "void", direction, exact_line: numericLine, actual_total: actual };
  const hit = direction === "over" ? actual > numericLine : actual < numericLine;
  return { status: hit ? "hit" : "miss", direction, exact_line: numericLine, actual_total: actual };
}

export function buildPredictionResult({ analysis, actualTotal = null, source = "manual_user_input", recordedAt = new Date().toISOString() } = {}) {
  if (!analysis?.analysis_id || !analysis?.fixture_id) throw new TypeError("El resultado requiere una versión de análisis existente.");
  const outcome = actualTotal === null
    ? { status: "unresolved", direction: null, exact_line: Number(analysis.director?.line) || null, actual_total: null }
    : resultForLine({ selection: analysis.director?.selection, line: analysis.director?.line, actualTotal });
  return Object.freeze({
    contract: "PredictionResult",
    version: 1,
    analysis_id: analysis.analysis_id,
    fixture_id: analysis.fixture_id,
    competition: analysis.director?.fixture?.competition || null,
    market_family: analysis.director?.market_evaluated?.family || null,
    selection: analysis.director?.selection || null,
    line: analysis.director?.line ?? null,
    decimal_odds: analysis.director?.odds ?? null,
    preliminary_probability: analysis.preliminary_probability?.point_estimate ?? null,
    uncertainty_low: analysis.preliminary_probability?.uncertainty_low ?? null,
    uncertainty_high: analysis.preliminary_probability?.uncertainty_high ?? null,
    analysis_confidence_score: analysis.analysis_confidence?.analysis_confidence_score ?? null,
    analyzed_at: analysis.created_at,
    phase: analysis.phase,
    actual_total: outcome.actual_total,
    outcome: outcome.status,
    result_source: source,
    recorded_at: recordedAt,
    model_validation_status: "preliminary_unvalidated",
  });
}

function group(records, key) {
  return Object.fromEntries([...new Set(records.map((item) => item[key] || "not_available"))].map((value) => [value, summary(records.filter((item) => (item[key] || "not_available") === value), false)]));
}

function summary(records, includeGroups = true) {
  // preliminary_probability puede representar Favorabilidad Atlas
  // (settlement_favorability, p.ej. asian_total_goals) en vez de una
  // probabilidad literal calibrable. Ese valor pondera full/half win/push/
  // half/full loss de forma distinta a como este módulo reduce el mismo
  // settlement a hit/miss — comparar ambos en un Brier/hit-rate Bernoulli
  // produciría una lectura estadísticamente inválida. Se excluye del
  // agregado clásico sin borrar el registro del dataset bruto (prediction_count
  // lo sigue contando) ni alterar su resolution/outcome histórico.
  const resolved = records.filter((item) => ["hit", "miss"].includes(item.outcome) && Number.isFinite(item.preliminary_probability) && !isSettlementFavorabilityCandidate(item));
  const hits = resolved.filter((item) => item.outcome === "hit").length;
  const brier = resolved.length
    ? resolved.reduce((sum, item) => sum + (item.preliminary_probability - (item.outcome === "hit" ? 1 : 0)) ** 2, 0) / resolved.length
    : null;
  const base = {
    prediction_count: records.length,
    resolved_count: resolved.length,
    hit_rate: resolved.length ? Number((hits / resolved.length).toFixed(4)) : null,
    brier_score: brier === null ? null : Number(brier.toFixed(4)),
  };
  if (!includeGroups) return base;
  const bands = [
    [0, 0.4, "0–39%"],
    [0.4, 0.5, "40–49%"],
    [0.5, 0.6, "50–59%"],
    [0.6, 0.7, "60–69%"],
    [0.7, 0.8, "70–79%"],
    [0.8, 1.01, "80–100%"],
  ].map(([low, high, label]) => ({ label, ...summary(resolved.filter((item) => item.preliminary_probability >= low && item.preliminary_probability < high), false) }));
  return {
    ...base,
    contract: "PreliminaryCalibrationSummary",
    version: 1,
    minimum_resolved_for_calibration: CALIBRATION_MINIMUM_RESOLVED,
    calibration_status: resolved.length >= CALIBRATION_MINIMUM_RESOLVED ? "eligible_for_manual_validation_review" : "preliminary_insufficient_history",
    automatic_weight_recalibration: false,
    model_validation_status: "preliminary_unvalidated",
    bands,
    by_market_family: group(resolved, "market_family"),
    by_competition: group(resolved, "competition"),
    by_phase: group(resolved, "phase"),
  };
}

export function calculateCalibration(records = []) {
  return summary(records);
}
