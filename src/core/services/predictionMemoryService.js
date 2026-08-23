import { getApiFootballCompetitionByKey } from "../data/apiFootballLeagues.js";
import {
  PERSONAL_OWNER_ID,
  belongsToPersonalOwner,
} from "../auth/personalIdentity.js";
import { fixtureStatTotal } from "../intelligence/intelligenceUtils.js";
import {
  RESOLVABLE_MARKET_STAT,
  createOfficialPredictionSnapshot,
  resolveOfficialPrediction,
} from "../intelligence/officialPrediction.js";

async function automaticOutcome(prediction, gateway) {
  const competition = getApiFootballCompetitionByKey(prediction.competition_key || prediction.source_metadata?.competition_key);
  if (!competition) return { state: "pending", reason: "competition_not_available_for_result_update" };
  let fixtureResult;
  try {
    fixtureResult = prediction.mode === "live" ? await gateway.loadLiveFixtureById({
      fixtureId: prediction.fixture_id,
      competition,
      timezone: prediction.source_metadata?.timezone,
    }) : await gateway.loadFixtureById({
      fixtureId: prediction.fixture_id,
      competition,
      date: prediction.source_metadata?.requested_date,
      season: prediction.source_metadata?.season,
      timezone: prediction.source_metadata?.timezone,
    });
  } catch {
    return { state: "pending", reason: "result_provider_temporarily_unavailable" };
  }
  if (!fixtureResult?.fixture) return { state: "pending", reason: fixtureResult?.errorCode || "fixture_result_not_available" };
  if (!fixtureResult.fixture.status?.isFinished) return { state: "pending", reason: "fixture_not_finished" };

  const statKey = RESOLVABLE_MARKET_STAT[prediction.market_family];
  if (!statKey) return { state: "not_evaluable", reason: "market_result_resolver_not_supported" };
  if (statKey === "goals") {
    const home = fixtureResult.fixture.score?.goals?.home;
    const away = fixtureResult.fixture.score?.goals?.away;
    if (home === null || home === undefined || away === null || away === undefined) {
      return { state: "not_evaluable", reason: "finished_fixture_score_missing" };
    }
    const actualTotal = Number(home) + Number(away);
    return Number.isFinite(actualTotal)
      ? { state: "resolved", actualTotal }
      : { state: "not_evaluable", reason: "finished_fixture_score_invalid" };
  }

  let statisticsResult;
  try {
    statisticsResult = await gateway.loadFixtureStatistics(prediction.fixture_id);
  } catch {
    return { state: "pending", reason: "statistics_provider_temporarily_unavailable" };
  }
  if (statisticsResult?.status === "unavailable") {
    return { state: "pending", reason: statisticsResult.errorCode || "statistics_provider_temporarily_unavailable" };
  }
  const actualTotal = fixtureStatTotal(statisticsResult?.statistics, statKey);
  return Number.isFinite(actualTotal)
    ? { state: "resolved", actualTotal }
    : { state: "not_evaluable", reason: "finished_fixture_statistics_missing" };
}

export function createPredictionMemoryService({
  predictionRepositoryFactory,
  analysisRepositoryFactory,
  gatewayFactory,
  idFactory,
  now = () => new Date().toISOString(),
  liveAnalysisFinder = null,
  ownerId = PERSONAL_OWNER_ID,
} = {}) {
  if (!predictionRepositoryFactory || !analysisRepositoryFactory || !idFactory) {
    throw new TypeError("prediction_memory_dependencies_required");
  }

  async function repository() {
    return predictionRepositoryFactory();
  }

  let mutationChain = Promise.resolve();
  function enqueueMutation(task) {
    const result = mutationChain.then(task);
    mutationChain = result.catch(() => undefined);
    return result;
  }

  async function register({ analysisId }) {
    const analyses = await analysisRepositoryFactory();
    const analysis = (await analyses.list()).find((item) => item.analysis_id === analysisId);
    if (!analysis) throw new Error("analysis_not_found");
    const prediction = createOfficialPredictionSnapshot(analysis, {
      predictionId: idFactory(),
      registeredAt: now(),
      ownerId,
    });
    return (await (await repository()).appendPrediction(prediction));
  }

  async function registerLive({ liveAnalysisId }) {
    if (!liveAnalysisFinder) throw new Error("live_analysis_memory_not_configured");
    const analysis = await liveAnalysisFinder(liveAnalysisId);
    if (!analysis) throw new Error("live_analysis_not_found_or_expired");
    const prediction = createOfficialPredictionSnapshot(analysis, { predictionId: idFactory(), registeredAt: now(), ownerId });
    return (await (await repository()).appendPrediction(prediction));
  }

  async function resolveOne({ predictionId, source = "api_football", actualTotal = null }, sharedGateway = null) {
    const store = await repository();
    const prediction = await store.getById(predictionId);
    if (!prediction || !belongsToPersonalOwner(prediction, ownerId)) throw new Error("official_prediction_not_found");
    if (prediction.resolution?.status !== "pending") return { prediction, deduplicated: true, update_status: "already_resolved" };

    if (source === "manual_user_input") {
      if (!Number.isInteger(Number(actualTotal)) || Number(actualTotal) < 0) throw new Error("invalid_actual_total");
      const resolved = resolveOfficialPrediction(prediction, { actualTotal: Number(actualTotal), source, resolvedAt: now() });
      return { ...(await store.appendResolution(resolved)), update_status: "resolved" };
    }
    if (source !== "api_football") throw new Error("invalid_result_source");
    if (!gatewayFactory && !sharedGateway) throw new Error("result_gateway_not_configured");
    const outcome = await automaticOutcome(prediction, sharedGateway || gatewayFactory());
    if (outcome.state === "pending") return { prediction, deduplicated: true, update_status: "pending", reason: outcome.reason };
    const resolved = resolveOfficialPrediction(prediction, outcome.state === "not_evaluable"
      ? { source, resolvedAt: now(), notEvaluableReason: outcome.reason }
      : { source, resolvedAt: now(), actualTotal: outcome.actualTotal });
    return { ...(await store.appendResolution(resolved)), update_status: "resolved" };
  }

  return {
    register(input) {
      return enqueueMutation(() => register(input));
    },

    registerLive(input) {
      return enqueueMutation(() => registerLive(input));
    },

    async overview(filters = {}) {
      const store = await repository();
      return {
        predictions: await store.list({ ...filters, ownerId }),
        metrics: await store.metrics({ ...filters, ownerId }),
        calibration: await store.calibration({ ...filters, ownerId }),
      };
    },

    resolveOne(input) {
      return enqueueMutation(() => resolveOne(input));
    },

    resolvePending() {
      return enqueueMutation(async () => {
        const store = await repository();
        const pending = await store.list({ status: "pending", ownerId });
        const results = [];
        const sharedGateway = gatewayFactory ? gatewayFactory() : null;
        for (const prediction of pending) {
          try {
            results.push(await resolveOne({ predictionId: prediction.prediction_id, source: "api_football" }, sharedGateway));
          } catch (error) {
            results.push({ prediction, update_status: "pending", reason: error?.message || "result_update_failed" });
          }
        }
        return {
          checked: pending.length,
          resolved: results.filter((item) => item.update_status === "resolved").length,
          still_pending: results.filter((item) => item.update_status === "pending").length,
          results,
        };
      });
    },
  };
}
