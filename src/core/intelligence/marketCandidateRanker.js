import { generateCandidateLines } from "./candidateLineGenerator.js";
import {
  ESTIMATED_PROBABILITY_REPRESENTS,
  classifyProbability,
  isCalibratedModel,
  isValidProbability,
  toProbabilityPercent,
} from "./probabilityClassification.js";

export const MARKET_CANDIDATE_RANKER_VERSION = "market-candidate-ranker-v1";
export const PRICE_STATUS = Object.freeze({ VERIFIED_CURRENT: "verified_current", USER_REPORTED_CURRENT: "user_reported_current", STALE: "stale", UNAVAILABLE: "unavailable", INCOMPATIBLE_LINE: "incompatible_line", INCOMPATIBLE_SELECTION: "incompatible_selection" });
export const OVERALL_STATUS = Object.freeze({ SUITABLE: "suitable_for_consideration", CAUTION: "viable_with_caution", SPORTS_PENDING_PRICE: "sports_candidate_pending_price", REVIEW_ONLY: "review_only", NOT_VIABLE: "not_viable", BLOCKED: "blocked", INSUFFICIENT: "insufficient_information" });

function clamp(value, minimum = 0, maximum = 100) { return Math.max(minimum, Math.min(maximum, value)); }
function round(value, decimals = 1) { return Number(Number(value).toFixed(decimals)); }
function average(values = []) {
  const numeric = values.map(Number).filter(Number.isFinite);
  return numeric.length ? round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length) : null;
}
function normalizedDirection(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (/^(over|mas de|más de)\b/.test(normalized)) return "over";
  if (/^(under|menos de)\b/.test(normalized)) return "under";
  return null;
}

function priceStatusForQuote(quote) {
  if (quote?.freshness === "stale" || quote?.verification_status === "stale" || quote?.stale) return PRICE_STATUS.STALE;
  if (quote?.verification_status === "verified_provider") return PRICE_STATUS.VERIFIED_CURRENT;
  return PRICE_STATUS.USER_REPORTED_CURRENT;
}

function quotePriority(quote) {
  return {
    [PRICE_STATUS.VERIFIED_CURRENT]: 3,
    [PRICE_STATUS.USER_REPORTED_CURRENT]: 2,
    [PRICE_STATUS.STALE]: 1,
  }[priceStatusForQuote(quote)] || 0;
}

function isExactQuote(candidate, quote) {
  return quote?.market_family === candidate.market_family &&
    normalizedDirection(quote.direction || quote.selection) === candidate.direction &&
    Number(quote.line) === Number(candidate.line);
}

export function selectCandidateQuote(candidate, quotes = [], preferredQuote = null) {
  const sameMarket = quotes.filter((quote) => quote.market_family === candidate.market_family);
  if (!sameMarket.length) return { quote: null, status: PRICE_STATUS.UNAVAILABLE };
  const sameDirection = sameMarket.filter((quote) => normalizedDirection(quote.direction || quote.selection) === candidate.direction);
  if (!sameDirection.length) return { quote: null, status: PRICE_STATUS.INCOMPATIBLE_SELECTION };
  const exact = sameDirection.filter((quote) => Number(quote.line) === Number(candidate.line));
  if (!exact.length) return { quote: null, status: PRICE_STATUS.INCOMPATIBLE_LINE };
  const explicit = preferredQuote && isExactQuote(candidate, preferredQuote) ? preferredQuote : null;
  const quote = explicit || [...exact].sort((left, right) =>
    quotePriority(right) - quotePriority(left) || Number(right.decimal_odds) - Number(left.decimal_odds)
  )[0];
  return { quote, status: priceStatusForQuote(quote) };
}

function deriveEstimatedProbability(candidate) {
  if (candidate?.probability_status && candidate.probability_status !== "preliminary") return null;
  if (candidate?.estimated_probability !== undefined) {
    return isValidProbability(candidate.estimated_probability) ? candidate.estimated_probability : null;
  }
  return isValidProbability(candidate?.preliminary_probability) ? candidate.preliminary_probability : null;
}

export function calculateSportsScore(candidate, { marketAssessment = null, confidenceScore = null } = {}) {
  if (candidate?.probability_status !== "preliminary") return 0;
  const probability = Number(candidate.preliminary_probability);
  const intervalWidth = Math.max(0, Number(candidate.uncertainty_high) - Number(candidate.uncertainty_low));
  const probabilityBalance = clamp(100 - Math.abs(probability - 0.68) * 180);
  const uncertainty = clamp(100 - intervalWidth * 125);
  const effectiveSample = clamp((Number(candidate.sample_size_effective) / 20) * 100);
  const coverage = clamp(Number(marketAssessment?.technical_support_score ?? 70));
  const confidence = clamp(Number(confidenceScore ?? coverage));
  const lineStability = calculateLineStabilityScore(candidate);
  const sensitivity = clamp(100 - (candidate.limitations?.length || 0) * 3 - (candidate.context_adjustment?.changed_distribution ? 8 : 0));
  return round(probabilityBalance * 0.3 + uncertainty * 0.2 + effectiveSample * 0.15 + coverage * 0.15 + confidence * 0.05 + lineStability * 0.1 + sensitivity * 0.05);
}

export function calculateLineStabilityScore(candidate = {}) {
  const distance = Math.abs(Number(candidate.line) - Number(candidate.projected_mean)) / Math.max(0.75, Number(candidate.dispersion) || 0.75);
  return round(clamp(100 - distance * 18 - (candidate.contextual_only ? 28 : 0)));
}

function overallStatus(candidate, priceStatus, blocked) {
  if (blocked) return OVERALL_STATUS.BLOCKED;
  if (!candidate || candidate.probability_status !== "preliminary") return OVERALL_STATUS.INSUFFICIENT;
  if (candidate.sports_score < 45) return OVERALL_STATUS.NOT_VIABLE;
  if ([PRICE_STATUS.UNAVAILABLE, PRICE_STATUS.STALE, PRICE_STATUS.INCOMPATIBLE_LINE, PRICE_STATUS.INCOMPATIBLE_SELECTION].includes(priceStatus)) return candidate.sports_score >= 58 ? OVERALL_STATUS.SPORTS_PENDING_PRICE : OVERALL_STATUS.REVIEW_ONLY;
  if (priceStatus === PRICE_STATUS.USER_REPORTED_CURRENT || candidate.sports_score < 70) return OVERALL_STATUS.CAUTION;
  return OVERALL_STATUS.SUITABLE;
}

function rankReason(candidate) {
  return [
    `Equilibrio deportivo ${candidate.sports_score}/100 sin usar la cuota.`,
    `Probabilidad preliminar ${round(candidate.preliminary_probability * 100)}% con intervalo ${round(candidate.uncertainty_low * 100)}%–${round(candidate.uncertainty_high * 100)}%.`,
    candidate.contextual_only ? "La línea se conserva como contexto y recibe una penalización por relevancia." : "La línea está dentro del rango central de la distribución observada.",
  ];
}

function observedRoleReason(candidate, source, teamName, roleLabel) {
  const input = candidate.input_sources?.find((item) => item.source === source);
  if (!input || !Number.isFinite(Number(input.hits)) || !Number.isFinite(Number(input.sample_size)) || Number(input.sample_size) <= 0) return null;
  return `En la muestra de ${teamName} ${roleLabel}, ${candidate.selection.replace(/^Under\b/i, "Menos de").replace(/^Over\b/i, "Más de")} se dio en ${input.hits} de ${input.sample_size} partidos (${round(Number(input.observed_rate) * 100)}%).`;
}

function productionReason(candidate, homeTeamProfile, awayTeamProfile) {
  const family = candidate.market_family;
  const labels = {
    goals: ["goles", "marca", "concede"],
    corners: ["córners", "genera", "concede"],
    total_shots: ["remates", "produce", "concede"],
    shots_on_goal: ["remates a puerta", "produce", "concede"],
    cards: ["tarjetas", "recibe", "provoca en sus rivales"],
  }[family];
  if (!labels) return null;
  const homeRole = homeTeamProfile?.as_home?.sample_size ? homeTeamProfile.as_home : homeTeamProfile?.general;
  const awayRole = awayTeamProfile?.as_away?.sample_size ? awayTeamProfile.as_away : awayTeamProfile?.general;
  const homeFor = average(homeRole?.event_samples?.[family]?.for || []);
  const awayConceded = average(awayRole?.event_samples?.[family]?.conceded || []);
  if (!Number.isFinite(homeFor) && !Number.isFinite(awayConceded)) return null;
  const homeName = homeTeamProfile?.team_name || "el equipo local";
  const awayName = awayTeamProfile?.team_name || "el equipo visitante";
  const parts = [
    Number.isFinite(homeFor) ? `${homeName} ${labels[1]} ${homeFor} ${labels[0]} por partido como local` : null,
    Number.isFinite(awayConceded) ? `${awayName} ${labels[2]} ${awayConceded} como visitante` : null,
  ].filter(Boolean);
  return `${parts.join("; ")}.`;
}

export function buildSimpleSportsReasons(candidate, { homeTeamProfile = null, awayTeamProfile = null } = {}) {
  if (!candidate) return [];
  const homeName = homeTeamProfile?.team_name || "el equipo local";
  const awayName = awayTeamProfile?.team_name || "el equipo visitante";
  return [...new Set([
    observedRoleReason(candidate, "home_role", homeName, "como local"),
    observedRoleReason(candidate, "away_role", awayName, "como visitante"),
    productionReason(candidate, homeTeamProfile, awayTeamProfile),
  ].filter(Boolean))].slice(0, 3);
}

function isIneligibleForRanking(overallStatusValue) {
  return overallStatusValue === OVERALL_STATUS.NOT_VIABLE
    || overallStatusValue === OVERALL_STATUS.BLOCKED
    || overallStatusValue === OVERALL_STATUS.INSUFFICIENT;
}

export function rankMarketCandidates(candidates = [], { quotes = [], preferredQuote = null, marketAssessments = [], confidenceScore = null, blocked = false, homeTeamProfile = null, awayTeamProfile = null } = {}) {
  const assessmentByFamily = new Map(marketAssessments.map((item) => [item.market_family, item]));
  const sorted = candidates.map((candidate) => {
    const marketAssessment = assessmentByFamily.get(candidate.market_family) || null;
    const sportsScore = calculateSportsScore(candidate, { marketAssessment, confidenceScore });
    const price = selectCandidateQuote(candidate, quotes, preferredQuote);
    const estimatedProbability = deriveEstimatedProbability(candidate);
    const enriched = {
      ...candidate,
      estimated_probability: estimatedProbability,
      probability_percent: toProbabilityPercent(estimatedProbability),
      probability_classification: classifyProbability(estimatedProbability),
      estimated_probability_represents: ESTIMATED_PROBABILITY_REPRESENTS,
      estimated_probability_is_calibrated: isCalibratedModel(candidate.model_validation_status),
      sports_score: sportsScore,
      technical_support_score: marketAssessment?.technical_support_score !== null && marketAssessment?.technical_support_score !== undefined && Number.isFinite(Number(marketAssessment.technical_support_score))
        ? Number(marketAssessment.technical_support_score)
        : null,
      line_stability_score: calculateLineStabilityScore(candidate),
    };
    const candidateOverallStatus = overallStatus(enriched, price.status, blocked);
    return {
      ...enriched,
      price_status: price.status,
      price_quote: price.quote,
      overall_status: candidateOverallStatus,
      ranking_eligible: !isIneligibleForRanking(candidateOverallStatus),
      rank_reason: rankReason(enriched),
      simple_sports_reasons: buildSimpleSportsReasons(enriched, { homeTeamProfile, awayTeamProfile }),
      ranker_version: MARKET_CANDIDATE_RANKER_VERSION,
    };
  }).sort((left, right) => {
    const leftIneligible = isIneligibleForRanking(left.overall_status) ? 1 : 0;
    const rightIneligible = isIneligibleForRanking(right.overall_status) ? 1 : 0;
    if (leftIneligible !== rightIneligible) return leftIneligible - rightIneligible;

    const leftProbability = isValidProbability(left.estimated_probability) ? left.estimated_probability : -1;
    const rightProbability = isValidProbability(right.estimated_probability) ? right.estimated_probability : -1;
    if (rightProbability !== leftProbability) return rightProbability - leftProbability;

    const leftWidth = Number.isFinite(left.uncertainty_high) && Number.isFinite(left.uncertainty_low)
      ? left.uncertainty_high - left.uncertainty_low : Infinity;
    const rightWidth = Number.isFinite(right.uncertainty_high) && Number.isFinite(right.uncertainty_low)
      ? right.uncertainty_high - right.uncertainty_low : Infinity;
    if (leftWidth !== rightWidth) return leftWidth - rightWidth;

    const leftSample = Number.isFinite(left.sample_size_effective) ? left.sample_size_effective : -1;
    const rightSample = Number.isFinite(right.sample_size_effective) ? right.sample_size_effective : -1;
    if (rightSample !== leftSample) return rightSample - leftSample;

    const leftSupport = Number.isFinite(left.technical_support_score) ? left.technical_support_score : -1;
    const rightSupport = Number.isFinite(right.technical_support_score) ? right.technical_support_score : -1;
    if (rightSupport !== leftSupport) return rightSupport - leftSupport;

    const familyOrder = left.market_family.localeCompare(right.market_family);
    if (familyOrder) return familyOrder;
    if (left.line !== right.line) return left.line - right.line;
    return left.direction.localeCompare(right.direction);
  });
  const familyRanks = new Map();
  return sorted.map((candidate, index) => {
    const familyRank = (familyRanks.get(candidate.market_family) || 0) + 1;
    familyRanks.set(candidate.market_family, familyRank);
    return { ...candidate, rank: index + 1, overall_rank: index + 1, family_rank: familyRank };
  });
}

function lineProfiles(ranked) {
  const eligible = ranked.filter((candidate) => candidate.probability_status === "preliminary");
  const mostProbable = [...eligible].sort((left, right) => right.preliminary_probability - left.preliminary_probability || left.rank - right.rank)[0] || null;
  const bestBalance = eligible[0] || null;
  const aggressive = [...eligible].sort((left, right) => Math.abs(left.preliminary_probability - 0.52) - Math.abs(right.preliminary_probability - 0.52) || left.rank - right.rank)[0] || null;
  return { most_probable: mostProbable, best_balance: bestBalance, aggressive };
}

export function buildRankedMarketSelection(input = {}) {
  const analysisMode = input.analysisMode === "specific" || (input.requestedMarketId && input.requestedMarketId !== "open") ? "specific" : "general";
  const assessments = analysisMode === "specific" ? (input.marketAssessments || []).filter((item) => item.market_family === input.requestedMarketId) : (input.marketAssessments || []);
  const generated = assessments.map((assessment) => generateCandidateLines({
    marketFamily: assessment.market_family, leagueProfile: input.leagueProfile, homeTeamProfile: input.homeTeamProfile,
    awayTeamProfile: input.awayTeamProfile, refereeProfile: input.refereeProfile, contextItems: input.contextItems,
    contextImpacts: input.contextImpacts, exactLine: input.exactLine,
  }));
  const ranked = rankMarketCandidates(generated.flatMap((result) => result.candidates), {
    quotes: input.quotes,
    preferredQuote: input.preferredQuote,
    marketAssessments: assessments,
    confidenceScore: input.confidenceScore,
    blocked: input.blocked,
    homeTeamProfile: input.homeTeamProfile,
    awayTeamProfile: input.awayTeamProfile,
  });
  const primary = ranked[0] || null;
  return {
    contract: "RankedMarketSelection", version: 1, analysis_mode: analysisMode,
    requested_market_family: analysisMode === "specific" ? input.requestedMarketId : null,
    generated, ranked_candidates: ranked, primary, alternatives: ranked.slice(1, 4), line_profiles: lineProfiles(ranked),
    explanation: primary ? `${primary.selection}: posición general Scout #${primary.overall_rank} y posición dentro de ${primary.market_family} #${primary.family_rank}; la cuota no intervino en el ranking deportivo.` : "No se generaron candidatos compatibles con la muestra disponible.",
  };
}
