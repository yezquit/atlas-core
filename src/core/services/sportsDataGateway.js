import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { normalizeFootballFixtures } from "../modules/footballFixtureNormalizer.js";
import { normalizeFixtureStatistics } from "../modules/footballStatisticsNormalizer.js";

function successful(response, details = {}) {
  return { status: DATA_LOAD_STATUS.SUCCESS, response, ...details };
}

function unavailable(errorCode, message, details = {}) {
  return {
    status: DATA_LOAD_STATUS.UNAVAILABLE,
    errorCode,
    message,
    ...details,
  };
}

export function createSportsDataGateway(runtime) {
  async function loadCompetitionMetadata(competition, season) {
    const result = await runtime.request({
      pathname: "/leagues",
      query: { id: competition.id },
      ttlSeconds: 86_400,
      tags: [`competition:${competition.id}`, `season:${season}`],
      externalIds: { competitionId: competition.id },
    });
    if (result.status !== DATA_LOAD_STATUS.SUCCESS) return result;

    const matches = result.response.filter(
      (item) => Number(item?.league?.id) === Number(competition.id)
    );
    if (matches.length !== 1) {
      return unavailable(
        matches.length > 1 ? "competition_ambiguous" : "competition_unverified",
        matches.length > 1
          ? "El proveedor devolvió metadatos ambiguos para la competición."
          : "El ID de la competición no pudo verificarse con el proveedor.",
        { requestMeta: result.requestMeta }
      );
    }

    const item = matches[0];
    const seasons = Array.isArray(item.seasons) ? item.seasons : [];
    const seasonMetadata = seasons.find(
      (candidate) => Number(candidate?.year) === Number(season)
    );
    if (!seasonMetadata) {
      return unavailable(
        "season_unavailable",
        "La temporada seleccionada no figura entre las temporadas verificadas.",
        {
          availableSeasons: seasons.map((candidate) => candidate.year).filter(Number.isFinite),
          requestMeta: result.requestMeta,
        }
      );
    }

    return successful(item, {
      competition: {
        id: item.league.id,
        name: item.league.name,
        type: item.league.type,
        logo: item.league.logo || null,
        country: item.country?.name || null,
        countryCode: item.country?.code || null,
      },
      availableSeasons: seasons.map((candidate) => candidate.year).filter(Number.isFinite),
      seasonMetadata: {
        year: seasonMetadata.year,
        start: seasonMetadata.start || null,
        end: seasonMetadata.end || null,
        current: Boolean(seasonMetadata.current),
        coverage: seasonMetadata.coverage || null,
      },
      verificationStatus: "verified",
      requestMeta: result.requestMeta,
    });
  }

  async function loadFixturesForDate({ competition, date, season }) {
    const result = await runtime.request({
      pathname: "/fixtures",
      query: { league: competition.id, season, date },
      ttlSeconds: 300,
      tags: [
        `competition:${competition.id}`,
        `season:${season}`,
        `date:${date}`,
      ],
      externalIds: { competitionId: competition.id },
    });
    if (result.status !== DATA_LOAD_STATUS.SUCCESS) return result;
    const fixtures = normalizeFootballFixtures(result.response).filter(
      (fixture) =>
        Number(fixture.competition.id) === Number(competition.id) &&
        Number(fixture.competition.season) === Number(season) &&
        String(fixture.date.utc || "").slice(0, 10) === date
    );
    return {
      status: fixtures.length ? DATA_LOAD_STATUS.SUCCESS : DATA_LOAD_STATUS.EMPTY,
      fixtures,
      message: fixtures.length
        ? `${fixtures.length} partido(s) verificado(s).`
        : "No hay partidos para la fecha seleccionada.",
      requestMeta: result.requestMeta,
    };
  }

  async function loadFixtureById({ fixtureId, competition, date, season }) {
    const result = await runtime.request({
      pathname: "/fixtures",
      query: { id: fixtureId },
      ttlSeconds: 300,
      tags: [
        `fixture:${fixtureId}`,
        `competition:${competition.id}`,
        `season:${season}`,
      ],
      externalIds: { fixtureId, competitionId: competition.id },
    });
    if (result.status !== DATA_LOAD_STATUS.SUCCESS) return result;
    const exact = normalizeFootballFixtures(result.response).filter(
      (fixture) => Number(fixture.fixtureId) === Number(fixtureId)
    );
    if (exact.length !== 1) {
      return {
        status:
          exact.length > 1
            ? DATA_LOAD_STATUS.AMBIGUOUS
            : DATA_LOAD_STATUS.UNAVAILABLE,
        errorCode:
          exact.length > 1 ? "ambiguous_fixture_id" : "fixture_not_found",
        message:
          exact.length > 1
            ? "El proveedor devolvió más de un fixture para el mismo ID."
            : "El fixture seleccionado no está disponible.",
        fixture: null,
        selectedFixtureId: Number(fixtureId),
        requestMeta: result.requestMeta,
      };
    }
    const fixture = exact[0];
    const contextMatches =
      Number(fixture.competition.id) === Number(competition.id) &&
      Number(fixture.competition.season) === Number(season) &&
      String(fixture.date.utc || "").slice(0, 10) === date;
    if (!contextMatches) {
      return unavailable(
        "fixture_selection_mismatch",
        "El fixture no coincide con fecha, competición y temporada.",
        { fixture: null, selectedFixtureId: Number(fixtureId), requestMeta: result.requestMeta }
      );
    }
    return successful(result.response, {
      fixture,
      selectedFixtureId: Number(fixtureId),
      requestMeta: result.requestMeta,
    });
  }

  async function loadLeagueWindow({ competition, season, from, to }) {
    const result = await runtime.request({
      pathname: "/fixtures",
      query: { league: competition.id, season, from, to },
      ttlSeconds: 1_800,
      tags: [`competition:${competition.id}`, `season:${season}`],
      externalIds: { competitionId: competition.id },
    });
    if (result.status !== DATA_LOAD_STATUS.SUCCESS) return result;
    const fixtures = normalizeFootballFixtures(result.response).filter(
      (fixture) =>
        fixture.status.isFinished &&
        Number(fixture.competition.id) === Number(competition.id) &&
        Number(fixture.competition.season) === Number(season)
    );
    return successful(result.response, { fixtures, requestMeta: result.requestMeta });
  }

  async function loadTeamRecent({ teamId, season }) {
    const result = await runtime.request({
      pathname: "/fixtures",
      query: { team: teamId, season, last: 10 },
      ttlSeconds: 900,
      tags: [`team:${teamId}`, `season:${season}`],
      externalIds: { teamId },
    });
    if (result.status !== DATA_LOAD_STATUS.SUCCESS) return result;
    return successful(result.response, {
      fixtures: normalizeFootballFixtures(result.response),
      requestMeta: result.requestMeta,
    });
  }

  async function loadFixtureStatistics(fixtureId) {
    const result = await runtime.request({
      pathname: "/fixtures/statistics",
      query: { fixture: fixtureId },
      ttlSeconds: 1_800,
      tags: [`fixture:${fixtureId}`],
      externalIds: { fixtureId },
    });
    if (result.status !== DATA_LOAD_STATUS.SUCCESS) return result;
    const statistics = normalizeFixtureStatistics(result.response);
    return {
      status: statistics.qualityFlags.hasStatistics
        ? DATA_LOAD_STATUS.SUCCESS
        : DATA_LOAD_STATUS.EMPTY,
      statistics: statistics.qualityFlags.hasStatistics ? statistics : null,
      fixtureId: Number(fixtureId),
      requestMeta: result.requestMeta,
    };
  }

  return {
    runtime,
    loadCompetitionMetadata,
    loadFixturesForDate,
    loadFixtureById,
    loadLeagueWindow,
    loadTeamRecent,
    loadFixtureStatistics,
  };
}
