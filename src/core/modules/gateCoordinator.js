import {
  MARKET_STATUS,
  PARLAY_STATUS,
  POLICY_STATUS,
  createPolicyDecision,
} from "../contracts/atlasContracts.js";

export function coordinateGates({
  validationGate,
  marketGate,
  sourceConfidence,
}) {
  const informationScore =
    sourceConfidence?.informationScore ??
    sourceConfidence?.score ??
    sourceConfidence?.qualityScore ??
    0;

  const validationStatus = validationGate?.gateStatus;
  const marketStatus = marketGate?.gateStatus;

  if (
    validationStatus === POLICY_STATUS.BLOCKED ||
    marketStatus === MARKET_STATUS.BLOCKED
  ) {
    const blockedByValidation = validationStatus === POLICY_STATUS.BLOCKED;
    const primaryReason = blockedByValidation
      ? validationGate?.reason || "ValidationGate bloqueó la operación."
      : marketGate?.reason ||
        "El mercado solicitado no tiene datos base suficientes.";
    const requiredAction = blockedByValidation
      ? validationGate?.userAction || "Completar validación crítica."
      : marketGate?.requiredAction ||
        "Conectar una fuente complementaria o elegir otro mercado.";

    return buildDecision({
      status: POLICY_STATUS.BLOCKED,
      finalLabel: "🔴 No decidir todavía",
      operationalPermission: "No decidir",
      canAnalyze: false,
      canRecommend: false,
      primaryReason,
      requiredAction,
      informationScore,
      summary:
        "Atlas bloquea la operación porque al menos un gate detectó una condición crítica.",
      hierarchy:
        "Un bloqueo de ValidationGate o MarketGate tiene precedencia absoluta.",
    });
  }

  if (
    validationStatus === POLICY_STATUS.LIMITED ||
    marketStatus === MARKET_STATUS.LIMITED
  ) {
    return buildDecision({
      status: POLICY_STATUS.LIMITED,
      finalLabel: "🟠 Solo análisis inicial",
      operationalPermission: "Explorar contexto, no recomendar",
      canAnalyze: true,
      canRecommend: false,
      primaryReason:
        validationGate?.reason ||
        marketGate?.reason ||
        "La cobertura o validación es incompleta.",
      requiredAction:
        validationGate?.userAction ||
        marketGate?.requiredAction ||
        "Completar datos faltantes.",
      informationScore,
      summary:
        "Atlas permite análisis inicial, pero bloquea la recomendación.",
      hierarchy: "El estado limited domina cualquier estado preliminar.",
    });
  }

  if (
    validationStatus === POLICY_STATUS.PRELIMINARY ||
    marketStatus === MARKET_STATUS.PRELIMINARY
  ) {
    return buildDecision({
      status: POLICY_STATUS.PRELIMINARY,
      finalLabel: "🟡 Análisis preliminar",
      operationalPermission: "Análisis técnico preliminar",
      canAnalyze: true,
      canRecommend: false,
      primaryReason:
        marketGate?.reason ||
        validationGate?.reason ||
        "La evidencia permite análisis, pero no una recomendación.",
      requiredAction:
        marketGate?.requiredAction ||
        validationGate?.userAction ||
        "Completar validación final.",
      informationScore,
      summary:
        "Atlas permite análisis preliminar, pero no recomendación real.",
      hierarchy: "El estado preliminary conserva prudencia operativa.",
    });
  }

  if (
    validationStatus === POLICY_STATUS.READY &&
    marketStatus === MARKET_STATUS.READY
  ) {
    return buildDecision({
      status: POLICY_STATUS.READY,
      finalLabel: "🟢 Listo para evaluación final",
      operationalPermission: "Evaluación final permitida",
      canAnalyze: true,
      canRecommend: true,
      primaryReason: "Ambos gates alcanzaron el estado ready.",
      requiredAction: "Construir el dictamen final de DirectorAtlas.",
      informationScore,
      summary: "Atlas puede pasar a evaluación final.",
      hierarchy: "Ready exige acuerdo explícito de ambos gates.",
    });
  }

  return buildDecision({
    status: POLICY_STATUS.EXPLORATORY,
    finalLabel: "🔵 Exploración controlada",
    operationalPermission: "Solo análisis exploratorio",
    canAnalyze: true,
    canRecommend: false,
    primaryReason:
      "Atlas no encontró bloqueo, pero los gates no alcanzaron ready.",
    requiredAction: "Completar clasificación y validación de datos.",
    informationScore,
    summary:
      "Atlas mantiene el análisis en modo exploratorio hasta completar validación.",
    hierarchy: "Exploratory solo aplica cuando ningún gate está bloqueado.",
  });
}

function buildDecision({ status, primaryReason, requiredAction, ...details }) {
  const decision = createPolicyDecision({
    status,
    canAnalyze: details.canAnalyze,
    canRecommend: details.canRecommend,
    reason: primaryReason,
    requiredAction,
    parlayStatus: PARLAY_STATUS.UNSUPPORTED,
    ...details,
  });

  return {
    ...decision,
    finalStatus: decision.status,
    primaryReason: decision.reason,
  };
}
