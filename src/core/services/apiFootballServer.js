import "server-only";

import {
  loadFixtureStatistics,
  loadFixturesByDate,
  loadSelectedFixture,
} from "./apiFootballService.js";

function serverProviderOptions() {
  return {
    config: {
      apiKey: process.env.API_FOOTBALL_KEY,
      baseUrl: process.env.API_FOOTBALL_BASE_URL,
    },
  };
}

export function loadFixturesByDateFromServer(input) {
  return loadFixturesByDate(input, serverProviderOptions());
}

export function loadSelectedFixtureFromServer(input) {
  return loadSelectedFixture(input, serverProviderOptions());
}

export function loadFixtureStatisticsFromServer(fixtureId) {
  return loadFixtureStatistics(fixtureId, serverProviderOptions());
}
