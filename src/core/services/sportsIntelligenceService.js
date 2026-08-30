import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import {
  expectedSeasonForDate,
  getApiFootballCompetitionByKey,
} from "../data/apiFootballLeagues.js";
import { buildLeagueIntelligence } from "../intelligence/leagueIntelligence.js";
import {
  SPORTS_MARKETS,
  evaluateSportsMarkets,
  selectBestSupportedMarket,
} from "../intelligence/marketEngine.js";
import { buildRankedMarketSelection, selectCandidateQuote } from "../intelligence/marketCandidateRanker.js";
import { buildMarketOpportunityRadar, attachRadarContext } from "../intelligence/marketOpportunityRadar.js";
import { buildDecisionFrontier } from "../intelligence/decisionFrontier.js";
import { normalizeProviderOdds } from "../intelligence/oddsIntelligence.js";
import { buildCompetitionProfileContext, findCompetitionProfile } from "../intelligence/competitionProfile.js";
import {
  buildRefereeIntelligence,
  normalizeRefereeName,
} from "../intelligence/refereeIntelligence.js";
import { buildTeamRecentIntelligence } from "../intelligence/teamRecentIntelligence.js";
import { buildVenueWeatherContext } from "../intelligence/venueWeatherContext.js";
import { buildCompetitiveContext } from "../intelligence/competitiveContext.js";
import { isModelLimitation } from "../intelligence/redTeamAtlas.js";
import { assessPrematchEligibility, filterPrematchFixtures } from "../intelligence/prematchEligibility.js";
import { buildPhaseTwoDirectorVerdict } from "../modules/directorAtlas.js";
import { isValidIsoDate, validateFixtureId } from "./apiFootballService.js";
import { normalizeTimeZone } from "../intelligence/dateTimeContext.js";

const PROFILE_WINDOW_DAYS = 120;
const PROFILE_FIXTURE_LIMIT = 10;
const REFEREE_FIXTURE_LIMIT = 10;
const SUPPORTED_MARKET_IDS = new Set(SPORTS_MARKETS.map((market) => market.id));

// Idéntico a attachRadarContextByFamily en operationalAnalysisService.js
// (Fase 3B): cada candidato recibe el radar_context de SU PROPIA familia,
// nunca el de otra.
function attachRadarContextByFamily(candidates, radarResults) {
  const radarByFamily = new Map(radarResults.map((radar) => [radar.market_family, radar]));
  return candidates.map((candidate) => attachRadarContext([candidate], radarByFamily.get(candidate.market_family) || null)[0]);
}

// Adjunta el resultado COMPLETO de MarketOpportunityRadar (no solo el
// contexto reducido de attachRadarContext) por market_family, para lectura
// presentacional en Jornada/Recomendadas: model_coherence, señales,
// opposing_strength y demás métricas auditables que el Radar ya calcula.
// No modifica marketOpportunityRadar.js ni attachRadarContext; no altera
// candidate_id, línea, probabilidad, sports_score, ranking ni universo.
function attachRadarAnalysisByFamily(candidates, radarResults) {
  const radarByFamily = new Map(radarResults.map((radar) => [radar.market_family, radar]));
  return candidates.map((candidate) => ({
    ...candidate,
    radar_analysis: radarByFamily.get(candidate.market_family) || null,
  }));
}

function lowerFamilyReason(candidate, winner) {
  if (!candidate) return "Sin candidatos válidos.";
  const candidateWidth = Number(candidate.uncertainty_high) - Number(candidate.uncertainty_low);
  const winnerWidth = Number(winner.uncertainty_high) - Number(winner.uncertainty_low);
  if ((candidate.sample_size_effective || 0) < 5) return "Muestra insuficiente.";
  if (candidateWidth > winnerWidth) return "Incertidumbre mayor.";
  if (candidate.preliminary_probability < winner.preliminary_probability) return "Probabilidad menor.";
  return "Puntaje deportivo inferior.";
}

export function buildJourneyFamilyComparison(selection, marketAssessments = [], selectedCandidate = null) {
  const winner = selectedCandidate || selection?.primary || null;
  const assessmentByFamily = new Map(marketAssessments.map((item) => [item.market_family, item]));
  const bestByFamily = new Map();
  for (const candidate of selection?.ranked_candidates || []) {
    if (!bestByFamily.has(candidate.market_family)) bestByFamily.set(candidate.market_family, candidate);
  }
  const families = (selection?.generated || []).map((generated) => {
    const candidate = bestByFamily.get(generated.market_family) || null;
    const assessment = assessmentByFamily.get(generated.market_family) || null;
    let reason = candidate && winner ? lowerFamilyReason(candidate, winner) : "Sin candidatos válidos.";
    if (!candidate && generated.reason === "insufficient_distribution_data") reason = "Muestra insuficiente.";
    else if (!candidate && (assessment?.available_evidence?.length || 0) < (assessment?.data_requirements?.length || 0) * 0.7) reason = "Cobertura insuficiente.";
    else if (!candidate && (assessment?.risk_flags || []).some((item) => /crític|critical|depend/i.test(item))) reason = "Dependencia crítica.";
    if (candidate?.candidate_id === winner?.candidate_id) reason = "Mejor opción por frontera de decisión, conservando elegibilidad y evidencia deportiva.";
    return {
      market_family: generated.market_family,
      market_label: assessment?.market_label || generated.market_family,
      best_score: candidate?.sports_score ?? null,
      best_rank: candidate?.rank ?? null,
      reason,
    };
  });
  return {
    general_rank: winner?.rank ?? null,
    family_rank: winner?.family_rank ?? null,
    sports_score: winner?.sports_score ?? null,
    families_compared: families.map((item) => item.market_label),
    best_by_family: families,
    why_market_won: winner
      ? `${assessmentByFamily.get(winner.market_family)?.market_label || winner.market_family} fue destacada por la frontera de decisión V3, sin alterar probabilidad ni soporte deportivo.`
      : "No hubo un candidato destacado.",
  };
}

export function deriveJourneyOutcome({ fixturesFound = 0, candidates = [], telemetry = {} } = {}) {
  if (telemetry.budgetExhausted && candidates.length === 0) {
    return { status: DATA_LOAD_STATUS.BLOCKED, reason: "provider_quota_or_budget", displayTone: "blocked", overallStatus: "blocked", message: "Análisis bloqueado por un límite crítico antes de producir candidatos." };
  }
  if (candidates.length === 0) {
    return {
      status: DATA_LOAD_STATUS.EMPTY,
      reason: fixturesFound === 0 ? "no_fixtures" : "no_sports_candidates",
      displayTone: "neutral",
      overallStatus: "no_candidates",
      message: fixturesFound === 0 ? "No se encontraron partidos en las competiciones seleccionadas." : "No se encontraron candidatos con respaldo suficiente",
    };
  }
  const priceComplete = candidates.every((candidate) => ["verified_current", "user_reported_current"].includes(candidate.priceStatus));
  return priceComplete
    ? { status: DATA_LOAD_STATUS.SUCCESS, reason: null, displayTone: "success", overallStatus: "completed", message: "Análisis de jornada completado" }
    : { status: DATA_LOAD_STATUS.SUCCESS, reason: null, displayTone: "warning", overallStatus: "candidates_pending_price", message: "Candidatos deportivos encontrados — evaluación de precio pendiente" };
}

function dateShift(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function failure({ status = DATA_LOAD_STATUS.UNAVAILABLE, errorCode, message, runtime }) {
  return {
    contract: "AtlasSportsIntelligenceAnalysis",
    version: 2,
    status,
    errorCode,
    message,
    selectedFixtureId: null,
    fixture: null,
    competitionMetadata: null,
    leagueProfile: null,
    homeTeamProfile: null,
    awayTeamProfile: null,
    refereeProfile: null,
    venueWeatherContext: null,
    marketAssessments: [],
    director: buildPhaseTwoDirectorVerdict({
      dataStatus: status,
      dataErrorCode: errorCode,
    }),
    telemetry: runtime?.snapshot?.() || null,
  };
}

export function validateSportsAnalysisInput(input = {}) {
  if (!isValidIsoDate(input.date)) {
    return { errorCode: "invalid_date", message: "La fecha debe ser válida." };
  }
  const competition = getApiFootballCompetitionByKey(input.competitionKey);
  if (!competition) {
    return {
      errorCode: "invalid_competition",
      message: "La competición no pertenece al catálogo administrado.",
    };
  }
  const season = Number(input.season);
  if (!Number.isInteger(season) || season !== expectedSeasonForDate(competition, input.date)) {
    return {
      errorCode: "invalid_season",
      message: "La temporada no coincide con la fecha y competición.",
    };
  }
  const fixtureValidation = validateFixtureId(input.fixtureId);
  if (fixtureValidation.status !== DATA_LOAD_STATUS.SUCCESS) {
    return { errorCode: fixtureValidation.errorCode, message: fixtureValidation.message };
  }
  if (
    input.marketId &&
    input.marketId !== "open" &&
    !SUPPORTED_MARKET_IDS.has(input.marketId)
  ) {
    return {
      errorCode: "invalid_market",
      message: "El mercado no pertenece al catálogo de Fase 2.",
    };
  }
  return {
    competition,
    season,
    fixtureId: fixtureValidation.fixtureId,
    timezone: normalizeTimeZone(input.timezone),
  };
}

async function loadStatisticsMap(gateway, fixtureIds) {
  const entries = await Promise.all(
    [...new Set(fixtureIds)].map(async (fixtureId) => {
      const result = await gateway.loadFixtureStatistics(fixtureId);
      return [fixtureId, result];
    })
  );
  return new Map(
    entries
      .filter(([, result]) => result.status === DATA_LOAD_STATUS.SUCCESS)
      .map(([fixtureId, result]) => [fixtureId, result.statistics])
  );
}

export async function analyzeSportsFixture(input, gateway) {
  const validation = validateSportsAnalysisInput(input);
  if (validation.errorCode) {
    return failure({ ...validation, runtime: gateway.runtime });
  }
  const { competition, season, fixtureId, timezone } = validation;
  const metadata = await gateway.loadCompetitionMetadata(competition, season);
  if (metadata.status !== DATA_LOAD_STATUS.SUCCESS) {
    return failure({ ...metadata, runtime: gateway.runtime });
  }

  const selected = await gateway.loadFixtureById({
    fixtureId,
    competition,
    date: input.date,
    season,
    timezone,
  });
  if (selected.status !== DATA_LOAD_STATUS.SUCCESS) {
    return {
      ...failure({ ...selected, runtime: gateway.runtime }),
      selectedFixtureId: selected.selectedFixtureId ?? fixtureId,
    };
  }
  const fixture = selected.fixture;
  if (Number(fixture?.fixtureId) !== fixtureId) {
    return {
      ...failure({
        status: DATA_LOAD_STATUS.BLOCKED,
        errorCode: "fixture_selection_mismatch",
        message: "El proveedor intentó sustituir el fixture ID seleccionado.",
        runtime: gateway.runtime,
      }),
      selectedFixtureId: fixtureId,
    };
  }
  if (input.prematchOnly) {
    const prematch = assessPrematchEligibility(fixture, {
      now: input.analyzedAt || input.now || new Date().toISOString(),
    });
    if (!prematch.eligible) {
      return {
        ...failure({
          status: DATA_LOAD_STATUS.BLOCKED,
          errorCode: "prematch_fixture_closed",
          message: prematch.message,
          runtime: gateway.runtime,
        }),
        selectedFixtureId: fixtureId,
        prematchEligibility: prematch,
      };
    }
  }
  const windowEnd = dateShift(input.date, -1);
  const windowStart = dateShift(input.date, -PROFILE_WINDOW_DAYS);
  const [leagueWindow, homeRecent, awayRecent] = await Promise.all([
    gateway.loadLeagueWindow({ competition, season, from: windowStart, to: windowEnd }),
    gateway.loadTeamRecent({ teamId: fixture.teams.home.id, season }),
    gateway.loadTeamRecent({ teamId: fixture.teams.away.id, season }),
  ]);
  const leagueHistory = (leagueWindow.fixtures || []).sort(
    (left, right) => Date.parse(right.date.utc) - Date.parse(left.date.utc)
  );
  const leagueFixtures = leagueHistory.slice(0, PROFILE_FIXTURE_LIMIT);
  const homeFixtures = homeRecent.fixtures || [];
  const awayFixtures = awayRecent.fixtures || [];
  const normalizedReferee = normalizeRefereeName(fixture?.referee?.name || "");
  const refereeFixtures = normalizedReferee
    ? leagueHistory
        .filter(
          (item) =>
            normalizeRefereeName(item?.referee?.name || "") === normalizedReferee
        )
        .slice(0, REFEREE_FIXTURE_LIMIT)
    : [];
  const historicalFixtures = [
    ...new Map(
      [
        ...leagueFixtures,
        ...homeFixtures,
        ...awayFixtures,
        ...refereeFixtures,
      ].map((item) => [item.fixtureId, item])
    ).values(),
  ];
  const statisticsByFixture = await loadStatisticsMap(
    gateway,
    historicalFixtures.map((item) => item.fixtureId)
  );
  const leagueProfile = buildLeagueIntelligence({
    competition,
    season,
    windowStart,
    windowEnd,
    fixtures: leagueFixtures,
    statisticsByFixture,
    coverage: metadata.seasonMetadata.coverage,
  });
  const homeTeamProfile = buildTeamRecentIntelligence({
    teamId: fixture.teams.home.id,
    teamName: fixture.teams.home.name,
    season,
    targetDate: fixture.date.utc,
    fixtures: homeFixtures,
    statisticsByFixture,
  });
  const awayTeamProfile = buildTeamRecentIntelligence({
    teamId: fixture.teams.away.id,
    teamName: fixture.teams.away.name,
    season,
    targetDate: fixture.date.utc,
    fixtures: awayFixtures,
    statisticsByFixture,
  });
  const refereeProfile = buildRefereeIntelligence({
    fixture,
    historicalFixtures: leagueHistory,
    statisticsByFixture,
    leagueProfile,
  });
  const venueWeatherContext = buildVenueWeatherContext({ fixture });
  const competitiveContext = buildCompetitiveContext({
    fixture,
    competition: {
      ...fixture.competition,
      name: competition.localName || fixture.competition?.name || null,
      country: fixture.competition?.country || competition.country || null,
      season: fixture.competition?.season ?? season,
    },
    homeTeamProfile,
    awayTeamProfile,
  });
  const marketAssessments = evaluateSportsMarkets({
    leagueProfile,
    homeTeamProfile,
    awayTeamProfile,
    refereeProfile,
    venueWeatherContext,
    competitiveContext,
    line: input.line || null,
    odds: input.odds || null,
  });
  const requestedMarketIds = Array.isArray(input.marketIds)
    ? new Set(input.marketIds)
    : null;
  const eligibleAssessments = requestedMarketIds?.size
    ? marketAssessments.filter((assessment) =>
        requestedMarketIds.has(assessment.market_family)
      )
    : marketAssessments;
  const requestedMarket = input.marketId || "open";
  const selectedMarket = selectBestSupportedMarket(
    eligibleAssessments,
    requestedMarket
  );
  const evidenceRefs = [
    `fixture:${fixture.fixtureId}`,
    ...leagueProfile.source_refs,
    ...homeTeamProfile.source_refs,
    ...awayTeamProfile.source_refs,
    ...refereeProfile.source_refs,
    ...venueWeatherContext.source_refs,
  ];
  const dataStatus = gateway.runtime.snapshot().budgetExhausted
    ? DATA_LOAD_STATUS.BLOCKED
    : DATA_LOAD_STATUS.SUCCESS;
  const dataErrorCode =
    dataStatus === DATA_LOAD_STATUS.BLOCKED ? "request_budget_exhausted" : null;
  const director = buildPhaseTwoDirectorVerdict({
    dataStatus,
    dataErrorCode,
    fixture,
    competition,
    marketAssessment: selectedMarket,
    evidenceRefs,
  });

  return {
    contract: "AtlasSportsIntelligenceAnalysis",
    version: 2,
    status: dataStatus,
    errorCode: dataErrorCode,
    message:
      dataStatus === DATA_LOAD_STATUS.BLOCKED
        ? "El análisis se detuvo al alcanzar el presupuesto configurado."
        : "Análisis deportivo construido para el fixture ID seleccionado.",
    selectedFixtureId: fixtureId,
    fixture,
    competition: { ...competition },
    timezone,
    competitionMetadata: metadata,
    leagueProfile,
    homeTeamProfile,
    awayTeamProfile,
    refereeProfile,
    venueWeatherContext,
    competitiveContext,
    marketAssessments: eligibleAssessments,
    selectedMarket,
    evidenceRefs: [...new Set(evidenceRefs)],
    director,
    telemetry: gateway.runtime.snapshot(),
  };
}

export function toJourneyCandidate({ analysis, candidate, comparison }) {
  const fixtureId = Number(analysis.fixture.fixtureId);
  const risks = (candidate.limitations || []).filter((item) => !isModelLimitation(item)).slice(0, 3);
  const fixtureEvidence = {
    fixture_id: fixtureId,
    reasons: [...(candidate.simple_sports_reasons || [])],
    risks: [...risks],
    explanation: comparison.why_market_won,
  };
  return {
    competition: analysis.competition.localName,
    competitionKey: analysis.competition.key,
    season: analysis.fixture.competition.season,
    fixtureId,
    fixture: `${analysis.fixture.teams.home.name} vs ${analysis.fixture.teams.away.name}`,
    kickoff: analysis.fixture.date.utc,
    kickoffLocal: analysis.fixture.date.kickoff_local,
    timezone: analysis.fixture.date.timezone,
    localCalendarDate: analysis.fixture.date.local_calendar_date,
    market: analysis.marketAssessments.find((item) => item.market_family === candidate.market_family)?.market_label || candidate.market_family,
    marketId: candidate.market_family,
    analysisMode: "specific",
    selection: candidate.selection,
    direction: candidate.direction,
    line: candidate.line,
    probability: candidate.preliminary_probability,
    estimatedProbability: candidate.estimated_probability,
    probabilityPercent: candidate.probability_percent,
    probabilityClassification: candidate.probability_classification,
    rankingEligible: candidate.ranking_eligible === true,
    uncertaintyLow: candidate.uncertainty_low,
    uncertaintyHigh: candidate.uncertainty_high,
    confidence: candidate.sports_score,
    priceStatus: candidate.price_status,
    status: candidate.overall_status,
    displayStatus: candidate.overall_status,
    technicalSupport: candidate.technical_support_score ?? candidate.sports_score,
    lineStabilityScore: candidate.line_stability_score,
    limitations: candidate.limitations || [],
    sampleSize: candidate.sample_size_effective,
    methodologyVersion: candidate.methodology_version,
    generalRank: candidate.rank,
    familyRank: candidate.family_rank,
    sportsScore: candidate.sports_score,
    radarContext: candidate.radar_context ?? null,
    radarAnalysis: candidate.radar_analysis ?? null,
    selectionQuality: candidate.selection_quality ?? null,
    decisionFrontier: candidate.decision_frontier ?? null,
    decisionEconomics: candidate.decision_economics ?? null,
    familiesCompared: comparison.families_compared,
    familyComparison: comparison.best_by_family,
    whyMarketWon: comparison.why_market_won,
    competitiveContext: analysis.competitiveContext,
    transferredCandidate: {
      fixture_id: analysis.fixture.fixtureId,
      analysis_mode: "specific",
      market_family: candidate.market_family,
      direction: candidate.direction,
      line: candidate.line,
      selection: candidate.selection,
      preliminary_probability: candidate.preliminary_probability,
      uncertainty: { low: candidate.uncertainty_low, high: candidate.uncertainty_high },
      sports_score: candidate.sports_score,
      technical_support_score: candidate.technical_support_score,
      line_stability_score: candidate.line_stability_score,
      sample_size_effective: candidate.sample_size_effective,
      limitations: candidate.limitations || [],
      rank: candidate.rank,
      overall_rank: candidate.overall_rank || candidate.rank,
      family_rank: candidate.family_rank,
      reasons: candidate.simple_sports_reasons,
      risks,
      methodology_version: candidate.methodology_version,
    },
    fixtureEvidence,
    reasons: fixtureEvidence.reasons,
    risks: fixtureEvidence.risks,
    missingData: ["Cuota actual para la línea exacta"],
    nextAction: "Atlas intentará recuperar una cuota exacta; si no existe, puedes ingresarla manualmente.",
    rankReason: candidate.rank_reason.join(" "),
  };
}

export function attachCompetitionProfile(candidate, profiles = []) {
  const profile = findCompetitionProfile(profiles, {
    competition: candidate.competition,
    competition_key: candidate.competitionKey,
    season: candidate.season,
  });
  return profile ? {
    ...candidate,
    competitionProfile: profile,
    competitionProfileContext: buildCompetitionProfileContext(profile),
  } : candidate;
}

export async function recoverJourneyCandidateOdds(candidates, gateway, now) {
  if (typeof gateway.loadFixtureOdds !== "function" || candidates.length === 0) return candidates;
  const fixtureContext = new Map(candidates.map((candidate) => [Number(candidate.fixtureId), candidate]));
  const oddsByFixture = new Map(await Promise.all([...fixtureContext].map(async ([fixtureId, candidate]) => {
    try {
      const raw = await gateway.loadFixtureOdds(fixtureId);
      if (raw.status !== DATA_LOAD_STATUS.SUCCESS) return [fixtureId, []];
      const normalized = normalizeProviderOdds({ response: raw.response, fixtureId, now, kickoff: candidate.kickoff });
      return [fixtureId, normalized.quotes];
    } catch {
      return [fixtureId, []];
    }
  })));
  return candidates.map((candidate) => {
    const price = selectCandidateQuote({
      market_family: candidate.marketId,
      direction: candidate.direction,
      line: candidate.line,
    }, oddsByFixture.get(Number(candidate.fixtureId)) || []);
    const usable = ["verified_current", "user_reported_current"].includes(price.status) && price.quote?.stale !== true;
    return {
      ...candidate,
      activeQuote: usable ? price.quote : null,
      priceStatus: usable ? price.status : price.status || "unavailable",
      missingData: usable ? [] : ["Cuota actual para la línea exacta"],
    };
  });
}

export function selectCombinationJourneyCandidates(entries = [], maximum = 50) {
  const groups = new Map();
  const eligible = entries.filter((entry) => entry.candidate?.ranking_eligible === true);
  const sorted = rankJourneyCandidatesByDecision(eligible, { product: "parlay" });
  for (const entry of sorted) {
    const key = Number(entry.analysis.fixture.fixtureId);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  const selected = [];
  let depth = 0;
  while (selected.length < maximum) {
    let added = false;
    for (const group of groups.values()) {
      if (group[depth]) {
        selected.push(group[depth]);
        added = true;
        if (selected.length === maximum) break;
      }
    }
    if (!added) break;
    depth += 1;
  }
  return selected;
}

// Presentation-only shortlist: the complete Journey catalogue is retained.
export function buildJourneyRecommendationShortlist(candidates = [], maximum = 10) {
  return (candidates || []).map((candidate) => {
    const support = Number(candidate.technicalSupport ?? candidate.sportsScore ?? candidate.confidence);
    const width = Number(candidate.uncertaintyHigh) - Number(candidate.uncertaintyLow);
    const frontier = candidate.decisionFrontier || {};
    const risky = ["RIESGOSA", "MUY RIESGOSA"].includes(candidate.probabilityClassification);
    const currentPrice = ["verified_current", "user_reported_current"].includes(candidate.priceStatus);
    const economics = candidate.decisionEconomics;
    const riskyWithPriceValue = risky && currentPrice && economics?.status === "available"
      && Number(economics.edge) > 0 && Number(economics.expected_value) > 0;
    const recommendable = frontier.recommended === true
      && frontier.status === "eligible"
      && Number(candidate.selectionQuality) >= 60
      && support >= 58
      && Number.isFinite(width)
      && width <= 0.35
      && (!risky || riskyWithPriceValue);
    if (!recommendable) return null;
    const sportsSignals = (candidate.fixtureEvidence?.reasons || candidate.reasons || []).filter(Boolean).slice(0, 2);
    const sportsReason = sportsSignals.length
      ? sportsSignals.join(" ")
      : "ATLAS no dispone de evidencia descriptiva suficiente para justificar esta recomendación más allá del modelo cuantitativo.";
    return {
      ...candidate,
      atlasRecommendation: {
        reason: sportsReason,
        frontier_note: riskyWithPriceValue
          ? `Frontera Atlas: entra por valor positivo pese a una clasificación de mayor riesgo (edge ${economics.edge}; EV ${economics.expected_value}).`
          : "Frontera Atlas: mantiene utilidad suficiente frente a líneas alternativas.",
        support,
        uncertainty_width: width,
      },
    };
  }).filter(Boolean)
    // Mismo criterio de orden que el universo completo: estimated_probability
    // descendente, sin prioridad de familia. selectionQuality sigue decidiendo
    // QUÉ entra al shortlist (arriba), no en qué orden se muestra.
    .sort((left, right) => {
      const leftProbability = Number.isFinite(left.estimatedProbability) ? left.estimatedProbability : -Infinity;
      const rightProbability = Number.isFinite(right.estimatedProbability) ? right.estimatedProbability : -Infinity;
      return rightProbability - leftProbability;
    })
    .slice(0, Math.max(0, maximum));
}

export async function scanSportsJourney(input, gateway) {
  const startedAt = Date.now();
  if (!isValidIsoDate(input?.date)) {
    return {
      status: DATA_LOAD_STATUS.UNAVAILABLE,
      errorCode: "invalid_date",
      reason: "internal_safe_error",
      message: "La fecha debe ser válida.",
      candidates: [],
      telemetry: gateway.runtime.snapshot(),
    };
  }
  const requestedMarketIds = [
    ...new Set(
      Array.isArray(input.marketIds)
        ? input.marketIds
        : SPORTS_MARKETS.map((market) => market.id)
    ),
  ];
  if (
    requestedMarketIds.length === 0 ||
    requestedMarketIds.some((marketId) => !SUPPORTED_MARKET_IDS.has(marketId))
  ) {
    return {
      status: DATA_LOAD_STATUS.UNAVAILABLE,
      errorCode: "invalid_market",
      reason: "insufficient_coverage",
      message: "Selecciona al menos un mercado válido.",
      candidates: [],
      telemetry: gateway.runtime.snapshot(),
    };
  }
  const competitionKeys = [...new Set(input.competitionKeys || [])];
  const competitions = competitionKeys
    .map(getApiFootballCompetitionByKey)
    .filter(Boolean);
  if (competitions.length !== competitionKeys.length || competitions.length === 0) {
    return {
      status: DATA_LOAD_STATUS.UNAVAILABLE,
      errorCode: "invalid_competition",
      reason: "unsupported_competition",
      message: "Selecciona al menos una competición válida.",
      candidates: [],
      telemetry: gateway.runtime.snapshot(),
    };
  }
  const referenceNow = input.now || `${input.date}T00:00:00.000Z`;
  const fixtures = [];
  const warnings = [];
  const providerFailureCodes = [];
  for (const competition of competitions) {
    const season = expectedSeasonForDate(competition, input.date);
    const metadata = await gateway.loadCompetitionMetadata(competition, season);
    if (metadata.status !== DATA_LOAD_STATUS.SUCCESS) {
      warnings.push(`${competition.localName}: ${metadata.message}`);
      providerFailureCodes.push(metadata.errorCode || metadata.status);
      continue;
    }
    const result = await gateway.loadFixturesForDate({
      competition,
      date: input.date,
      season,
      timezone: input.timezone,
    });
    if (result.status === DATA_LOAD_STATUS.SUCCESS) {
      fixtures.push(
        ...result.fixtures.map((fixture) => ({ fixture, competition, season }))
      );
    } else if (result.status !== DATA_LOAD_STATUS.EMPTY) {
      warnings.push(`${competition.localName}: ${result.message}`);
      providerFailureCodes.push(result.errorCode || result.status);
    }
  }

  const eligibility = filterPrematchFixtures(
    fixtures.map((item) => item.fixture),
    { now: referenceNow }
  );
  const eligibleIds = new Set(eligibility.eligible.map((fixture) => Number(fixture.fixtureId)));
  const eligibleFixtures = fixtures.filter((item) => eligibleIds.has(Number(item.fixture.fixtureId)));
  const exclusionsByReason = new Map();
  for (const excluded of eligibility.excluded) {
    exclusionsByReason.set(excluded.assessment.reason, (exclusionsByReason.get(excluded.assessment.reason) || 0) + 1);
  }
  for (const [reason, count] of exclusionsByReason) {
    warnings.push(`${count} partido(s) excluido(s) del flujo prepartido: ${reason}.`);
  }

  // Un escaneo debe analizar TODOS los fixtures elegibles descubiertos; el
  // único límite legítimo es el presupuesto real de solicitudes (budgetExhausted),
  // nunca un tope artificial de cantidad de partidos.
  const reviewed = [];
  for (const item of eligibleFixtures) {
    if (gateway.runtime.snapshot().budgetExhausted) break;
    const analysis = await analyzeSportsFixture(
      {
        date: input.date,
        competitionKey: item.competition.key,
        season: item.season,
        fixtureId: item.fixture.fixtureId,
        marketId: requestedMarketIds.length === 1 ? requestedMarketIds[0] : "open",
        marketIds: requestedMarketIds,
        timezone: input.timezone,
        prematchOnly: true,
        analyzedAt: referenceNow,
      },
      gateway
    );
    reviewed.push(analysis);
  }
  const analysisDiagnostics = [];
  const combinationEntries = [];

  const analysisCandidates = reviewed.flatMap((analysis) => {
    const selection = buildRankedMarketSelection({
      analysisMode: input.analysisMode === "specific" || requestedMarketIds.length === 1 ? "specific" : "general",
      requestedMarketId: requestedMarketIds.length === 1 ? requestedMarketIds[0] : null,
      marketAssessments: analysis.marketAssessments,
      leagueProfile: analysis.leagueProfile,
      homeTeamProfile: analysis.homeTeamProfile,
      awayTeamProfile: analysis.awayTeamProfile,
      refereeProfile: analysis.refereeProfile,
    });

    // Radar por familia (Fase 4), mismo patrón que Fase 3B: consume
    // selection.generated ya calculado, sin cuotas, sin contextItems/
    // contextImpacts (Jornada no tiene Gemini por fixture). El resultado
    // se adjunta como radar_context — nunca reemplaza ranked_candidates
    // ni cambia estimated_probability/sports_score/orden.
    const marketOpportunityRadar = (selection.generated || []).map((generatedLinesForFamily) =>
      buildMarketOpportunityRadar({ generatedLines: generatedLinesForFamily, contextItems: [], contextImpacts: [] })
    );
    const radarContextEnrichedCandidates = attachRadarContextByFamily(selection.ranked_candidates || [], marketOpportunityRadar);
    const radarEnrichedCandidates = attachRadarAnalysisByFamily(radarContextEnrichedCandidates, marketOpportunityRadar);

    analysisDiagnostics.push({
      competition: analysis?.competition?.localName || "Desconocida",
      fixtureId: analysis?.fixture?.fixtureId || null,
      fixture: analysis?.fixture
        ? `${analysis.fixture.teams.home.name} vs ${analysis.fixture.teams.away.name}`
        : null,
      analysisStatus: analysis?.director?.status || analysis?.status || null,
      rankedCandidateCount: selection?.ranked_candidates?.length || 0,
      marketAssessmentCount: analysis?.marketAssessments?.length || 0,
      marketStatuses: (analysis?.marketAssessments || []).map((item) => ({
        marketFamily: item.market_family,
        status: item.quality_status || item.status || null,
        candidate: item.candidate ?? null,
      })),
    });

    // Jornada debe mostrar el mismo universo exhaustivo que alimenta las
    // combinaciones (Parlay/Soñadora): todas las líneas/familias legítimamente
    // calculadas, no solo la mejor por familia por fixture.
    const entries = radarEnrichedCandidates.map((candidate) => ({
      analysis,
      candidate,
      comparison: buildJourneyFamilyComparison(selection, analysis.marketAssessments, candidate),
    }));
    combinationEntries.push(...entries);
    return entries;
  });
  const candidateDiagnosticsByCompetition = Object.fromEntries(
    [...analysisCandidates.reduce((map, entry) => {
      const competition = entry.analysis?.competition?.localName || "Desconocida";
      const current = map.get(competition);

      if (
        !current ||
        Number(entry.candidate?.sports_score || 0) > Number(current.sportsScore || 0)
      ) {
        map.set(competition, {
          fixtureId: entry.analysis?.fixture?.fixtureId || null,
          fixture: entry.analysis?.fixture
            ? `${entry.analysis.fixture.teams.home.name} vs ${entry.analysis.fixture.teams.away.name}`
            : null,
          selection: entry.candidate?.selection || null,
          marketFamily: entry.candidate?.market_family || null,
          sportsScore: entry.candidate?.sports_score ?? null,
          overallStatus: entry.candidate?.overall_status || null,
          rank: entry.candidate?.rank ?? null,
        });
      }

      return map;
    }, new Map())]
  );

  // Sin tope artificial: si el llamador pide explícitamente un número, se
  // respeta; si no, no se recorta la lista (no se descarta ningún candidato
  // ya analizado solo por un límite de presentación inventado).
  const requestedMaximumCandidates = Number(input.maximumCandidates);
  const maximumCandidates = Number.isInteger(requestedMaximumCandidates) && requestedMaximumCandidates > 0
    ? requestedMaximumCandidates
    : Number.POSITIVE_INFINITY;
  const competitionProfiles = Array.isArray(input.competitionProfiles) ? input.competitionProfiles : [];
  const highlightedSports = rankJourneyCandidatesByDecision(
    analysisCandidates.filter((entry) => entry.candidate?.ranking_eligible === true)
  ).slice(0, maximumCandidates).map(toJourneyCandidate).map((candidate) => attachCompetitionProfile(candidate, competitionProfiles));
  const combinationSports = selectCombinationJourneyCandidates(combinationEntries, maximumCandidates).map(toJourneyCandidate).map((candidate) => attachCompetitionProfile(candidate, competitionProfiles));
  const pricedUniverse = await recoverJourneyCandidateOdds(
    [...new Map([...highlightedSports, ...combinationSports].map((candidate) => [`${candidate.fixtureId}:${candidate.marketId}:${candidate.direction}:${candidate.line}`, candidate])).values()],
    gateway,
    referenceNow,
  );
  const pricedByIdentity = new Map(pricedUniverse.map((candidate) => [`${candidate.fixtureId}:${candidate.marketId}:${candidate.direction}:${candidate.line}`, candidate]));
  const highlighted = highlightedSports.map((candidate) => pricedByIdentity.get(`${candidate.fixtureId}:${candidate.marketId}:${candidate.direction}:${candidate.line}`) || candidate);
  const combinationCandidates = combinationSports.map((candidate) => pricedByIdentity.get(`${candidate.fixtureId}:${candidate.marketId}:${candidate.direction}:${candidate.line}`) || candidate);
  const recommendedCandidates = buildJourneyRecommendationShortlist(highlighted);
  const fixturesByCompetition = Object.fromEntries(
    [...fixtures.reduce((map, item) => {
      const name = item.competition.localName;
      map.set(name, (map.get(name) || 0) + 1);
      return map;
    }, new Map())]
  );

  const telemetry = gateway.runtime.snapshot();
  const outcome = deriveJourneyOutcome({ fixturesFound: eligibleFixtures.length, candidates: highlighted, telemetry });
  if (highlighted.length === 0 && !telemetry.budgetExhausted) {
    if (providerFailureCodes.some((code) => /timeout/i.test(code))) outcome.reason = "timeout";
    else if (fixtures.length === 0 && providerFailureCodes.length > 0) outcome.reason = "provider_unavailable";
    else if (reviewed.length > 0 && analysisCandidates.length === 0) outcome.reason = "insufficient_coverage";
  }
  return {
    contract: "JourneyExplorationResult",
    version: 2,
    status: outcome.status,
    reason: outcome.reason,
    displayTone: outcome.displayTone,
    overallStatus: outcome.overallStatus,
    message: outcome.message,
    date: input.date,
    timezone: normalizeTimeZone(input.timezone),
    competitionsQueried: competitions.map((item) => item.localName),
    fixturesFound: fixtures.length,
    fixturesByCompetition,
    prematchFixturesFound: eligibleFixtures.length,
    fixturesReviewed: reviewed.length,
    fixturesDiscarded: eligibility.excluded.length + Math.max(0, reviewed.length - highlighted.length),
    fixturesExcludedBeforeKickoff: eligibility.excluded.length,
    analyzableFixtures: reviewed.filter(
      (analysis) => analysis.director.status !== "insufficient_data"
    ).length,
    candidateDiagnosticsByCompetition,
    analysisDiagnostics,
    candidates: highlighted,
    recommendedCandidates,
    combinationCandidates,
    competitionProfilesApplied: competitionProfiles.length,
    warnings,
    executionTimeMs: Date.now() - startedAt,
    telemetry,
  };
}

// Agrupación de presentación (alta/media/baja) derivada de la clasificación
// YA EXISTENTE (probabilityClassification.js), sin inventar una fórmula de
// seguridad nueva: MUY ALTA/ALTA -> alta, BUENA/MODERADA -> media,
// RIESGOSA/MUY RIESGOSA -> baja. Las odds nunca intervienen en este orden.
const SAFETY_TIER_RANK = Object.freeze({
  "MUY ALTA": 0,
  ALTA: 0,
  BUENA: 1,
  MODERADA: 1,
  RIESGOSA: 2,
  "MUY RIESGOSA": 2,
});
function safetyTierRank(candidate) {
  const tier = SAFETY_TIER_RANK[candidate?.probability_classification];
  return tier === undefined ? 3 : tier;
}

export function rankJourneyCandidatesByProbability(entries = []) {
  return [...entries].sort((left, right) => {
    const tierDifference = safetyTierRank(left.candidate) - safetyTierRank(right.candidate);
    if (tierDifference) return tierDifference;

    const leftProbability = Number.isFinite(left.candidate?.estimated_probability) ? left.candidate.estimated_probability : -1;
    const rightProbability = Number.isFinite(right.candidate?.estimated_probability) ? right.candidate.estimated_probability : -1;
    if (rightProbability !== leftProbability) return rightProbability - leftProbability;

    const leftWidth = Number.isFinite(left.candidate?.uncertainty_high) && Number.isFinite(left.candidate?.uncertainty_low)
      ? left.candidate.uncertainty_high - left.candidate.uncertainty_low : Infinity;
    const rightWidth = Number.isFinite(right.candidate?.uncertainty_high) && Number.isFinite(right.candidate?.uncertainty_low)
      ? right.candidate.uncertainty_high - right.candidate.uncertainty_low : Infinity;
    if (leftWidth !== rightWidth) return leftWidth - rightWidth;

    const leftSample = Number.isFinite(left.candidate?.sample_size_effective) ? left.candidate.sample_size_effective : -1;
    const rightSample = Number.isFinite(right.candidate?.sample_size_effective) ? right.candidate.sample_size_effective : -1;
    if (rightSample !== leftSample) return rightSample - leftSample;

    const leftSupport = Number.isFinite(left.candidate?.technical_support_score) ? left.candidate.technical_support_score : -1;
    const rightSupport = Number.isFinite(right.candidate?.technical_support_score) ? right.candidate.technical_support_score : -1;
    if (rightSupport !== leftSupport) return rightSupport - leftSupport;

    if (left.analysis.fixture.fixtureId !== right.analysis.fixture.fixtureId) return left.analysis.fixture.fixtureId - right.analysis.fixture.fixtureId;
    return left.candidate.candidate_id.localeCompare(right.candidate.candidate_id);
  });
}

// Keeps the probability ranking available for the catalogue and legacy views,
// while the Journey recommendation uses the same explicit frontier as a single
// analysis. A fixture id is supplied so distinct fixtures remain independent.
export function rankJourneyCandidatesByDecision(entries = [], { product = "individual" } = {}) {
  const candidateIdentity = (candidate = {}) => `${Number(candidate.fixture_id)}:${candidate.candidate_id}`;
  const candidates = entries.map((entry) => ({
    ...entry.candidate,
    fixture_id: entry.candidate?.fixture_id ?? entry.analysis?.fixture?.fixtureId,
  }));
  const frontier = buildDecisionFrontier(candidates, { product });
  const byIdentity = new Map(frontier.candidates.map((candidate) => [candidateIdentity(candidate), candidate]));
  return entries.map((entry) => {
    const candidate = {
      ...entry.candidate,
      fixture_id: entry.candidate?.fixture_id ?? entry.analysis?.fixture?.fixtureId,
    };
    return {
      ...entry,
      candidate: byIdentity.get(candidateIdentity(candidate)) || entry.candidate,
    };
  }).sort((left, right) => {
    // No hay prioridad fija por market_family (goals/total_shots/etc.): el
    // universo visible (Jornada y el que alimenta Parlay/Soñadora) se ordena
    // exclusivamente por estimated_probability descendente. Empates conservan
    // el orden estable de entrada (Array#sort es estable en Node >=20); un
    // candidato sin probabilidad finita nunca adelanta a uno con probabilidad
    // válida y queda al final.
    const leftProbability = Number.isFinite(left.candidate?.estimated_probability)
      ? left.candidate.estimated_probability
      : -Infinity;
    const rightProbability = Number.isFinite(right.candidate?.estimated_probability)
      ? right.candidate.estimated_probability
      : -Infinity;
    return rightProbability - leftProbability;
  });
}

export function selectDiverseJourneyCandidates(entries = [], maximum = 5, comparableGap = 4) {
  const remaining = [...entries].sort((left, right) => {
    if (right.candidate.sports_score !== left.candidate.sports_score) return right.candidate.sports_score - left.candidate.sports_score;
    if (left.analysis.fixture.fixtureId !== right.analysis.fixture.fixtureId) return left.analysis.fixture.fixtureId - right.analysis.fixture.fixtureId;
    return left.candidate.candidate_id.localeCompare(right.candidate.candidate_id);
  });
  const selected = [];
  const usedFamilies = new Set();
  while (remaining.length && selected.length < maximum) {
    const best = remaining[0];
    const diverseIndex = usedFamilies.has(best.candidate.market_family)
      ? remaining.findIndex((entry) => !usedFamilies.has(entry.candidate.market_family) && best.candidate.sports_score - entry.candidate.sports_score <= comparableGap)
      : -1;
    const index = diverseIndex > 0 ? diverseIndex : 0;
    const [chosen] = remaining.splice(index, 1);
    selected.push(chosen);
    usedFamilies.add(chosen.candidate.market_family);
  }
  return selected;
}
