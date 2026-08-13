export const SPORTS_INTELLIGENCE_VERSION = 3;

export const QUALITY_STATUS = Object.freeze({
  VERIFIED: "verified",
  PARTIAL: "partial",
  INSUFFICIENT_SAMPLE: "insufficient_sample",
  UNAVAILABLE: "unavailable",
  CONTRADICTED: "contradicted",
});

export const WEATHER_STATUS = Object.freeze({
  FORECAST: "forecast",
  OBSERVED: "observed",
  STALE: "stale",
  UNAVAILABLE: "unavailable",
});

export const CACHE_STATUS = Object.freeze({
  HIT: "hit",
  MISS: "miss",
  DEDUPLICATED: "deduplicated",
});

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

export function createMetric({
  value = null,
  sampleSize = 0,
  coverageStatus = QUALITY_STATUS.UNAVAILABLE,
  sourceRefs = [],
  warning = null,
}) {
  return {
    value: numberOrNull(value),
    sample_size: sampleSize,
    coverage_status: coverageStatus,
    source_refs: [...new Set(sourceRefs)].filter(Boolean),
    warning,
  };
}

export function createLeagueProfile(input = {}) {
  return {
    contract: "LeagueIntelligenceProfile",
    version: SPORTS_INTELLIGENCE_VERSION,
    competition_id: input.competitionId ?? null,
    competition_name: input.competitionName || null,
    season: input.season ?? null,
    window_start: input.windowStart || null,
    window_end: input.windowEnd || null,
    sample_size: input.sampleSize || 0,
    generated_at: input.generatedAt || new Date().toISOString(),
    source: input.source || "api-football",
    coverage: input.coverage || null,
    metrics: input.metrics || {},
    unavailable_metrics: input.unavailableMetrics || [],
    quality_status: input.qualityStatus || QUALITY_STATUS.UNAVAILABLE,
    labels: input.labels || [],
    warnings: input.warnings || [],
    event_samples: input.eventSamples || {},
    source_refs: input.sourceRefs || [],
    thresholds_version: input.thresholdsVersion || "league-v1",
  };
}

export function createTeamRecentProfile(input = {}) {
  return {
    contract: "TeamRecentIntelligence",
    version: SPORTS_INTELLIGENCE_VERSION,
    team_id: input.teamId ?? null,
    team_name: input.teamName || null,
    season: input.season ?? null,
    window_start: input.windowStart || null,
    window_end: input.windowEnd || null,
    fixture_ids: input.fixtureIds || [],
    sample_size: input.sampleSize || 0,
    last_5: input.last5 || null,
    last_10: input.last10 || null,
    general: input.general || null,
    as_home: input.asHome || null,
    as_away: input.asAway || null,
    quality_status: input.qualityStatus || QUALITY_STATUS.UNAVAILABLE,
    source_refs: input.sourceRefs || [],
    warnings: input.warnings || [],
    event_samples: input.eventSamples || {},
    sample_origins: input.sampleOrigins || [],
  };
}

export function createRefereeProfile(input = {}) {
  return {
    contract: "RefereeIntelligence",
    version: SPORTS_INTELLIGENCE_VERSION,
    referee_name: input.refereeName || null,
    normalized_name: input.normalizedName || null,
    status: input.status || "missing",
    matches_in_sample: input.matchesInSample || 0,
    window_start: input.windowStart || null,
    window_end: input.windowEnd || null,
    competitions_included: input.competitionsIncluded || [],
    yellow_cards_per_match: numberOrNull(input.yellowCardsPerMatch),
    red_cards_per_match: numberOrNull(input.redCardsPerMatch),
    fouls_per_match: numberOrNull(input.foulsPerMatch),
    penalties_per_match: numberOrNull(input.penaltiesPerMatch),
    home_away_distribution: input.homeAwayDistribution || null,
    last_5: input.last5 || null,
    last_10: input.last10 || null,
    last_20: input.last20 || null,
    league_comparison: input.leagueComparison || null,
    sample_size: input.sampleSize || 0,
    freshness: input.freshness || null,
    quality_status: input.qualityStatus || QUALITY_STATUS.UNAVAILABLE,
    source_refs: input.sourceRefs || [],
    warnings: input.warnings || [],
    event_samples: input.eventSamples || {},
  };
}

export function createVenueWeatherContext(input = {}) {
  return {
    contract: "VenueWeatherContext",
    version: SPORTS_INTELLIGENCE_VERSION,
    venue: input.venue || null,
    city: input.city || null,
    country: input.country || null,
    altitude: numberOrNull(input.altitude),
    surface: input.surface || null,
    local_kickoff_time: input.localKickoffTime || null,
    temperature: numberOrNull(input.temperature),
    feels_like: numberOrNull(input.feelsLike),
    humidity: numberOrNull(input.humidity),
    precipitation: numberOrNull(input.precipitation),
    rain_intensity: numberOrNull(input.rainIntensity),
    wind_speed: numberOrNull(input.windSpeed),
    wind_gusts: numberOrNull(input.windGusts),
    weather_status: input.weatherStatus || WEATHER_STATUS.UNAVAILABLE,
    source: input.source || null,
    fetched_at: input.fetchedAt || null,
    warnings: input.warnings || [],
    risk_flags: input.riskFlags || [],
    source_refs: input.sourceRefs || [],
  };
}
