import { fixtureStatTotal } from "./intelligenceUtils.js";

export const LIVE_ANALYSIS_VERSION = "atlas-live-v1";
export const LIVE_ACTIVE_STATUSES = Object.freeze(["1H", "HT", "2H", "ET", "BT", "P"]);

const FINAL_STATUSES = new Set(["FT", "AET", "PEN"]);
const INACTIVE_STATUSES = new Set(["SUSP", "INT", "PST", "CANC", "ABD", "AWD", "WO"]);
const SUPPORTED_STATS = Object.freeze({
  corners: "corner_kicks",
  cards: "yellow_cards",
  total_shots: "total_shots",
  shots_on_goal: "shots_on_goal",
});
const SNAPSHOT_STATS = Object.freeze(["total_shots", "shots_on_goal", "corner_kicks", "yellow_cards", "red_cards", "fouls", "ball_possession"]);
const PROJECTION_CONFIG = Object.freeze({
  goals: { minimumMinute: 15, maximumPer90: 6, maximumAdditional: 4 },
  corners: { minimumMinute: 10, maximumPer90: 18, maximumAdditional: 10 },
  cards: { minimumMinute: 15, maximumPer90: 12, maximumAdditional: 8 },
  total_shots: { minimumMinute: 10, maximumPer90: 42, maximumAdditional: 24 },
  shots_on_goal: { minimumMinute: 10, maximumPer90: 18, maximumAdditional: 10 },
});

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function parsedTime(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function effectiveMinute(fixture) {
  const elapsed = number(fixture?.status?.elapsed);
  if (elapsed !== null && elapsed > 0) return elapsed;
  if (fixture?.status?.short === "HT") return 45;
  if (fixture?.status?.short === "BT") return 105;
  if (fixture?.status?.short === "P") return 120;
  return null;
}

export function assessLiveFixture(fixture) {
  const short = fixture?.status?.short;
  if (!fixture?.fixtureId || !short) return { status: "invalid", reason: "live_fixture_identity_missing" };
  if (fixture.status?.isScheduled || ["NS", "TBD"].includes(short)) return { status: "not_started", reason: "fixture_not_started" };
  if (fixture.status?.isFinished || FINAL_STATUSES.has(short)) return { status: "finished", reason: "fixture_finished" };
  if (INACTIVE_STATUSES.has(short)) return { status: "inactive", reason: `fixture_${short.toLowerCase()}` };
  if (!LIVE_ACTIVE_STATUSES.includes(short)) return { status: "inactive", reason: "fixture_not_live" };
  const minute = effectiveMinute(fixture);
  const home = number(fixture.score?.goals?.home);
  const away = number(fixture.score?.goals?.away);
  if (minute === null || home === null || away === null) return { status: "invalid", reason: "live_minute_or_score_missing" };
  return { status: "active", reason: null, minute, score: { home, away } };
}

function snapshotStatistics(statistics) {
  if (!statistics?.teams?.length) return { available_stats: [], teams: [] };
  return {
    available_stats: SNAPSHOT_STATS.filter((key) => statistics.availableStats?.includes(key)),
    teams: statistics.teams.map((team) => ({
      team: { id: team.team?.id || null, name: team.team?.name || null },
      statistics: Object.fromEntries(SNAPSHOT_STATS.filter((key) => team.statistics?.[key]).map((key) => [key, number(team.statistics[key].value)])),
    })),
  };
}

function totalsForSnapshot(fixture, statistics) {
  return {
    goals: number(fixture?.score?.goals?.home) + number(fixture?.score?.goals?.away),
    corners: fixtureStatTotal(statistics, "corner_kicks"),
    cards: fixtureStatTotal(statistics, "yellow_cards"),
    total_shots: fixtureStatTotal(statistics, "total_shots"),
    shots_on_goal: fixtureStatTotal(statistics, "shots_on_goal"),
  };
}

function snapshotIdentity({ fixture, minute, score, totals, liveStatistics }) {
  return encodeURIComponent(JSON.stringify({ fixture: fixture.fixtureId, status: fixture.status.short, minute, score, totals, statistics: liveStatistics }));
}

export function createLiveMatchSnapshot({ fixture, statistics = null, fixtureFetchedAt, statisticsFetchedAt = null, oddsFetchedAt = null, snapshotAt = new Date().toISOString() } = {}) {
  const assessment = assessLiveFixture(fixture);
  if (assessment.status !== "active") return { status: "unavailable", errorCode: assessment.reason, fixture_assessment: assessment, snapshot: null };
  const now = parsedTime(snapshotAt);
  const fixtureTime = parsedTime(fixtureFetchedAt);
  if (now === null || fixtureTime === null) return { status: "unavailable", errorCode: "invalid_live_snapshot_timestamp", fixture_assessment: assessment, snapshot: null };
  const statisticsTime = parsedTime(statisticsFetchedAt);
  const oddsTime = parsedTime(oddsFetchedAt);
  const availableTimes = [fixtureTime, statisticsTime, oddsTime].filter(Number.isFinite);
  const sourceSkewSeconds = availableTimes.length > 1 ? Math.round((Math.max(...availableTimes) - Math.min(...availableTimes)) / 1000) : 0;
  const fixtureAgeSeconds = Math.max(0, Math.round((now - fixtureTime) / 1000));
  const statisticsAgeSeconds = statisticsTime === null ? null : Math.max(0, Math.round((now - statisticsTime) / 1000));
  const coherent = fixtureAgeSeconds <= 90 && sourceSkewSeconds <= 180 && (statisticsAgeSeconds === null || statisticsAgeSeconds <= 180);
  if (!coherent) return { status: "unavailable", errorCode: "live_snapshot_stale_or_incoherent", fixture_assessment: assessment, snapshot: null };
  const totals = totalsForSnapshot(fixture, statistics);
  const liveStatistics = snapshotStatistics(statistics);
  return {
    status: "success",
    snapshot: Object.freeze({
      contract: "LiveMatchSnapshot",
      version: 1,
      snapshot_id: snapshotIdentity({ fixture, minute: assessment.minute, score: assessment.score, totals, liveStatistics }),
      mode: "live",
      fixture_id: Number(fixture.fixtureId),
      competition: fixture.competition?.name || null,
      season: fixture.competition?.season ?? null,
      round: fixture.competition?.round || null,
      home_team: fixture.teams?.home?.name || null,
      away_team: fixture.teams?.away?.name || null,
      kickoff_utc: fixture.date?.kickoff_utc || fixture.date?.utc || null,
      status: { short: fixture.status.short, long: fixture.status.long || null, elapsed: assessment.minute },
      minute: assessment.minute,
      score: assessment.score,
      statistics: liveStatistics,
      totals,
      captured_at: snapshotAt,
      sources: {
        fixture_fetched_at: fixtureFetchedAt,
        statistics_fetched_at: statisticsFetchedAt,
        odds_fetched_at: oddsFetchedAt,
        source_skew_seconds: sourceSkewSeconds,
        fixture_age_seconds: fixtureAgeSeconds,
        statistics_age_seconds: statisticsAgeSeconds,
        coherence_status: statistics ? "coherent" : "partial_without_statistics",
      },
    }),
  };
}

export function projectLiveTotal({ marketFamily, currentTotal, minute, statusShort } = {}) {
  const config = PROJECTION_CONFIG[marketFamily];
  const current = number(currentTotal);
  const elapsed = number(minute);
  if (!config || current === null || elapsed === null || elapsed < config.minimumMinute) {
    return { status: "insufficient_information", projected_total: null, reason: !config ? "unsupported_live_market" : current === null ? "live_stat_missing" : "live_sample_too_early" };
  }
  const targetMinutes = ["ET", "BT", "P"].includes(statusShort) ? 120 : 90;
  const boundedMinute = clamp(elapsed, 1, targetMinutes);
  const remaining = Math.max(0, targetMinutes - boundedMinute);
  const observedRate = current / boundedMinute;
  const maximumRate = config.maximumPer90 / 90;
  const boundedRate = Math.min(observedRate, maximumRate);
  const sampleWeight = clamp(boundedMinute / targetMinutes, 0.2, 1);
  const conservativeDecay = 0.55 + sampleWeight * 0.3;
  const rawAdditional = observedRate * remaining;
  const pacedAdditional = boundedRate * remaining * conservativeDecay;
  const timeScaledCap = Math.min(config.maximumAdditional, config.maximumPer90 * (remaining / 90) * 1.35);
  const projectedAdditional = clamp(pacedAdditional, 0, timeScaledCap);
  return {
    status: "available",
    current_total: current,
    elapsed_minutes: boundedMinute,
    remaining_minutes: remaining,
    raw_linear_additional: Number(rawAdditional.toFixed(3)),
    projected_additional: Number(projectedAdditional.toFixed(3)),
    projected_total: Number((current + projectedAdditional).toFixed(3)),
    controls: {
      rate_clamped: observedRate > maximumRate,
      maximum_rate_per_minute: Number(maximumRate.toFixed(4)),
      time_scaled_additional_cap: Number(timeScaledCap.toFixed(3)),
      conservative_decay: Number(conservativeDecay.toFixed(3)),
      linear_projection_used_as_final: false,
    },
  };
}

function normalized(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function marketFamilyFromBet(name) {
  const value = normalized(name);
  if (!/over|under|total/.test(value)) return null;
  if (/1st half|2nd half|first half|second half|half time|home team|away team|team total|3 ?way/.test(value)) return null;
  if (/^total corners(?: over.?under)?$/.test(value)) return "corners";
  if (/^total (?:cards|bookings)(?: over.?under)?$/.test(value)) return "cards";
  if (/^total shots? on (?:goal|target)(?: over.?under)?$/.test(value)) return "shots_on_goal";
  if (/^total shots?(?: over.?under)?$/.test(value)) return "total_shots";
  if (/^over.?under line$|^total goals?(?: over.?under)?$/.test(value)) return "goals";
  return null;
}

function directionFrom(value) {
  const candidate = normalized(value);
  if (/\bover\b|\bmas\b/.test(candidate)) return "over";
  if (/\bunder\b|\bmenos\b/.test(candidate)) return "under";
  return null;
}

function liveBetContainers(item) {
  const direct = Array.isArray(item?.odds) ? item.odds.map((bet) => ({ bet, bookmaker: item.bookmaker || null })) : [];
  const bookmakers = (item?.bookmakers || []).flatMap((bookmaker) => (bookmaker?.bets || bookmaker?.odds || []).map((bet) => ({ bet, bookmaker })));
  return [...direct, ...bookmakers];
}

export function normalizeLiveOdds(payload = [], { fixtureId, fetchedAt, now = new Date().toISOString() } = {}) {
  const observed = parsedTime(fetchedAt);
  const current = parsedTime(now);
  if (observed === null || current === null || current - observed > 120_000 || observed - current > 30_000) return [];
  const quotes = [];
  for (const item of payload || []) {
    if (Number(item?.fixture?.id ?? item?.fixture_id) !== Number(fixtureId)) continue;
    if (!item?.status || typeof item.status !== "object") continue;
    const updated = parsedTime(item.update);
    if (updated === null || current - updated > 120_000 || updated - current > 30_000) continue;
    const liveStatus = item.status || {};
    if (liveStatus.stopped === true || liveStatus.blocked === true || liveStatus.finished === true) continue;
    for (const { bet, bookmaker } of liveBetContainers(item)) {
      const family = marketFamilyFromBet(bet?.name);
      if (!family) continue;
      for (const value of bet?.values || []) {
        const direction = directionFrom(value?.value || value?.label || value?.name);
        const line = number(value?.handicap ?? String(value?.value || value?.label || "").match(/-?\d+(?:[.,]\d+)?/)?.[0]);
        const decimalOdds = number(value?.odd ?? value?.odds);
        if (!direction || line === null || decimalOdds === null || decimalOdds <= 1 || value?.suspended === true || value?.main === false) continue;
        quotes.push(Object.freeze({
          contract: "LiveOddsQuote",
          version: 1,
          quote_id: `live:${fixtureId}:${bookmaker?.id || "unknown"}:${bet?.id || normalized(bet?.name)}:${direction}:${line}:${fetchedAt}`,
          mode: "live",
          fixture_id: Number(fixtureId),
          market_family: family,
          direction,
          selection: `${direction === "over" ? "Over" : "Under"} ${line}`,
          line,
          decimal_odds: decimalOdds,
          bookmaker_name: bookmaker?.name || item?.bookmaker?.name || null,
          observed_at: item.update,
          fetched_at: fetchedAt,
          freshness: "fresh",
          verification_status: "verified_live_provider",
          source_status: "verified_live_current",
        }));
      }
    }
  }
  return quotes;
}

function matchingLiveQuote(candidate, quotes) {
  return quotes
    .filter((quote) => quote.mode === "live" && quote.freshness === "fresh" && quote.source_status === "verified_live_current" && Number(quote.fixture_id) === Number(candidate.fixture_id) && quote.market_family === candidate.market_family && quote.direction === candidate.direction && Number(quote.line) === Number(candidate.line))
    .sort((left, right) => right.decimal_odds - left.decimal_odds)[0] || null;
}

function confidenceFor(snapshot, family) {
  const elapsedFactor = clamp(snapshot.minute / 90, 0, 1);
  const hasFamilyData = family === "goals" || snapshot.statistics.available_stats.includes(SUPPORTED_STATS[family]);
  const statisticsCoverage = snapshot.statistics.available_stats.length / SNAPSHOT_STATS.length;
  return Math.round(clamp(35 + elapsedFactor * 25 + (hasFamilyData ? 12 : 0) + statisticsCoverage * 10, 30, 82));
}

export function buildLiveMarketAssessments(snapshot, liveQuotes = []) {
  return Object.keys(PROJECTION_CONFIG).map((family) => {
    const projection = projectLiveTotal({ marketFamily: family, currentTotal: snapshot.totals[family], minute: snapshot.minute, statusShort: snapshot.status.short });
    if (projection.status !== "available") return { contract: "LiveMarketAssessment", version: 1, market_family: family, status: "insufficient_information", projection, candidate: null, reasons: [], risks: [projection.reason] };
    const line = Number((projection.current_total + 0.5).toFixed(1));
    const direction = projection.projected_additional >= 0.75 ? "over" : "under";
    const margin = direction === "over" ? projection.projected_total - line : line - projection.projected_total;
    const confidence = confidenceFor(snapshot, family);
    const sportsScore = Math.round(clamp(48 + Math.max(0, margin) * 24 + (confidence - 40) * 0.35, 42, 84));
    const candidate = {
      fixture_id: snapshot.fixture_id,
      market_family: family,
      direction,
      line,
      selection: `${direction === "over" ? "Over" : "Under"} ${line}`,
      current_total: projection.current_total,
      projected_total: projection.projected_total,
      sports_score: sportsScore,
      confidence_score: confidence,
      estimated_probability: null,
      probability_status: "unavailable",
      reasons: [`Minuto ${snapshot.minute}: ${projection.current_total} acumulado(s); proyección acotada ${projection.projected_total}.`, "La proyección reduce el ritmo observado y aplica un máximo dependiente del tiempo restante."],
      risks: [snapshot.sources.coherence_status === "partial_without_statistics" ? "El snapshot no contiene estadísticas acumuladas completas." : null, confidence < 60 ? "La muestra temporal o la cobertura todavía son limitadas." : null].filter(Boolean),
    };
    const quote = matchingLiveQuote(candidate, liveQuotes);
    return {
      contract: "LiveMarketAssessment",
      version: 1,
      market_family: family,
      status: sportsScore >= 58 ? "available" : "insufficient_information",
      projection,
      candidate: { ...candidate, active_quote: quote },
      reasons: candidate.reasons,
      risks: candidate.risks,
    };
  });
}

export function buildLiveDirectorVerdict(snapshot, assessments) {
  const candidates = assessments.filter((item) => item.status === "available" && item.candidate).map((item) => item.candidate).sort((left, right) => right.sports_score - left.sports_score || right.confidence_score - left.confidence_score);
  const primary = candidates[0] || null;
  const supported = primary && primary.sports_score >= 68 && primary.confidence_score >= 58;
  const decisionStatus = supported ? "yes" : primary ? "wait" : "no";
  const labels = { yes: "SÍ, ME GUSTA ESTA OPCIÓN", wait: "ESPERAR", no: "NO ME GUSTA ESTA OPCIÓN" };
  const explanation = supported ? `El snapshot LIVE respalda ${primary.selection} con datos acumulados y proyección acotada.` : primary ? "La lectura existe, pero la muestra LIVE todavía no alcanza el umbral operativo." : "Los datos LIVE disponibles no sostienen un mercado evaluable.";
  return Object.freeze({
    contract: "DirectorLiveVerdict",
    version: 1,
    voice: "DirectorAtlas",
    mode: "live",
    fixture: { fixture_id: snapshot.fixture_id, home_team: snapshot.home_team, away_team: snapshot.away_team, competition: snapshot.competition, season: snapshot.season, kickoff_utc: snapshot.kickoff_utc },
    live_context: { snapshot_id: snapshot.snapshot_id, minute: snapshot.minute, status: snapshot.status, score: snapshot.score, captured_at: snapshot.captured_at },
    analysis_decision: { status: decisionStatus, label: labels[decisionStatus], explanation },
    decision_code: decisionStatus,
    sports_verdict: primary ? { status: supported ? "sports_candidate" : "review_only", ...primary } : { status: "insufficient_information" },
    market_evaluated: primary ? { family: primary.market_family, label: primary.market_family } : null,
    selection: primary?.selection || null,
    line: primary?.line ?? null,
    analysis_confidence_score: primary?.confidence_score || 0,
    estimated_probability: null,
    probability_status: "unavailable",
    price_assessment: primary?.active_quote ? { status: "observed_live_price_unpriced", mode: "live", bookmaker: primary.active_quote.bookmaker_name, decimal_odds: primary.active_quote.decimal_odds, freshness: primary.active_quote.freshness, source_status: primary.active_quote.source_status, message: "Cuota LIVE vigente observada; Atlas no estima valor sin probabilidad deportiva validada." } : { status: "unavailable", mode: "live", freshness: "unavailable", source_status: "unavailable", message: "No existe una cuota LIVE compatible y vigente." },
    reasons: primary?.reasons || [],
    simple_reasons: (primary?.reasons || []).slice(0, 3),
    risks: primary?.risks || [],
  });
}

export function analyzeLiveMatch({ analysisId, competitionKey, fixture, statistics = null, liveOddsPayload = [], fixtureFetchedAt, statisticsFetchedAt = null, oddsFetchedAt = null, analyzedAt = new Date().toISOString() } = {}) {
  const snapshotResult = createLiveMatchSnapshot({ fixture, statistics, fixtureFetchedAt, statisticsFetchedAt, oddsFetchedAt, snapshotAt: analyzedAt });
  if (snapshotResult.status !== "success") return { contract: "LiveAnalysisResult", version: 1, status: "unavailable", mode: "live", errorCode: snapshotResult.errorCode, analysis_id: null, snapshot: null, market_assessments: [], director: null };
  const liveOdds = normalizeLiveOdds(liveOddsPayload, { fixtureId: fixture.fixtureId, fetchedAt: oddsFetchedAt || analyzedAt, now: analyzedAt });
  const assessments = buildLiveMarketAssessments(snapshotResult.snapshot, liveOdds);
  const director = buildLiveDirectorVerdict(snapshotResult.snapshot, assessments);
  return Object.freeze({
    contract: "LiveAnalysisResult",
    version: 1,
    status: "success",
    mode: "live",
    analysis_id: analysisId,
    fixture_id: Number(fixture.fixtureId),
    competition_key: competitionKey,
    analyzed_at: analyzedAt,
    pipeline_version: LIVE_ANALYSIS_VERSION,
    snapshot: snapshotResult.snapshot,
    market_assessments: assessments,
    live_odds: liveOdds,
    active_quote: director.sports_verdict?.active_quote || null,
    director,
  });
}
