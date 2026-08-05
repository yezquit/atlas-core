import { generateCandidateLines } from "./candidateLineGenerator.js";

export const MARKET_CANDIDATE_RANKER_VERSION = "market-candidate-ranker-v1";
export const PRICE_STATUS = Object.freeze({ VERIFIED_CURRENT: "verified_current", USER_REPORTED_CURRENT: "user_reported_current", STALE: "stale", UNAVAILABLE: "unavailable", INCOMPATIBLE_LINE: "incompatible_line", INCOMPATIBLE_SELECTION: "incompatible_selection" });
export const OVERALL_STATUS = Object.freeze({ SUITABLE: "suitable_for_consideration", CAUTION: "viable_with_caution", SPORTS_PENDING_PRICE: "sports_candidate_pending_price", REVIEW_ONLY: "review_only", NOT_VIABLE: "not_viable", BLOCKED: "blocked", INSUFFICIENT: "insufficient_information" });

function clamp(value, minimum = 0, maximum = 100) { return Math.max(minimum, Math.min(maximum, value)); }
function round(value, decimals = 1) { return Number(Number(value).toFixed(decimals)); }
function normalizedDirection(value) {
  const normalized = String(value || "").toLowerCase();
  if (/over|mas de|más de/.test(normalized)) return "over";
  if (/under|menos de/.test(normalized)) return "under";
  return null;
}

function comparableQuote(candidate, quotes = []) {
  const sameMarket = quotes.filter((quote) => quote.market_family === candidate.market_family);
  if (!sameMarket.length) return { quote: null, status: PRICE_STATUS.UNAVAILABLE };
  const sameDirection = sameMarket.filter((quote) => normalizedDirection(quote.selection) === candidate.direction);
  if (!sameDirection.length) return { quote: null, status: PRICE_STATUS.INCOMPATIBLE_SELECTION };
  const exact = sameDirection.filter((quote) => Number(quote.line) === Number(candidate.line));
  if (!exact.length) return { quote: null, status: PRICE_STATUS.INCOMPATIBLE_LINE };
  const quote = [...exact].sort((left, right) => Number(right.decimal_odds) - Number(left.decimal_odds))[0];
  if (quote.freshness === "stale" || quote.verification_status === "stale") return { quote, status: PRICE_STATUS.STALE };
  if (quote.verification_status === "verified_provider") return { quote, status: PRICE_STATUS.VERIFIED_CURRENT };
  return { quote, status: PRICE_STATUS.USER_REPORTED_CURRENT };
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
  const distance = Math.abs(Number(candidate.line) - Number(candidate.projected_mean)) / Math.max(0.75, Number(candidate.dispersion) || 0.75);
  const lineStability = clamp(100 - distance * 18 - (candidate.contextual_only ? 28 : 0));
  const sensitivity = clamp(100 - (candidate.limitations?.length || 0) * 3 - (candidate.context_adjustment?.changed_distribution ? 8 : 0));
  return round(probabilityBalance * 0.3 + uncertainty * 0.2 + effectiveSample * 0.15 + coverage * 0.15 + confidence * 0.05 + lineStability * 0.1 + sensitivity * 0.05);
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

export function rankMarketCandidates(candidates = [], { quotes = [], marketAssessments = [], confidenceScore = null, blocked = false } = {}) {
  const assessmentByFamily = new Map(marketAssessments.map((item) => [item.market_family, item]));
  return candidates.map((candidate) => {
    const marketAssessment = assessmentByFamily.get(candidate.market_family) || null;
    const sportsScore = calculateSportsScore(candidate, { marketAssessment, confidenceScore });
    const price = comparableQuote(candidate, quotes);
    const enriched = { ...candidate, sports_score: sportsScore };
    return { ...enriched, price_status: price.status, price_quote: price.quote, overall_status: overallStatus(enriched, price.status, blocked), rank_reason: rankReason(enriched), ranker_version: MARKET_CANDIDATE_RANKER_VERSION };
  }).sort((left, right) => {
    if (right.sports_score !== left.sports_score) return right.sports_score - left.sports_score;
    const leftWidth = left.uncertainty_high - left.uncertainty_low;
    const rightWidth = right.uncertainty_high - right.uncertainty_low;
    if (leftWidth !== rightWidth) return leftWidth - rightWidth;
    if (right.sample_size_effective !== left.sample_size_effective) return right.sample_size_effective - left.sample_size_effective;
    const familyOrder = left.market_family.localeCompare(right.market_family);
    if (familyOrder) return familyOrder;
    if (left.line !== right.line) return left.line - right.line;
    return left.direction.localeCompare(right.direction);
  }).map((candidate, index) => ({ ...candidate, rank: index + 1 }));
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
  const ranked = rankMarketCandidates(generated.flatMap((result) => result.candidates), { quotes: input.quotes, marketAssessments: assessments, confidenceScore: input.confidenceScore, blocked: input.blocked });
  const primary = ranked[0] || null;
  return {
    contract: "RankedMarketSelection", version: 1, analysis_mode: analysisMode,
    requested_market_family: analysisMode === "specific" ? input.requestedMarketId : null,
    generated, ranked_candidates: ranked, primary, alternatives: ranked.slice(1, 4), line_profiles: lineProfiles(ranked),
    explanation: primary ? `${primary.selection} ocupa el primer lugar por equilibrio deportivo; la cuota no intervino en sports_score.` : "No se generaron candidatos compatibles con la muestra disponible.",
  };
}

