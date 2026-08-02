import "server-only";

import { runAtlasFixtureAnalysis } from "./atlasAnalysisService.js";
import {
  loadFixtureStatisticsFromServer,
  loadSelectedFixtureFromServer,
} from "./apiFootballServer.js";

const serverGateway = {
  loadSelectedFixture: loadSelectedFixtureFromServer,
  loadFixtureStatistics: loadFixtureStatisticsFromServer,
};

export function runAtlasFixtureAnalysisOnServer(input) {
  return runAtlasFixtureAnalysis(input, serverGateway);
}
