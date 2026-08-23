import { API_FOOTBALL_COMPETITIONS, getApiFootballCompetitionByKey } from "../data/apiFootballLeagues.js";
import { assessLiveFixture, analyzeLiveMatch } from "../intelligence/liveMatchAnalysisEngine.js";

function validFixtureId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function competitionKeyFor(fixture) {
  return API_FOOTBALL_COMPETITIONS.find((item) => Number(item.id) === Number(fixture.competition?.id))?.key || null;
}

export async function listLiveFixtures(gateway, { competitions = API_FOOTBALL_COMPETITIONS, timezone = "America/Bogota" } = {}) {
  const result = await gateway.loadLiveFixtures({ competitions, timezone });
  if (!["success", "empty"].includes(result?.status)) return { contract: "LiveFixtureCatalog", version: 1, status: result?.status || "provider_error", mode: "live", fixtures: [], errorCode: result?.errorCode || "live_fixture_provider_unavailable", message: result?.message || "No fue posible consultar partidos LIVE." };
  const fixtures = (result.fixtures || []).filter((fixture) => assessLiveFixture(fixture).status === "active").map((fixture) => ({ ...fixture, competitionKey: competitionKeyFor(fixture) })).filter((fixture) => fixture.competitionKey);
  return { contract: "LiveFixtureCatalog", version: 1, status: fixtures.length ? "success" : "empty", mode: "live", fixtures, timezone: result.timezone || timezone, updated_at: result.requestMeta?.fetchedAt || null, message: fixtures.length ? `${fixtures.length} partido(s) LIVE activo(s).` : "No hay partidos en vivo ahora mismo en las competiciones configuradas." };
}

export async function analyzeLiveFixture(input, gateway, { idFactory, now = () => new Date().toISOString() } = {}) {
  const fixtureId = validFixtureId(input?.fixtureId);
  const competition = getApiFootballCompetitionByKey(input?.competitionKey);
  if (!fixtureId) return { contract: "LiveAnalysisResult", version: 1, status: "unavailable", mode: "live", errorCode: "invalid_fixture_id", message: "El fixture ID debe ser un entero positivo." };
  if (!competition) return { contract: "LiveAnalysisResult", version: 1, status: "unavailable", mode: "live", errorCode: "invalid_competition_key", message: "La competición LIVE no está configurada." };
  const fixtureResult = await gateway.loadLiveFixtureById({ fixtureId, competition, timezone: input?.timezone || "America/Bogota" });
  if (fixtureResult?.status !== "success" || !fixtureResult.fixture) return { contract: "LiveAnalysisResult", version: 1, status: fixtureResult?.status || "unavailable", mode: "live", errorCode: fixtureResult?.errorCode || "live_fixture_unavailable", message: fixtureResult?.message || "El fixture LIVE no está disponible." };
  const liveState = assessLiveFixture(fixtureResult.fixture);
  if (liveState.status !== "active") return { contract: "LiveAnalysisResult", version: 1, status: "unavailable", mode: "live", errorCode: liveState.reason, fixture_state: liveState.status, message: "El fixture no está activo para análisis LIVE." };

  const [statisticsResult, oddsResult] = await Promise.all([
    (gateway.loadLiveFixtureStatistics || gateway.loadFixtureStatistics).call(gateway, fixtureId).catch(() => ({ status: "provider_error", errorCode: "live_statistics_provider_error" })),
    gateway.loadLiveFixtureOdds(fixtureId).catch(() => ({ status: "provider_error", errorCode: "live_odds_provider_error" })),
  ]);
  const analyzedAt = now();
  const result = analyzeLiveMatch({
    analysisId: idFactory(), competitionKey: competition.key, fixture: fixtureResult.fixture,
    statistics: statisticsResult?.status === "success" ? statisticsResult.statistics : null,
    liveOddsPayload: oddsResult?.status === "success" ? oddsResult.response : [],
    fixtureFetchedAt: fixtureResult.requestMeta?.fetchedAt || analyzedAt,
    statisticsFetchedAt: statisticsResult?.status === "success" ? statisticsResult.requestMeta?.fetchedAt || analyzedAt : null,
    oddsFetchedAt: oddsResult?.status === "success" ? oddsResult.requestMeta?.fetchedAt || analyzedAt : null,
    analyzedAt,
  });
  return { ...result, provider_status: { fixture: fixtureResult.status, statistics: statisticsResult?.status || "unavailable", live_odds: oddsResult?.status || "unavailable" } };
}
