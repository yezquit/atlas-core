import test from "node:test";
import assert from "node:assert/strict";

import { DATA_LOAD_STATUS, DIRECTOR_STATUS } from "../contracts/atlasContracts.js";
import { buildPhaseOneDirectorVerdict } from "../modules/directorAtlas.js";
import { normalizeFootballFixture } from "../modules/footballFixtureNormalizer.js";
import { normalizeFixtureStatistics } from "../modules/footballStatisticsNormalizer.js";
import {
  loadFixturesByDate,
  loadSelectedFixture,
} from "../services/apiFootballService.js";
import { runAtlasFixtureAnalysis } from "../services/atlasAnalysisService.js";

const SECRET_KEY = "test-secret-must-never-leak";
const providerOptions = {
  config: {
    apiKey: SECRET_KEY,
    baseUrl: "https://v3.football.api-sports.io",
  },
};

function providerFixture({
  id,
  date = "2026-08-01",
  season = 2026,
  status = "FT",
}) {
  return {
    fixture: {
      id,
      date: `${date}T20:00:00+00:00`,
      timezone: "UTC",
      referee: "Árbitro de prueba",
      status: { long: "Match Finished", short: status, elapsed: 90 },
      venue: { id: 1, name: "Estadio", city: "Bogotá" },
    },
    league: {
      id: 239,
      name: "Primera A",
      country: "Colombia",
      season,
      round: "Fecha 1",
    },
    teams: {
      home: { id: 10, name: "Equipo A", winner: true },
      away: { id: 20, name: "Equipo B", winner: false },
    },
    goals: { home: 2, away: 1 },
    score: {
      halftime: { home: 1, away: 0 },
      fulltime: { home: 2, away: 1 },
    },
  };
}

function providerStatistics() {
  return [
    {
      team: { id: 10, name: "Equipo A" },
      statistics: [
        { type: "Total Shots", value: 12 },
        { type: "Shots on Goal", value: 5 },
        { type: "Yellow Cards", value: 2 },
        { type: "Red Cards", value: 0 },
      ],
    },
    {
      team: { id: 20, name: "Equipo B" },
      statistics: [
        { type: "Total Shots", value: 8 },
        { type: "Shots on Goal", value: 3 },
        { type: "Yellow Cards", value: 3 },
        { type: "Red Cards", value: 0 },
      ],
    },
  ];
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function successFetch(response) {
  return async () => jsonResponse({ response, errors: [] });
}

const validQuery = {
  date: "2026-08-01",
  leagueKey: "primeraA",
  season: "2026",
};

test("Fase 1 rechaza fecha inválida sin llamar al proveedor", async () => {
  let called = false;
  const result = await loadFixturesByDate(
    { ...validQuery, date: "2026-02-30" },
    {
      ...providerOptions,
      fetchImpl: async () => {
        called = true;
      },
    }
  );

  assert.equal(result.status, DATA_LOAD_STATUS.UNAVAILABLE);
  assert.equal(result.errorCode, "invalid_date");
  assert.equal(called, false);
});

test("Fase 1 rechaza liga fuera del catálogo", async () => {
  const result = await loadFixturesByDate(
    { ...validQuery, leagueKey: "ligaInventada" },
    providerOptions
  );

  assert.equal(result.errorCode, "invalid_league");
});

test("Fase 1 rechaza temporada inválida o incompatible", async () => {
  const invalid = await loadFixturesByDate(
    { ...validQuery, season: "abc" },
    providerOptions
  );
  const mismatch = await loadFixturesByDate(
    { ...validQuery, season: "2025" },
    providerOptions
  );

  assert.equal(invalid.errorCode, "invalid_season");
  assert.equal(mismatch.errorCode, "season_date_mismatch");
});

test("respuesta sin fixtures conserva estado empty", async () => {
  const result = await loadFixturesByDate(validQuery, {
    ...providerOptions,
    fetchImpl: successFetch([]),
  });

  assert.equal(result.status, DATA_LOAD_STATUS.EMPTY);
  assert.equal(result.count, 0);
});

test("múltiples fixtures se listan sin elegir uno automáticamente", async () => {
  const result = await loadFixturesByDate(validQuery, {
    ...providerOptions,
    fetchImpl: successFetch([
      providerFixture({ id: 101 }),
      providerFixture({ id: 102 }),
    ]),
  });

  assert.equal(result.status, DATA_LOAD_STATUS.SUCCESS);
  assert.equal(result.count, 2);
  assert.deepEqual(
    result.fixtures.map((fixture) => fixture.fixtureId),
    [101, 102]
  );
  assert.equal("selectedFixture" in result, false);
});

test("fixture seleccionado se resuelve únicamente por su ID", async () => {
  const result = await loadSelectedFixture(
    { ...validQuery, fixtureId: 102 },
    {
      ...providerOptions,
      fetchImpl: successFetch([providerFixture({ id: 102 })]),
    }
  );

  assert.equal(result.status, DATA_LOAD_STATUS.SUCCESS);
  assert.equal(result.selectedFixtureId, 102);
  assert.equal(result.fixture.fixtureId, 102);
});

test("respuesta duplicada para un ID se declara ambiguous", async () => {
  const result = await loadSelectedFixture(
    { ...validQuery, fixtureId: 102 },
    {
      ...providerOptions,
      fetchImpl: successFetch([
        providerFixture({ id: 102 }),
        providerFixture({ id: 102 }),
      ]),
    }
  );

  assert.equal(result.status, DATA_LOAD_STATUS.AMBIGUOUS);
  assert.equal(result.fixture, null);
});

test("limitación del plan para temporada se muestra como unavailable", async () => {
  const result = await loadFixturesByDate(validQuery, {
    ...providerOptions,
    fetchImpl: async () =>
      jsonResponse({
        response: [],
        errors: { plan: "This season is not available in your plan" },
      }),
  });

  assert.equal(result.status, DATA_LOAD_STATUS.UNAVAILABLE);
  assert.equal(result.errorCode, "provider_plan_unavailable");
});

test("timeout se transforma en error sanitizado", async () => {
  const fetchImpl = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        const error = new Error("socket and provider internals");
        error.name = "AbortError";
        reject(error);
      });
    });
  const result = await loadFixturesByDate(validQuery, {
    ...providerOptions,
    fetchImpl,
    timeoutMs: 5,
  });

  assert.equal(result.status, DATA_LOAD_STATUS.PROVIDER_ERROR);
  assert.equal(result.errorCode, "provider_timeout");
  assert.doesNotMatch(JSON.stringify(result), /socket|internals/i);
});

test("error del proveedor no expone detalles ni API key", async () => {
  const result = await loadFixturesByDate(validQuery, {
    ...providerOptions,
    fetchImpl: async () =>
      jsonResponse(
        {
          response: [],
          errors: { internal: `provider detail ${SECRET_KEY}` },
        },
        500
      ),
  });
  const serialized = JSON.stringify(result);

  assert.equal(result.status, DATA_LOAD_STATUS.PROVIDER_ERROR);
  assert.doesNotMatch(serialized, /provider detail/i);
  assert.equal(serialized.includes(SECRET_KEY), false);
  assert.equal("rawErrors" in result, false);
});

test("DirectorAtlas no recomienda sin histórico real", async () => {
  const normalizedFixture = normalizeFootballFixture(
    providerFixture({ id: 700 })
  );
  const statistics = normalizeFixtureStatistics(providerStatistics());
  const analysis = await runAtlasFixtureAnalysis(
    { ...validQuery, fixtureId: 700, marketId: "total_shots" },
    {
      loadSelectedFixture: async () => ({
        status: DATA_LOAD_STATUS.SUCCESS,
        selectedFixtureId: 700,
        fixture: normalizedFixture,
        evidence: [],
      }),
      loadFixtureStatistics: async (fixtureId) => ({
        status: DATA_LOAD_STATUS.SUCCESS,
        fixtureId,
        statistics,
        evidence: [],
        message: "Estadísticas disponibles.",
      }),
    }
  );

  assert.equal(analysis.selectedFixtureId, 700);
  assert.equal(analysis.fixture.fixtureId, 700);
  assert.equal(
    analysis.director.status,
    DIRECTOR_STATUS.ANALYZABLE_NOT_ACTIONABLE
  );
  assert.equal(analysis.director.canRecommend, false);
  assert.equal(analysis.director.estimatedProbability, null);
  assert.equal(analysis.director.parlayStatus, "unsupported");
  assert.match(analysis.director.candidateSelection, /Sin pick accionable/);
});

test("fixture seleccionado nunca cambia silenciosamente", async () => {
  const result = await loadSelectedFixture(
    { ...validQuery, fixtureId: 900 },
    {
      ...providerOptions,
      fetchImpl: successFetch([providerFixture({ id: 901 })]),
    }
  );

  assert.equal(result.selectedFixtureId, 900);
  assert.equal(result.fixture, null);
  assert.equal(result.status, DATA_LOAD_STATUS.UNAVAILABLE);
});

test("viable_with_caution exige que toda la evidencia esté verificada", () => {
  const common = {
    dataStatus: DATA_LOAD_STATUS.SUCCESS,
    fixture: { fixtureId: 1 },
    marketAssessment: {
      marketLabel: "Goles",
      actionable: true,
      historicalSampleSize: 10,
      verifiedData: ["score.goals"],
      technicalSupport: 80,
      missingData: [],
      evidence: [{ id: "one", status: "verified" }],
    },
  };
  const viable = buildPhaseOneDirectorVerdict(common);
  const notViable = buildPhaseOneDirectorVerdict({
    ...common,
    marketAssessment: {
      ...common.marketAssessment,
      evidence: [{ id: "one", status: "missing" }],
    },
  });

  assert.equal(viable.status, DIRECTOR_STATUS.VIABLE_WITH_CAUTION);
  assert.notEqual(notViable.status, DIRECTOR_STATUS.VIABLE_WITH_CAUTION);
  assert.equal(viable.canRecommend, false);
});
