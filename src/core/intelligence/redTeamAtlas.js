function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

export function isModelLimitation(value) {
  return /modelo|metodolog|calibr|distribuci[oó]n emp[ií]rica|submuestras|valor esperado|observaciones independientes|muestra efectiva fue penalizada|[uú]ltimos 5 est[aá]n contenidas|dispersi[oó]n relevante entre submuestras/i.test(String(value || ""));
}

export function buildRedTeamAtlas({ candidate = null, marketAssessment = null, competitiveContext = null, preMatchContext = null, opposingEvidence = [], contradictions = [] } = {}) {
  const candidateLimitations = candidate?.limitations || [];
  const marketRisks = marketAssessment?.risk_flags || [];
  const modelLimitations = unique([
    ...candidateLimitations.filter(isModelLimitation),
    ...marketRisks.filter(isModelLimitation),
  ]);
  const rotationRisk = ["confirmed", "reported_risk"].includes(competitiveContext?.rotation?.status)
    ? competitiveContext.rotation.message
    : null;
  const risks = unique([
    ...contradictions,
    ...opposingEvidence,
    ...marketRisks.filter((item) => !isModelLimitation(item)),
    ...candidateLimitations.filter((item) => !isModelLimitation(item)),
    ...(competitiveContext?.warnings || []),
    rotationRisk,
    ...(preMatchContext?.lineups?.warnings || []),
    ...(preMatchContext?.injuries?.warnings || []),
  ]);
  const probableLineupWithoutCausality = preMatchContext?.lineups?.status === "probable" && !(preMatchContext?.lineups?.material_impacts || []).length;
  const items = risks.slice(0, 3).map((text) => ({ status: "risk", text }));
  if (probableLineupWithoutCausality && items.length < 3) {
    items.push({ status: "neutral", text: "Alineación probable sin causalidad deportiva verificada: neutral / no concluyente." });
  }
  return {
    contract: "RedTeamAtlasResult",
    version: 1,
    items: items.slice(0, 3),
    full_risks: risks,
    model_limitations: modelLimitations,
    alternative_probability_model: false,
  };
}

export function buildAtlasPreflight({ fixture = null, candidate = null, competitiveContext = null, oddsQuote = null, preMatchContext = null, blocked = false } = {}) {
  const entries = [
    { key: "fixture", label: "Fixture confirmado", state: fixture?.fixtureId && !blocked ? "confirmed" : "blocking" },
    { key: "sports", label: "Datos deportivos suficientes", state: candidate?.probability_status === "preliminary" ? "confirmed" : "pending" },
    { key: "line", label: "Línea válida", state: Number.isFinite(Number(candidate?.line)) ? "confirmed" : "blocking" },
    { key: "context", label: "Contexto competitivo revisado", state: competitiveContext ? "confirmed" : "pending" },
    { key: "price", label: "Cuota actual", state: oddsQuote && oddsQuote.freshness !== "stale" ? "confirmed" : "pending" },
    { key: "lineups", label: "Alineaciones confirmadas", state: preMatchContext?.lineups?.status === "confirmed" ? "confirmed" : "pending" },
  ];
  return {
    contract: "AtlasPreflight",
    version: 1,
    entries,
    status: entries.some((item) => item.state === "blocking") ? "blocking" : entries.some((item) => item.state === "pending") ? "pending" : "confirmed",
  };
}
