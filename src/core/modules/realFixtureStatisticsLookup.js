export async function lookupFixtureStatistics(realFixtureLookup) {
  const fixtureId = realFixtureLookup?.selectedFixture?.fixtureId;

  if (!fixtureId) {
    return {
      attempted: false,
      connected: false,
      status: "Sin fixture para consultar estadísticas",
      reason: "No existe fixtureId confirmado.",
      fixtureId: null,
      statistics: null,
    };
  }

  try {
    const response = await fetch(
      `/api/football/fixture-statistics?fixtureId=${encodeURIComponent(fixtureId)}`,
      {
        cache: "no-store",
      }
    );

    const data = await response.json();

    return {
      attempted: true,
      connected: response.ok && data?.ok,
      status: data?.statistics?.qualityFlags?.hasStatistics
        ? "Estadísticas reales encontradas"
        : "Sin estadísticas disponibles",
      reason: data?.statistics?.qualityFlags?.hasStatistics
        ? "Atlas encontró estadísticas del fixture en API-FOOTBALL."
        : "La API respondió, pero no entregó estadísticas para este fixture.",
      fixtureId,
      statistics: data?.statistics || null,
      rawErrors: data?.rawErrors || null,
    };
  } catch (error) {
    return {
      attempted: true,
      connected: false,
      status: "Error consultando estadísticas",
      reason: error.message,
      fixtureId,
      statistics: null,
    };
  }
}
