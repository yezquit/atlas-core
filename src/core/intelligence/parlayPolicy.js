import { MARKET_SUITABILITY, PARLAY_OPERATIONAL_STATUS } from "../contracts/operationalContracts.js";

const HIGH_CORRELATION = new Set(["goals:shots_on_goal", "goals:total_shots", "shots_on_goal:total_shots"]);

export function detectSelectionCorrelation(left, right) {
  if (Number(left?.fixture_id) === Number(right?.fixture_id)) return { level: "high", reason: "same_fixture" };
  const key = [left?.market_family, right?.market_family].sort().join(":");
  return HIGH_CORRELATION.has(key) ? { level: "medium", reason: "related_market_families" } : { level: "low", reason: null };
}

export function combinedDecimalOdds(selections = []) {
  if (!selections.length || selections.some((item) => !Number.isFinite(Number(item.decimal_odds)))) return null;
  return Number(selections.reduce((product, item) => product * Number(item.decimal_odds), 1).toFixed(4));
}

export function buildConservativeParlays(candidates = []) {
  const authorized = candidates.filter((item) =>
    item.market_suitability === MARKET_SUITABILITY.SUITABLE_UNDER_CONDITIONS &&
    item.odds_source_status === "verified_provider" &&
    item.freshness === "fresh" &&
    Number(item.decimal_odds) > 1
  );
  if (authorized.length < 6) {
    return { status: authorized.length ? PARLAY_OPERATIONAL_STATUS.REVIEW_ONLY : PARLAY_OPERATIONAL_STATUS.INSUFFICIENT_CANDIDATES, parlays: [], reasons: ["No existen seis selecciones individuales autorizadas, frescas y diversificables."], combined_odds_is_probability: false };
  }
  const used = new Set();
  const sizes = [["conservador", 2], ["intermedio", 2], ["agresivo", 2]];
  const parlays = [];
  for (const [type, size] of sizes) {
    const selections = [];
    for (const candidate of authorized) {
      const criticalKey = `${candidate.fixture_id}:${candidate.market_family}:${candidate.line}:${candidate.selection}`;
      if (used.has(criticalKey)) continue;
      if (selections.some((selected) => detectSelectionCorrelation(selected, candidate).level === "high")) continue;
      selections.push(candidate);
      used.add(criticalKey);
      if (selections.length === size) break;
    }
    if (selections.length !== size) return { status: PARLAY_OPERATIONAL_STATUS.REVIEW_ONLY, parlays: [], reasons: ["La política de correlación o no repetición impide construir tres parlays."], combined_odds_is_probability: false };
    parlays.push({ type, selections, combined_decimal_odds: combinedDecimalOdds(selections), combined_odds_is_probability: false, warnings: selections.some((left, index) => selections.slice(index + 1).some((right) => detectSelectionCorrelation(left, right).level === "medium")) ? ["medium_correlation"] : [] });
  }
  return { status: PARLAY_OPERATIONAL_STATUS.ALLOWED_WITH_CAUTION, parlays, reasons: ["Solo se usaron selecciones individuales autorizadas y cuotas vigentes."], combined_odds_is_probability: false };
}
