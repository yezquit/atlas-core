const COUNT_FAMILIES = Object.freeze(["goals", "corners", "total_shots", "shots_on_goal"]);

export const MARKET_COMPONENT_ADAPTERS = Object.freeze({
  goals: { for_metric: "goals_for", against_metric: "goals_against", direct_evidence: ["goals"], supports_components: true },
  corners: { for_metric: "corners_for", against_metric: "corners_allowed", direct_evidence: ["corners"], supports_components: true },
  total_shots: { for_metric: "shots_for", against_metric: "shots_allowed", direct_evidence: ["total_shots"], supports_components: true },
  shots_on_goal: { for_metric: "shots_on_goal_for", against_metric: "shots_on_goal_allowed", direct_evidence: ["shots_on_goal"], supports_components: true },
  cards: { for_metric: "cards_received", against_metric: "opponent_cards_received", direct_evidence: ["cards", "fouls", "referee"], supports_components: false, note: "Las tarjetas del rival no se interpretan como tarjetas provocadas." },
});

function mean(values = []) { const numeric = values.map(Number).filter(Number.isFinite); return numeric.length ? numeric.reduce((a, b) => a + b, 0) / numeric.length : null; }
function signal(profile, role, family, key) { const values = profile?.[role]?.event_samples?.[family]?.[key] || []; return { sample_size: values.length, value: mean(values) }; }
function combine(left, right) { return Number.isFinite(left?.value) && Number.isFinite(right?.value) ? (left.value + right.value) / 2 : null; }

export function buildMarketComponents({ marketFamily, homeTeamProfile, awayTeamProfile } = {}) {
  const adapter = MARKET_COMPONENT_ADAPTERS[marketFamily] || null;
  if (!adapter) return null;
  const home_for = signal(homeTeamProfile, "as_home", marketFamily, "for");
  const away_against = signal(awayTeamProfile, "as_away", marketFamily, "conceded");
  const away_for = signal(awayTeamProfile, "as_away", marketFamily, "for");
  const home_against = signal(homeTeamProfile, "as_home", marketFamily, "conceded");
  const expected_home_component = adapter.supports_components ? combine(home_for, away_against) : null;
  const expected_away_component = adapter.supports_components ? combine(away_for, home_against) : null;
  return {
    contract: "MarketComponentModel", version: 1, market_family: marketFamily, adapter,
    home_component: { own_production: home_for, opponent_allowance: away_against, expected: expected_home_component },
    away_component: { own_production: away_for, opponent_allowance: home_against, expected: expected_away_component },
    component_total: Number.isFinite(expected_home_component) && Number.isFinite(expected_away_component) ? expected_home_component + expected_away_component : null,
  };
}

export function isDirectMarketEvidence(item, marketFamily) { return Boolean(item?.affected_markets?.includes(marketFamily)); }
