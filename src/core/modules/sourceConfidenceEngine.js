export function calculateSourceConfidence({ sourceConnector, sourceValidation }) {
  const sourceData = sourceConnector?.sourceData || [];
  const requiredSources = sourceValidation?.requiredSources || [];

  const totalSources = sourceData.length;

  const confirmedSources = sourceData.filter((item) =>
    ["Confirmado", "Inferido"].includes(item.status)
  );

  const pendingSources = sourceData.filter((item) =>
    item.status === "Pendiente"
  );

  const criticalPending = requiredSources.filter(
    (item) => item.priority === "Crítica" && item.status === "Pendiente"
  );

  const confirmedCount = confirmedSources.length;
  const pendingCount = pendingSources.length;
  const criticalPendingCount = criticalPending.length;

  let informationQuality = "Baja";
  let informationScore = 10;
  let allowedDecisionLevel = "Solo análisis inicial";
  let status = "Información insuficiente";

  if (criticalPendingCount > 0) {
    informationQuality = "Baja";
    informationScore = 10;
    allowedDecisionLevel = "Solo análisis inicial / esperar validación";
    status = "Dato crítico pendiente";
  } else if (confirmedCount === 0) {
    informationQuality = "Muy baja";
    informationScore = 5;
    allowedDecisionLevel = "No decidir";
    status = "Sin fuentes confirmadas";
  } else if (confirmedCount < totalSources / 2) {
    informationQuality = "Baja";
    informationScore = 20;
    allowedDecisionLevel = "Análisis preliminar";
    status = "Fuentes parciales";
  } else if (confirmedCount < totalSources) {
    informationQuality = "Media";
    informationScore = 50;
    allowedDecisionLevel = "Análisis preliminar avanzado";
    status = "Fuentes parcialmente validadas";
  } else {
    informationQuality = "Alta";
    informationScore = 75;
    allowedDecisionLevel = "Puede pasar a decisión técnica";
    status = "Fuentes validadas";
  }

  const blockers = [];

  if (criticalPendingCount > 0) {
    blockers.push(
      ...criticalPending.map((item) => `${item.data}: ${item.reason}`)
    );
  }

  if (pendingCount > confirmedCount) {
    blockers.push(
      "La mayoría de datos relevantes todavía está pendiente de fuente externa."
    );
  }

  return {
    status,
    informationQuality,
    informationScore: `${informationScore}%`,
    allowedDecisionLevel,
    totalSources,
    confirmedCount,
    pendingCount,
    criticalPendingCount,
    blockers,
    summary:
      criticalPendingCount > 0
        ? "Atlas detecta información crítica pendiente. No debe emitir recomendación real."
        : "Atlas puede continuar, pero la decisión dependerá de la calidad de fuentes disponibles.",
  };
}
