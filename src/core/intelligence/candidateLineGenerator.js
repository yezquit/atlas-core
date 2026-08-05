import { estimatePreliminaryMarketProbability } from "./preliminaryMarketModel.js";
import { contextShiftForMarket } from "./geminiImpactMapper.js";

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
function deviation(values, mean) { return values.length < 2 ? null : Math.sqrt(values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1)); }
function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * ratio;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return low === high ? sorted[low] : sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}
function round(value, decimals = 2) { return Number(Number(value).toFixed(decimals)); }

export function buildMarketDistribution(input = {}) {
  const family = input.marketFamily;
  const sources = SOURCE_DEFINITIONS.map(([name, weight, select]) => ({ name, weight, values: numeric(select(input, family)) })).filter((source) => source.values.length);
  if (!sources.length) return null;
  const weightTotal = sources.reduce((sum, source) => sum + source.weight, 0);
  const projectedMean = sources.reduce((sum, source) => sum + average(source.values) * (source.weight / weightTotal), 0);
  const pooled = sources.flatMap((source) => source.values);
  const pooledMedian = median(pooled);
  const pooledDeviation = deviation(pooled, average(pooled));
  const context = contextShiftForMarket(input.contextImpacts || [], family);
  const dispersion = Math.max(0.75, pooledDeviation || 0.75);
  const contextShift = context.standardized_shift * dispersion;
  return {
    methodology_version: `${CANDIDATE_LINE_GENERATOR_VERSION}:${METHODOLOGIES[family] || "unsupported"}`,
    market_family: family,
    projected_mean: round(projectedMean + contextShift),
    unadjusted_mean: round(projectedMean),
    median: round(pooledMedian + contextShift),
    dispersion: round(dispersion),
    percentile_10: round(percentile(pooled, 0.1) + contextShift),
    percentile_90: round(percentile(pooled, 0.9) + contextShift),
    context_adjustment: context,
    context_shift_events: round(contextShift, 3),
    input_sources: sources.map((source) => ({ source: source.name, sample_size: source.values.length, weight: round(source.weight / weightTotal, 3), mean: round(average(source.values)) })),
    pooled_sample_size: pooled.length,
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

export function isValidCandidateLine(marketFamily, line, distribution = null) {
  const numericLine = Number(line);
  if (!Number.isFinite(numericLine) || Math.abs((numericLine % 1) - 0.5) > 1e-9) return false;
  if (FIXED_LINE_CATALOGS[marketFamily]) return FIXED_LINE_CATALOGS[marketFamily].includes(numericLine);
  if (!["total_shots", "shots_on_goal"].includes(marketFamily) || !distribution) return false;
  const limit = Math.max(4, distribution.dispersion * 2.5);
  return Math.abs(numericLine - distribution.projected_mean) <= limit;
}

export function generateCandidateLines(input = {}) {
  const distribution = buildMarketDistribution(input);
  if (!distribution) return { market_family: input.marketFamily, distribution: null, candidates: [], reason: "insufficient_distribution_data" };
  const requestedLine = Number(input.exactLine);
  let lines = plausibleLines(distribution, input.marketFamily);
  if (Number.isFinite(requestedLine) && isValidCandidateLine(input.marketFamily, requestedLine, distribution)) lines = [...new Set([...lines, requestedLine])].sort((left, right) => left - right);
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
        allowLimitedReferee: true,
      });
      if (probability.probability_status !== "preliminary") continue;
      const point = probability.point_estimate;
      const contextualOnly = point >= 0.88 || point <= 0.12 || Math.abs(line - distribution.projected_mean) > distribution.dispersion * 2.25;
      candidates.push({
        contract: "MarketLineCandidate", version: 1, candidate_id: `${input.marketFamily}:${direction}:${line}`,
        market_family: input.marketFamily, direction, selection: direction === "over" ? `Over ${line}` : `Under ${line}`, line,
        projected_mean: distribution.projected_mean, median: distribution.median, dispersion: distribution.dispersion,
        observed_hit_rate: probability.inputs_used?.find((item) => item.source === "league")?.observed_rate ?? null,
        preliminary_probability: point, probability_status: probability.probability_status,
        uncertainty_low: probability.uncertainty_low, uncertainty_high: probability.uncertainty_high,
        sample_size_effective: probability.sample_size_effective, input_sources: probability.inputs_used || distribution.input_sources,
        limitations: [...new Set([...(distribution.limitations || []), ...(probability.limitations || [])])],
        methodology_version: distribution.methodology_version, context_adjustment: distribution.context_adjustment,
        contextual_only: contextualOnly, price_status: "unavailable",
      });
    }
  }
  return { market_family: input.marketFamily, distribution, candidates, reason: candidates.length ? null : "insufficient_compatible_samples" };
}

