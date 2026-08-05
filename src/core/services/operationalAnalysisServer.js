import "server-only";

import { randomUUID } from "node:crypto";
import { createPersistencePort } from "../contracts/platformContracts.js";
import { getApiFootballCompetitionByKey } from "../data/apiFootballLeagues.js";
import { createFileOperationalHistory } from "../infrastructure/operationalHistoryServer.js";
import { fixtureStatTotal } from "../intelligence/intelligenceUtils.js";
import { buildPredictionResult } from "../intelligence/resultCalibration.js";
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

export async function recordOperationalResult({ analysisId, actualTotal = null, source = "manual_user_input" }) {
  const repository = await getOperationalHistoryRepository();
  const analysis = (await repository.list()).find((item) => item.analysis_id === analysisId);
  if (!analysis) throw new Error("analysis_not_found");
  let resolvedTotal = actualTotal;
  let resolvedSource = source;
  if (source === "api_football") {
    const competition = getApiFootballCompetitionByKey(analysis.inputs?.competitionKey);
    if (!competition) throw new Error("competition_not_available_for_result_update");
    const gateway = createServerSportsGateway("profile");
    const fixtureResult = await gateway.loadFixtureById({
      fixtureId: analysis.fixture_id,
      competition,
      date: analysis.inputs?.date,
      season: analysis.inputs?.season,
      timezone: analysis.inputs?.timezone,
    });
    if (!fixtureResult.fixture?.status?.isFinished) throw new Error("fixture_result_not_available");
    const family = analysis.director?.market_evaluated?.family;
    if (family === "goals") {
      resolvedTotal = Number(fixtureResult.fixture.score?.goals?.home) + Number(fixtureResult.fixture.score?.goals?.away);
    } else {
      const statisticsResult = await gateway.loadFixtureStatistics(analysis.fixture_id);
      const statKeys = { total_shots: "total_shots", shots_on_goal: "shots_on_goal", cards: "yellow_cards", corners: "corner_kicks" };
      resolvedTotal = fixtureStatTotal(statisticsResult.statistics, statKeys[family]);
    }
    if (!Number.isFinite(resolvedTotal)) throw new Error("fixture_statistics_not_available_for_result");
    resolvedSource = "api_football";
  }
  const result = buildPredictionResult({ analysis, actualTotal: resolvedTotal, source: resolvedSource });
  await repository.appendResult(result);
  return { result, calibration: await repository.calibration() };
}
