import {
  DATA_LOAD_STATUS,
  EVIDENCE_STATUS,
  createEvidenceItem,
  createFixtureCatalogResult,
} from "../contracts/atlasContracts.js";
import {
  expectedSeasonForDate,
  getApiFootballCompetitionByKey,
} from "../data/apiFootballLeagues.js";
import { normalizeFootballFixtures } from "../modules/footballFixtureNormalizer.js";
import { normalizeFixtureStatistics } from "../modules/footballStatisticsNormalizer.js";
import { localDateInterval, normalizeTimeZone } from "../intelligence/dateTimeContext.js";

export const DEFAULT_PROVIDER_TIMEOUT_MS = 8_000;
export const FIXTURE_CACHE_SECONDS = 300;
export const STATISTICS_CACHE_SECONDS = 120;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SEASON_PATTERN = /^\d{4}$/;
const ALLOWED_PROVIDER_HOSTS = new Set(["v3.football.api-sports.io"]);

function unavailable(errorCode, message, details = {}) {
  return {
    status: DATA_LOAD_STATUS.UNAVAILABLE,
    errorCode,
    message,
    ...details,
  };
}

function providerError(errorCode, message, details = {}) {
  return {
    status: DATA_LOAD_STATUS.PROVIDER_ERROR,
    errorCode,
    message,
    ...details,
  };
}

export function isValidIsoDate(value) {
  if (!ISO_DATE_PATTERN.test(String(value || ""))) return false;
  const [year, month, day] = String(value).split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function validateSeason(value, { date, league } = {}) {
  const normalized = String(value || "");
  if (!SEASON_PATTERN.test(normalized)) {
    return unavailable(
      "invalid_season",
      "La temporada debe tener cuatro dígitos."
    );
  }

  const season = Number(normalized);
  const maximumSeason = new Date().getUTCFullYear() + 1;
  if (season < 2000 || season > maximumSeason) {
    return unavailable(
      "invalid_season",
      "La temporada está fuera del rango admitido."
    );
  }

  if (
    date &&
    expectedSeasonForDate(league, date) !== season
  ) {
    return unavailable(
      "season_date_mismatch",
      "La temporada no coincide con el año de la fecha seleccionada."
    );
  }

  return { status: DATA_LOAD_STATUS.SUCCESS, season };
}

export function validateFixtureQuery({ date, leagueKey, season, timezone }) {
  if (!isValidIsoDate(date)) {
    return unavailable(
      "invalid_date",
      "La fecha debe usar el formato YYYY-MM-DD y ser válida."
    );
  }

  const league = getApiFootballCompetitionByKey(leagueKey);
  if (!league) {
    return unavailable(
      "invalid_league",
      "La liga no pertenece al catálogo autorizado de Atlas."
    );
  }

  const seasonValidation = validateSeason(season, { date, league });
  if (seasonValidation.status !== DATA_LOAD_STATUS.SUCCESS) {
    return seasonValidation;
  }

  return {
    status: DATA_LOAD_STATUS.SUCCESS,
    date,
    leagueKey,
    season: seasonValidation.season,
    league,
    timezone: normalizeTimeZone(timezone),
  };
}

export function validateFixtureId(value) {
  const normalized = String(value || "");
  if (!/^\d+$/.test(normalized)) {
    return unavailable(
      "invalid_fixture_id",
      "El fixture ID debe ser un entero positivo."
    );
  }

  const fixtureId = Number(normalized);
  if (!Number.isSafeInteger(fixtureId) || fixtureId <= 0) {
    return unavailable(
      "invalid_fixture_id",
      "El fixture ID debe ser un entero positivo."
    );
  }

  return { status: DATA_LOAD_STATUS.SUCCESS, fixtureId };
}

function validateProviderConfig(config = {}) {
  if (!config.apiKey || !config.baseUrl) {
    return unavailable(
      "provider_unconfigured",
      "La integración deportiva no está disponible en este entorno."
    );
  }

  try {
    const baseUrl = new URL(config.baseUrl);
    if (
      baseUrl.protocol !== "https:" ||
      !ALLOWED_PROVIDER_HOSTS.has(baseUrl.hostname)
    ) {
      return unavailable(
        "provider_config_invalid",
        "La configuración del proveedor no es válida."
      );
    }

    return {
      status: DATA_LOAD_STATUS.SUCCESS,
      apiKey: config.apiKey,
      baseUrl,
    };
  } catch {
    return unavailable(
      "provider_config_invalid",
      "La configuración del proveedor no es válida."
    );
  }
}

function hasProviderErrors(errors) {
  if (!errors) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === "object") return Object.keys(errors).length > 0;
  return Boolean(String(errors).trim());
}

function isPlanLimitation(errors) {
  const signal = JSON.stringify(errors || "").toLowerCase();
  return [
    "plan",
    "subscription",
    "season",
    "quota",
    "request limit",
    "requests left",
    "access",
  ].some((token) => signal.includes(token));
}

export async function requestApiFootball({
  path,
  query,
  config,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
  cacheSeconds = FIXTURE_CACHE_SECONDS,
}) {
  const providerConfig = validateProviderConfig(config);
  if (providerConfig.status !== DATA_LOAD_STATUS.SUCCESS) {
    return providerConfig;
  }

  const url = new URL(path, providerConfig.baseUrl);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      headers: { "x-apisports-key": providerConfig.apiKey },
      signal: controller.signal,
      cache: "force-cache",
      next: { revalidate: cacheSeconds },
    });

    let payload;
    try {
      payload = await response.json();
    } catch {
      return providerError(
        "provider_invalid_response",
        "El proveedor devolvió una respuesta no procesable."
      );
    }

    if (!response.ok) {
      if ([401, 403].includes(response.status)) {
        return unavailable(
          "provider_access_unavailable",
          "El proveedor no autorizó esta consulta para la configuración actual."
        );
      }

      return providerError(
        "provider_request_failed",
        "El proveedor deportivo no pudo completar la consulta."
      );
    }

    if (hasProviderErrors(payload?.errors)) {
      if (isPlanLimitation(payload.errors)) {
        return unavailable(
          "provider_plan_unavailable",
          "El plan actual del proveedor no permite consultar esta temporada o recurso."
        );
      }

      return providerError(
        "provider_rejected_request",
        "El proveedor rechazó la consulta deportiva."
      );
    }

    if (!Array.isArray(payload?.response)) {
      return providerError(
        "provider_invalid_response",
        "El proveedor devolvió una respuesta no procesable."
      );
    }

    return {
      status: DATA_LOAD_STATUS.SUCCESS,
      response: payload.response,
    };
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      return providerError(
        "provider_timeout",
        "El proveedor no respondió dentro del tiempo permitido."
      );
    }

    return providerError(
      "provider_network_error",
      "No fue posible conectar con el proveedor deportivo."
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function fixtureCatalogEvidence({ status, query, count }) {
  return createEvidenceItem({
    id: `fixture-catalog:${query.leagueId}:${query.date}`,
    type: "fixture_catalog",
    status,
    source: "api-football",
    value: { count, ...query },
    fetchedAt: new Date().toISOString(),
    quality: { exactDate: true, exactLeague: true, exactSeason: true },
  });
}

export async function loadFixturesByDate(input, options = {}) {
  const validation = validateFixtureQuery(input);
  if (validation.status !== DATA_LOAD_STATUS.SUCCESS) {
    return createFixtureCatalogResult(validation);
  }

  const query = {
    date: validation.date,
    leagueKey: validation.leagueKey,
    leagueId: validation.league.id,
    leagueName: validation.league.localName,
    season: validation.season,
    timezone: validation.timezone,
    dateInterval: localDateInterval(validation.date, validation.timezone),
  };
  const providerResult = await requestApiFootball({
    path: "/fixtures",
    query: {
      date: validation.date,
      league: validation.league.id,
      season: validation.season,
      timezone: validation.timezone,
    },
    ...options,
    cacheSeconds: options.cacheSeconds ?? FIXTURE_CACHE_SECONDS,
  });

  if (providerResult.status !== DATA_LOAD_STATUS.SUCCESS) {
    return createFixtureCatalogResult({ ...providerResult, query });
  }

  const fixtures = normalizeFootballFixtures(providerResult.response, { timezone: validation.timezone }).filter(
    (fixture) =>
      fixture.fixtureId &&
      fixture.competition.id === validation.league.id &&
      Number(fixture.competition.season) === validation.season &&
      fixture.date.local_calendar_date === validation.date
  );

  if (fixtures.length === 0) {
    return createFixtureCatalogResult({
      status: DATA_LOAD_STATUS.EMPTY,
      query,
      fixtures: [],
      message: "No hay fixtures disponibles para la fecha y liga seleccionadas.",
      evidence: [
        fixtureCatalogEvidence({
          status: EVIDENCE_STATUS.FETCHED,
          query,
          count: 0,
        }),
      ],
    });
  }

  return createFixtureCatalogResult({
    status: DATA_LOAD_STATUS.SUCCESS,
    query,
    fixtures,
    message: `${fixtures.length} fixture(s) disponibles.`,
    evidence: [
      fixtureCatalogEvidence({
        status: EVIDENCE_STATUS.VERIFIED,
        query,
        count: fixtures.length,
      }),
    ],
  });
}

export async function loadSelectedFixture(input, options = {}) {
  const queryValidation = validateFixtureQuery(input);
  if (queryValidation.status !== DATA_LOAD_STATUS.SUCCESS) {
    return { ...queryValidation, selectedFixtureId: null, fixture: null };
  }

  const idValidation = validateFixtureId(input.fixtureId);
  if (idValidation.status !== DATA_LOAD_STATUS.SUCCESS) {
    return { ...idValidation, selectedFixtureId: null, fixture: null };
  }

  const selectedFixtureId = idValidation.fixtureId;
  const providerResult = await requestApiFootball({
    path: "/fixtures",
    query: { id: selectedFixtureId, timezone: queryValidation.timezone },
    ...options,
    cacheSeconds: options.cacheSeconds ?? FIXTURE_CACHE_SECONDS,
  });

  if (providerResult.status !== DATA_LOAD_STATUS.SUCCESS) {
    return { ...providerResult, selectedFixtureId, fixture: null, evidence: [] };
  }

  const exactMatches = normalizeFootballFixtures(providerResult.response, { timezone: queryValidation.timezone }).filter(
    (fixture) => fixture.fixtureId === selectedFixtureId
  );

  if (exactMatches.length > 1) {
    return {
      status: DATA_LOAD_STATUS.AMBIGUOUS,
      errorCode: "ambiguous_fixture_id",
      message: "El proveedor devolvió más de un fixture para el mismo ID.",
      selectedFixtureId,
      fixture: null,
      evidence: [],
    };
  }

  if (exactMatches.length === 0) {
    return {
      status: DATA_LOAD_STATUS.UNAVAILABLE,
      errorCode: "fixture_not_found",
      message: "El fixture seleccionado no está disponible.",
      selectedFixtureId,
      fixture: null,
      evidence: [],
    };
  }

  const fixture = exactMatches[0];
  const selectionMatches =
    fixture.competition.id === queryValidation.league.id &&
    Number(fixture.competition.season) === queryValidation.season &&
    fixture.date.local_calendar_date === queryValidation.date;

  if (!selectionMatches) {
    return {
      status: DATA_LOAD_STATUS.UNAVAILABLE,
      errorCode: "fixture_selection_mismatch",
      message:
        "El fixture devuelto no coincide con la fecha, liga y temporada seleccionadas.",
      selectedFixtureId,
      fixture: null,
      evidence: [],
    };
  }

  return {
    status: DATA_LOAD_STATUS.SUCCESS,
    selectedFixtureId,
    fixture,
    message: "Fixture seleccionado y verificado por ID.",
    evidence: [
      createEvidenceItem({
        id: `fixture:${selectedFixtureId}`,
        type: "fixture",
        status: EVIDENCE_STATUS.VERIFIED,
        source: "api-football",
        value: {
          fixtureId: selectedFixtureId,
          date: queryValidation.date,
          leagueId: queryValidation.league.id,
          season: queryValidation.season,
          timezone: queryValidation.timezone,
          kickoffUtc: fixture.date.kickoff_utc,
          kickoffLocal: fixture.date.kickoff_local,
        },
        fetchedAt: new Date().toISOString(),
        quality: { exactId: true, exactContext: true },
      }),
    ],
  };
}

export async function loadFixtureStatistics(fixtureId, options = {}) {
  const idValidation = validateFixtureId(fixtureId);
  if (idValidation.status !== DATA_LOAD_STATUS.SUCCESS) {
    return { ...idValidation, fixtureId: null, statistics: null, evidence: [] };
  }

  const providerResult = await requestApiFootball({
    path: "/fixtures/statistics",
    query: { fixture: idValidation.fixtureId },
    ...options,
    cacheSeconds: options.cacheSeconds ?? STATISTICS_CACHE_SECONDS,
  });

  if (providerResult.status !== DATA_LOAD_STATUS.SUCCESS) {
    return {
      ...providerResult,
      fixtureId: idValidation.fixtureId,
      statistics: null,
      evidence: [],
    };
  }

  const statistics = normalizeFixtureStatistics(providerResult.response);
  const hasStatistics = statistics.qualityFlags.hasStatistics;

  return {
    status: hasStatistics ? DATA_LOAD_STATUS.SUCCESS : DATA_LOAD_STATUS.EMPTY,
    fixtureId: idValidation.fixtureId,
    statistics: hasStatistics ? statistics : null,
    message: hasStatistics
      ? "Estadísticas del fixture obtenidas y normalizadas."
      : "El proveedor no ofrece estadísticas para este fixture.",
    evidence: [
      createEvidenceItem({
        id: `fixture-statistics:${idValidation.fixtureId}`,
        type: "fixture_statistics",
        status: hasStatistics
          ? EVIDENCE_STATUS.VERIFIED
          : EVIDENCE_STATUS.MISSING,
        source: "api-football",
        value: hasStatistics
          ? { availableStats: statistics.availableStats }
          : null,
        fetchedAt: new Date().toISOString(),
        quality: { normalized: true, teamCount: statistics.countTeams },
      }),
    ],
  };
}
