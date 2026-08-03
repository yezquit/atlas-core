import { QUALITY_STATUS } from "../contracts/sportsIntelligenceContracts.js";

export const SPORTS_MARKETS = Object.freeze([
  { id: "goals", label: "Goles" },
  { id: "total_shots", label: "Remates totales" },
  { id: "shots_on_goal", label: "Remates a puerta" },
  { id: "cards", label: "Tarjetas" },
  { id: "corners", label: "Córners" },
]);

const MARKET_RULES = Object.freeze({
  goals: {
    label: "Goles",
    leagueMetric: "goals_per_match",
    teamMetric: "goals_for_per_match",
    requiresReferee: false,
    weatherRisks: ["heavy_rain", "strong_wind", "extreme_heat", "extreme_cold"],
  },
  total_shots: {
    label: "Remates totales",
    leagueMetric: "total_shots_per_match",
    teamMetric: "total_shots_per_match",
    requiresReferee: false,
    weatherRisks: ["heavy_rain", "strong_wind", "compromised_surface"],
  },
  shots_on_goal: {
    label: "Remates a puerta",
    leagueMetric: "shots_on_goal_per_match",
    teamMetric: "shots_on_goal_per_match",
    requiresReferee: false,
    weatherRisks: ["heavy_rain", "strong_wind", "compromised_surface"],
  },
  cards: {
    label: "Tarjetas",
    leagueMetric: "yellow_cards_per_match",
    teamMetric: "yellow_cards_per_match",
    requiresReferee: true,
    weatherRisks: [],
  },
  corners: {
    label: "Córners",
    leagueMetric: "corners_per_match",
    teamMetric: "corners_per_match",
    requiresReferee: false,
    weatherRisks: ["heavy_rain", "strong_wind", "compromised_surface"],
  },
});

function hasTeamMetric(profile, metric) {
  return Number.isFinite(profile?.general?.[metric]);
}

function roleSample(profile, role) {
  return role === "home" ? profile?.as_home?.sample_size || 0 : profile?.as_away?.sample_size || 0;
}

export function evaluateSportsMarket({
  marketId,
  leagueProfile,
  homeTeamProfile,
  awayTeamProfile,
  refereeProfile,
  venueWeatherContext,
  line = null,
  odds = null,
}) {
  const rule = MARKET_RULES[marketId];
  if (!rule) {
    return {
      market_family: marketId || "unknown",
      market_label: "Mercado no soportado",
      data_requirements: [],
      available_evidence: [],
      missing_evidence: ["Mercado fuera del catálogo de Fase 2."],
      league_context: null,
      home_team_context: null,
      away_team_context: null,
      referee_context: null,
      venue_weather_context: null,
      sample_size: 0,
      technical_support_score: 0,
      quality_status: QUALITY_STATUS.UNAVAILABLE,
      risk_flags: ["unsupported_market"],
      candidate: false,
      actionable: false,
      explanation: "Atlas no tiene una regla verificable para este mercado.",
      next_action: "Elegir uno de los cinco mercados disponibles.",
      estimatedProbability: null,
      probabilityStatus: "unavailable",
      line,
      odds,
    };
  }

  const leagueMetric = leagueProfile?.metrics?.[rule.leagueMetric];
  const leagueReady =
    leagueProfile?.sample_size >= 8 && Number.isFinite(leagueMetric?.value);
  const homeReady =
    homeTeamProfile?.sample_size >= 5 && hasTeamMetric(homeTeamProfile, rule.teamMetric);
  const awayReady =
    awayTeamProfile?.sample_size >= 5 && hasTeamMetric(awayTeamProfile, rule.teamMetric);
  const homeRoleReady = roleSample(homeTeamProfile, "home") >= 2;
  const awayRoleReady = roleSample(awayTeamProfile, "away") >= 2;
  const refereeReady =
    !rule.requiresReferee ||
    (refereeProfile?.status === "confirmed" &&
      refereeProfile?.quality_status === QUALITY_STATUS.VERIFIED);
  const requirements = [
    ["Perfil de liga con muestra suficiente", leagueReady, `league:${rule.leagueMetric}`],
    ["Histórico reciente del equipo local", homeReady, `team:${homeTeamProfile?.team_id}:recent`],
    ["Histórico reciente del equipo visitante", awayReady, `team:${awayTeamProfile?.team_id}:recent`],
    ["Rendimiento del local en casa", homeRoleReady, `team:${homeTeamProfile?.team_id}:home`],
    ["Rendimiento del visitante fuera", awayRoleReady, `team:${awayTeamProfile?.team_id}:away`],
    ...(rule.requiresReferee
      ? [["Histórico arbitral suficiente", refereeReady, `referee:${refereeProfile?.normalized_name || "missing"}`]]
      : []),
  ];
  const availableEvidence = requirements
    .filter(([, available]) => available)
    .map(([requirement, , sourceRef]) => ({ requirement, source_ref: sourceRef }));
  const missingEvidence = requirements
    .filter(([, available]) => !available)
    .map(([requirement]) => requirement);
  const riskFlags = (venueWeatherContext?.risk_flags || []).filter((flag) =>
    rule.weatherRisks.includes(flag)
  );
  if (rule.requiresReferee && !refereeReady) riskFlags.push("referee_sample_insufficient");
  const score = Math.round(
    (availableEvidence.length / Math.max(1, requirements.length)) * 80 +
      (riskFlags.length === 0 ? 20 : Math.max(0, 20 - riskFlags.length * 5))
  );
  const candidate = missingEvidence.length === 0 && score >= 70;
  const sampleSize = Math.min(
    leagueProfile?.sample_size || 0,
    homeTeamProfile?.sample_size || 0,
    awayTeamProfile?.sample_size || 0,
    ...(rule.requiresReferee ? [refereeProfile?.sample_size || 0] : [])
  );

  return {
    market_family: marketId,
    market_label: rule.label,
    data_requirements: requirements.map(([requirement]) => requirement),
    available_evidence: availableEvidence,
    missing_evidence: missingEvidence,
    league_context: leagueMetric || null,
    home_team_context: {
      sample_size: homeTeamProfile?.sample_size || 0,
      metric: homeTeamProfile?.general?.[rule.teamMetric] ?? null,
      home_sample_size: homeTeamProfile?.as_home?.sample_size || 0,
    },
    away_team_context: {
      sample_size: awayTeamProfile?.sample_size || 0,
      metric: awayTeamProfile?.general?.[rule.teamMetric] ?? null,
      away_sample_size: awayTeamProfile?.as_away?.sample_size || 0,
    },
    referee_context: rule.requiresReferee ? refereeProfile : null,
    venue_weather_context: {
      weather_status: venueWeatherContext?.weather_status || "unavailable",
      relevant_risk_flags: riskFlags.filter((flag) => flag !== "referee_sample_insufficient"),
    },
    sample_size: sampleSize,
    technical_support_score: score,
    quality_status: candidate
      ? QUALITY_STATUS.VERIFIED
      : availableEvidence.length > 0
        ? QUALITY_STATUS.INSUFFICIENT_SAMPLE
        : QUALITY_STATUS.UNAVAILABLE,
    risk_flags: [...new Set(riskFlags)],
    candidate,
    actionable: false,
    explanation: candidate
      ? "La evidencia permite revisar este mercado, pero no equivale a una apuesta autorizada."
      : "La evaluación permanece limitada por evidencia o muestra insuficiente.",
    next_action: candidate
      ? "Revisar una línea y cuota verificables sin inferir probabilidad."
      : missingEvidence[0] || "Completar evidencia verificable.",
    line,
    odds,
    estimatedProbability: null,
    probabilityStatus: "unavailable",
  };
}

export function evaluateSportsMarkets(context) {
  return SPORTS_MARKETS.map((market) =>
    evaluateSportsMarket({ ...context, marketId: market.id })
  );
}

export function selectBestSupportedMarket(assessments = [], requestedMarketId = "open") {
  const candidates =
    requestedMarketId && requestedMarketId !== "open"
      ? assessments.filter((item) => item.market_family === requestedMarketId)
      : assessments;
  return [...candidates].sort((left, right) => {
    if (left.candidate !== right.candidate) return left.candidate ? -1 : 1;
    if (right.technical_support_score !== left.technical_support_score) {
      return right.technical_support_score - left.technical_support_score;
    }
    if (right.sample_size !== left.sample_size) return right.sample_size - left.sample_size;
    return left.market_family.localeCompare(right.market_family);
  })[0] || null;
}
