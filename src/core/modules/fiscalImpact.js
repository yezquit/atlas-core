import {
  PARLAY_STATUS,
  PROBABILITY_STATUS,
} from "../contracts/atlasContracts.js";

function getFiscalSeverity(fiscalReview) {
  const status = fiscalReview?.fiscalStatus || fiscalReview?.status || "";
  const objections = fiscalReview?.objections || [];
  const normalizedStatus = status.toLowerCase();

  if (
    normalizedStatus.includes("sin objeción") ||
    normalizedStatus.includes("sin objecion")
  ) {
    return {
      level: "clear",
      label: "🟢 Sin objeción fuerte",
      penalty: 0,
      maxTechnicalSupport: 95,
      blocksRecommendation: false,
    };
  }

  if (
    normalizedStatus.includes("objeción fuerte") ||
    normalizedStatus.includes("objecion fuerte") ||
    normalizedStatus.includes("fuerte")
  ) {
    return {
      level: "strong",
      label: "🔴 Objeción fuerte",
      penalty: 25,
      maxTechnicalSupport: 55,
      blocksRecommendation: true,
    };
  }

  if (
    normalizedStatus.includes("objeción") ||
    normalizedStatus.includes("objecion") ||
    objections.length >= 2
  ) {
    return {
      level: "medium",
      label: "🟠 Objeción media",
      penalty: 12,
      maxTechnicalSupport: 68,
      blocksRecommendation: true,
    };
  }

  if (objections.length === 1) {
    return {
      level: "low",
      label: "🟡 Observación fiscal",
      penalty: 6,
      maxTechnicalSupport: 78,
      blocksRecommendation: false,
    };
  }

  return {
    level: "clear",
    label: "🟢 Sin objeción fuerte",
    penalty: 0,
    maxTechnicalSupport: 95,
    blocksRecommendation: false,
  };
}

export function applyFiscalImpact({
  fiscalReview,
  confidenceCalibration,
  gateCoordinator,
}) {
  const severity = getFiscalSeverity(fiscalReview);
  const originalTechnicalSupport =
    confidenceCalibration?.technicalSupport ?? 0;
  const adjustedTechnicalSupport = Math.max(
    0,
    Math.min(
      severity.maxTechnicalSupport,
      originalTechnicalSupport - severity.penalty
    )
  );
  const blocksRecommendation =
    severity.blocksRecommendation || gateCoordinator?.canRecommend !== true;
  const objections = fiscalReview?.objections || [];
  const summary =
    severity.level === "clear"
      ? "El Fiscal no detecta objeción fuerte adicional."
      : "El Fiscal detecta riesgos que limitan el dictamen operativo de Atlas.";

  return {
    applied: true,
    fiscalLevel: severity.level,
    fiscalLabel: severity.label,
    penalty: severity.penalty,
    originalTechnicalSupport,
    adjustedTechnicalSupport,
    originalEstimatedProbability: null,
    adjustedEstimatedProbability: null,
    probabilityStatus: PROBABILITY_STATUS.UNAVAILABLE,
    maxTechnicalSupport: severity.maxTechnicalSupport,
    maxEstimatedProbability: null,
    blocksRecommendation,
    blocksParlay: true,
    parlayStatus: PARLAY_STATUS.UNSUPPORTED,
    objections,
    summary,
    operationalEffect: blocksRecommendation
      ? "No recomendar apuesta real en el estado actual."
      : "No bloquea recomendación por sí solo.",
    parlayEffect:
      "Parlay no está soportado en la Fase 0; no se penaliza el mercado por haber sido seleccionado con ese uso.",
  };
}
