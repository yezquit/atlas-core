import {
  DATA_LOAD_STATUS,
  FIXTURE_STATISTICS_STATUS,
  createFixtureStatisticsResult,
} from "../contracts/atlasContracts.js";
import { buildPhaseOneDirectorVerdict } from "../modules/directorAtlas.js";
import {
  evaluateFunctionalMarketCoverage,
  getFunctionalMarketRule,
} from "../modules/marketDataCoverage.js";
import { buildRefereeProfile } from "../modules/refereeProfile.js";
import { buildTeamRecentProfile } from "../modules/teamRecentProfile.js";

function statisticsNotRequested(fixtureId, reason) {
  return createFixtureStatisticsResult({
    status: FIXTURE_STATISTICS_STATUS.NOT_REQUESTED,
    attempted: false,
    connected: false,
    reason,
    fixtureId,
    loadStatus: DATA_LOAD_STATUS.UNAVAILABLE,
  });
}

function toStatisticsContract(result, fixtureId) {
  if (result.status === DATA_LOAD_STATUS.SUCCESS) {
    return createFixtureStatisticsResult({
      status: FIXTURE_STATISTICS_STATUS.AVAILABLE,
      attempted: true,
      connected: true,
      reason: result.message,
      fixtureId,
      statistics: result.statistics,
      loadStatus: result.status,
      evidence: result.evidence,
    });
  }

  if (result.status === DATA_LOAD_STATUS.EMPTY) {
    return createFixtureStatisticsResult({
      status: FIXTURE_STATISTICS_STATUS.UNAVAILABLE,
      attempted: true,
      connected: true,
      reason: result.message,
      fixtureId,
      statistics: null,
      loadStatus: result.status,
      evidence: result.evidence,
    });
  }

  return createFixtureStatisticsResult({
    status:
      result.status === DATA_LOAD_STATUS.PROVIDER_ERROR
        ? FIXTURE_STATISTICS_STATUS.ERROR
        : FIXTURE_STATISTICS_STATUS.UNAVAILABLE,
    attempted: true,
    connected: false,
    reason: result.message,
    fixtureId,
    statistics: null,
    loadStatus: result.status,
    errorCode: result.errorCode,
    evidence: result.evidence || [],
  });
}

export async function runAtlasFixtureAnalysis(input, gateway) {
  const selectedFixtureId = Number(input?.fixtureId) || null;
  const marketRule = getFunctionalMarketRule(input?.marketId);

  if (!marketRule) {
    const marketAssessment = evaluateFunctionalMarketCoverage({
      marketId: input?.marketId,
      fixture: null,
      fixtureStatisticsResult: null,
    });
    const director = buildPhaseOneDirectorVerdict({
      dataStatus: DATA_LOAD_STATUS.UNAVAILABLE,
      dataErrorCode: "unsupported_market",
      marketAssessment,
    });

    return {
      contract: "AtlasFunctionalAnalysis",
      version: 1,
      status: DATA_LOAD_STATUS.UNAVAILABLE,
      errorCode: "unsupported_market",
      message: "El mercado no está habilitado en la Fase 1.",
      selectedFixtureId,
      fixture: null,
      statistics: null,
      marketAssessment,
      refereeProfile: null,
      teamRecentProfile: null,
      evidence: [],
      director,
    };
  }

  const fixtureResult = await gateway.loadSelectedFixture(input);
  if (fixtureResult.status !== DATA_LOAD_STATUS.SUCCESS) {
    const marketAssessment = evaluateFunctionalMarketCoverage({
      marketId: input.marketId,
      fixture: null,
      fixtureStatisticsResult: null,
    });
    const director = buildPhaseOneDirectorVerdict({
      dataStatus: fixtureResult.status,
      dataErrorCode: fixtureResult.errorCode,
      marketAssessment,
      evidence: fixtureResult.evidence || [],
    });

    return {
      contract: "AtlasFunctionalAnalysis",
      version: 1,
      status: fixtureResult.status,
      errorCode: fixtureResult.errorCode,
      message: fixtureResult.message,
      selectedFixtureId: fixtureResult.selectedFixtureId ?? selectedFixtureId,
      fixture: null,
      statistics: null,
      marketAssessment,
      refereeProfile: null,
      teamRecentProfile: null,
      evidence: fixtureResult.evidence || [],
      director,
    };
  }

  const fixture = fixtureResult.fixture;
  const shouldLoadStatistics = Boolean(
    fixture?.status?.isFinished || fixture?.status?.isLive
  );
  let statisticsProviderResult = null;
  let statisticsResult;

  if (shouldLoadStatistics) {
    statisticsProviderResult = await gateway.loadFixtureStatistics(
      fixtureResult.selectedFixtureId
    );
    statisticsResult = toStatisticsContract(
      statisticsProviderResult,
      fixtureResult.selectedFixtureId
    );
  } else {
    statisticsResult = statisticsNotRequested(
      fixtureResult.selectedFixtureId,
      "El fixture aún no está en vivo ni finalizado; no corresponde consultar estadísticas del partido."
    );
  }

  const marketAssessment = evaluateFunctionalMarketCoverage({
    marketId: input.marketId,
    fixture,
    fixtureStatisticsResult: statisticsResult,
  });
  const realFixtureLookup = {
    status: "confirmed",
    selectedFixture: fixture,
  };
  const refereeProfile = buildRefereeProfile({
    realFixtureLookup,
    marketText: marketRule.label,
    sourceConfidence: null,
  });
  const teamRecentProfile = buildTeamRecentProfile({
    realFixtureLookup,
    realFixtureStatistics: statisticsResult,
    marketFocusedStats: null,
    marketText: marketRule.label,
  });
  const evidence = [
    ...(fixtureResult.evidence || []),
    ...(statisticsProviderResult?.evidence || []),
    ...(marketAssessment.evidence || []),
  ];
  const statisticsFailed = [
    DATA_LOAD_STATUS.PROVIDER_ERROR,
    DATA_LOAD_STATUS.UNAVAILABLE,
  ].includes(statisticsProviderResult?.status);
  const analysisStatus = statisticsFailed
    ? statisticsProviderResult.status
    : DATA_LOAD_STATUS.SUCCESS;
  const director = buildPhaseOneDirectorVerdict({
    dataStatus: analysisStatus,
    dataErrorCode: statisticsProviderResult?.errorCode || null,
    fixture,
    statisticsResult,
    marketAssessment,
    evidence,
  });

  return {
    contract: "AtlasFunctionalAnalysis",
    version: 1,
    status: analysisStatus,
    errorCode: statisticsProviderResult?.errorCode || null,
    message: statisticsFailed
      ? statisticsProviderResult.message
      : "El fixture seleccionado fue analizado sin sustituir su ID.",
    selectedFixtureId: fixtureResult.selectedFixtureId,
    fixture,
    statistics: statisticsResult,
    marketAssessment,
    refereeProfile,
    teamRecentProfile,
    evidence,
    director,
  };
}
