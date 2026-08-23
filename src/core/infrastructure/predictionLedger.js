import { calculateOfficialPredictionCalibration, calculateOfficialPredictionMetrics } from "../intelligence/officialPrediction.js";

export function createMemoryPredictionLedger(initialEvents = []) {
  const events = [...initialEvents];

  function materialized() {
    const predictions = new Map();
    for (const event of events) {
      if (event.type === "official_prediction_registered") predictions.set(event.payload.prediction_id, event.payload);
      if (event.type === "official_prediction_resolved" && predictions.has(event.payload.prediction_id)) {
        predictions.set(event.payload.prediction_id, event.payload);
      }
    }
    return [...predictions.values()].sort((left, right) => Date.parse(right.issued_at) - Date.parse(left.issued_at));
  }

  return {
    async appendPrediction(prediction) {
      const existing = materialized().find((item) => item.fingerprint === prediction.fingerprint);
      if (existing) return { prediction: existing, deduplicated: true };
      events.push({ type: "official_prediction_registered", schema_version: 1, recorded_at: prediction.registered_at, payload: prediction });
      return { prediction, deduplicated: false };
    },
    async appendResolution(prediction) {
      const current = materialized().find((item) => item.prediction_id === prediction.prediction_id);
      if (!current) throw new Error("official_prediction_not_found");
      if (current.resolution?.status !== "pending") return { prediction: current, deduplicated: true };
      events.push({ type: "official_prediction_resolved", schema_version: 1, recorded_at: prediction.resolution.resolved_at, payload: prediction });
      return { prediction, deduplicated: false };
    },
    async getById(predictionId) {
      return materialized().find((item) => item.prediction_id === predictionId) || null;
    },
    async list(filters = {}) {
      return materialized().filter((item) =>
        (!filters.status || item.resolution?.status === filters.status) &&
        (!filters.market || item.market_family === filters.market) &&
        (!filters.mode || item.mode === filters.mode) &&
        (!filters.competition || String(item.competition || "").toLowerCase().includes(String(filters.competition).toLowerCase()))
      );
    },
    async metrics(filters = {}) {
      return calculateOfficialPredictionMetrics(materialized(), filters);
    },
    async calibration(filters = {}) {
      return calculateOfficialPredictionCalibration(materialized(), filters);
    },
    events,
  };
}
