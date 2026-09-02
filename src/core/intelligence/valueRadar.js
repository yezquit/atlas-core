import { ASIAN_TOTAL_GOALS_FAMILY } from "./asianTotalGoals.js";
import { TEAM_ASIAN_HANDICAP_FAMILY } from "./teamAsianHandicap.js";
import { settlementExpectedValue, settlementFairOdds } from "./settlementMath.js";

export const VALUE_RADAR_STATUS = Object.freeze({
  INTERESTING: "interesting",
  WATCH: "watch",
  NO_VALUE: "no_value",
  NOT_EVALUABLE: "not_evaluable",
});

const round = (value, decimals = 6) => Number(Number(value).toFixed(decimals));

// Familias con settlement de 5 estados (full_win/half_win/push/half_loss/
// full_loss) — Favorabilidad Atlas, no probabilidad literal. Genérico sobre
// cualquier familia futura con la misma forma de perfil.
const SETTLEMENT_AWARE_FAMILIES = new Set([ASIAN_TOTAL_GOALS_FAMILY, TEAM_ASIAN_HANDICAP_FAMILY]);

function exactIdentity(candidate, quote) {
  if (!candidate || !quote) return false;
  const sameFixture = Number(candidate.fixture_id ?? candidate.fixtureId) === Number(quote.fixture_id);
  const sameFamily = (candidate.market_family ?? candidate.marketId) === quote.market_family;
  const sameLine = Number(candidate.line) === Number(quote.line);
  if (!sameFixture || !sameFamily || !sameLine) return false;
  // team_asian_handicap se identifica por equipo exacto (team_id), nunca
  // por direction=over|under (ver ATLAS_DECISIONS_LOG.md, decisión 13). Los
  // candidatos clásicos/asian_total_goals nunca llevan team_id, así que
  // caen exactamente en la misma rama de comparación por direction que ya
  // usaban — sin cambio de comportamiento.
  const candidateTeamId = candidate.team_id ?? candidate.teamId;
  if (candidateTeamId !== undefined && candidateTeamId !== null) {
    return Number(candidateTeamId) === Number(quote.team_id ?? quote.teamId);
  }
  return String(candidate.direction).toLowerCase() === String(quote.direction || quote.selection || "").toLowerCase().replace(/^mas de|^más de/, "over").replace(/^menos de/, "under").split(" ")[0];
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
  // settlementAware cubre toda familia con perfil de settlement de 5
  // estados (hoy: asian_total_goals, team_asian_handicap) — ambas
  // reutilizan exactamente las mismas fórmulas genéricas
  // (settlementFairOdds/settlementExpectedValue, settlementMath.js);
  // asianFairOdds/asianExpectedValue son wrappers idénticos, se conservan
  // aquí solo por compatibilidad con el nombre histórico para
  // asian_total_goals.
  const settlementAware = SETTLEMENT_AWARE_FAMILIES.has(family);
  const fairOdds = settlementAware ? settlementFairOdds(asianSettlementProfile) : 1 / probability;
  const expectedRoi = settlementAware ? settlementExpectedValue(asianSettlementProfile, odds) : probability * odds - 1;
  // Para asian_total_goals/team_asian_handicap, raw_edge_pp/conservative_edge_pp
  // NUNCA usan weighted_win_probability ni Favorabilidad Atlas
  // (sports_favorability / uncertainty_low de Favorabilidad) — ambas
  // magnitudes están sesgadas negativamente frente al precio justo real en
  // cuanto existe masa de half_win/push/half_loss (demostrado
  // algebraicamente: en el precio justo, weighted_win_probability - implied
  // <= 0 salvo en líneas .5 puras). price_equivalent_probability
  // (= 1/settlementFairOdds) es la única magnitud cuyo signo frente a
  // implied coincide siempre con el signo del EV real, para las 5
  // combinaciones de settlement.
  const priceEquivalentProbability = settlementAware ? asianSettlementProfile?.price_equivalent_probability : null;
  const priceEquivalentLow = settlementAware ? asianSettlementProfile?.price_equivalent_probability_low : null;
  const rawEdge = settlementAware
    ? (Number.isFinite(priceEquivalentProbability) ? (priceEquivalentProbability - implied) * 100 : null)
    : (probability - implied) * 100;
  const conservativeEdge = settlementAware
    ? (Number.isFinite(priceEquivalentLow) ? (priceEquivalentLow - implied) * 100 : null)
    : (Number.isFinite(uncertaintyLow) ? (uncertaintyLow - implied) * 100 : null);
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
    // Probabilidad equivalente Atlas por precio — expuesta explícitamente
    // (no solo derivable de fair_odds_atlas) para que consumidores como
    // DirectorAtlas puedan citarla en texto sin recalcularla ni caer de
    // vuelta en weighted_win_probability/Favorabilidad. NO es la
    // probabilidad literal de ganar.
    price_equivalent_probability: settlementAware && Number.isFinite(priceEquivalentProbability) ? round(priceEquivalentProbability) : null,
    price_equivalent_probability_low: settlementAware && Number.isFinite(priceEquivalentLow) ? round(priceEquivalentLow) : null,
    raw_edge_pp: Number.isFinite(rawEdge) ? round(rawEdge, 2) : null,
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
