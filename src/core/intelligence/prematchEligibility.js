const EXCLUDED_STATUS = Object.freeze({
  PST: "postponed",
  CANC: "cancelled",
  ABD: "abandoned",
  AWD: "awarded",
  WO: "walkover",
});

export function assessPrematchEligibility(fixture, { now = new Date().toISOString() } = {}) {
  const status = fixture?.status || {};
  const short = String(status.short || "").toUpperCase();
  const kickoff = fixture?.date?.kickoff_utc || fixture?.date?.utc || null;
  const kickoffTime = Date.parse(kickoff);
  const nowTime = Date.parse(now);

  if (status.isFinished) {
    return { eligible: false, reason: "finished", status: short, message: "Partido finalizado" };
  }
  if (status.isLive) {
    return { eligible: false, reason: "started", status: short, message: "Partido ya iniciado" };
  }
  if (EXCLUDED_STATUS[short]) {
    return {
      eligible: false,
      reason: EXCLUDED_STATUS[short],
      status: short,
      message: short === "PST" ? "Partido aplazado" : short === "CANC" ? "Partido cancelado" : "Partido no disponible para análisis prepartido",
    };
  }
  if (!status.isScheduled) {
    return { eligible: false, reason: "not_scheduled", status: short, message: "Estado no compatible con análisis prepartido" };
  }
  if (!Number.isFinite(kickoffTime)) {
    return { eligible: false, reason: "invalid_kickoff", status: short, message: "Hora de inicio no verificable" };
  }
  if (!Number.isFinite(nowTime) || kickoffTime <= nowTime) {
    return { eligible: false, reason: "started", status: short, message: "Partido ya iniciado" };
  }
  return { eligible: true, reason: "future", status: short, message: "Partido futuro disponible para análisis prepartido" };
}

export function filterPrematchFixtures(fixtures = [], options = {}) {
  const eligible = [];
  const excluded = [];
  for (const fixture of fixtures) {
    const assessment = assessPrematchEligibility(fixture, options);
    (assessment.eligible ? eligible : excluded).push({ fixture, assessment });
  }
  return { eligible: eligible.map((item) => item.fixture), excluded };
}
