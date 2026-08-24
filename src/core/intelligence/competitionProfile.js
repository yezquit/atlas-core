import { PERSONAL_OWNER_ID, belongsToPersonalOwner } from "../auth/personalIdentity.js";

export const COMPETITION_PROFILE_VERSION = "competition-profile-v1";
export const DEFAULT_COMPETITION_PROFILE_MINIMUM = 30;

const EVALUATED = new Set(["hit", "miss"]);

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value) {
  return String(value ?? "").trim() || null;
}

function identityFrom(value = {}) {
  return {
    competition_id: finite(value.competition_id ?? value.competitionId),
    competition_key: text(value.competition_key ?? value.competitionKey),
    competition: text(value.competition ?? value.competition_name ?? value.competitionName),
    season: finite(value.season ?? value.source_metadata?.season),
  };
}

function sameIdentity(prediction, identity) {
  const candidate = identityFrom(prediction);
  if (identity.competition_id !== null && candidate.competition_id !== identity.competition_id) return false;
  if (identity.competition_key && candidate.competition_key !== identity.competition_key) return false;
  if (identity.competition && candidate.competition !== identity.competition) return false;
  if (identity.season !== null && candidate.season !== identity.season) return false;
  return true;
}

function sampleStatus(count, minimum) {
  return count >= minimum ? "sufficient_sample" : "insufficient_sample";
}

function metricsFor(predictions, minimum) {
  const evaluated = predictions.filter((item) => EVALUATED.has(item.resolution?.status));
  const hits = evaluated.filter((item) => item.resolution.status === "hit").length;
  const misses = evaluated.filter((item) => item.resolution.status === "miss").length;
  const probabilityItems = evaluated.map((item) => ({
    probability: finite(item.estimated_probability),
    outcome: item.resolution.status === "hit" ? 1 : 0,
  })).filter((item) => item.probability !== null && item.probability >= 0 && item.probability <= 1);
  const sportsScores = evaluated.map((item) => finite(item.sports_score)).filter((item) => item !== null);
  const hitRate = evaluated.length ? hits / evaluated.length : null;
  const brier = probabilityItems.length
    ? probabilityItems.reduce((sum, item) => sum + (item.probability - item.outcome) ** 2, 0) / probabilityItems.length
    : null;
  return {
    evaluated_count: evaluated.length,
    hits,
    misses,
    hit_rate: hitRate === null ? null : Number(hitRate.toFixed(6)),
    brier_score: brier === null ? null : Number(brier.toFixed(6)),
    brier_evaluated_count: probabilityItems.length,
    average_sports_score: sportsScores.length ? Number((sportsScores.reduce((sum, value) => sum + value, 0) / sportsScores.length).toFixed(2)) : null,
    calibration_status: sampleStatus(evaluated.length, minimum),
    sample_status: sampleStatus(evaluated.length, minimum),
  };
}

export function createNeutralCompetitionProfile(identity = {}, {
  ownerId = PERSONAL_OWNER_ID,
  minimumEvaluated = DEFAULT_COMPETITION_PROFILE_MINIMUM,
  updatedAt = null,
} = {}) {
  const normalizedIdentity = identityFrom(identity);
  return {
    contract: "CompetitionProfile",
    profile_version: COMPETITION_PROFILE_VERSION,
    owner_id: ownerId,
    ...normalizedIdentity,
    status: "neutral",
    sample_requirements: { minimum_evaluated: minimumEvaluated },
    market_reliability: {},
    market_calibration: {},
    data_quality: { prediction_count: 0, evaluated_count: 0, excluded_count: 0 },
    observed_performance: metricsFor([], minimumEvaluated),
    supported_adjustments: [],
    updated_at: updatedAt,
    source: "official_predictions_resolved",
    automatic_learning: false,
    affects_sports_score: false,
    affects_preliminary_probability: false,
  };
}

export function deriveCompetitionProfile(predictions = [], identity = {}, {
  ownerId = PERSONAL_OWNER_ID,
  minimumEvaluated = DEFAULT_COMPETITION_PROFILE_MINIMUM,
  updatedAt = null,
} = {}) {
  const normalizedIdentity = identityFrom(identity);
  const owned = predictions.filter((item) => belongsToPersonalOwner(item, ownerId));
  const scoped = owned.filter((item) => sameIdentity(item, normalizedIdentity));
  const families = new Map();
  for (const prediction of scoped) {
    const family = text(prediction.market_family) || "unknown";
    if (!families.has(family)) families.set(family, []);
    families.get(family).push(prediction);
  }
  const reliability = Object.fromEntries([...families].map(([family, items]) => [family, metricsFor(items, minimumEvaluated)]));
  const observed = metricsFor(scoped, minimumEvaluated);
  return {
    ...createNeutralCompetitionProfile(normalizedIdentity, { ownerId, minimumEvaluated, updatedAt }),
    status: sampleStatus(observed.evaluated_count, minimumEvaluated),
    market_reliability: reliability,
    market_calibration: Object.fromEntries(Object.entries(reliability).map(([family, metrics]) => [family, {
      brier_score: metrics.brier_score,
      brier_evaluated_count: metrics.brier_evaluated_count,
      calibration_status: metrics.calibration_status,
    }])),
    data_quality: {
      prediction_count: scoped.length,
      evaluated_count: observed.evaluated_count,
      excluded_count: scoped.length - observed.evaluated_count,
    },
    observed_performance: observed,
  };
}

export function deriveCompetitionProfiles(predictions = [], options = {}) {
  const ownerId = options.ownerId || PERSONAL_OWNER_ID;
  const groups = new Map();
  for (const prediction of predictions.filter((item) => belongsToPersonalOwner(item, ownerId))) {
    const identity = identityFrom(prediction);
    const key = [identity.competition_id, identity.competition_key, identity.competition, identity.season].join("|");
    if (!groups.has(key)) groups.set(key, { identity, predictions: [] });
    groups.get(key).predictions.push(prediction);
  }
  return [...groups.values()].map((group) => deriveCompetitionProfile(group.predictions, group.identity, options));
}

export function findCompetitionProfile(profiles = [], candidate = {}) {
  const identity = identityFrom(candidate);
  return profiles.find((profile) => profile.owner_id === (candidate.owner_id || PERSONAL_OWNER_ID) && sameIdentity(profile, identity)) || null;
}

export function buildCompetitionProfileContext(profile) {
  if (!profile) return null;
  const sufficient = Object.entries(profile.market_reliability || {}).filter(([, metrics]) => metrics.sample_status === "sufficient_sample");
  const insufficient = Object.entries(profile.market_reliability || {}).filter(([, metrics]) => metrics.sample_status !== "sufficient_sample");
  const metricLines = Object.entries(profile.market_reliability || {}).map(([family, metrics]) =>
    `${family}: muestra evaluada ${metrics.evaluated_count}; aciertos ${metrics.hits}; fallos ${metrics.misses}; tasa de acierto ${metrics.hit_rate ?? "no disponible"}; Brier ${metrics.brier_score ?? "no disponible"}.`
  );
  return [
    "COMPETICIÓN",
    `${profile.competition || profile.competition_key || profile.competition_id || "No identificada"} · temporada ${profile.season ?? "no disponible"}`,
    "PERFIL ATLAS",
    `${profile.status}. Contexto observacional; no modifica puntuaciones ni probabilidades.`,
    "MUESTRA",
    `Evaluadas ${profile.observed_performance?.evaluated_count ?? 0}; mínimo ${profile.sample_requirements?.minimum_evaluated ?? DEFAULT_COMPETITION_PROFILE_MINIMUM}.`,
    "MERCADOS CON CALIBRACIÓN SUFICIENTE",
    sufficient.map(([family]) => family).join(", ") || "Ninguno.",
    "MERCADOS CON MUESTRA INSUFICIENTE",
    insufficient.map(([family]) => family).join(", ") || "Ninguno.",
    ...metricLines,
  ].join("\n");
}
