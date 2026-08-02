import {
  PARLAY_STATUS,
  POLICY_STATUS,
  createPolicyDecision,
} from "../contracts/atlasContracts.js";

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

  let gateStatus = POLICY_STATUS.LIMITED;
  let gateLabel = "🔵 Solo análisis inicial";
  let permission = "Atlas puede mostrar estructura, pero no recomendación.";
  let reason =
    "El sistema todavía no tiene suficiente calidad de información para avanzar.";
  let userAction = "Conectar o validar fuentes críticas antes de decidir.";
  let canAnalyze = true;
  let canRecommend = false;

  if (criticalPending > 0) {
    gateStatus = POLICY_STATUS.BLOCKED;
    gateLabel = "🔴 No decidir todavía";
    permission = "No emitir recomendación real.";
    reason =
      "Existe al menos un dato crítico pendiente que puede cambiar por completo el análisis.";
    userAction = "Resolver datos críticos antes de considerar una apuesta.";
    canAnalyze = false;
  } else if (fiscalStatus === "Objeción fuerte") {
    gateStatus = POLICY_STATUS.BLOCKED;
    gateLabel = "🔴 No decidir todavía";
    permission = "No emitir recomendación real.";
    reason = "El Fiscal detectó objeción fuerte.";
    userAction = "Resolver objeciones del Fiscal antes de avanzar.";
    canAnalyze = false;
  } else if (sourceScore < 25) {
    gateStatus = POLICY_STATUS.LIMITED;
    gateLabel = "🔵 Solo análisis inicial";
    permission = "Solo lectura estructural del caso.";
    reason = "La calidad de información es muy baja.";
    userAction = "Validar fuentes externas.";
  } else if (sourceScore < 50 || decision === "Esperar validación") {
    gateStatus = POLICY_STATUS.LIMITED;
    gateLabel = "🟠 Esperar validación";
    permission = "Puede mantenerse como análisis preliminar, sin apuesta.";
    reason = "Faltan fuentes suficientes para elevar confianza.";
    userAction = "Esperar datos oficiales y estadísticas verificables.";
  } else if (sourceScore < 70) {
    gateStatus = POLICY_STATUS.PRELIMINARY;
    gateLabel = "🟡 Análisis preliminar";
    permission = "Puede evaluar mercado, pero aún no cerrar decisión.";
    reason =
      "La información es parcial, pero ya permite una lectura técnica inicial.";
    userAction = "Completar validación antes de apostar.";
  } else {
    gateStatus = POLICY_STATUS.READY;
    gateLabel = "🟢 Listo para decisión técnica";
    permission = "Puede pasar a evaluación técnica final.";
    reason = "La información disponible supera el umbral operativo inicial.";
    userAction = "Ejecutar la evaluación final del mercado.";
    canRecommend = true;
  }

  return createPolicyDecision({
    status: gateStatus,
    canAnalyze,
    canRecommend,
    reason,
    requiredAction: userAction,
    parlayStatus: PARLAY_STATUS.UNSUPPORTED,
    gateStatus,
    gateLabel,
    permission,
    userAction,
    marketFamily,
    finalMessage: buildFinalMessage({
      gateLabel,
      useCase,
      canRecommend,
    }),
  });
}

function buildFinalMessage({ gateLabel, useCase, canRecommend }) {
  if (useCase === "parlay") {
    return `Estado: ${gateLabel}. Parlay no soportado en la Fase 0.`;
  }

  if (!canRecommend) {
    return `Estado: ${gateLabel}. Atlas no debe emitir recomendación real todavía.`;
  }

  return `Estado: ${gateLabel}. Atlas puede avanzar a decisión técnica.`;
}
