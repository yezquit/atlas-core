const ACTIVE_MATCH_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P"]);
const ACCUMULATIVE_MARKETS = new Set([
  "goals",
  "corners",
  "cards",
  "total_shots",
  "shots_on_goal",
]);

export const LIVE_MARKET_VIABILITY_STATUS = Object.freeze({
  PENDING: "pending",
  ALREADY_CROSSED: "already_crossed",
  ALREADY_REACHED: "already_reached",
  LINE_NOT_LIVE: "line_not_live",
  QUOTE_UNAVAILABLE: "quote_unavailable",
  STALE: "stale",
  BLOCKED: "blocked",
  PROVIDER_UNAVAILABLE: "provider_unavailable",
  CURRENT_LINE_UNKNOWN: "current_line_unknown",
  UNSUPPORTED: "unsupported",
  FIXTURE_MISMATCH: "fixture_mismatch",
  MARKET_MISMATCH: "market_mismatch",
  DIRECTION_MISMATCH: "direction_mismatch",
  LINE_MISMATCH: "line_mismatch",
  MATCH_NOT_LIVE: "match_not_live",
});

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parsedTime(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function result(viable, status, reason, details = {}) {
  return Object.freeze({
    contract: "LiveMarketViability",
    version: 1,
    viable,
    status,
    reason,
    ...details,
  });
}

function blockedStatus(value) {
  return ["blocked", "stopped", "suspended", "finished"].includes(String(value || "").toLowerCase());
}

export function assessLiveMarketViability({
  fixtureId,
  marketFamily,
  direction,
  line,
  currentValue,
  matchMinute,
  matchStatus,
  quote = null,
  quoteTimestamp = null,
  providerStatus = "success",
  providerMarketStatus = null,
  now = new Date().toISOString(),
  maximumQuoteAgeSeconds = 120,
} = {}) {
  const exactLine = numeric(line);
  const current = numeric(currentValue);
  const minute = numeric(matchMinute);
  const normalizedDirection = String(direction || "").toLowerCase();

  if (!ACCUMULATIVE_MARKETS.has(marketFamily) || !["over", "under"].includes(normalizedDirection)) {
    return result(false, LIVE_MARKET_VIABILITY_STATUS.UNSUPPORTED, "unsupported_live_market");
  }
  if (!ACTIVE_MATCH_STATUSES.has(matchStatus) || minute === null || minute <= 0) {
    return result(false, LIVE_MARKET_VIABILITY_STATUS.MATCH_NOT_LIVE, "match_not_active_for_live_market");
  }
  if (current === null || exactLine === null) {
    return result(false, LIVE_MARKET_VIABILITY_STATUS.CURRENT_LINE_UNKNOWN, "current_value_or_line_unknown");
  }
  if (current > exactLine) {
    return result(false, LIVE_MARKET_VIABILITY_STATUS.ALREADY_CROSSED, "accumulated_value_already_crossed_line", { current_value: current, line: exactLine });
  }
  if (current === exactLine) {
    return result(false, LIVE_MARKET_VIABILITY_STATUS.ALREADY_REACHED, "accumulated_value_already_reached_line", { current_value: current, line: exactLine });
  }
  if (providerStatus !== "success") {
    return result(false, LIVE_MARKET_VIABILITY_STATUS.PROVIDER_UNAVAILABLE, "live_market_provider_unavailable");
  }
  if (String(providerMarketStatus || "").toLowerCase() === "stale") {
    return result(false, LIVE_MARKET_VIABILITY_STATUS.STALE, "exact_live_quote_stale");
  }
  if (blockedStatus(providerMarketStatus)) {
    return result(false, LIVE_MARKET_VIABILITY_STATUS.BLOCKED, "exact_live_market_blocked");
  }
  if (String(providerMarketStatus || "").toLowerCase() === "quote_unavailable") {
    return result(false, LIVE_MARKET_VIABILITY_STATUS.QUOTE_UNAVAILABLE, "exact_live_quote_price_unavailable");
  }
  if (String(providerMarketStatus || "").toLowerCase() === "unsupported") {
    return result(false, LIVE_MARKET_VIABILITY_STATUS.UNSUPPORTED, "live_market_payload_not_verified");
  }
  if (String(providerMarketStatus || "").toLowerCase() === "not_main") {
    return result(false, LIVE_MARKET_VIABILITY_STATUS.LINE_NOT_LIVE, "exact_live_line_not_main");
  }
  if (!quote) {
    return result(false, LIVE_MARKET_VIABILITY_STATUS.LINE_NOT_LIVE, "exact_live_line_unavailable");
  }
  if (quote.mode !== "live") {
    return result(false, LIVE_MARKET_VIABILITY_STATUS.LINE_NOT_LIVE, "quote_is_not_live");
  }
  if (Number(quote.fixture_id) !== Number(fixtureId)) {
    return result(false, LIVE_MARKET_VIABILITY_STATUS.FIXTURE_MISMATCH, "live_quote_fixture_mismatch");
  }
  if (quote.market_family !== marketFamily) {
    return result(false, LIVE_MARKET_VIABILITY_STATUS.MARKET_MISMATCH, "live_quote_market_mismatch");
  }
  if (quote.direction !== normalizedDirection) {
    return result(false, LIVE_MARKET_VIABILITY_STATUS.DIRECTION_MISMATCH, "live_quote_direction_mismatch");
  }
  if (numeric(quote.line) !== exactLine) {
    return result(false, LIVE_MARKET_VIABILITY_STATUS.LINE_MISMATCH, "live_quote_line_mismatch");
  }
  if (blockedStatus(quote.market_status) || blockedStatus(quote.source_status)) {
    return result(false, LIVE_MARKET_VIABILITY_STATUS.BLOCKED, "exact_live_market_blocked");
  }

  const observedAt = parsedTime(quoteTimestamp || quote.observed_at || quote.fetched_at);
  const evaluatedAt = parsedTime(now);
  const explicitlyStale = quote.freshness === "stale";
  const timestampStale = observedAt === null || evaluatedAt === null || evaluatedAt - observedAt > maximumQuoteAgeSeconds * 1000 || observedAt - evaluatedAt > 30_000;
  if (explicitlyStale || timestampStale) {
    return result(false, LIVE_MARKET_VIABILITY_STATUS.STALE, "exact_live_quote_stale");
  }
  if (numeric(quote.decimal_odds) === null || numeric(quote.decimal_odds) <= 1) {
    return result(false, LIVE_MARKET_VIABILITY_STATUS.QUOTE_UNAVAILABLE, "exact_live_quote_price_unavailable");
  }

  return result(true, LIVE_MARKET_VIABILITY_STATUS.PENDING, "exact_live_line_pending_and_current", {
    current_value: current,
    line: exactLine,
    quote_id: quote.quote_id || null,
  });
}
