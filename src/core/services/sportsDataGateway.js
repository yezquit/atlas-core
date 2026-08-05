import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { normalizeFootballFixtures } from "../modules/footballFixtureNormalizer.js";
import { normalizeFixtureStatistics } from "../modules/footballStatisticsNormalizer.js";
import { localDateInterval, normalizeTimeZone } from "../intelligence/dateTimeContext.js";

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

  async function loadFixturesForDate({ competition, date, season, timezone }) {
    const operationalTimezone = normalizeTimeZone(timezone);
    const dateInterval = localDateInterval(date, operationalTimezone);
    const result = await runtime.request({
      pathname: "/fixtures",
      query: { league: competition.id, season, date, timezone: operationalTimezone },
      ttlSeconds: 300,
      tags: [
        `competition:${competition.id}`,
        `season:${season}`,
        `date:${date}`,
        `timezone:${operationalTimezone}`,
      ],
      externalIds: { competitionId: competition.id, timezone: operationalTimezone, localDate: date },
    });
    if (result.status !== DATA_LOAD_STATUS.SUCCESS) return result;
    const fixtures = normalizeFootballFixtures(result.response, { timezone: operationalTimezone }).filter(
      (fixture) =>
        Number(fixture.competition.id) === Number(competition.id) &&
        Number(fixture.competition.season) === Number(season) &&
        fixture.date.local_calendar_date === date
    );
    return {
      status: fixtures.length ? DATA_LOAD_STATUS.SUCCESS : DATA_LOAD_STATUS.EMPTY,
      fixtures,
      message: fixtures.length
        ? `${fixtures.length} partido(s) verificado(s).`
        : "No hay partidos para la fecha seleccionada.",
      requestMeta: result.requestMeta,
      dateInterval,
      timezone: operationalTimezone,
    };
  }

  async function loadFixtureById({ fixtureId, competition, date, season, timezone }) {
    const operationalTimezone = normalizeTimeZone(timezone);
    const result = await runtime.request({
      pathname: "/fixtures",
      query: { id: fixtureId, timezone: operationalTimezone },
      ttlSeconds: 300,
      tags: [
        `fixture:${fixtureId}`,
        `competition:${competition.id}`,
        `season:${season}`,
        `timezone:${operationalTimezone}`,
      ],
      externalIds: { fixtureId, competitionId: competition.id, timezone: operationalTimezone, localDate: date },
    });
    if (result.status !== DATA_LOAD_STATUS.SUCCESS) return result;
    const exact = normalizeFootballFixtures(result.response, { timezone: operationalTimezone }).filter(
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
      fixture.date.local_calendar_date === date;
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

  async function loadFixtureOdds(fixtureId) {
    const result = await runtime.request({
      pathname: "/odds",
      query: { fixture: fixtureId },
      ttlSeconds: 60,
      tags: [`fixture:${fixtureId}`, "resource:odds"],
      externalIds: { fixtureId },
    });
    if (result.status !== DATA_LOAD_STATUS.SUCCESS) return result;
    const exact = result.response.filter(
      (item) => Number(item?.fixture?.id) === Number(fixtureId)
    );
    return {
      status: exact.length ? DATA_LOAD_STATUS.SUCCESS : DATA_LOAD_STATUS.EMPTY,
      response: exact,
      fixtureId: Number(fixtureId),
      warnings: exact.length === result.response.length ? [] : ["provider_fixture_mismatch"],
      requestMeta: result.requestMeta,
    };
  }

  async function loadFixtureLineups(fixtureId) {
    const result = await runtime.request({
      pathname: "/fixtures/lineups",
      query: { fixture: fixtureId },
      ttlSeconds: 120,
      tags: [`fixture:${fixtureId}`, "resource:lineups"],
      externalIds: { fixtureId },
    });
    if (result.status !== DATA_LOAD_STATUS.SUCCESS) return result;
    return { ...result, fixtureId: Number(fixtureId) };
  }

  async function loadFixtureInjuries(fixtureId) {
    const result = await runtime.request({
      pathname: "/injuries",
      query: { fixture: fixtureId },
      ttlSeconds: 300,
      tags: [`fixture:${fixtureId}`, "resource:injuries"],
      externalIds: { fixtureId },
    });
    if (result.status !== DATA_LOAD_STATUS.SUCCESS) return result;
    const exact = result.response.filter(
      (item) => Number(item?.fixture?.id) === Number(fixtureId)
    );
    return {
      status: DATA_LOAD_STATUS.SUCCESS,
      response: exact,
      fixtureId: Number(fixtureId),
      warnings: exact.length === result.response.length ? [] : ["provider_fixture_mismatch"],
      requestMeta: result.requestMeta,
    };
  }

  async function loadStandings({ competition, season }) {
    const result = await runtime.request({
      pathname: "/standings",
      query: { league: competition.id, season },
      ttlSeconds: 1_800,
      tags: [`competition:${competition.id}`, `season:${season}`, "resource:standings"],
      externalIds: { competitionId: competition.id },
    });
    if (result.status !== DATA_LOAD_STATUS.SUCCESS) return result;
    const exact = result.response.filter(
      (item) => Number(item?.league?.id) === Number(competition.id)
    );
    return {
      status: exact.length ? DATA_LOAD_STATUS.SUCCESS : DATA_LOAD_STATUS.EMPTY,
      response: exact,
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
    loadFixtureOdds,
    loadFixtureLineups,
    loadFixtureInjuries,
    loadStandings,
  };
}
