import { combinedDecimalOdds } from "./parlayPolicy.js";
import { buildDirectorCombinationMessage } from "./directorParlayIntegration.js";

export const COMBINATION_PRODUCT = Object.freeze({
  PARLAY: "parlay",
  DREAM: "dream",
});

export const COMBINATION_MODE = Object.freeze({
  AUTOMATIC: "automatic",
  MANUAL: "manual",
  MIXED: "mixed",
});

export const COMBINATION_LIMITS = Object.freeze({
  [COMBINATION_PRODUCT.PARLAY]: Object.freeze({ minimum: 2, maximum: 4 }),
  [COMBINATION_PRODUCT.DREAM]: Object.freeze({ minimum: 5, maximum: 15 }),
});

const CURRENT_QUOTE_STATUSES = new Set(["verified_provider", "user_reported"]);
const CURRENT_SOURCE_STATUSES = new Set(["verified_current", "user_reported_current"]);
const ACCEPTED_PRICE_STATUSES = new Set(["favorable_preliminary", "marginal"]);
const ACCEPTED_PARLAY_STATUSES = new Set(["eligible", "eligible_with_caution"]);
const BLOCKING_DIRECTOR_DECISIONS = new Set(["No", "NO APOSTAR", "blocked"]);

function normalizedDirection(value) {
  const candidate = String(value || "").trim().toLowerCase();
  if (/^(under|menos)/.test(candidate)) return "under";
  if (/^(over|mas|más)/.test(candidate)) return "over";
  return null;
}

function number(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function combinationSelectionKey(candidate = {}) {
  const fixtureId = Number(candidate.fixture_id ?? candidate.fixtureId);
  const marketFamily = candidate.market_family ?? candidate.marketId ?? candidate.market;
  const direction = normalizedDirection(candidate.direction ?? candidate.selection);
  const line = number(candidate.line);
  if (!Number.isInteger(fixtureId) || fixtureId <= 0 || !marketFamily || !direction || line === null) return null;
  return `${fixtureId}:${marketFamily}:${direction}:${line}`;
}

export function classifyCombinationSize(size) {
  const selections = Number(size);
  if (!Number.isInteger(selections) || selections < 2 || selections > 15) return "single_or_invalid";
  return selections <= 4 ? COMBINATION_PRODUCT.PARLAY : COMBINATION_PRODUCT.DREAM;
}

export function validateCombinationRequest({ product, mode, selections } = {}) {
  const limits = COMBINATION_LIMITS[product];
  if (!limits) return { valid: false, errorCode: "invalid_product", message: "Elige Parlay Atlas o Soñadora Atlas." };
  if (!Object.values(COMBINATION_MODE).includes(mode)) {
    return { valid: false, errorCode: "invalid_mode", message: "Elige modo automático, manual o mixto." };
  }
  const count = Number(selections);
  if (!Number.isInteger(count) || count < limits.minimum || count > limits.maximum) {
    return {
      valid: false,
      errorCode: "invalid_selection_count",
      message: product === COMBINATION_PRODUCT.PARLAY
        ? "Parlay Atlas requiere entre 2 y 4 selecciones."
        : "Soñadora Atlas requiere entre 5 y 15 selecciones.",
    };
  }
  return { valid: true, count, limits };
}

function quoteMatchesCandidate(candidate, quote) {
  if (!quote) return false;
  const fixtureMatches = Number(quote.fixture_id ?? quote.fixtureId) === Number(candidate.fixture_id ?? candidate.fixtureId);
  const familyMatches = (quote.market_family ?? quote.marketFamily) === (candidate.market_family ?? candidate.marketId ?? candidate.market);
  const directionMatches = normalizedDirection(quote.direction ?? quote.selection) === normalizedDirection(candidate.direction ?? candidate.selection);
  return fixtureMatches && familyMatches && directionMatches && number(quote.line) === number(candidate.line);
}

export function inspectCombinationCandidate(candidate = {}) {
  const key = combinationSelectionKey(candidate);
  const quote = candidate.active_quote ?? candidate.activeQuote ?? candidate.current_quote ?? candidate.currentQuote ?? null;
  const decimalOdds = number(quote?.decimal_odds ?? quote?.decimalOdds ?? candidate.decimal_odds ?? candidate.decimalOdds);
  const verificationStatus = quote?.verification_status ?? candidate.odds_source_status ?? candidate.oddsSourceStatus;
  const sourceStatus = quote?.source_status ?? candidate.odds_source_state ?? candidate.oddsSourceState;
  const fresh = (quote?.freshness ?? candidate.freshness) === "fresh" && quote?.stale !== true;
  const currentSource = CURRENT_QUOTE_STATUSES.has(verificationStatus) || CURRENT_SOURCE_STATUSES.has(sourceStatus);
  const priceStatus = candidate.price_status ?? candidate.priceStatus;
  const priceGap = number(candidate.price_gap ?? candidate.priceGap);
  const directorDecision = candidate.director_decision ?? candidate.directorDecision ?? candidate.operational_decision;
  const parlayEligibility = candidate.parlay_eligibility ?? candidate.parlayEligibility;
  const marketSuitability = candidate.market_suitability ?? candidate.marketSuitability;
  const reasons = [];

  if (!key) reasons.push("invalid_identity");
  if (!quote || !quoteMatchesCandidate(candidate, quote)) reasons.push("missing_or_incompatible_quote");
  if (!fresh || !currentSource) reasons.push("quote_not_current");
  if (decimalOdds === null || decimalOdds <= 1) reasons.push("invalid_decimal_odds");
  if (!ACCEPTED_PRICE_STATUSES.has(priceStatus) || (priceStatus === "marginal" && !(priceGap > 0))) reasons.push("price_not_acceptable");
  if (parlayEligibility && !ACCEPTED_PARLAY_STATUSES.has(parlayEligibility)) reasons.push("director_parlay_not_eligible");
  if (BLOCKING_DIRECTOR_DECISIONS.has(directorDecision)) reasons.push("director_blocks_selection");
  if (["blocked", "not_viable", "insufficient_data", "review_only"].includes(marketSuitability)) reasons.push("market_not_operationally_eligible");

  return {
    eligible: reasons.length === 0,
    reasons: [...new Set(reasons)],
    candidate: {
      ...candidate,
      selection_key: key,
      fixture_id: Number(candidate.fixture_id ?? candidate.fixtureId),
      market_family: candidate.market_family ?? candidate.marketId ?? candidate.market,
      direction: normalizedDirection(candidate.direction ?? candidate.selection),
      line: number(candidate.line),
      decimal_odds: decimalOdds,
      active_quote: quote,
    },
  };
}

export function assessCombinationCorrelation(left, right) {
  if (!left || !right) return { level: "low", reason: null };
  const sameFixture = Number(left.fixture_id ?? left.fixtureId) === Number(right.fixture_id ?? right.fixtureId);
  if (!sameFixture) return { level: "low", reason: null };
  const sameFamily = (left.market_family ?? left.marketId) === (right.market_family ?? right.marketId);
  if (sameFamily) return { level: "high", reason: "same_fixture_same_market_family" };
  return { level: "medium", reason: "same_fixture_multiple_markets" };
}

function score(candidate) {
  const pricePriority = candidate.price_status === "favorable_preliminary" ? 30 : 15;
  return pricePriority + Number(candidate.price_gap ?? 0) * 100 + Number(candidate.sports_score ?? candidate.sportsScore ?? candidate.technicalSupport ?? 0);
}

function uniqueInspections(candidates) {
  const deduplicated = new Map();
  for (const candidate of candidates || []) {
    const inspection = inspectCombinationCandidate(candidate);
    const key = inspection.candidate.selection_key || `invalid:${deduplicated.size}`;
    const current = deduplicated.get(key);
    if (!current || score(inspection.candidate) > score(current.candidate)) deduplicated.set(key, inspection);
  }
  return [...deduplicated.values()];
}

function canAppend(selected, candidate, product) {
  if (selected.some((item) => assessCombinationCorrelation(item, candidate).level === "high")) return false;
  const sameFixtureCount = selected.filter((item) => Number(item.fixture_id) === Number(candidate.fixture_id)).length;
  return sameFixtureCount < (product === COMBINATION_PRODUCT.DREAM ? 2 : 1);
}

function correlationWarnings(selections) {
  const warnings = [];
  for (let index = 0; index < selections.length; index += 1) {
    for (const right of selections.slice(index + 1)) {
      const correlation = assessCombinationCorrelation(selections[index], right);
      if (correlation.level !== "low") warnings.push(correlation.reason);
    }
  }
  return [...new Set(warnings)];
}

function riskFor(product, selections, warnings) {
  if (product === COMBINATION_PRODUCT.DREAM) return { level: "high", score: Math.min(100, 55 + selections.length * 3 + warnings.length * 8) };
  const scoreValue = Math.min(100, 18 + selections.length * 10 + warnings.length * 15);
  return { level: scoreValue >= 60 ? "high" : scoreValue >= 35 ? "medium" : "low", score: scoreValue };
}

export function buildAtlasCombination({ candidates = [], product, mode, selections, selectedKeys = [] } = {}) {
  const validation = validateCombinationRequest({ product, mode, selections });
  if (!validation.valid) return { contract: "AtlasCombinationResult", version: 1, status: "invalid_request", ...validation, selections: [] };

  const inspected = uniqueInspections(candidates);
  const eligible = inspected.filter((item) => item.eligible).map((item) => item.candidate).sort((left, right) => score(right) - score(left));
  const requestedKeys = [...new Set(selectedKeys.filter(Boolean))];
  const fixed = requestedKeys.map((key) => eligible.find((candidate) => candidate.selection_key === key)).filter(Boolean);

  if (mode === COMBINATION_MODE.MANUAL && (requestedKeys.length !== validation.count || fixed.length !== validation.count)) {
    return {
      contract: "AtlasCombinationResult",
      version: 1,
      status: "insufficient_candidates",
      product,
      mode,
      requested_selections: validation.count,
      selections: fixed,
      eligible_candidates: eligible,
      rejected_candidates: inspected.filter((item) => !item.eligible),
      director_message: buildDirectorCombinationMessage({ product, status: "manual_incomplete", selections: validation.count }),
    };
  }

  if (mode === COMBINATION_MODE.MIXED && (requestedKeys.length > validation.count || fixed.length !== requestedKeys.length)) {
    return {
      contract: "AtlasCombinationResult",
      version: 1,
      status: "insufficient_candidates",
      product,
      mode,
      requested_selections: validation.count,
      selections: fixed,
      eligible_candidates: eligible,
      rejected_candidates: inspected.filter((item) => !item.eligible),
      director_message: buildDirectorCombinationMessage({ product, status: "fixed_selection_invalid", selections: validation.count }),
    };
  }

  const chosen = mode === COMBINATION_MODE.AUTOMATIC ? [] : [...fixed];
  if (mode !== COMBINATION_MODE.MANUAL) {
    for (const candidate of eligible) {
      if (chosen.some((item) => item.selection_key === candidate.selection_key)) continue;
      if (!canAppend(chosen, candidate, product)) continue;
      chosen.push(candidate);
      if (chosen.length === validation.count) break;
    }
  }

  if (chosen.length !== validation.count) {
    return {
      contract: "AtlasCombinationResult",
      version: 1,
      status: "insufficient_candidates",
      product,
      mode,
      requested_selections: validation.count,
      selections: chosen,
      eligible_candidates: eligible,
      rejected_candidates: inspected.filter((item) => !item.eligible),
      director_message: buildDirectorCombinationMessage({ product, status: "insufficient_candidates", selections: validation.count }),
    };
  }

  const warnings = correlationWarnings(chosen);
  const risk = riskFor(product, chosen, warnings);
  return {
    contract: "AtlasCombinationResult",
    version: 1,
    status: "ready",
    product,
    mode,
    requested_selections: validation.count,
    selections: chosen,
    combined_decimal_odds: combinedDecimalOdds(chosen),
    combined_odds_is_probability: false,
    risk,
    correlation: { level: warnings.length ? "medium" : "low", warnings },
    eligible_candidates: eligible,
    rejected_candidates: inspected.filter((item) => !item.eligible),
    director_message: buildDirectorCombinationMessage({ product, status: "ready", selections: chosen.length }),
  };
}

export function mergeJourneyExplorations(results = [], dates = []) {
  const successful = results.filter((item) => item?.status === "success");
  const source = successful.length ? successful : results.filter(Boolean);
  const candidates = [...new Map(source.flatMap((item) => item.candidates || []).map((candidate) => [combinationSelectionKey(candidate), candidate])).values()]
    .filter((candidate) => combinationSelectionKey(candidate));
  return {
    contract: "MultiDateJourneyExplorationResult",
    version: 1,
    status: successful.length ? "success" : source[0]?.status || "empty",
    message: successful.length
      ? `Atlas reunió ${candidates.length} candidato(s) de ${dates.length} fecha(s) seleccionada(s).`
      : source[0]?.message || "No se encontraron candidatos para las fechas seleccionadas.",
    dates,
    dateResults: results,
    candidates,
    fixturesFound: source.reduce((total, item) => total + Number(item.fixturesFound || 0), 0),
    fixturesReviewed: source.reduce((total, item) => total + Number(item.fixturesReviewed || 0), 0),
    warnings: source.flatMap((item, index) => (item.warnings || []).map((warning) => `${dates[index] || "Fecha"}: ${warning}`)),
  };
}
