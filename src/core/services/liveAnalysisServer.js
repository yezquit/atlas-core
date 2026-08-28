import "server-only";

import { randomUUID } from "node:crypto";
import { createServerSportsGateway } from "./sportsIntelligenceServer.js";
import { getOperationalHistoryRepository } from "./operationalAnalysisServer.js";
import { analyzeLiveFixture, listLiveFixtures, selectLatestPrematchAnalysis } from "./liveAnalysisService.js";

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
  // Contexto prematch: solo se acepta la última versión guardada que sea
  // genuinamente anterior al kickoff (phase !== "pre_match_closed" y
  // kickoff_distance_minutes > 0, campos ya existentes). Nunca se fabrica
  // ni se consulta al proveedor; si no existe una versión así, queda null.
  const fixtureId = Number(input?.fixtureId);
  const prematchContext = Number.isInteger(fixtureId) && fixtureId > 0
    ? selectLatestPrematchAnalysis(await (await getOperationalHistoryRepository()).list({ fixtureId }))
    : null;
  return remember(await analyzeLiveFixture(input, createServerSportsGateway("live"), { idFactory: randomUUID, prematchContext }));
}

export function getRecentLiveAnalysis(analysisId) {
  const entry = recent.get(analysisId);
  if (!entry || entry.expires < Date.now()) {
    if (entry) recent.delete(analysisId);
    return null;
  }
  return entry.result;
}
