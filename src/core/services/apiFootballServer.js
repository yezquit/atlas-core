import "server-only";

import {
  loadFixtureStatistics,
  loadFixturesByDate,
  loadSelectedFixture,
} from "./apiFootballService.js";
import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { filterPrematchFixtures } from "../intelligence/prematchEligibility.js";

function serverProviderOptions() {
  return {
    config: {
      apiKey: process.env.API_FOOTBALL_KEY,
      baseUrl: process.env.API_FOOTBALL_BASE_URL,
    },
  };
}

export async function loadFixturesByDateFromServer(input) {
  const result = await loadFixturesByDate(input, serverProviderOptions());
  if (result.status !== DATA_LOAD_STATUS.SUCCESS) return result;
  const filtered = filterPrematchFixtures(result.fixtures, { now: new Date().toISOString() });
  return {
    ...result,
    status: filtered.eligible.length ? DATA_LOAD_STATUS.SUCCESS : DATA_LOAD_STATUS.EMPTY,
    fixtures: filtered.eligible,
    excludedFixtures: filtered.excluded.map((item) => ({ fixtureId: item.fixture.fixtureId, reason: item.assessment.reason })),
    message: filtered.eligible.length
      ? "Partidos futuros disponibles para análisis prepartido."
      : "No hay partidos futuros disponibles para análisis prepartido.",
  };
}

export function loadSelectedFixtureFromServer(input) {
  return loadSelectedFixture(input, serverProviderOptions());
}

export function loadFixtureStatisticsFromServer(fixtureId) {
  return loadFixtureStatistics(fixtureId, serverProviderOptions());
}
