import "server-only";

import { randomUUID } from "node:crypto";
import { createPersistencePort } from "../contracts/platformContracts.js";
import { createFileOperationalHistory } from "../infrastructure/operationalHistoryServer.js";
import { createServerSportsGateway } from "./sportsIntelligenceServer.js";
import { analyzeOperationalFixture } from "./operationalAnalysisService.js";

const historyStore = createFileOperationalHistory();

export async function analyzeOperationalFixtureOnServer(input, { reanalysis = false } = {}) {
  const repository = createPersistencePort(await historyStore.repository());
  const previousVersion = input?.fixtureId
    ? await repository.latestForFixture(input.fixtureId)
    : null;
  const result = await analyzeOperationalFixture(
    input,
    createServerSportsGateway(reanalysis ? "reanalysis" : "individual"),
    { idFactory: randomUUID, previousVersion }
  );
  if (result.analysisVersion) await repository.appendAnalysis(result.analysisVersion);
  return result;
}

export async function getOperationalHistoryRepository() {
  return createPersistencePort(await historyStore.repository());
}
