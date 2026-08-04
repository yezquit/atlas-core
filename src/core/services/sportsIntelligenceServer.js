import "server-only";

import { createPersistentFileCache } from "../infrastructure/persistentCacheServer.js";
import { createProviderRuntime } from "../infrastructure/providerRuntime.js";
import { createSportsDataGateway } from "./sportsDataGateway.js";
import {
  analyzeSportsFixture,
  scanSportsJourney,
} from "./sportsIntelligenceService.js";

export const SPORTS_REQUEST_BUDGETS = Object.freeze({
  individual: 45,
  journey: 90,
  profile: 30,
  reanalysis: 60,
});

const persistentCache = createPersistentFileCache();

function configuredBudget(kind) {
  const environmentName = `ATLAS_${kind.toUpperCase()}_REQUEST_BUDGET`;
  const configured = Number(process.env[environmentName]);
  return Number.isInteger(configured) && configured > 0
    ? Math.min(configured, 150)
    : SPORTS_REQUEST_BUDGETS[kind];
}

export function createServerSportsGateway(kind = "individual") {
  const runtime = createProviderRuntime({
    apiKey: process.env.API_FOOTBALL_KEY,
    baseUrl: process.env.API_FOOTBALL_BASE_URL,
    budget: configuredBudget(kind),
    concurrency: Math.max(
      1,
      Math.min(5, Number(process.env.ATLAS_PROVIDER_CONCURRENCY) || 3)
    ),
    timeoutMs: 8_000,
    maxRetries: 1,
    cache: persistentCache,
    quotaWarningRatio: Math.max(0, Math.min(1, Number(process.env.ATLAS_QUOTA_WARNING_PERCENT || 15) / 100)),
    quotaBlockRatio: Math.max(0, Math.min(1, Number(process.env.ATLAS_QUOTA_BLOCK_PERCENT || 5) / 100)),
  });
  return createSportsDataGateway(runtime);
}

export function analyzeSportsFixtureOnServer(input) {
  return analyzeSportsFixture(input, createServerSportsGateway("individual"));
}

export function scanSportsJourneyOnServer(input) {
  return scanSportsJourney(input, createServerSportsGateway("journey"));
}
