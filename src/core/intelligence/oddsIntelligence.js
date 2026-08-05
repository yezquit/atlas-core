import {
  ODDS_VERIFICATION_STATUS,
  OPERATIONAL_SCHEMA_VERSION,
} from "../contracts/operationalContracts.js";

const MARKET_NAME_RULES = Object.freeze([
  ["shots_on_goal", ["shots on goal", "shots on target", "remates a puerta"]],
  ["total_shots", ["total shots", "shots total", "remates totales"]],
  ["cards", ["cards", "bookings", "tarjetas"]],
  ["corners", ["corners", "córners", "corners kicks"]],
  ["goals", ["goals over/under", "total goals", "goals", "goles"]],
]);

function text(value) {
  return value === null || value === undefined ? null : String(value).trim() || null;
}

function normalized(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function mapProviderMarket(marketName) {
  const candidate = normalized(marketName);
  return MARKET_NAME_RULES.find(([, tokens]) =>
    tokens.some((token) => candidate.includes(normalized(token)))
  )?.[0] || null;
}

export function parseSelectionLine(value, explicitLine = null) {
  const selection = text(value);
  const numeric = text(explicitLine)?.match(/-?\d+(?:[.,]\d+)?/) || selection?.match(/-?\d+(?:[.,]\d+)?/);
  return {
    selection,
    line: numeric ? numeric[0].replace(",", ".") : text(explicitLine),
  };
}

export function impliedProbability(decimalOdds) {
  const value = Number(decimalOdds);
  if (!Number.isFinite(value) || value <= 1) return null;
  return Number((1 / value).toFixed(6));
}

export function oddsFreshnessPolicy({ kickoff = null, now = new Date().toISOString(), source = "provider" } = {}) {
  const distanceMinutes = kickoff
    ? (Date.parse(kickoff) - Date.parse(now)) / 60_000
    : null;
  let limitMinutes = 180;
  let phase = "early_review";
  if (Number.isFinite(distanceMinutes) && distanceMinutes <= 60) {
    limitMinutes = 15;
    phase = "near_kickoff";
  } else if (Number.isFinite(distanceMinutes) && distanceMinutes <= 180) {
    limitMinutes = 30;
    phase = "three_hours_before";
  } else if (Number.isFinite(distanceMinutes) && distanceMinutes <= 1_440) {
    limitMinutes = 60;
    phase = "day_before";
  }
  if (source === "manual_user_input") limitMinutes = Math.min(limitMinutes, 30);
  return { phase, limit_minutes: limitMinutes };
}

function freshnessFor(updatedAt, now, staleAfterMinutes) {
  const ageMinutes = (Date.parse(now) - Date.parse(updatedAt)) / 60_000;
  if (!Number.isFinite(ageMinutes) || ageMinutes < 0) {
    return { freshness: "unknown", age_minutes: null };
  }
  return {
    freshness: ageMinutes > staleAfterMinutes ? "stale" : "fresh",
    age_minutes: Number(ageMinutes.toFixed(2)),
  };
}

function quoteId(parts) {
  return parts.map((item) => normalized(item).replace(/[^a-z0-9.-]/g, "-")).join(":");
}

export function normalizeProviderOdds({
  response = [],
  fixtureId,
  now = new Date().toISOString(),
  kickoff = null,
  staleAfterMinutes = null,
} = {}) {
  const warnings = [];
  const quotes = [];
  for (const item of response) {
    if (Number(item?.fixture?.id) !== Number(fixtureId)) {
      warnings.push("provider_fixture_mismatch");
      continue;
    }
    const updatedAt = text(item.update) || text(item.fixture?.date) || now;
    const policy = oddsFreshnessPolicy({ kickoff: kickoff || item.fixture?.date, now, source: "provider" });
    const freshnessLimit = staleAfterMinutes ?? policy.limit_minutes;
    const freshnessResult = freshnessFor(updatedAt, now, freshnessLimit);
    const freshness = freshnessResult.freshness;
    for (const bookmaker of item.bookmakers || []) {
      for (const bet of bookmaker.bets || []) {
        const marketFamily = mapProviderMarket(bet.name);
        if (!marketFamily) continue;
        for (const value of bet.values || []) {
          const decimalOdds = Number(value.odd);
          const { selection, line } = parseSelectionLine(value.value, value.handicap);
          if (!selection || !Number.isFinite(decimalOdds) || decimalOdds <= 1) continue;
          const status = freshness === "stale"
            ? ODDS_VERIFICATION_STATUS.STALE
            : ODDS_VERIFICATION_STATUS.VERIFIED_PROVIDER;
          quotes.push({
            contract: "OddsQuote",
            schema_version: OPERATIONAL_SCHEMA_VERSION,
            quote_id: quoteId([fixtureId, bookmaker.id, marketFamily, selection, line, decimalOdds]),
            fixture_id: Number(fixtureId),
            bookmaker_id: Number.isFinite(Number(bookmaker.id)) ? Number(bookmaker.id) : null,
            bookmaker_name: text(bookmaker.name),
            market_family: marketFamily,
            market_name: text(bet.name),
            selection,
            line,
            decimal_odds: decimalOdds,
            implied_probability: impliedProbability(decimalOdds),
            implied_probability_label: "Probabilidad implícita de la cuota",
            updated_at: updatedAt,
            consulted_at: now,
            source: "api-football",
            freshness,
            age_minutes: freshnessResult.age_minutes,
            freshness_limit_minutes: freshnessLimit,
            freshness_phase: policy.phase,
            stale_reason: freshness === "stale"
              ? `La cotización tiene ${freshnessResult.age_minutes} minutos y supera el límite de ${freshnessLimit} minutos para esta fase.`
              : null,
            verification_status: status,
            warnings: freshness === "stale" ? ["odds_stale"] : [],
          });
        }
      }
    }
  }
  const deduplicated = [...new Map(quotes.map((quote) => [quote.quote_id, quote])).values()];
  return {
    contract: "OddsResult",
    schema_version: OPERATIONAL_SCHEMA_VERSION,
    fixture_id: Number(fixtureId),
    status: deduplicated.length ? "available" : "unavailable",
    quotes: deduplicated,
    warnings: [...new Set(warnings)],
  };
}

export function createManualOdds({ fixtureId, bookmaker, marketFamily, marketName, selection, line, decimalOdds, receivedAt = new Date().toISOString(), analyzedAt = new Date().toISOString(), kickoff = null }) {
  const parsedOdds = Number(decimalOdds);
  if (!fixtureId || !text(selection) || !Number.isFinite(parsedOdds) || parsedOdds <= 1) return null;
  const policy = oddsFreshnessPolicy({ kickoff, now: analyzedAt, source: "manual_user_input" });
  const freshnessResult = freshnessFor(receivedAt, analyzedAt, policy.limit_minutes);
  return {
    contract: "OddsQuote",
    schema_version: OPERATIONAL_SCHEMA_VERSION,
    quote_id: quoteId([fixtureId, "manual", bookmaker, marketFamily, selection, line, parsedOdds, receivedAt]),
    fixture_id: Number(fixtureId),
    bookmaker_id: null,
    bookmaker_name: text(bookmaker) || "No informado",
    market_family: text(marketFamily) || "unknown",
    market_name: text(marketName) || text(marketFamily) || "Mercado manual",
    selection: text(selection),
    line: text(line),
    decimal_odds: parsedOdds,
    implied_probability: impliedProbability(parsedOdds),
    implied_probability_label: "Probabilidad implícita de la cuota",
    updated_at: receivedAt,
    consulted_at: analyzedAt,
    source: "manual_user_input",
    freshness: freshnessResult.freshness,
    age_minutes: freshnessResult.age_minutes,
    freshness_limit_minutes: policy.limit_minutes,
    freshness_phase: policy.phase,
    stale_reason: freshnessResult.freshness === "stale"
      ? `La cuota manual fue consultada hace ${freshnessResult.age_minutes} minutos y supera el límite de ${policy.limit_minutes} minutos para esta fase.`
      : null,
    verification_status: ODDS_VERIFICATION_STATUS.USER_REPORTED,
    warnings: ["manual_odds_unverified", ...(freshnessResult.freshness === "stale" ? ["odds_stale"] : [])],
  };
}

export function selectBestComparableOdds(quotes = [], { marketFamily, selection, line } = {}) {
  const requestedSelection = normalized(selection);
  const requestedLine = text(line);
  const comparable = quotes.filter((quote) =>
    quote.verification_status === ODDS_VERIFICATION_STATUS.VERIFIED_PROVIDER &&
    quote.freshness === "fresh" &&
    (!marketFamily || quote.market_family === marketFamily) &&
    (!requestedSelection || normalized(quote.selection) === requestedSelection) &&
    (!requestedLine || text(quote.line) === requestedLine)
  );
  return comparable.sort((left, right) => right.decimal_odds - left.decimal_odds)[0] || null;
}
