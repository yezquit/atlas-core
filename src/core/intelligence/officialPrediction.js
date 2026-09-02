import { calculateCalibration } from "./resultCalibration.js";
import { buildSimpleDirectorPresentation } from "../modules/directorAtlas.js";
import {
  PERSONAL_OWNER_ID,
  belongsToPersonalOwner,
} from "../auth/personalIdentity.js";
import { ASIAN_TOTAL_GOALS_FAMILY, settleAsianTotalGoals } from "./asianTotalGoals.js";
import { isSettlementFavorabilityCandidate } from "./probabilityClassification.js";

export const OFFICIAL_PREDICTION_STATUS = Object.freeze({
  PENDING: "pending",
  HIT: "hit",
  MISS: "miss",
  VOID: "void",
  NOT_EVALUABLE: "not_evaluable",
});

export const RESOLVABLE_MARKET_STAT = Object.freeze({
  goals: "goals",
  corners: "corner_kicks",
  cards: "yellow_cards",
  total_shots: "total_shots",
  shots_on_goal: "shots_on_goal",
  // El total de goles reales del partido es exactamente el mismo valor que
  // ya usa la familia "goals" (mismo statKey "goals" en automaticOutcome);
  // asian_total_goals reutiliza ese mismo dato, no un cálculo nuevo.
  [ASIAN_TOTAL_GOALS_FAMILY]: "goals",
});

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizedDirection(value) {
  const normalized = text(value).toLowerCase();
  if (/^(over|mas|más)/.test(normalized)) return "over";
  if (/^(under|menos)/.test(normalized)) return "under";
  return null;
}

// Usada únicamente por el snapshot PREMATCH (ver estimatedProbability en
// createOfficialPredictionSnapshot); LIVE nunca la consume y siempre fija
// estimated_probability en null de forma explícita.
function probabilityFrom(analysis) {
  return finiteNumber(analysis?.director?.sports_verdict?.estimated_probability);
}

function uncertaintyFrom(analysis, key) {
  const director = analysis?.director || {};
  const preliminary = analysis?.preliminary_probability || {};
  return finiteNumber(
    preliminary[`uncertainty_${key}`] ??
    director[`probability_uncertainty_${key}`] ??
    director.sports_verdict?.[`uncertainty_${key}`]
  );
}

function currentQuote(analysis) {
  const quote = analysis?.active_quote || null;
  const director = analysis?.director || {};
  const quoteLine = finiteNumber(quote?.line);
  const predictionLine = finiteNumber(director.sports_verdict?.line ?? director.line);
  const compatible = quote &&
    Number(quote.fixture_id) === Number(analysis?.fixture_id ?? director.fixture?.fixture_id) &&
    quote.market_family === director.market_evaluated?.family &&
    normalizedDirection(quote.direction || quote.selection) === normalizedDirection(director.sports_verdict?.direction || director.selection) &&
    quoteLine !== null && predictionLine !== null && Math.abs(quoteLine - predictionLine) < 0.000001 &&
    finiteNumber(quote.decimal_odds) > 1;
  if (!compatible || quote.stale === true || quote.freshness !== "fresh") return null;
  return {
    quote_id: quote.quote_id || null,
    bookmaker: quote.bookmaker_name || null,
    decimal_odds: finiteNumber(quote.decimal_odds),
    observed_at: quote.updated_at || quote.consulted_at || quote.observed_at || quote.fetched_at || null,
    verification_status: quote.verification_status || quote.source_status || null,
    freshness: quote.freshness,
  };
}

function isLiveAnalysis(analysis) {
  return analysis?.mode === "live" && analysis?.snapshot?.mode === "live";
}

function livePublicDecision(analysis) {
  const decision = analysis?.director?.analysis_decision || {};
  return { status: decision.status || "no", label: decision.label || null, explanation: decision.explanation || null, price_status: analysis?.director?.price_assessment?.status || null };
}

export function officialPredictionPublicDecision(analysis) {
  if (isLiveAnalysis(analysis)) return livePublicDecision(analysis);
  const presentation = buildSimpleDirectorPresentation(analysis?.director, {
    geminiItems: analysis?.gemini_context?.selected_items || [],
  });
  return {
    ...presentation.analysis_decision,
    price_status: presentation.price_decision?.status || null,
  };
}

export function officialPredictionEligibility(analysis, publicDecision = null) {
  const director = analysis?.director || {};
  const fixture = director.fixture || {};
  const sports = director.sports_verdict || {};
  const direction = normalizedDirection(sports.direction || director.selection);
  const line = finiteNumber(sports.line ?? director.line);
  const resolvedPublicDecision = publicDecision || officialPredictionPublicDecision(analysis);
  const reasons = [];

  if (isLiveAnalysis(analysis)) {
    const snapshot = analysis.snapshot;
    if (!analysis.analysis_id) reasons.push("analysis_id_missing");
    if (analysis.status !== "success") reasons.push("live_analysis_not_successful");
    if (!snapshot.snapshot_id || !snapshot.captured_at) reasons.push("live_snapshot_missing");
    if (!Number.isInteger(Number(snapshot.fixture_id)) || Number(snapshot.fixture_id) <= 0) reasons.push("fixture_id_missing");
    if (sports.status !== "sports_candidate") reasons.push("director_sports_support_required");
    if (resolvedPublicDecision.status !== "yes") reasons.push("public_director_support_required");
    if (!director.market_evaluated?.family) reasons.push("market_family_missing");
    if (!direction) reasons.push("direction_missing");
    if (line === null) reasons.push("line_missing");
    if (!fixture.home_team || !fixture.away_team) reasons.push("teams_missing");
    return deepFreeze({ contract: "OfficialPredictionEligibility", version: 1, eligible: reasons.length === 0, status: reasons.length === 0 ? "official_prediction_eligible" : "candidate_only", reasons });
  }

  if (!analysis?.analysis_id) reasons.push("analysis_id_missing");
  if (analysis?.inputs?.reanalysis !== true) reasons.push("completed_reanalysis_required");
  if (!analysis?.gemini_context) reasons.push("validated_context_required");
  if (!Number.isInteger(Number(analysis?.fixture_id ?? fixture.fixture_id)) || Number(analysis?.fixture_id ?? fixture.fixture_id) <= 0) reasons.push("fixture_id_missing");
  if (director.analysis_phase === "pre_match_closed" || analysis?.phase === "pre_match_closed") reasons.push("prematch_closed");
  if (sports.status !== "sports_candidate") reasons.push("director_sports_support_required");
  if (resolvedPublicDecision.status !== "yes") reasons.push("public_director_support_required");
  if (!director.market_evaluated?.family) reasons.push("market_family_missing");
  if (!sports.selection && !director.selection) reasons.push("selection_missing");
  if (!direction) reasons.push("direction_missing");
  if (line === null) reasons.push("line_missing");
  if (!fixture.home_team || !fixture.away_team) reasons.push("teams_missing");

  return deepFreeze({
    contract: "OfficialPredictionEligibility",
    version: 1,
    eligible: reasons.length === 0,
    status: reasons.length === 0 ? "official_prediction_eligible" : "candidate_only",
    reasons,
  });
}

export function officialPredictionFingerprint(analysis) {
  const director = analysis?.director || {};
  const sports = director.sports_verdict || {};
  return [
    isLiveAnalysis(analysis) ? "official_prediction_live_v1" : "official_prediction_v1",
    ...(isLiveAnalysis(analysis) ? [analysis?.snapshot?.snapshot_id] : [analysis?.analysis_id]),
    analysis?.fixture_id ?? director.fixture?.fixture_id,
    director.market_evaluated?.family,
    normalizedDirection(sports.direction || director.selection),
    finiteNumber(sports.line ?? director.line),
  ].map((value) => encodeURIComponent(String(value ?? ""))).join(":");
}

export function createOfficialPredictionSnapshot(analysis, {
  predictionId,
  registeredAt = new Date().toISOString(),
  publicDecision = null,
  ownerId = PERSONAL_OWNER_ID,
} = {}) {
  const eligibility = officialPredictionEligibility(analysis, publicDecision);
  if (!eligibility.eligible) {
    const error = new Error("analysis_is_not_an_official_prediction");
    error.reasons = eligibility.reasons;
    throw error;
  }

  if (!predictionId) throw new TypeError("prediction_id_required");
  const director = analysis.director;
  const sports = director.sports_verdict;
  const fixture = director.fixture;
  const quote = currentQuote(analysis);
  const estimatedProbability = probabilityFrom(analysis);
  const uncertaintyLow = uncertaintyFrom(analysis, "low");
  const uncertaintyHigh = uncertaintyFrom(analysis, "high");
  const publicPresentation = publicDecision || officialPredictionPublicDecision(analysis);

  if (isLiveAnalysis(analysis)) {
    const snapshot = analysis.snapshot;
    return deepFreeze({
      contract: "OfficialPrediction", version: 1, prediction_id: predictionId,
      owner_id: ownerId,
      fingerprint: officialPredictionFingerprint(analysis), source_analysis_id: analysis.analysis_id,
      fixture_id: Number(snapshot.fixture_id), kickoff_utc: snapshot.kickoff_utc || null,
      issued_at: snapshot.captured_at, registered_at: registeredAt,
      competition: snapshot.competition || null, competition_key: analysis.competition_key || null,
      season: snapshot.season ?? null, home_team: snapshot.home_team, away_team: snapshot.away_team,
      mode: "live", market_family: director.market_evaluated.family,
      selection: sports.selection || director.selection, direction: normalizedDirection(sports.direction || director.selection),
      line: finiteNumber(sports.line ?? director.line), active_quote: quote,
      estimated_probability: null, probability_status: "unavailable", uncertainty: { low: null, high: null },
      confidence_score: finiteNumber(director.analysis_confidence_score), sports_score: finiteNumber(sports.sports_score),
      public_director_decision: { status: publicPresentation.status, label: publicPresentation.label || null, explanation: publicPresentation.explanation || null },
      economic_state: { price_status: director.price_assessment?.status || "unavailable", market_suitability: null, decision_code: director.decision_code || null, price_decision_status: publicPresentation.price_status || null },
      reasons: [...new Set([...(director.simple_reasons || []), ...(director.reasons || [])])].slice(0, 5),
      versions: { operational_engine: analysis.pipeline_version || null, director_contract: `${director.contract || "DirectorLiveVerdict"}@${director.version || "unknown"}`, probability_methodology: null, scout_ranker: null, scout_candidate_id: null },
      live_context: { snapshot_id: snapshot.snapshot_id, minute: snapshot.minute, status: snapshot.status, score_at_prediction: snapshot.score, live_stats_snapshot: snapshot.statistics, live_timestamp: snapshot.captured_at },
      source_metadata: { competition_key: analysis.competition_key || null, requested_date: snapshot.kickoff_utc?.slice(0, 10) || null, season: snapshot.season ?? null, timezone: null, evidence_refs: [], gemini_context_id: null, line_origin: "live_snapshot_projection" },
      resolution: { status: OFFICIAL_PREDICTION_STATUS.PENDING, actual_total: null, source: null, resolved_at: null, reason: null, asian_settlement: null },
    });
  }

  return deepFreeze({
    contract: "OfficialPrediction",
    version: 1,
    prediction_id: predictionId,
    owner_id: ownerId,
    fingerprint: officialPredictionFingerprint(analysis),
    source_analysis_id: analysis.analysis_id,
    fixture_id: Number(analysis.fixture_id ?? fixture.fixture_id),
    kickoff_utc: fixture.kickoff_utc || fixture.kickoff || null,
    issued_at: analysis.created_at || director.analyzed_at || registeredAt,
    registered_at: registeredAt,
    competition: fixture.competition || null,
    competition_key: analysis.inputs?.competitionKey || null,
    season: analysis.inputs?.season ?? fixture.season ?? null,
    home_team: fixture.home_team,
    away_team: fixture.away_team,
    mode: "prematch",
    market_family: director.market_evaluated.family,
    selection: sports.selection || director.selection,
    direction: normalizedDirection(sports.direction || director.selection),
    line: finiteNumber(sports.line ?? director.line),
    active_quote: quote,
    estimated_probability: estimatedProbability,
    probability_status: estimatedProbability === null ? "unavailable" : director.probability_status || "preliminary",
    uncertainty: {
      low: uncertaintyLow,
      high: uncertaintyHigh,
    },
    confidence_score: finiteNumber(analysis.analysis_confidence?.analysis_confidence_score ?? director.analysis_confidence_score),
    sports_score: finiteNumber(sports.sports_score),
    probability_percent: finiteNumber(sports.probability_percent),
    probability_classification: sports.probability_classification || null,
    sample_size_effective: finiteNumber(sports.sample_size_effective),
    technical_support_score: finiteNumber(sports.technical_support_score),
    ranking_eligible: sports.ranking_eligible === true,
    public_director_decision: {
      status: publicPresentation.status,
      label: publicPresentation.label || null,
      explanation: publicPresentation.explanation || null,
    },
    economic_state: {
      price_status: director.price_assessment?.status || "unavailable",
      market_suitability: director.market_suitability || null,
      decision_code: director.decision_code || null,
      price_decision_status: publicPresentation.price_status || null,
    },
    reasons: [...new Set([...(director.simple_reasons || []), ...(director.reasons || [])])].slice(0, 5),
    versions: {
      operational_engine: analysis.engine_version || null,
      director_contract: `${director.contract || "DirectorVerdict"}@${director.version || "unknown"}`,
      probability_methodology: director.probability_methodology || analysis.preliminary_probability?.methodology_version || null,
      scout_ranker: analysis.parlay_candidate?.ranking_version || null,
      scout_candidate_id: director.scout?.primary_candidate_id || analysis.parlay_candidate?.candidate_id || null,
    },
    source_metadata: {
      competition_key: analysis.inputs?.competitionKey || null,
      requested_date: analysis.inputs?.date || null,
      season: analysis.inputs?.season ?? fixture.season ?? null,
      timezone: analysis.inputs?.timezone || fixture.timezone || null,
      evidence_refs: (analysis.evidence || []).map((item) => item.source_ref || item.id).filter(Boolean),
      gemini_context_id: analysis.gemini_context?.context_id || analysis.gemini_context?.id || null,
      line_origin: analysis.line_origin || analysis.inputs?.lineOrigin || null,
    },
    resolution: {
      status: OFFICIAL_PREDICTION_STATUS.PENDING,
      actual_total: null,
      source: null,
      resolved_at: null,
      reason: null,
      asian_settlement: null,
    },
  });
}

export function resolveOfficialPrediction(prediction, {
  actualTotal = null,
  source,
  resolvedAt = new Date().toISOString(),
  notEvaluableReason = null,
} = {}) {
  if (!prediction?.prediction_id) throw new TypeError("official_prediction_required");
  if (prediction.resolution?.status !== OFFICIAL_PREDICTION_STATUS.PENDING) return prediction;

  let status;
  let asianSettlement = null;
  const actual = finiteNumber(actualTotal);
  if (notEvaluableReason) {
    status = OFFICIAL_PREDICTION_STATUS.NOT_EVALUABLE;
  } else if (actual === null) {
    throw new TypeError("actual_total_or_not_evaluable_reason_required");
  } else if (prediction.market_family === ASIAN_TOTAL_GOALS_FAMILY) {
    // Las líneas asiáticas de cuarto (X.25/X.75) pueden liquidar en
    // half_win/half_loss: un resultado parcial, no un acierto/fallo
    // completo. El umbral binario simple (actual > line) de las demás
    // familias las clasificaría mal. Se reutiliza la MISMA función de
    // liquidación ya usada en el ledger de apuestas (asianTotalGoals.js) y
    // se conserva el detalle explícito en resolution.asian_settlement en
    // vez de colapsarlo en silencio a hit/miss.
    asianSettlement = settleAsianTotalGoals({ totalGoals: actual, line: Number(prediction.line), direction: prediction.direction });
    status = asianSettlement.status === "not_evaluable" ? OFFICIAL_PREDICTION_STATUS.NOT_EVALUABLE
      : asianSettlement.status === "push" ? OFFICIAL_PREDICTION_STATUS.VOID
        : (asianSettlement.status === "full_win" || asianSettlement.status === "half_win") ? OFFICIAL_PREDICTION_STATUS.HIT
          : OFFICIAL_PREDICTION_STATUS.MISS;
  } else if (actual === Number(prediction.line)) {
    status = OFFICIAL_PREDICTION_STATUS.VOID;
  } else {
    const hit = prediction.direction === "over" ? actual > Number(prediction.line) : actual < Number(prediction.line);
    status = hit ? OFFICIAL_PREDICTION_STATUS.HIT : OFFICIAL_PREDICTION_STATUS.MISS;
  }

  return deepFreeze({
    ...prediction,
    resolution: {
      status,
      actual_total: actual,
      source: source || "manual_user_input",
      resolved_at: resolvedAt,
      reason: notEvaluableReason,
      asian_settlement: asianSettlement,
    },
  });
}

function accuracySummary(items) {
  const statusCount = (status) => items.filter((item) => item.resolution?.status === status).length;
  const hits = statusCount(OFFICIAL_PREDICTION_STATUS.HIT);
  const misses = statusCount(OFFICIAL_PREDICTION_STATUS.MISS);
  const evaluable = hits + misses;
  const pending = statusCount(OFFICIAL_PREDICTION_STATUS.PENDING);
  return {
    total: items.length,
    pending,
    resolved: items.length - pending,
    evaluated: evaluable,
    hits,
    misses,
    voids: statusCount(OFFICIAL_PREDICTION_STATUS.VOID),
    not_evaluable: statusCount(OFFICIAL_PREDICTION_STATUS.NOT_EVALUABLE),
    evaluable_decisions: evaluable,
    hit_rate: evaluable ? Number((hits / evaluable).toFixed(4)) : null,
  };
}

function groupBy(items, valueFor) {
  const groups = new Map();
  for (const item of items) {
    const key = String(valueFor(item) ?? "not_available");
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return Object.fromEntries([...groups].map(([key, groupItems]) => [key, accuracySummary(groupItems)]));
}

function scoreBucket(value) {
  const score = finiteNumber(value);
  if (score === null) return "not_available";
  if (score < 50) return "0-49";
  if (score < 60) return "50-59";
  if (score < 70) return "60-69";
  if (score < 80) return "70-79";
  return "80-100";
}

function liveMinuteBucket(item) {
  const minute = finiteNumber(item.live_context?.minute);
  if (minute === null) return "not_available";
  if (minute <= 30) return "1-30";
  if (minute <= 60) return "31-60";
  if (minute <= 75) return "61-75";
  return "76+";
}

export function calculateOfficialPredictionMetrics(predictions = [], filters = {}) {
  const items = predictions.filter((item) =>
    item?.contract === "OfficialPrediction" &&
    (!filters.ownerId || belongsToPersonalOwner(item, filters.ownerId)) &&
    (!filters.mode || item.mode === filters.mode)
  );
  return deepFreeze({
    contract: "OfficialPredictionMetrics",
    version: 1,
    source: "official_predictions_only",
    ...accuracySummary(items),
    by_market_family: groupBy(items, (item) => item.market_family),
    by_competition: groupBy(items, (item) => item.competition),
    by_confidence_bucket: groupBy(items, (item) => scoreBucket(item.confidence_score)),
    by_sports_score_bucket: groupBy(items, (item) => scoreBucket(item.sports_score)),
    by_period: groupBy(items, (item) => text(item.issued_at).slice(0, 7) || "not_available"),
    by_engine_version: groupBy(items, (item) => item.versions?.operational_engine),
    by_mode: groupBy(items, (item) => item.mode),
    by_live_minute_bucket: groupBy(items.filter((item) => item.mode === "live"), liveMinuteBucket),
  });
}

function calibrationLabel(predicted, observed) {
  if (predicted === null || observed === null) return "insufficient_data";
  const gap = predicted - observed;
  if (Math.abs(gap) <= 0.05) return "well_calibrated";
  return gap > 0 ? "overconfident" : "underconfident";
}

export function calculateOfficialPredictionCalibration(predictions = [], filters = {}) {
  const records = predictions
    .filter((item) => !filters.ownerId || belongsToPersonalOwner(item, filters.ownerId))
    .filter((item) => !filters.mode || item.mode === filters.mode)
    .filter((item) => [OFFICIAL_PREDICTION_STATUS.HIT, OFFICIAL_PREDICTION_STATUS.MISS].includes(item.resolution?.status))
    .map((item) => ({
      outcome: item.resolution.status,
      preliminary_probability: finiteNumber(item.estimated_probability),
      market_family: item.market_family,
      competition: item.competition,
      phase: item.mode,
    }));
  const base = calculateCalibration(records);
  const bands = base.bands.map((band) => {
    // Mismo criterio de exclusión que calculateCalibration/summary
    // (resultCalibration.js): sin esto, average_predicted_probability
    // quedaría calculado sobre un conjunto distinto (sin excluir Favorabilidad
    // Atlas) que el hit_rate/brier_score ya excluidos de `base`.
    const sourceBand = records.filter((item) => {
      const match = band.label.match(/(\d+).+?(\d+)/);
      if (!match || !Number.isFinite(item.preliminary_probability) || isSettlementFavorabilityCandidate(item)) return false;
      return item.preliminary_probability >= Number(match[1]) / 100 && item.preliminary_probability <= (Number(match[2]) + 0.999) / 100;
    });
    const average = sourceBand.length
      ? Number((sourceBand.reduce((sum, item) => sum + item.preliminary_probability, 0) / sourceBand.length).toFixed(4))
      : null;
    const gap = average === null || band.hit_rate === null ? null : Number((average - band.hit_rate).toFixed(4));
    return { ...band, average_predicted_probability: average, calibration_gap: gap, calibration_label: calibrationLabel(average, band.hit_rate) };
  });
  return deepFreeze({ ...base, source: "official_predictions_only", automatic_learning: false, bands });
}
