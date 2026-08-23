import "server-only";

import { randomUUID } from "node:crypto";
import { predictionLedgerStore } from "../infrastructure/predictionLedgerServer.js";
import { getOperationalHistoryRepository } from "./operationalAnalysisServer.js";
import { createPredictionMemoryService } from "./predictionMemoryService.js";
import { createServerSportsGateway } from "./sportsIntelligenceServer.js";
import { getRecentLiveAnalysis } from "./liveAnalysisServer.js";

export const predictionMemoryService = createPredictionMemoryService({
  predictionRepositoryFactory: () => predictionLedgerStore.repository(),
  analysisRepositoryFactory: getOperationalHistoryRepository,
  gatewayFactory: () => createServerSportsGateway("profile"),
  idFactory: randomUUID,
  liveAnalysisFinder: getRecentLiveAnalysis,
});
