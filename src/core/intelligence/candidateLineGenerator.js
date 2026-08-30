import { estimatePreliminaryMarketProbability } from "./preliminaryMarketModel.js";
import { contextShiftForMarket } from "./geminiImpactMapper.js";
import { buildCanonicalObservations } from "./canonicalObservations.js";
import { buildMarketComponents } from "./marketComponentAdapter.js";
import {
  ESTIMATED_PROBABILITY_REPRESENTS,
  classifyProbability,
  isCalibratedModel,
  toProbabilityPercent,
} from "./probabilityClassification.js";

export const CANDIDATE_LINE_GENERATOR_VERSION = "candidate-lines-v1";

export const FIXED_LINE_CATALOGS = Object.freeze({
  goals: Object.freeze([0.5, 1.5, 2.5, 3.5, 4.5, 5.5]),
  corners: Object.freeze([5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5]),
  cards: Object.freeze([1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5]),
});

const SOURCE_DEFINITIONS = Object.freeze([
  ["league", 0.25, (input, family) => input.leagueProfile?.event_samples?.[family]?.match_totals || []],
  ["home_last_5", 0.1, (input, family) => input.homeTeamProfile?.last_5?.event_samples?.[family]?.match_totals || []],
  ["home_last_10", 0.1, (input, family) => input.homeTeamProfile?.last_10?.event_samples?.[family]?.match_totals || []],
  ["away_last_5", 0.1, (input, family) => input.awayTeamProfile?.last_5?.event_samples?.[family]?.match_totals || []],
  ["away_last_10", 0.1, (input, family) => input.awayTeamProfile?.last_10?.event_samples?.[family]?.match_totals || []],
  ["home_role", 0.175, (input, family) => input.homeTeamProfile?.as_home?.event_samples?.[family]?.match_totals || []],
  ["away_role", 0.175, (input, family) => input.awayTeamProfile?.as_away?.event_samples?.[family]?.match_totals || []],
]);

const METHODOLOGIES = Object.freeze({
  goals: "empirical_discrete_goals_with_league_shrinkage",
  corners: "empirical_set_piece_volume_with_league_shrinkage",
  cards: "empirical_discipline_volume_with_optional_referee_limit",
  total_shots: "empirical_shot_volume_dynamic_half_lines",
  shots_on_goal: "empirical_accuracy_volume_dynamic_half_lines",
});

function numeric(values = []) { return values.map(Number).filter(Number.isFinite); }
function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * ratio;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return low === high ? sorted[low] : sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}
function round(value, decimals = 2) { return Number(Number(value).toFixed(decimals)); }

function sampleAudit(profile, role, family, measure) {
  const values = numeric(profile?.[role]?.event_samples?.[family]?.[measure] || []);
  return {
    sample_size: values.length,
    value: values.length ? round(average(values)) : null,
  };
}

function buildCountMarketAudit({ input, distribution, probability, line, direction }) {
  const family = input.marketFamily;
  const league = distribution.input_sources?.find((source) => source.source === "league") || null;
  const sourceSizes = probability.inputs_used?.map((source) => ({
    source: source.source,
    weight: source.weight,
    sample_size: source.sample_size,
  })) || [];
  const components = buildMarketComponents({ marketFamily: family, homeTeamProfile: input.homeTeamProfile, awayTeamProfile: input.awayTeamProfile });
  const center_delta = Number.isFinite(components?.component_total) ? distribution.projected_mean - components.component_total : null;
  const coherence_ratio = Number.isFinite(center_delta) ? Math.abs(center_delta) / Math.max(0.75, distribution.dispersion) : null;
  return {
    contract: "CountMarketAudit",
    version: 1,
    market_family: family,
    fixture_id: input.fixtureId ?? input.fixture_id ?? null,
    requested_line: Number.isFinite(Number(line)) ? Number(line) : null,
    direction: direction || null,
    // These are paired signals for each attacking side. They are displayed
    // separately and are never added as a total-match projection.
    home_for: sampleAudit(input.homeTeamProfile, "as_home", family, "for"),
    away_against: sampleAudit(input.awayTeamProfile, "as_away", family, "conceded"),
    away_for: sampleAudit(input.awayTeamProfile, "as_away", family, "for"),
    home_against: sampleAudit(input.homeTeamProfile, "as_home", family, "conceded"),
    league_baseline: league ? { sample_size: league.sample_size, value: league.mean } : null,
    recent_home_sample_size: probability.inputs_used?.find((source) => source.source === "home_last_10")?.sample_size ?? null,
    recent_away_sample_size: probability.inputs_used?.find((source) => source.source === "away_last_10")?.sample_size ?? null,
    effective_sample_size: probability.sample_size_effective,
    expected_home_component: components?.home_component?.expected ?? null,
    expected_away_component: components?.away_component?.expected ?? null,
    expected_total: components?.component_total ?? null,
    distribution_center: distribution.projected_mean ?? null,
    center_delta, coherence_ratio, model_coherence_warning: coherence_ratio !== null && coherence_ratio > 1,
    requested_threshold_probability: probability.point_estimate,
    source_weights: sourceSizes,
    source_audit: distribution.canonical_observations?.sources || [],
    canonical_fixture_ids: distribution.canonical_observations?.fixture_ids || [],
    components,
  };
}

export function buildMarketDistribution(input = {}) {
  const family = input.marketFamily;
  const canonical = input.canonicalObservations || buildCanonicalObservations(input);
  if (!canonical.observations.length) return null;
  const projectedMean = canonical.distribution_center;
  const pooled = canonical.observations.map((item) => item.value);
  const pooledMedian = median(pooled);
  const context = contextShiftForMarket(input.contextImpacts || [], family);
  const dispersion = Math.max(0.75, canonical.distribution_dispersion || 0.75);
  const contextShift = context.standardized_shift * dispersion;
  return {
    methodology_version: `${CANDIDATE_LINE_GENERATOR_VERSION}:${METHODOLOGIES[family] || "unsupported"}`,
    market_family: family,
    projected_mean: round(projectedMean + contextShift),
    unadjusted_mean: round(projectedMean), canonical_observations: canonical,
    median: round(pooledMedian + contextShift),
    dispersion: round(dispersion),
    percentile_10: round(percentile(pooled, 0.1) + contextShift),
    percentile_90: round(percentile(pooled, 0.9) + contextShift),
    context_adjustment: context,
    context_shift_events: round(contextShift, 3),
    input_sources: canonical.sources.map((source) => ({
      source: source.name,
      sample_size: source.raw_sample_size,
      weight: round(source.effective_weight, 3),
      mean: round(source.raw_center),
      raw_fixture_ids: source.raw_fixture_ids,
      unique_fixture_count: source.unique_fixture_count,
      requested_weight: source.requested_weight,
      effective_weight: source.effective_weight,
      weighted_contribution: source.weighted_contribution,
    })),
    pooled_sample_size: canonical.observations.length,
    limitations: [
      "Distribución empírica preliminar; no representa un modelo deportivo validado.",
      "Las submuestras solapadas se ponderan y no se interpretan como observaciones independientes.",
      ...(context.applied_impacts.length ? ["El contexto manual está limitado por procedencia y magnitud acumulada."] : []),
    ],
  };
}

function dynamicHalfLines(distribution, family) {
  const minimum = family === "shots_on_goal" ? 1.5 : 5.5;
  const maximum = family === "shots_on_goal" ? 24.5 : 60.5;
  const center = Math.floor(distribution.projected_mean) + 0.5;
  const radius = Math.max(3, Math.min(6, Math.ceil(distribution.dispersion)));
  const values = [];
  for (let offset = -radius; offset <= radius; offset += 1) {
    const line = center + offset;
    if (line >= minimum && line <= maximum) values.push(line);
  }
  return values;
}

function plausibleLines(distribution, marketFamily) {
  const catalog = FIXED_LINE_CATALOGS[marketFamily] || dynamicHalfLines(distribution, marketFamily);
  const lower = Math.max(0, distribution.percentile_10 - Math.max(1, distribution.dispersion * 0.75));
  const upper = distribution.percentile_90 + Math.max(1, distribution.dispersion * 0.75);
  const plausible = catalog.filter((line) => line >= lower && line <= upper);
  if (plausible.length >= 3) return plausible;
  return [...catalog].sort((left, right) => Math.abs(left - distribution.projected_mean) - Math.abs(right - distribution.projected_mean)).slice(0, Math.min(5, catalog.length)).sort((left, right) => left - right);
}

export function isValidCandidateLine(marketFamily, line, distribution = null, { manualExact = false } = {}) {
  const numericLine = Number(line);
  if (!Number.isFinite(numericLine) || Math.abs((numericLine % 1) - 0.5) > 1e-9) return false;
  if (!manualExact && FIXED_LINE_CATALOGS[marketFamily]) return FIXED_LINE_CATALOGS[marketFamily].includes(numericLine);
  // The catalogue determines which lines Atlas presents proactively. A manual
  // half-line is evaluated by the same empirical model, never by a neighbour.
  if (!METHODOLOGIES[marketFamily] || !distribution) return false;
  if (manualExact) return numericLine >= 0.5;
  if (!["total_shots", "shots_on_goal"].includes(marketFamily)) return false;
  const allowedDistance = Math.max(4, Number(distribution.dispersion || 0) * 2.5);
  return Math.abs(numericLine - Number(distribution.projected_mean)) <= allowedDistance;
}

export function generateCandidateLines(input = {}) {
  const distribution = buildMarketDistribution(input);
  if (!distribution) return { market_family: input.marketFamily, distribution: null, candidates: [], reason: "insufficient_distribution_data" };
  const requestedLine = Number(input.exactLine);
  let lines = plausibleLines(distribution, input.marketFamily);
  if (Number.isFinite(requestedLine) && isValidCandidateLine(input.marketFamily, requestedLine, distribution, { manualExact: true })) lines = [...new Set([...lines, requestedLine])].sort((left, right) => left - right);
  const candidates = [];
  for (const line of lines) {
    for (const direction of ["over", "under"]) {
      const probability = estimatePreliminaryMarketProbability({
        marketFamily: input.marketFamily,
        selection: `${direction} ${line}`,
        line,
        leagueProfile: input.leagueProfile,
        homeTeamProfile: input.homeTeamProfile,
        awayTeamProfile: input.awayTeamProfile,
        refereeProfile: input.refereeProfile,
        contextItems: input.contextItems || [],
        contextShift: distribution.context_shift_events,
        canonicalObservations: distribution.canonical_observations,
        allowLimitedReferee: true,
      });
      if (probability.probability_status !== "preliminary") continue;
      candidates.push(buildMarketLineCandidate({ input, distribution, line, direction, probability }));
    }
  }
  return { market_family: input.marketFamily, distribution, candidates, reason: candidates.length ? null : "insufficient_compatible_samples" };
}

export function evaluateExactMarketLine({ marketFamily, direction, line, ...context } = {}) {
  const normalizedDirection = String(direction || "").trim().toLowerCase();
  const standardCanonical = buildCanonicalObservations({ ...context, marketFamily });
  const standardSources = new Set(standardCanonical.sources.map((source) => source.name));
  const standardCoverageComplete = standardSources.has("league") &&
    [...standardSources].some((name) => name.startsWith("home_")) &&
    [...standardSources].some((name) => name.startsWith("away_"));
  const useSpecificLimitedSample = Boolean(context.allowSpecificLimitedSample && !standardCoverageComplete);
  const canonicalObservations = useSpecificLimitedSample
    ? buildCanonicalObservations({ ...context, marketFamily }, { allowSubthresholdSources: true })
    : standardCanonical;
  const distribution = buildMarketDistribution({ ...context, marketFamily, canonicalObservations });
  if (!distribution || !isValidCandidateLine(marketFamily, line, distribution, { manualExact: true })) {
    const result = { reason: distribution ? "unsupported_exact_line" : "insufficient_distribution_data" };
    return {
      contract: "ExactMarketLineEvaluation", version: 1, status: "unavailable", exact_selection_ready: false,
      candidate: null, reason: exactLineUnavailableReason({ marketFamily, result, ...context }),
    };
  }
  if (!['over', 'under'].includes(normalizedDirection)) {
    return { contract: "ExactMarketLineEvaluation", version: 1, status: "unavailable", exact_selection_ready: false, candidate: null, reason: "invalid_direction" };
  }
  // Exact manual lines deliberately bypass the presentation catalogue. The
  // estimator compares this requested threshold against raw match totals.
  const probability = estimatePreliminaryMarketProbability({
    marketFamily,
    selection: `${normalizedDirection} ${line}`,
    line,
    leagueProfile: context.leagueProfile,
    homeTeamProfile: context.homeTeamProfile,
    awayTeamProfile: context.awayTeamProfile,
    refereeProfile: context.refereeProfile,
    contextItems: context.contextItems || [],
    contextShift: distribution.context_shift_events,
    canonicalObservations: distribution.canonical_observations,
    allowLimitedReferee: true,
    allowSpecificLimitedSample: useSpecificLimitedSample,
  });
  const candidate = probability.probability_status === "preliminary"
    ? buildMarketLineCandidate({ input: { ...context, marketFamily }, distribution, line: Number(line), direction: normalizedDirection, probability })
    : null;
  if (candidate) {
    const canonical = probability.canonical_threshold_distribution;
    const difference = Math.abs((canonical?.over_probability ?? 0) - (canonical?.under_probability ?? 0));
    candidate.side_comparison = {
      contract: "ThresholdSideComparison",
      version: 1,
      market_family: marketFamily,
      line: Number(line),
      canonical: true,
      over_probability: canonical?.over_probability ?? null,
      under_probability: canonical?.under_probability ?? null,
      complementary_sum: canonical ? Number((canonical.over_probability + canonical.under_probability).toFixed(4)) : null,
      preferred_direction: difference < 0.02 ? null : canonical.over_probability > canonical.under_probability ? "over" : "under",
      sports_preferred_side: difference < 0.02 ? "neutral" : canonical.over_probability > canonical.under_probability ? "over" : "under",
      message: difference < 0.02 ? "Sin ventaja deportiva clara entre ambos lados." : `Lado deportivo preferido: ${canonical.over_probability > canonical.under_probability ? "Over" : "Under"} ${line}.`,
      enforce_preference: true,
    };
  }
  const lacksUnderlyingSamples = (probability.limitations || []).some((item) =>
    String(item).includes("Faltan observaciones subyacentes")
  );
  const result = { reason: candidate ? null : lacksUnderlyingSamples ? "insufficient_distribution_data" : "insufficient_underlying_market_data" };
  return {
    contract: "ExactMarketLineEvaluation",
    version: 1,
    status: candidate ? "ready_for_pricing" : "unavailable",
    exact_selection_ready: Boolean(candidate),
    candidate,
    reason: candidate ? null : exactLineUnavailableReason({ marketFamily, result, ...context }),
  };
}

function buildMarketLineCandidate({ input, distribution, line, direction, probability }) {
  const point = probability.point_estimate;
  const contextualOnly = point >= 0.88 || point <= 0.12 || Math.abs(line - distribution.projected_mean) > distribution.dispersion * 2.25;
  const marketModelAudit = buildCountMarketAudit({ input, distribution, probability, line, direction });
  return {
    contract: "MarketLineCandidate", version: 1, candidate_id: `${input.marketFamily}:${direction}:${line}`,
    market_family: input.marketFamily, direction, selection: direction === "over" ? `Over ${line}` : `Under ${line}`, line,
    projected_mean: distribution.projected_mean, median: distribution.median, dispersion: distribution.dispersion,
    observed_hit_rate: probability.inputs_used?.find((item) => item.source === "league")?.observed_rate ?? null,
    preliminary_probability: point, probability_status: probability.probability_status,
    estimated_probability: point,
    probability_percent: toProbabilityPercent(point),
    probability_classification: classifyProbability(point),
    estimated_probability_represents: ESTIMATED_PROBABILITY_REPRESENTS,
    estimated_probability_is_calibrated: isCalibratedModel(probability.model_validation_status),
    model_validation_status: probability.model_validation_status,
    uncertainty_low: probability.uncertainty_low, uncertainty_high: probability.uncertainty_high,
    sample_size_effective: probability.sample_size_effective, input_sources: probability.inputs_used || distribution.input_sources,
    limitations: [...new Set([...(distribution.limitations || []), ...(probability.limitations || [])])],
    methodology_version: distribution.methodology_version, context_adjustment: distribution.context_adjustment,
    market_model_audit: marketModelAudit,
    model_coherence_warning: marketModelAudit.model_coherence_warning,
    contextual_only: contextualOnly, price_status: "unavailable",
  };
}

function profileHasMarketSample(profile, marketFamily) {
  return ["last_5", "last_10", "as_home", "as_away", "general"]
    .some((scope) => numeric(profile?.[scope]?.event_samples?.[marketFamily]?.match_totals || []).length > 0);
}

export function exactLineUnavailableReason({ marketFamily, result, leagueProfile, homeTeamProfile, awayTeamProfile } = {}) {
  if (result?.reason !== "insufficient_distribution_data") return result?.reason || "insufficient_compatible_samples";
  if (!profileHasMarketSample(homeTeamProfile, marketFamily)) return `missing_home_${marketFamily}_sample`;
  if (!profileHasMarketSample(awayTeamProfile, marketFamily)) return `missing_away_${marketFamily}_sample`;
  if (!numeric(leagueProfile?.event_samples?.[marketFamily]?.match_totals || []).length) return `missing_league_${marketFamily}_sample`;
  return "distribution_unavailable";
}
