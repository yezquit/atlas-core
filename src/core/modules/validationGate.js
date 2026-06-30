export function runValidationGate({
  decisionResult,
  fiscalReview,
  sourceConfidence,
  marketEvaluation,
  analysisInput,
}) {
  const useCase = analysisInput?.uso || "analisis";
  const marketFamily = marketEvaluation?.marketFamily || "general";
  const criticalPending = sourceConfidence?.criticalPendingCount || 0;
  const sourceScoreText = sourceConfidence?.informationScore || "0%";
  const sourceScore = Number(String(sourceScoreText).replace("%", "")) || 0;
  const fiscalStatus = fiscalReview?.fiscalStatus || "Objeción moderada";
  const decision = decisionResult?.decision || "Análisis inicial";

  let gateStatus = "🔵 Solo análisis inicial";
  let gateLabel = "Solo análisis inicial";
  let permission = "Atlas puede mostrar estructura, pero no recomendación.";
  let reason =
    "El sistema todavía no tiene suficiente calidad de información para avanzar.";
  let userAction = "Conectar o validar fuentes críticas antes de decidir.";
  let canRecommend = false;
  let canUseInParlay = false;

  if (criticalPending > 0) {
    gateStatus = "🔴 No decidir todavía";
    gateLabel = "No decidir todavía";
    permission = "No emitir recomendación real.";
    reason =
      "Existe al menos un dato crítico pendiente que puede cambiar por completo el análisis.";
    userAction = "Resolver datos críticos antes de considerar una apuesta.";
  } else if (fiscalStatus === "Objeción fuerte") {
    gateStatus = "🔴 No decidir todavía";
    gateLabel = "No decidir todavía";
    permission = "No emitir recomendación real.";
    reason = "El Fiscal detectó objeción fuerte.";
    userAction = "Resolver objeciones del Fiscal antes de avanzar.";
  } else if (sourceScore < 25) {
    gateStatus = "🔵 Solo análisis inicial";
    gateLabel = "Solo análisis inicial";
    permission = "Solo lectura estructural del caso.";
    reason = "La calidad de información es muy baja.";
    userAction = "Validar fuentes externas.";
  } else if (sourceScore < 50 || decision === "Esperar validación") {
    gateStatus = "🟠 Esperar validación";
    gateLabel = "Esperar validación";
    permission = "Puede mantenerse como análisis preliminar, sin apuesta.";
    reason = "Faltan fuentes suficientes para elevar confianza.";
    userAction = "Esperar datos oficiales, estadísticas y líneas reales.";
  } else if (sourceScore < 70) {
    gateStatus = "🟡 Análisis preliminar";
    gateLabel = "Análisis preliminar";
    permission = "Puede evaluar mercado, pero aún no cerrar decisión.";
    reason = "La información es parcial, pero ya permite una lectura técnica inicial.";
    userAction = "Completar validación antes de apostar.";
  } else {
    gateStatus = "🟢 Listo para decisión técnica";
    gateLabel = "Listo para decisión técnica";
    permission = "Puede pasar a recomendación técnica si mercado y cuota acompañan.";
    reason = "La información disponible supera el umbral operativo inicial.";
    userAction = "Ejecutar evaluación final de mercado, cuota y parlay.";
    canRecommend = true;
  }

  if (useCase === "parlay") {
    if (gateStatus.includes("🟢") && fiscalStatus !== "Objeción fuerte") {
      canUseInParlay = true;
    } else {
      canUseInParlay = false;
      if (!gateStatus.includes("🔴")) {
        gateStatus = "🟠 Esperar validación";
        gateLabel = "Esperar validación para parlay";
        permission = "No congelar selección en parlay todavía.";
        reason =
          "El parlay exige más rigor que una apuesta individual y todavía faltan validaciones.";
        userAction =
          "Validar datos críticos y revisar compatibilidad antes de usar en parlay.";
      }
    }
  }

  return {
    gateStatus,
    gateLabel,
    permission,
    reason,
    userAction,
    canRecommend,
    canUseInParlay,
    marketFamily,
    finalMessage: buildFinalMessage({
      gateLabel,
      useCase,
      canRecommend,
      canUseInParlay,
    }),
  };
}

function buildFinalMessage({ gateLabel, useCase, canRecommend, canUseInParlay }) {
  if (useCase === "parlay" && !canUseInParlay) {
    return `Estado: ${gateLabel}. No usar en parlay todavía.`;
  }

  if (!canRecommend) {
    return `Estado: ${gateLabel}. Atlas no debe emitir recomendación real todavía.`;
  }

  return `Estado: ${gateLabel}. Atlas puede avanzar a decisión técnica.`;
}
