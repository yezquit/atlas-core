import "server-only";

import { randomUUID } from "node:crypto";
import { createServerSportsGateway } from "./sportsIntelligenceServer.js";
import { analyzeLiveFixture, listLiveFixtures } from "./liveAnalysisService.js";

const recent = new Map();
const MAX_RECENT = 100;
const TTL_MS = 15 * 60 * 1000;

function remember(result) {
  if (result?.status !== "success" || !result.analysis_id) return result;
  recent.set(result.analysis_id, { result, expires: Date.now() + TTL_MS });
  while (recent.size > MAX_RECENT) recent.delete(recent.keys().next().value);
  return result;
}

export function listLiveFixturesOnServer(input) {
  return listLiveFixtures(createServerSportsGateway("live"), input);
}

export async function analyzeLiveFixtureOnServer(input) {
  return remember(await analyzeLiveFixture(input, createServerSportsGateway("live"), { idFactory: randomUUID }));
}

export function getRecentLiveAnalysis(analysisId) {
  const entry = recent.get(analysisId);
  if (!entry || entry.expires < Date.now()) {
    if (entry) recent.delete(analysisId);
    return null;
  }
  return entry.result;
}
