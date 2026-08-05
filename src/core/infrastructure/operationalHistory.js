import { calculateCalibration } from "../intelligence/resultCalibration.js";
import { fixtureDateContext, normalizeTimeZone } from "../intelligence/dateTimeContext.js";

function analysisLocalDate(item) {
  if (item.director?.fixture?.local_calendar_date) return item.director.fixture.local_calendar_date;
  const kickoff = item.director?.fixture?.kickoff_utc || item.director?.fixture?.kickoff;
  return fixtureDateContext(kickoff, normalizeTimeZone(item.inputs?.timezone)).local_calendar_date;
}

export function createMemoryOperationalHistory(initialEvents = []) {
  const events = [...initialEvents];
  return {
    async appendAnalysis(version) {
      if (events.some((event) => event.type === "analysis_finalized" && event.payload.analysis_id === version.analysis_id)) {
        throw new Error("analysis_id_already_exists");
      }
      events.push({ type: "analysis_finalized", schema_version: 1, recorded_at: version.created_at, payload: version });
      return version;
    },
    async appendDeletion(analysisId, confirmation) {
      if (confirmation !== "DELETE") throw new Error("explicit_deletion_confirmation_required");
      events.push({ type: "analysis_deleted", schema_version: 1, recorded_at: new Date().toISOString(), payload: { analysis_id: analysisId } });
      return true;
    },
    async appendResult(result) {
      if (!result?.analysis_id) throw new TypeError("prediction_result_requires_analysis_id");
      if (!events.some((event) => event.type === "analysis_finalized" && event.payload.analysis_id === result.analysis_id)) {
        throw new Error("analysis_not_found");
      }
      events.push({ type: "prediction_result_recorded", schema_version: 1, recorded_at: result.recorded_at, payload: result });
      return result;
    },
    async listResults() {
      const latest = new Map();
      for (const event of events.filter((item) => item.type === "prediction_result_recorded")) latest.set(event.payload.analysis_id, event.payload);
      return [...latest.values()];
    },
    async calibration() {
      return calculateCalibration(await this.listResults());
    },
    async list(filters = {}) {
      const deleted = new Set(events.filter((event) => event.type === "analysis_deleted").map((event) => event.payload.analysis_id));
      const results = new Map((await this.listResults()).map((item) => [item.analysis_id, item]));
      return events.filter((event) => event.type === "analysis_finalized" && !deleted.has(event.payload.analysis_id)).map((event) => ({ ...event.payload, prediction_result: results.get(event.payload.analysis_id) || null })).filter((item) =>
        (!filters.fixtureId || Number(item.fixture_id) === Number(filters.fixtureId)) &&
        (!filters.phase || item.phase === filters.phase) &&
        (!filters.market || item.director?.market_evaluated?.family === filters.market) &&
        (!filters.status || item.director?.market_suitability === filters.status) &&
        (!filters.date || analysisLocalDate(item) === filters.date) &&
        (!filters.competition || String(item.director?.fixture?.competition || "").toLowerCase().includes(String(filters.competition).toLowerCase())) &&
        (!filters.team || `${item.director?.fixture?.home_team} ${item.director?.fixture?.away_team}`.toLowerCase().includes(String(filters.team).toLowerCase()))
      );
    },
    async latestForFixture(fixtureId) {
      const list = await this.list({ fixtureId });
      return list.sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0] || null;
    },
    async exportJson(filters = {}) {
      return JSON.stringify({ schema_version: 1, exported_at: new Date().toISOString(), analyses: await this.list(filters), results: await this.listResults(), calibration: await this.calibration() }, null, 2);
    },
    events,
  };
}
