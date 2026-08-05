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
import { buildRankedMarketSelection } from "../intelligence/marketCandidateRanker.js";
import {
  buildRefereeIntelligence,
  normalizeRefereeName,
} from "../intelligence/refereeIntelligence.js";
import { buildTeamRecentIntelligence } from "../intelligence/teamRecentIntelligence.js";
import { buildVenueWeatherContext } from "../intelligence/venueWeatherContext.js";
import { buildPhaseTwoDirectorVerdict } from "../modules/directorAtlas.js";
import { isValidIsoDate, validateFixtureId } from "./apiFootballService.js";
import { normalizeTimeZone } from "../intelligence/dateTimeContext.js";

const PROFILE_WINDOW_DAYS = 120;
const PROFILE_FIXTURE_LIMIT = 10;
const REFEREE_FIXTURE_LIMIT = 10;
const SUPPORTED_MARKET_IDS = new Set(SPORTS_MARKETS.map((market) => market.id));

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
    if (candidate?.candidate_id === winner?.candidate_id) reason = "Mayor sports_score del ranking general.";
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
    sports_score: winner?.sports_score ?? null,
    families_compared: families.map((item) => item.market_label),
    best_by_family: families,
    why_market_won: winner
      ? `${assessmentByFamily.get(winner.market_family)?.market_label || winner.market_family} ganó por sports_score (${winner.sports_score}/100), no por el orden inicial.`
      : "No hubo un candidato ganador.",
  };
}

export function deriveJourneyOutcome({ fixturesFound = 0, candidates = [], telemetry = {} } = {}) {
  if (telemetry.budgetExhausted && candidates.length === 0) {
    return { status: DATA_LOAD_STATUS.BLOCKED, displayTone: "blocked", overallStatus: "blocked", message: "Análisis bloqueado por un límite crítico antes de producir candidatos." };
  }
  if (candidates.length === 0) {
    return {
      status: DATA_LOAD_STATUS.EMPTY,
      displayTone: "neutral",
      overallStatus: "no_candidates",
      message: fixturesFound === 0 ? "No se encontraron partidos en las competiciones seleccionadas." : "No se encontraron candidatos con respaldo suficiente",
    };
  }
  const priceComplete = candidates.every((candidate) => ["verified_current", "user_reported_current"].includes(candidate.priceStatus));
  return priceComplete
    ? { status: DATA_LOAD_STATUS.SUCCESS, displayTone: "success", overallStatus: "completed", message: "Análisis de jornada completado" }
    : { status: DATA_LOAD_STATUS.SUCCESS, displayTone: "warning", overallStatus: "candidates_pending_price", message: "Candidatos deportivos encontrados — evaluación de precio pendiente" };
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
  const marketAssessments = evaluateSportsMarkets({
    leagueProfile,
    homeTeamProfile,
    awayTeamProfile,
    refereeProfile,
    venueWeatherContext,
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
    marketAssessments,
    selectedMarket,
    evidenceRefs: [...new Set(evidenceRefs)],
    director,
    telemetry: gateway.runtime.snapshot(),
  };
}

export async function scanSportsJourney(input, gateway) {
  const startedAt = Date.now();
  if (!isValidIsoDate(input?.date)) {
    return {
      status: DATA_LOAD_STATUS.UNAVAILABLE,
      errorCode: "invalid_date",
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
      message: "Selecciona al menos una competición válida.",
      candidates: [],
      telemetry: gateway.runtime.snapshot(),
    };
  }
  const maximumFixtures = Math.max(1, Math.min(10, Number(input.maximumFixtures) || 5));
  const fixtures = [];
  const warnings = [];
  for (const competition of competitions) {
    const season = expectedSeasonForDate(competition, input.date);
    const metadata = await gateway.loadCompetitionMetadata(competition, season);
    if (metadata.status !== DATA_LOAD_STATUS.SUCCESS) {
      warnings.push(`${competition.localName}: ${metadata.message}`);
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
    }
  }

  const reviewed = [];
  for (const item of fixtures.slice(0, maximumFixtures)) {
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
      },
      gateway
    );
    reviewed.push(analysis);
  }
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
    const bestByFamily = new Map();
    for (const candidate of selection.ranked_candidates) {
      if (!bestByFamily.has(candidate.market_family)) bestByFamily.set(candidate.market_family, candidate);
    }
    return [...bestByFamily.values()].map((candidate) => ({
      analysis,
      candidate,
      comparison: buildJourneyFamilyComparison(selection, analysis.marketAssessments, candidate),
    }));
  });
  const maximumCandidates = Math.max(1, Math.min(10, Number(input.maximumCandidates) || 5));
  const highlighted = selectDiverseJourneyCandidates(analysisCandidates, maximumCandidates)
    .map(({ analysis, candidate, comparison }) => ({
      competition: analysis.competition.localName,
      competitionKey: analysis.competition.key,
      season: analysis.fixture.competition.season,
      fixtureId: analysis.fixture.fixtureId,
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
      uncertaintyLow: candidate.uncertainty_low,
      uncertaintyHigh: candidate.uncertainty_high,
      confidence: candidate.sports_score,
      priceStatus: candidate.price_status,
      status: candidate.overall_status,
      displayStatus: candidate.overall_status,
      technicalSupport: candidate.sports_score,
      sampleSize: candidate.sample_size_effective,
      methodologyVersion: candidate.methodology_version,
      generalRank: candidate.rank,
      sportsScore: candidate.sports_score,
      familiesCompared: comparison.families_compared,
      familyComparison: comparison.best_by_family,
      whyMarketWon: comparison.why_market_won,
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
        rank: candidate.rank,
        reasons: candidate.rank_reason,
        risks: candidate.limitations.slice(0, 3),
        methodology_version: candidate.methodology_version,
      },
      reasons: candidate.rank_reason,
      risks: candidate.limitations.slice(0, 3),
      missingData: candidate.price_status === "unavailable" ? ["Cuota actual para la línea exacta"] : [],
      nextAction: "Abrir el análisis individual y evaluar una cuota actual para la línea exacta.",
      rankReason: candidate.rank_reason.join(" "),
    }));
  const telemetry = gateway.runtime.snapshot();
  const outcome = deriveJourneyOutcome({ fixturesFound: fixtures.length, candidates: highlighted, telemetry });
  return {
    contract: "JourneyExplorationResult",
    version: 2,
    status: outcome.status,
    displayTone: outcome.displayTone,
    overallStatus: outcome.overallStatus,
    message: outcome.message,
    date: input.date,
    timezone: normalizeTimeZone(input.timezone),
    competitionsQueried: competitions.map((item) => item.localName),
    fixturesFound: fixtures.length,
    fixturesReviewed: reviewed.length,
    fixturesDiscarded: Math.max(0, reviewed.length - highlighted.length),
    analyzableFixtures: reviewed.filter(
      (analysis) => analysis.director.status !== "insufficient_data"
    ).length,
    candidates: highlighted,
    warnings,
    executionTimeMs: Date.now() - startedAt,
    telemetry,
  };
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
