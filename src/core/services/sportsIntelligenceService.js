import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import {
  expectedSeasonForDate,
  getApiFootballCompetitionByKey,
} from "../data/apiFootballLeagues.js";
import { buildLeagueIntelligence } from "../intelligence/leagueIntelligence.js";
import {
  evaluateSportsMarkets,
  selectBestSupportedMarket,
} from "../intelligence/marketEngine.js";
import { buildRefereeIntelligence } from "../intelligence/refereeIntelligence.js";
import { buildTeamRecentIntelligence } from "../intelligence/teamRecentIntelligence.js";
import { buildVenueWeatherContext } from "../intelligence/venueWeatherContext.js";
import { buildPhaseTwoDirectorVerdict } from "../modules/directorAtlas.js";
import { isValidIsoDate, validateFixtureId } from "./apiFootballService.js";

const PROFILE_WINDOW_DAYS = 120;
const PROFILE_FIXTURE_LIMIT = 10;

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
  return { competition, season, fixtureId: fixtureValidation.fixtureId };
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
  const { competition, season, fixtureId } = validation;
  const metadata = await gateway.loadCompetitionMetadata(competition, season);
  if (metadata.status !== DATA_LOAD_STATUS.SUCCESS) {
    return failure({ ...metadata, runtime: gateway.runtime });
  }

  const selected = await gateway.loadFixtureById({
    fixtureId,
    competition,
    date: input.date,
    season,
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
  const leagueFixtures = (leagueWindow.fixtures || [])
    .sort((left, right) => Date.parse(right.date.utc) - Date.parse(left.date.utc))
    .slice(0, PROFILE_FIXTURE_LIMIT);
  const homeFixtures = homeRecent.fixtures || [];
  const awayFixtures = awayRecent.fixtures || [];
  const historicalFixtures = [
    ...new Map(
      [...leagueFixtures, ...homeFixtures, ...awayFixtures].map((item) => [
        item.fixtureId,
        item,
      ])
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
    historicalFixtures: leagueFixtures,
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
  const requestedMarket = input.marketId || "open";
  const selectedMarket = selectBestSupportedMarket(
    marketAssessments,
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
  const competitionKeys = [...new Set(input.competitionKeys || [])].slice(0, 5);
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
        marketId:
          input.marketIds?.length === 1 ? input.marketIds[0] : "open",
      },
      gateway
    );
    reviewed.push(analysis);
  }
  const highlighted = reviewed
    .filter((analysis) => analysis.selectedMarket?.candidate)
    .sort((left, right) => {
      const leftMarket = left.selectedMarket;
      const rightMarket = right.selectedMarket;
      if (rightMarket.technical_support_score !== leftMarket.technical_support_score) {
        return rightMarket.technical_support_score - leftMarket.technical_support_score;
      }
      if (rightMarket.sample_size !== leftMarket.sample_size) {
        return rightMarket.sample_size - leftMarket.sample_size;
      }
      return leftMarket.risk_flags.length - rightMarket.risk_flags.length;
    })
    .slice(0, 5)
    .map((analysis) => ({
      competition: analysis.competition.localName,
      competitionKey: analysis.competition.key,
      season: analysis.fixture.competition.season,
      fixtureId: analysis.fixture.fixtureId,
      fixture: `${analysis.fixture.teams.home.name} vs ${analysis.fixture.teams.away.name}`,
      kickoff: analysis.fixture.date.utc,
      market: analysis.selectedMarket.market_label,
      marketId: analysis.selectedMarket.market_family,
      status: analysis.director.status,
      displayStatus: analysis.director.display_status,
      technicalSupport: analysis.selectedMarket.technical_support_score,
      sampleSize: analysis.selectedMarket.sample_size,
      reasons: analysis.director.reasons,
      risks: analysis.director.risks,
      missingData: analysis.director.missing_data,
      nextAction: analysis.director.next_action,
    }));
  const telemetry = gateway.runtime.snapshot();
  return {
    contract: "JourneyExplorationResult",
    version: 2,
    status:
      telemetry.budgetExhausted
        ? DATA_LOAD_STATUS.BLOCKED
        : fixtures.length === 0
          ? DATA_LOAD_STATUS.EMPTY
          : DATA_LOAD_STATUS.SUCCESS,
    message:
      fixtures.length === 0
        ? "No se encontraron partidos en las competiciones seleccionadas."
        : `${highlighted.length} candidato(s) destacados tras revisar la jornada.`,
    date: input.date,
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
