export const OPERATIONAL_SCHEMA_VERSION = 1;
export const OPERATIONAL_ENGINE_VERSION = "atlas-operational-v1";

export const ODDS_VERIFICATION_STATUS = Object.freeze({
  VERIFIED_PROVIDER: "verified_provider",
  USER_REPORTED: "user_reported",
  STALE: "stale",
  UNAVAILABLE: "unavailable",
});

export const MARKET_SUITABILITY = Object.freeze({
  BLOCKED: "blocked",
  NOT_VIABLE: "not_viable",
  INSUFFICIENT_DATA: "insufficient_data",
  REVIEW_ONLY: "review_only",
  VIABLE_WITH_CAUTION: "viable_with_caution",
  SUITABLE_UNDER_CONDITIONS: "suitable_under_conditions",
});

export const PRICE_EVALUATION_STATUS = Object.freeze({
  FAVORABLE_PRELIMINARY: "favorable_preliminary",
  MARGINAL: "marginal",
  UNFAVORABLE: "unfavorable",
  UNAVAILABLE: "unavailable",
  STALE: "stale",
});

export const PARLAY_OPERATIONAL_STATUS = Object.freeze({
  UNSUPPORTED: "unsupported",
  INSUFFICIENT_CANDIDATES: "insufficient_candidates",
  BLOCKED: "blocked",
  REVIEW_ONLY: "review_only",
  ALLOWED_WITH_CAUTION: "allowed_with_caution",
});

export const ANALYSIS_PHASES = Object.freeze([
  "early_review",
  "day_before",
  "hours_before",
  "three_hours_before",
  "one_hour_before",
  "thirty_minutes_before",
  "final_pre_match",
  "pre_match_closed",
]);

export const CONTEXT_STATUS = Object.freeze({
  CONFIRMED: "confirmed",
  PROBABLE: "probable",
  NO_REPORTS: "no_reports",
  ENDPOINT_UNAVAILABLE: "endpoint_unavailable",
  DATA_UNAVAILABLE: "data_unavailable",
  VERIFIED_ABSENCE: "verified_absence",
  USER_REPORTED: "user_reported",
  STALE: "stale",
});

export const GEMINI_ITEM_KIND = Object.freeze({
  CONFIRMED: "confirmed",
  PROBABLE: "probable",
  RUMOR: "rumor",
  CONTRADICTION: "contradiction",
  NOT_FOUND: "not_found",
});

export const SOURCE_CLASSIFICATION = Object.freeze({
  OFFICIAL_COMPETITION: "official_competition",
  OFFICIAL_CLUB: "official_club",
  FEDERATION: "federation",
  RECOGNIZED_MEDIA: "recognized_media",
  JOURNALIST: "journalist",
  AGGREGATOR: "aggregator",
  UNKNOWN: "unknown",
});

export const LINE_ORIGIN = Object.freeze({
  ATLAS_SELECTED: "atlas_selected",
  USER_SELECTED: "user_selected",
  PROVIDER_QUOTE: "provider_quote",
  TRANSFERRED_CANDIDATE: "transferred_candidate",
});

export function confidenceLabel(score) {
  if (score >= 93) return "excepcional";
  if (score >= 85) return "muy_alta";
  if (score >= 75) return "alta";
  if (score >= 60) return "moderada";
  if (score >= 40) return "limitada";
  return "baja";
}

export function phaseForKickoff(kickoff, analyzedAt = new Date().toISOString()) {
  const distance = Math.round((Date.parse(kickoff) - Date.parse(analyzedAt)) / 60_000);
  if (!Number.isFinite(distance)) {
    return { phase: "early_review", kickoffDistanceMinutes: null };
  }
  if (distance <= 0) return { phase: "pre_match_closed", kickoffDistanceMinutes: distance };
  if (distance > 1_080) return { phase: "day_before", kickoffDistanceMinutes: distance };
  if (distance > 360) return { phase: "hours_before", kickoffDistanceMinutes: distance };
  if (distance > 120) return { phase: "three_hours_before", kickoffDistanceMinutes: distance };
  if (distance > 45) return { phase: "one_hour_before", kickoffDistanceMinutes: distance };
  if (distance > 15) return { phase: "thirty_minutes_before", kickoffDistanceMinutes: distance };
  return { phase: "final_pre_match", kickoffDistanceMinutes: distance };
}

export function createOperationalAnalysisVersion(input = {}) {
  if (!input.analysisId || !input.fixtureId || !input.createdAt) {
    throw new TypeError("La versión requiere analysisId, fixtureId y createdAt.");
  }
  if (!ANALYSIS_PHASES.includes(input.phase)) {
    throw new TypeError(`Fase temporal inválida: ${input.phase}`);
  }
  return Object.freeze({
    contract: "OperationalAnalysisVersion",
    schema_version: OPERATIONAL_SCHEMA_VERSION,
    analysis_id: String(input.analysisId),
    fixture_id: Number(input.fixtureId),
    created_at: input.createdAt,
    kickoff_distance_minutes: input.kickoffDistanceMinutes ?? null,
    phase: input.phase,
    inputs: input.inputs || {},
    evidence: input.evidence || [],
    odds: input.odds || [],
    active_quote: input.activeQuote || null,
    line_origin: Object.values(LINE_ORIGIN).includes(input.lineOrigin) ? input.lineOrigin : null,
    gemini_context: input.geminiContext || null,
    analysis_confidence: input.analysisConfidence || null,
    preliminary_probability: input.preliminaryProbability || null,
    parlay_candidate: input.parlayCandidate || null,
    director: input.director || null,
    parlay: input.parlay || null,
    engine_version: input.engineVersion || OPERATIONAL_ENGINE_VERSION,
    finalized: true,
  });
}
