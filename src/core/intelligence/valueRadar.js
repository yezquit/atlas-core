import { asianExpectedValue, asianFairOdds, ASIAN_TOTAL_GOALS_FAMILY } from "./asianTotalGoals.js";

export const VALUE_RADAR_STATUS = Object.freeze({
  INTERESTING: "interesting",
  WATCH: "watch",
  NO_VALUE: "no_value",
  NOT_EVALUABLE: "not_evaluable",
});

const round = (value, decimals = 6) => Number(Number(value).toFixed(decimals));

function exactIdentity(candidate, quote) {
  return Boolean(
    candidate && quote &&
    Number(candidate.fixture_id ?? candidate.fixtureId) === Number(quote.fixture_id) &&
    (candidate.market_family ?? candidate.marketId) === quote.market_family &&
    String(candidate.direction).toLowerCase() === String(quote.direction || quote.selection || "").toLowerCase().replace(/^mas de|^más de/, "over").replace(/^menos de/, "under").split(" ")[0] &&
    Number(candidate.line) === Number(quote.line)
  );
}

export function evaluateValueOpportunity({ candidate, quote, asianSettlementProfile = null } = {}) {
  const family = candidate?.market_family ?? candidate?.marketId;
  const probability = Number(candidate?.estimated_probability ?? candidate?.estimatedProbability ?? candidate?.probability);
  const uncertaintyLow = Number(candidate?.uncertainty_low ?? candidate?.uncertaintyLow);
  const odds = Number(quote?.decimal_odds);
  const base = {
    contract: "AtlasValueOpportunity",
    version: 1,
    fixture_id: Number(candidate?.fixture_id ?? candidate?.fixtureId) || null,
    market_family: family || null,
    direction: candidate?.direction || null,
    line: Number.isFinite(Number(candidate?.line)) ? Number(candidate.line) : null,
    quote_exact: exactIdentity(candidate, quote),
    quote_id: quote?.quote_id || null,
    bookmaker: quote?.bookmaker_name || null,
    decimal_odds: Number.isFinite(odds) ? odds : null,
    estimated_probability: Number.isFinite(probability) ? probability : null,
    sports_score: candidate?.sports_score ?? candidate?.sportsScore ?? null,
    support: candidate?.technical_support_score ?? candidate?.technicalSupport ?? null,
    uncertainty_low: Number.isFinite(uncertaintyLow) ? uncertaintyLow : null,
    uncertainty_high: candidate?.uncertainty_high ?? candidate?.uncertaintyHigh ?? null,
    asian_settlement_profile: asianSettlementProfile,
  };
  if (!base.quote_exact || !(odds > 1) || !Number.isFinite(probability)) {
    return { ...base, status: VALUE_RADAR_STATUS.NOT_EVALUABLE, implied_probability: null, fair_odds_atlas: null, raw_edge_pp: null, conservative_edge_pp: null, expected_roi: null, simple_message: "No existe una cuota exacta vigente para evaluar esta selección." };
  }
  const implied = 1 / odds;
  const asian = family === ASIAN_TOTAL_GOALS_FAMILY;
  const fairOdds = asian ? asianFairOdds(asianSettlementProfile) : 1 / probability;
  const expectedRoi = asian ? asianExpectedValue(asianSettlementProfile, odds) : probability * odds - 1;
  const rawEdge = asian && asianSettlementProfile
    ? (asianSettlementProfile.weighted_win_probability - implied) * 100
    : (probability - implied) * 100;
  const conservativeEdge = Number.isFinite(uncertaintyLow) ? (uncertaintyLow - implied) * 100 : null;
  const status = expectedRoi <= 0 ? VALUE_RADAR_STATUS.NO_VALUE
    : Number.isFinite(conservativeEdge) && conservativeEdge > 0 ? VALUE_RADAR_STATUS.INTERESTING
      : VALUE_RADAR_STATUS.WATCH;
  const simpleMessage = status === VALUE_RADAR_STATUS.INTERESTING
    ? `La casa está pagando mejor de lo que Atlas considera necesario para el riesgo calculado. No garantiza que la apuesta vaya a ganar.`
    : status === VALUE_RADAR_STATUS.WATCH
      ? "El precio parece favorable en promedio, pero la incertidumbre todavía exige cautela."
      : "La selección puede ser razonable deportivamente, pero la cuota no compensa el riesgo que Atlas calcula.";
  return {
    ...base,
    status,
    implied_probability: round(implied),
    fair_odds_atlas: Number.isFinite(fairOdds) ? round(fairOdds) : null,
    raw_edge_pp: round(rawEdge, 2),
    conservative_edge_pp: Number.isFinite(conservativeEdge) ? round(conservativeEdge, 2) : null,
    expected_roi: Number.isFinite(expectedRoi) ? round(expectedRoi) : null,
    simple_message: simpleMessage,
  };
}

const STATUS_RANK = Object.freeze({ interesting: 3, watch: 2, no_value: 1, not_evaluable: 0 });

export function rankValueOpportunities(opportunities = []) {
  return [...opportunities].sort((left, right) =>
    (STATUS_RANK[right.status] || 0) - (STATUS_RANK[left.status] || 0) ||
    Number(right.expected_roi ?? -Infinity) - Number(left.expected_roi ?? -Infinity) ||
    Number(right.conservative_edge_pp ?? -Infinity) - Number(left.conservative_edge_pp ?? -Infinity) ||
    Number(right.raw_edge_pp ?? -Infinity) - Number(left.raw_edge_pp ?? -Infinity) ||
    Number(right.sports_score ?? -Infinity) - Number(left.sports_score ?? -Infinity)
  );
}
