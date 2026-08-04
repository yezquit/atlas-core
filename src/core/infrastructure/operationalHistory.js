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
    async list(filters = {}) {
      const deleted = new Set(events.filter((event) => event.type === "analysis_deleted").map((event) => event.payload.analysis_id));
      return events.filter((event) => event.type === "analysis_finalized" && !deleted.has(event.payload.analysis_id)).map((event) => event.payload).filter((item) =>
        (!filters.fixtureId || Number(item.fixture_id) === Number(filters.fixtureId)) &&
        (!filters.phase || item.phase === filters.phase) &&
        (!filters.market || item.director?.market_evaluated?.family === filters.market) &&
        (!filters.status || item.director?.market_suitability === filters.status) &&
        (!filters.date || item.created_at?.slice(0, 10) === filters.date) &&
        (!filters.competition || String(item.director?.fixture?.competition || "").toLowerCase().includes(String(filters.competition).toLowerCase())) &&
        (!filters.team || `${item.director?.fixture?.home_team} ${item.director?.fixture?.away_team}`.toLowerCase().includes(String(filters.team).toLowerCase()))
      );
    },
    async latestForFixture(fixtureId) {
      const list = await this.list({ fixtureId });
      return list.sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0] || null;
    },
    async exportJson(filters = {}) {
      return JSON.stringify({ schema_version: 1, exported_at: new Date().toISOString(), analyses: await this.list(filters) }, null, 2);
    },
    events,
  };
}
