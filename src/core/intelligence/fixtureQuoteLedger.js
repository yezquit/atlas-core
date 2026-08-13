import { PRICE_EVALUATION_STATUS } from "../contracts/operationalContracts.js";
import { selectCandidateQuote } from "./marketCandidateRanker.js";
import { evaluateMarketPrice } from "./marketSuitability.js";
import { isCurrentOddsQuote, refreshStoredOddsQuote } from "./oddsIntelligence.js";

function normalizedDirection(value) {
  const candidate = String(value || "").trim().toLowerCase();
  if (/^(under|menos)/.test(candidate)) return "under";
  if (/^(over|mas|más)/.test(candidate)) return "over";
  return null;
}

function normalizedLine(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? String(parsed) : String(value ?? "").trim();
}

function normalizedBookmaker(value) {
  return String(value || "unknown")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function fixtureSelectionKey(input = {}) {
  const fixtureId = Number(input.fixture_id ?? input.fixtureId);
  const marketFamily = input.market_family ?? input.marketFamily ?? input.marketId;
  const direction = normalizedDirection(input.direction ?? input.selection);
  const line = normalizedLine(input.line);
  if (!Number.isInteger(fixtureId) || fixtureId <= 0 || !marketFamily || !direction || !line) return null;
  return `${fixtureId}:${marketFamily}:${direction}:${line}`;
}

function versionSelectionKey(version) {
  return fixtureSelectionKey({
    fixtureId: version.fixture_id,
    marketFamily: version.director?.market_evaluated?.family,
    direction: version.director?.sports_verdict?.direction || version.director?.selection,
    line: version.director?.line,
  });
}

function quoteRecordKey(record) {
  return `${record.selectionKey}:${normalizedBookmaker(record.quote.bookmaker_name)}`;
}

function priceDecision(price) {
  if (price?.status === PRICE_EVALUATION_STATUS.FAVORABLE_PRELIMINARY) return "Sí";
  if (price?.status === PRICE_EVALUATION_STATUS.MARGINAL) return "Sí, pero con cautela";
  if (price?.status === PRICE_EVALUATION_STATUS.UNFAVORABLE) return "No";
  return "Pendiente de precio";
}

function quoteObservationTime(quote) {
  return quote?.updated_at || quote?.consulted_at || null;
}

function quotesFromVersion(version) {
  const quotes = [...(version.odds || [])];
  if (version.active_quote && !quotes.some((quote) => quote.quote_id === version.active_quote.quote_id)) {
    quotes.push(version.active_quote);
  }
  return quotes;
}

function latestCompatibleVersion(versions, selectionKey) {
  return [...versions]
    .filter((version) => versionSelectionKey(version) === selectionKey)
    .sort((left, right) => timestamp(right.created_at) - timestamp(left.created_at))[0] || null;
}

function latestVersionContainingQuote(versions, quoteId) {
  if (!quoteId) return null;
  return [...versions]
    .filter((version) => quotesFromVersion(version).some((quote) => quote.quote_id === quoteId))
    .sort((left, right) => timestamp(right.created_at) - timestamp(left.created_at))[0] || null;
}

function evaluateSelectedQuote(quote, version) {
  if (!quote || !version) return null;
  if (version.active_quote?.quote_id === quote.quote_id && version.director?.price_assessment) {
    return version.director.price_assessment;
  }
  return evaluateMarketPrice({
    oddsQuote: quote,
    preliminaryProbability: version.preliminary_probability,
    confidenceScore: version.analysis_confidence?.analysis_confidence_score || 0,
    sampleSize: version.preliminary_probability?.sample_size_effective || 0,
    phase: version.phase,
  });
}

export function buildFixtureQuoteLedger(analyses = [], { fixtureId, now = new Date().toISOString(), kickoff = null } = {}) {
  const resolvedFixtureId = Number(fixtureId);
  const versions = analyses
    .filter((version) => Number(version.fixture_id) === resolvedFixtureId)
    .sort((left, right) => timestamp(left.created_at) - timestamp(right.created_at));
  const resolvedKickoff = kickoff || versions.at(-1)?.director?.fixture?.kickoff_utc || versions.at(-1)?.director?.fixture?.kickoff || null;
  const uniqueRecords = new Map();

  for (const version of versions) {
    for (const quote of quotesFromVersion(version)) {
      const selectionKey = fixtureSelectionKey(quote);
      if (!selectionKey || Number(quote.fixture_id) !== resolvedFixtureId) continue;
      const record = { quote, selectionKey, versionCreatedAt: version.created_at };
      uniqueRecords.set(quote.quote_id || `${selectionKey}:${quote.bookmaker_name}:${quote.updated_at}:${quote.decimal_odds}`, record);
    }
  }

  const latestByBookmaker = new Map();
  for (const record of uniqueRecords.values()) {
    const key = quoteRecordKey(record);
    const current = latestByBookmaker.get(key);
    const recordObservedAt = timestamp(record.quote.updated_at || record.quote.consulted_at || record.versionCreatedAt);
    const currentObservedAt = timestamp(current?.quote?.updated_at || current?.quote?.consulted_at || current?.versionCreatedAt);
    if (!current || recordObservedAt > currentObservedAt || (
      recordObservedAt === currentObservedAt && timestamp(record.versionCreatedAt) > timestamp(current.versionCreatedAt)
    )) latestByBookmaker.set(key, record);
  }

  const selectionKeys = new Set(versions.map(versionSelectionKey).filter(Boolean));
  const entries = [...selectionKeys].map((selectionKey) => {
    const records = [...uniqueRecords.values()].filter((record) => record.selectionKey === selectionKey);
    const latestRecords = records.filter((record) => latestByBookmaker.get(quoteRecordKey(record)) === record);
    const refreshedLatest = latestRecords.map((record) => ({
      ...record,
      quote: refreshStoredOddsQuote(record.quote, { now, kickoff: resolvedKickoff }),
    }));
    const currentQuotes = refreshedLatest.map((record) => record.quote).filter(isCurrentOddsQuote);
    const reference = records.at(-1)?.quote || latestCompatibleVersion(versions, selectionKey)?.active_quote || null;
    const candidate = {
      market_family: reference?.market_family,
      direction: normalizedDirection(reference?.direction || reference?.selection),
      line: reference?.line,
    };
    const activeQuote = selectCandidateQuote(candidate, currentQuotes).quote || null;
    const latestVersion = latestCompatibleVersion(versions, selectionKey);
    const price = evaluateSelectedQuote(activeQuote, latestVersion);
    const historicalQuotes = records
      .map((record) => refreshStoredOddsQuote(record.quote, { now, kickoff: resolvedKickoff }))
      .filter((quote) => quote.quote_id !== activeQuote?.quote_id)
      .sort((left, right) => timestamp(right.updated_at || right.consulted_at) - timestamp(left.updated_at || left.consulted_at))
      .map((quote) => ({ ...quote, active: false, superseded: true }));
    const latestKnownQuote = activeQuote || historicalQuotes[0] || null;
    const quoteSourceVersion = latestVersionContainingQuote(versions, latestKnownQuote?.quote_id);
    const quoteState = activeQuote ? "current" : latestKnownQuote ? "stale" : "never_quoted";
    const exclusionReason = quoteState === "stale"
      ? latestKnownQuote.stale_reason || "La cotización compatible ya no está vigente."
      : quoteState === "never_quoted"
        ? "No existe una cotización compatible registrada para esta selección exacta."
        : null;
    const [entryFixtureId, marketFamily, direction, line] = selectionKey.split(":");
    return {
      selection_key: selectionKey,
      fixture_id: Number(entryFixtureId),
      market_family: marketFamily,
      direction,
      line,
      selection: latestVersion?.director?.sports_verdict?.selection || activeQuote?.selection || `${direction === "under" ? "Under" : "Over"} ${line}`,
      active_quote: activeQuote ? { ...activeQuote, active: true, superseded: false } : null,
      latest_known_quote: latestKnownQuote,
      historical_quotes: historicalQuotes,
      quote_state: quoteState,
      price_status: price?.status || (quoteState === "stale" ? PRICE_EVALUATION_STATUS.STALE : PRICE_EVALUATION_STATUS.UNAVAILABLE),
      price_gap: price?.price_gap ?? null,
      operational_decision: quoteState === "stale" ? "Cuota vencida — actualizar precio" : priceDecision(price),
      reason: price?.message || exclusionReason || "No existe una cuota actual para evaluar el precio.",
      ranking_included: quoteState === "current",
      ranking_exclusion_reason: exclusionReason,
      sports_confidence_score: latestVersion?.analysis_confidence?.analysis_confidence_score ?? null,
      source_analysis_id: latestVersion?.analysis_id || null,
      quote_source_analysis_id: quoteSourceVersion?.analysis_id || null,
    };
  }).sort((left, right) => left.selection_key.localeCompare(right.selection_key));

  return {
    contract: "FixtureQuoteLedger",
    version: 1,
    fixture_id: resolvedFixtureId,
    generated_at: now,
    source: "operational_history_append_only",
    entries,
  };
}

export function findFixtureQuoteEntry(ledger, candidate) {
  const key = fixtureSelectionKey(candidate);
  return ledger?.entries?.find((entry) => entry.selection_key === key) || null;
}

export function diagnoseFixtureQuoteEntry(analyses = [], { fixtureId, candidate, now, kickoff = null } = {}) {
  const ledger = buildFixtureQuoteLedger(analyses, { fixtureId, now, kickoff });
  const entry = findFixtureQuoteEntry(ledger, candidate);
  if (!entry) {
    return {
      identity_key: fixtureSelectionKey({ ...candidate, fixtureId }),
      persisted_state: "not_found",
      queried_state: "never_quoted",
      ranking_included: false,
      ranking_exclusion_reason: "No existe una versión compatible para esta selección exacta.",
    };
  }
  const latestKnownQuote = entry.latest_known_quote;
  const sourceVersion = analyses.find((version) => version.analysis_id === entry.quote_source_analysis_id) || null;
  const persistedQuote = sourceVersion?.active_quote?.quote_id === latestKnownQuote?.quote_id
    ? sourceVersion.active_quote
    : (sourceVersion?.odds || []).find((quote) => quote.quote_id === latestKnownQuote?.quote_id) || latestKnownQuote;
  return {
    analysis_id: entry.quote_source_analysis_id,
    evaluation_analysis_id: entry.source_analysis_id,
    quote_id: latestKnownQuote?.quote_id || null,
    observed_at: quoteObservationTime(latestKnownQuote),
    identity_key: entry.selection_key,
    persisted_state: sourceVersion?.active_quote?.quote_id === latestKnownQuote?.quote_id ? "active_quote" : latestKnownQuote ? "historical_quote" : "never_quoted",
    persisted_verification_status: persistedQuote?.verification_status || null,
    persisted_freshness: persistedQuote?.freshness || null,
    queried_state: entry.quote_state,
    queried_verification_status: latestKnownQuote?.verification_status || null,
    queried_freshness: latestKnownQuote?.freshness || null,
    queried_age_minutes: latestKnownQuote?.age_minutes ?? null,
    freshness_limit_minutes: latestKnownQuote?.freshness_limit_minutes ?? null,
    ranking_included: entry.ranking_included,
    ranking_exclusion_reason: entry.ranking_exclusion_reason,
  };
}

export function summarizeJourneyQuoteCoverage(candidates = [], ledgersByFixture = {}) {
  const states = candidates.map((candidate) =>
    findFixtureQuoteEntry(ledgersByFixture[String(candidate.fixtureId)], candidate)?.quote_state || "never_quoted"
  );
  const current = states.filter((value) => value === "current").length;
  const stale = states.filter((value) => value === "stale").length;
  const pending = states.length - current - stale;
  if (current === 0) {
    return {
      status: "pending",
      tone: "warning",
      message: "Candidatos deportivos encontrados — evaluación de precio pendiente",
      total: states.length,
      current,
      stale,
      pending,
    };
  }
  if (current < states.length) {
    return {
      status: "partial",
      tone: "operational_partial",
      message: "Hay opciones con precio evaluado y otras pendientes.",
      total: states.length,
      current,
      stale,
      pending,
    };
  }
  return {
    status: "available",
    tone: "operational_available",
    message: "Todas las opciones relevantes tienen precio vigente evaluado.",
    total: states.length,
    current,
    stale,
    pending,
  };
}

const OPERATIONAL_PRIORITY = Object.freeze({
  [PRICE_EVALUATION_STATUS.FAVORABLE_PRELIMINARY]: 3,
  [PRICE_EVALUATION_STATUS.MARGINAL]: 2,
  [PRICE_EVALUATION_STATUS.UNFAVORABLE]: 1,
});

export function buildJourneyOperationalRanking(candidates = [], ledgersByFixture = {}) {
  return candidates.flatMap((candidate) => {
    const entry = findFixtureQuoteEntry(ledgersByFixture[String(candidate.fixtureId)], candidate);
    if (!entry?.active_quote || !isCurrentOddsQuote(entry.active_quote)) return [];
    return [{ candidate, operation: entry }];
  }).sort((left, right) =>
    (OPERATIONAL_PRIORITY[right.operation.price_status] || 0) - (OPERATIONAL_PRIORITY[left.operation.price_status] || 0) ||
    Number(right.operation.price_gap ?? -Infinity) - Number(left.operation.price_gap ?? -Infinity) ||
    Number(left.candidate.generalRank ?? Infinity) - Number(right.candidate.generalRank ?? Infinity)
  ).map((item, index) => ({ ...item, operational_rank: index + 1 }));
}
