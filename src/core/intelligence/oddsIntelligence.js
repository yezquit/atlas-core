import {
  ODDS_VERIFICATION_STATUS,
  OPERATIONAL_SCHEMA_VERSION,
} from "../contracts/operationalContracts.js";
import { TEAM_ASIAN_HANDICAP_FAMILY, isValidTeamAsianHandicapSide } from "./teamAsianHandicap.js";

const MARKET_NAME_RULES = Object.freeze([
  ["asian_total_goals", ["asian total goals", "asian goals over/under", "asian goals", "total goals asian", "asiatico total de goles", "total asiatico de goles"]],
  ["shots_on_goal", ["shots on goal", "shots on target", "remates a puerta"]],
  ["total_shots", ["total shots", "shots total", "remates totales"]],
  ["cards", ["cards", "bookings", "tarjetas"]],
  ["corners", ["corners", "córners", "corners kicks"]],
  ["goals", ["goals over/under", "total goals", "goals", "goles"]],
]);
// team_asian_handicap se admite como entrada MANUAL, pero deliberadamente
// NO se agrega a MARKET_NAME_RULES: esa lista también alimenta
// mapProviderMarket (mapeo automático desde el proveedor API-Football), que
// esta fase explícitamente NO debe activar para Team AH (bet types del
// proveedor aún sin mapear — ver ATLAS_DECISIONS_LOG.md).
const MANUAL_MARKET_FAMILIES = new Set([...MARKET_NAME_RULES.map(([family]) => family), TEAM_ASIAN_HANDICAP_FAMILY]);

function text(value) {
  return value === null || value === undefined ? null : String(value).trim() || null;
}

export function parseDecimalOdds(value) {
  const candidate = text(value)?.replace(",", ".");
  const parsed = Number(candidate);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : null;
}

export function manualOddsCopyWarning({ line, decimalOdds } = {}) {
  const parsedLine = numericToken(line);
  const parsedOdds = parseDecimalOdds(decimalOdds);
  if (parsedOdds === null) return null;
  const repeatsHighLine = Number.isFinite(parsedLine) && parsedLine >= 4 && parsedOdds === parsedLine;
  if (!repeatsHighLine && parsedOdds < 6) return null;
  return repeatsHighLine
    ? `Verificación sugerida: la cuota ${parsedOdds} coincide con la línea ${parsedLine}. Confirma que copiaste la cuota decimal exacta de la casa y no repetiste la línea. Atlas no la corrige ni la rechaza.`
    : `Verificación sugerida: la cuota ${parsedOdds} es inusualmente alta. Confirma la copia exacta en la casa. Atlas no la corrige ni la rechaza.`;
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
  const value = parseDecimalOdds(decimalOdds);
  if (value === null) return null;
  return Number((1 / value).toFixed(6));
}

function numericToken(value) {
  const match = text(value)?.match(/-?\d+(?:[.,]\d+)?/);
  return match ? Number(match[0].replace(",", ".")) : null;
}

function structurallyConsistentValue(value) {
  const selectionLine = numericToken(value?.value);
  const handicapLine = numericToken(value?.handicap);
  if (
    selectionLine !== null &&
    handicapLine !== null &&
    selectionLine !== handicapLine
  ) {
    return { valid: false, reason: "provider_selection_handicap_mismatch" };
  }
  return { valid: true, reason: null };
}

export function validateManualOddsInput(input = {}) {
  const direction = normalized(input.direction || input.selection);
  const line = numericToken(input.line);
  const selectionLine = numericToken(input.selection);
  const consultedAt = Date.parse(input.consultedAt);
  const isTeamAsianHandicap = text(input.marketFamily) === TEAM_ASIAN_HANDICAP_FAMILY;
  const errors = [];
  if (!Number.isInteger(Number(input.fixtureId)) || Number(input.fixtureId) <= 0) errors.push("invalid_fixture_id");
  if (!MANUAL_MARKET_FAMILIES.has(text(input.marketFamily))) errors.push("invalid_market_family");
  // team_asian_handicap identifica el lado por equipo (side: home|away +
  // team_id), nunca por direction=over|under — decisión 13. La línea sigue
  // siendo obligatoria y puede ser negativa (signed quarter-step), a
  // diferencia de las familias clásicas.
  if (isTeamAsianHandicap) {
    if (!isValidTeamAsianHandicapSide(input.side || input.direction || input.selection)) errors.push("invalid_side");
    if (!Number.isInteger(Number(input.teamId)) || Number(input.teamId) <= 0) errors.push("invalid_team_id");
  } else if (!/^(over|under)(\b|$)/.test(direction)) errors.push("invalid_direction");
  if (!Number.isFinite(line)) errors.push("invalid_line");
  if (selectionLine !== null && Number.isFinite(line) && selectionLine !== line) errors.push("selection_line_mismatch");
  if (parseDecimalOdds(input.decimalOdds) === null) errors.push("invalid_decimal_odds");
  if (!text(input.bookmaker)) errors.push("missing_bookmaker");
  if (!Number.isFinite(consultedAt)) errors.push("invalid_consulted_at");
  if (!text(input.timezone)) errors.push("missing_timezone");
  return { valid: errors.length === 0, errors, line };
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

export function isCurrentOddsQuote(quote) {
  return Boolean(
    quote &&
    quote.freshness === "fresh" &&
    !quote.stale &&
    ["verified_current", "user_reported_current"].includes(quote.source_status)
  );
}

export function refreshStoredOddsQuote(quote, { now = new Date().toISOString(), kickoff = null } = {}) {
  if (!quote) return null;
  const source = quote.source === "manual_user_input" ? "manual_user_input" : "provider";
  const policy = oddsFreshnessPolicy({ kickoff, now, source });
  const observedAt = quote.updated_at || quote.consulted_at;
  const result = freshnessFor(observedAt, now, policy.limit_minutes);
  const current = result.freshness === "fresh";
  const currentSourceStatus = source === "manual_user_input" ? "user_reported_current" : "verified_current";
  const currentVerificationStatus = source === "manual_user_input"
    ? ODDS_VERIFICATION_STATUS.USER_REPORTED
    : ODDS_VERIFICATION_STATUS.VERIFIED_PROVIDER;
  return {
    ...quote,
    freshness: current ? "fresh" : "stale",
    age_minutes: result.age_minutes,
    freshness_limit_minutes: policy.limit_minutes,
    freshness_phase: policy.phase,
    stale: !current,
    source_status: current ? currentSourceStatus : "stale",
    verification_status: current ? currentVerificationStatus : ODDS_VERIFICATION_STATUS.STALE,
    stale_reason: current
      ? null
      : Number.isFinite(result.age_minutes)
        ? `La cotización tiene ${result.age_minutes} minutos y supera el límite de ${policy.limit_minutes} minutos para esta fase.`
        : "No fue posible verificar la vigencia temporal de la cotización anterior.",
    warnings: [...new Set([...(quote.warnings || []).filter((item) => item !== "odds_stale"), ...(!current ? ["odds_stale"] : [])])],
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
  const discarded = [];
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
        for (const [valueIndex, value] of (bet.values || []).entries()) {
          const consistency = structurallyConsistentValue(value);
          const decimalOdds = parseDecimalOdds(value.odd);
          const { selection, line } = parseSelectionLine(value.value, value.handicap);
          const structuralBase = {
            bookmaker_id: Number.isFinite(Number(bookmaker.id)) ? Number(bookmaker.id) : null,
            provider_bet_id: text(bet.id),
            provider_bet_name: text(bet.name),
            provider_value_index: valueIndex,
          };
          if (!consistency.valid || !selection || decimalOdds === null) {
            const reason = consistency.reason || (!selection ? "provider_selection_missing" : "provider_odd_invalid");
            warnings.push(reason);
            discarded.push({ ...structuralBase, reason });
            continue;
          }
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
            stale: freshness === "stale",
            source_status: freshness === "stale" ? "stale" : "verified_current",
            stale_reason: freshness === "stale"
              ? `La cotización tiene ${freshnessResult.age_minutes} minutos y supera el límite de ${freshnessLimit} minutos para esta fase.`
              : null,
            verification_status: status,
            provider_bet_id: text(bet.id),
            provider_bet_name: text(bet.name),
            provider_value_index: valueIndex,
            provider_raw_selection: text(value.value),
            provider_raw_handicap: text(value.handicap),
            provider_odd_field: "odd",
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
    discarded,
    warnings: [...new Set(warnings)],
  };
}

export function createManualOdds({ fixtureId, bookmaker, marketFamily, marketName, selection, direction = null, teamId = null, line, decimalOdds, receivedAt = new Date().toISOString(), analyzedAt = new Date().toISOString(), kickoff = null, timezone = null, analysisVersion = null }) {
  const parsedOdds = parseDecimalOdds(decimalOdds);
  if (!fixtureId || !text(selection) || parsedOdds === null) return null;
  const policy = oddsFreshnessPolicy({ kickoff, now: analyzedAt, source: "manual_user_input" });
  const freshnessResult = freshnessFor(receivedAt, analyzedAt, policy.limit_minutes);
  const isTeamAsianHandicap = text(marketFamily) === TEAM_ASIAN_HANDICAP_FAMILY;
  const normalizedLine = text(line);
  // team_asian_handicap identifica el lado por equipo (home|away), nunca
  // por direction=over|under (decisión 13, teamAsianHandicap.js) — la
  // rama clásica de dirección/canonicalSelection queda intacta para el
  // resto de familias.
  const resolvedSide = isTeamAsianHandicap
    ? (/^home$/i.test(direction || selection) ? "home" : /^away$/i.test(direction || selection) ? "away" : null)
    : null;
  const resolvedDirection = isTeamAsianHandicap
    ? resolvedSide
    : /^(under|menos)/i.test(direction || selection) ? "under" : /^(over|más|mas)/i.test(direction || selection) ? "over" : null;
  const numericTeamId = Number.isInteger(Number(teamId)) && Number(teamId) > 0 ? Number(teamId) : null;
  const signedLine = Number.isFinite(Number(normalizedLine)) && Number(normalizedLine) >= 0 ? `+${normalizedLine}` : normalizedLine;
  const canonicalSelection = isTeamAsianHandicap && resolvedSide && normalizedLine
    ? `${resolvedSide === "home" ? "Local" : "Visitante"} ${signedLine}`
    : resolvedDirection && normalizedLine
      ? `${resolvedDirection === "over" ? "Over" : "Under"} ${normalizedLine}`
      : text(selection);
  const requestKey = quoteId([fixtureId, "manual", bookmaker, marketFamily, resolvedDirection, numericTeamId, normalizedLine, parsedOdds, receivedAt, timezone, analysisVersion]);
  return {
    contract: "OddsQuote",
    schema_version: OPERATIONAL_SCHEMA_VERSION,
    quote_id: requestKey,
    request_key: requestKey,
    fixture_id: Number(fixtureId),
    bookmaker_id: null,
    bookmaker_name: text(bookmaker) || "No informado",
    market_family: text(marketFamily) || "unknown",
    market_name: text(marketName) || text(marketFamily) || "Mercado manual",
    selection: canonicalSelection,
    direction: resolvedDirection,
    team_id: numericTeamId,
    line: normalizedLine,
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
    stale: freshnessResult.freshness === "stale",
    source_status: freshnessResult.freshness === "stale" ? "stale" : "user_reported_current",
    timezone: text(timezone),
    analysis_version: text(analysisVersion),
    stale_reason: freshnessResult.freshness === "stale"
      ? `La cuota manual fue consultada hace ${freshnessResult.age_minutes} minutos y supera el límite de ${policy.limit_minutes} minutos para esta fase.`
      : null,
    verification_status: ODDS_VERIFICATION_STATUS.USER_REPORTED,
    warnings: [
      "manual_odds_unverified",
      ...(manualOddsCopyWarning({ line: normalizedLine, decimalOdds: parsedOdds }) ? ["manual_odds_unusual_copy"] : []),
      ...(freshnessResult.freshness === "stale" ? ["odds_stale"] : []),
    ],
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
