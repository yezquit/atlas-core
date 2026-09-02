import { generateCandidateLines } from "./candidateLineGenerator.js";
import {
  ESTIMATED_PROBABILITY_REPRESENTS,
  classifyProbability,
  isCalibratedModel,
  isSettlementFavorabilityCandidate,
  isValidProbability,
  toProbabilityPercent,
} from "./probabilityClassification.js";
import { buildDecisionFrontier } from "./decisionFrontier.js";

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

// Peso combinado de los seis componentes semánticamente neutrales (todo
// calculateSportsScore salvo probabilityBalance). Se usa para renormalizar
// Solidez a escala 0-100 para settlement_favorability sin inventar ninguna
// ancla nueva de Favorabilidad.
const SETTLEMENT_FAVORABILITY_NEUTRAL_WEIGHT = 0.2 + 0.15 + 0.15 + 0.05 + 0.1 + 0.05;

export function calculateSportsScore(candidate, { marketAssessment = null, confidenceScore = null } = {}) {
  if (candidate?.probability_status !== "preliminary") return 0;
  const intervalWidth = Math.max(0, Number(candidate.uncertainty_high) - Number(candidate.uncertainty_low));
  const uncertainty = clamp(100 - intervalWidth * 125);
  const effectiveSample = clamp((Number(candidate.sample_size_effective) / 20) * 100);
  const coverage = clamp(Number(marketAssessment?.technical_support_score ?? 70));
  const confidence = clamp(Number(confidenceScore ?? coverage));
  const lineStability = calculateLineStabilityScore(candidate);
  const sensitivity = clamp(100 - (candidate.limitations?.length || 0) * 3 - (candidate.context_adjustment?.changed_distribution ? 8 : 0));
  if (isSettlementFavorabilityCandidate(candidate)) {
    // sports_favorability (Favorabilidad Atlas) es un atractivo deportivo de
    // settlement, no una probabilidad literal de ganar — nunca debe
    // alimentar un componente diseñado alrededor de una forma ideal de
    // probabilidad (ver ATLAS_DECISIONS_LOG.md, decisión 52). Solidez para
    // esta semántica mide únicamente calidad/robustez de la evidencia,
    // reutilizando los mismos seis componentes neutrales de abajo,
    // renormalizados sobre su propio peso combinado (0.70).
    return round((
      uncertainty * 0.2 + effectiveSample * 0.15 + coverage * 0.15 + confidence * 0.05 + lineStability * 0.1 + sensitivity * 0.05
    ) / SETTLEMENT_FAVORABILITY_NEUTRAL_WEIGHT);
  }
  const probability = Number(candidate.preliminary_probability);
  const probabilityBalance = clamp(100 - Math.abs(probability - 0.68) * 180);
  return round(probabilityBalance * 0.3 + uncertainty * 0.2 + effectiveSample * 0.15 + coverage * 0.15 + confidence * 0.05 + lineStability * 0.1 + sensitivity * 0.05);
}

export function calculateLineStabilityScore(candidate = {}) {
  const distance = Math.abs(Number(candidate.line) - Number(candidate.projected_mean)) / Math.max(0.75, Number(candidate.dispersion) || 0.75);
  return round(clamp(100 - distance * 18 - (candidate.contextual_only ? 28 : 0)));
}

function overallStatus(candidate, priceStatus, blocked) {
  if (blocked) return OVERALL_STATUS.BLOCKED;
  if (!candidate || candidate.probability_status !== "preliminary") return OVERALL_STATUS.INSUFFICIENT;
  const sideComparison = candidate.side_comparison;
  if (sideComparison?.enforce_preference && sideComparison.preferred_direction && sideComparison.preferred_direction !== candidate.direction) return OVERALL_STATUS.NOT_VIABLE;
  if (candidate.sports_score < 45) return OVERALL_STATUS.NOT_VIABLE;
  if ([PRICE_STATUS.UNAVAILABLE, PRICE_STATUS.STALE, PRICE_STATUS.INCOMPATIBLE_LINE, PRICE_STATUS.INCOMPATIBLE_SELECTION].includes(priceStatus)) return candidate.sports_score >= 58 ? OVERALL_STATUS.SPORTS_PENDING_PRICE : OVERALL_STATUS.REVIEW_ONLY;
  if (priceStatus === PRICE_STATUS.USER_REPORTED_CURRENT || candidate.sports_score < 70) return OVERALL_STATUS.CAUTION;
  return OVERALL_STATUS.SUITABLE;
}

// Capa exclusivamente textual/descriptiva: no participa en calculateSportsScore,
// ranking, orden, thresholds, overallStatus ni el comparator — solo redacta el
// texto de rank_reason. Para candidatos cuyo probability_semantics indica
// Favorabilidad Atlas (settlement asiático, no probabilidad literal de ganar),
// evita la palabra "probabilidad" y usa el lenguaje correcto.
function rankReason(candidate) {
  const isSettlementFavorability = candidate.probability_semantics === "settlement_favorability" || candidate.market_family === "asian_total_goals";
  const probabilityLine = isSettlementFavorability
    ? `Favorabilidad Atlas ${Math.round(candidate.preliminary_probability * 100)}/100 con intervalo ${round(candidate.uncertainty_low * 100)}–${round(candidate.uncertainty_high * 100)} (no es una probabilidad literal de ganar).`
    : `Probabilidad preliminar ${round(candidate.preliminary_probability * 100)}% con intervalo ${round(candidate.uncertainty_low * 100)}%–${round(candidate.uncertainty_high * 100)}%.`;
  return [
    `Equilibrio deportivo ${candidate.sports_score}/100 sin usar la cuota.`,
    probabilityLine,
    candidate.contextual_only ? "La línea se conserva como contexto y recibe una penalización por relevancia." : "La línea está dentro del rango central de la distribución observada.",
  ];
}

function observedRoleReason(candidate, source, teamName, roleLabel) {
  const input = candidate.input_sources?.find((item) => item.source === source);
  if (!input ||
    typeof input.hits !== "number" || !Number.isFinite(input.hits) ||
    typeof input.sample_size !== "number" || !Number.isFinite(input.sample_size) || input.sample_size <= 0 ||
    typeof input.observed_rate !== "number" || !Number.isFinite(input.observed_rate)) return null;
  return `En la muestra de ${teamName} ${roleLabel}, ${candidate.selection.replace(/^Under\b/i, "Menos de").replace(/^Over\b/i, "Más de")} se dio en ${input.hits} de ${input.sample_size} partidos (${round(input.observed_rate * 100)}%).`;
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

// Magnitud monotónica usada exclusivamente para ordenar candidatos que ya
// comparten la misma semántica deportiva. Para clásicos es probabilidad;
// para settlement asiático es Favorabilidad Atlas. Nunca se usa en economía
// ni para comparar ambos grupos entre sí.
function sportsAttractiveness(candidate) {
  if (!isSettlementFavorabilityCandidate(candidate)) {
    return isValidProbability(candidate.estimated_probability) ? candidate.estimated_probability : -1;
  }
  if (candidate.sports_favorability !== null && candidate.sports_favorability !== undefined) {
    return isValidProbability(candidate.sports_favorability) ? candidate.sports_favorability : -1;
  }
  if (isValidProbability(candidate.estimated_probability)) return candidate.estimated_probability;
  return isValidProbability(candidate.preliminary_probability) ? candidate.preliminary_probability : -1;
}

function compareCandidatesWithinSemantics(left, right) {
  const leftIneligible = isIneligibleForRanking(left.overall_status) ? 1 : 0;
  const rightIneligible = isIneligibleForRanking(right.overall_status) ? 1 : 0;
  if (leftIneligible !== rightIneligible) return leftIneligible - rightIneligible;

  const attractivenessDifference = sportsAttractiveness(right) - sportsAttractiveness(left);
  if (attractivenessDifference) return attractivenessDifference;

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
}

function sortCandidatesWithoutCrossSemanticComparison(candidates) {
  const semanticOrder = [];
  const grouped = new Map();
  for (const candidate of candidates) {
    const semantics = isSettlementFavorabilityCandidate(candidate)
      ? "settlement_favorability"
      : "event_probability";
    if (!grouped.has(semantics)) {
      grouped.set(semantics, []);
      semanticOrder.push(semantics);
    }
    grouped.get(semantics).push(candidate);
  }
  return semanticOrder.flatMap((semantics) => grouped.get(semantics).sort(compareCandidatesWithinSemantics));
}

export function rankMarketCandidates(candidates = [], { quotes = [], preferredQuote = null, marketAssessments = [], confidenceScore = null, blocked = false, homeTeamProfile = null, awayTeamProfile = null } = {}) {
  const assessmentByFamily = new Map(marketAssessments.map((item) => [item.market_family, item]));
  const enrichedCandidates = candidates.map((candidate) => {
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
  });
  const sorted = sortCandidatesWithoutCrossSemanticComparison(enrichedCandidates);
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

// Prioriza como alternativas otras líneas viables de la MISMA familia que el
// candidato principal (p. ej. Over 1.5 / Over 2.5 cuando el principal es
// Over 0.5), en vez de un simple top-3 global que puede quedar copado por
// otras familias y esconder alternativas deportivas fuertes del mismo mercado.
function selectAlternatives(ranked, primary) {
  if (!primary) return ranked.slice(0, 3);
  const rest = ranked.filter((candidate) => candidate.candidate_id !== primary.candidate_id);
  const sameFamily = rest.filter((candidate) => candidate.market_family === primary.market_family);
  const otherFamilies = rest.filter((candidate) => candidate.market_family !== primary.market_family);
  return [...sameFamily, ...otherFamilies].slice(0, 3);
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
  // `ranked_candidates` remains the complete, probability-ordered catalogue.
  // The frontier is a separate recommendation layer and never rewrites it.
  const decisionFrontier = buildDecisionFrontier(ranked, { product: input.recommendationProduct || "individual" });
  const catalog = decisionFrontier.candidates;
  const primary = decisionFrontier.primary || catalog[0] || null;
  return {
    contract: "RankedMarketSelection", version: 1, analysis_mode: analysisMode,
    requested_market_family: analysisMode === "specific" ? input.requestedMarketId : null,
    generated, ranked_candidates: catalog, catalog_candidates: catalog, decision_frontier: decisionFrontier,
    recommendation_candidate_id: primary?.candidate_id || null,
    primary, alternatives: selectAlternatives(catalog, primary), line_profiles: { ...lineProfiles(catalog), best_balance: primary },
    explanation: primary ? `${primary.selection}: recomendación por frontera de decisión con respaldo deportivo comparable. El catálogo conserva todas las líneas válidas y la cuota no modifica probabilidad, soporte ni datos deportivos.` : "No se generaron candidatos compatibles con la muestra disponible.",
  };
}
