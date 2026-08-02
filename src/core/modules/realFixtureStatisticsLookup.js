import {
  FIXTURE_STATISTICS_STATUS,
  createFixtureStatisticsResult,
} from "../contracts/atlasContracts.js";

export async function lookupFixtureStatistics(realFixtureLookup) {
  const fixtureId = realFixtureLookup?.selectedFixture?.fixtureId;

  if (!fixtureId) {
    return createFixtureStatisticsResult({
      status: FIXTURE_STATISTICS_STATUS.NOT_REQUESTED,
      reason: "No existe fixtureId confirmado.",
      fixtureId: null,
      statusLabel: "Sin fixture para consultar estadísticas",
    });
  }

  try {
    const response = await fetch(
      `/api/football/fixture-statistics?fixtureId=${encodeURIComponent(fixtureId)}`,
      { cache: "no-store" }
    );
    const data = await response.json();
    const hasStatistics = Boolean(
      data?.statistics?.qualityFlags?.hasStatistics
    );

    if (!response.ok || !data?.ok) {
      return createFixtureStatisticsResult({
        status: FIXTURE_STATISTICS_STATUS.ERROR,
        attempted: true,
        connected: false,
        reason:
          data?.message || "La fuente de estadísticas respondió con error.",
        fixtureId,
        rawErrors: data?.rawErrors || null,
        statusLabel: "Error consultando estadísticas",
      });
    }

    return createFixtureStatisticsResult({
      status: hasStatistics
        ? FIXTURE_STATISTICS_STATUS.AVAILABLE
        : FIXTURE_STATISTICS_STATUS.UNAVAILABLE,
      attempted: true,
      connected: true,
      reason: hasStatistics
        ? "Atlas encontró estadísticas normalizadas del fixture."
        : "La fuente respondió, pero no entregó estadísticas para este fixture.",
      fixtureId,
      statistics: data?.statistics || null,
      rawErrors: data?.rawErrors || null,
      statusLabel: hasStatistics
        ? "Estadísticas reales encontradas"
        : "Sin estadísticas disponibles",
    });
  } catch (error) {
    return createFixtureStatisticsResult({
      status: FIXTURE_STATISTICS_STATUS.ERROR,
      attempted: true,
      connected: false,
      reason: error.message,
      fixtureId,
      statusLabel: "Error consultando estadísticas",
    });
  }
}
