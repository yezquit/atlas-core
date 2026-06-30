function getFiscalSeverity(fiscalReview) {
  const status = fiscalReview?.fiscalStatus || fiscalReview?.status || "";
  const objections = fiscalReview?.objections || [];

  const normalizedStatus = status.toLowerCase();

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
      maxEstimatedProbability: 54,
      blocksRecommendation: true,
      blocksParlay: true,
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
      maxEstimatedProbability: 58,
      blocksRecommendation: true,
      blocksParlay: true,
    };
  }

  if (objections.length === 1) {
    return {
      level: "low",
      label: "🟡 Observación fiscal",
      penalty: 6,
      maxTechnicalSupport: 78,
      maxEstimatedProbability: 62,
      blocksRecommendation: false,
      blocksParlay: true,
    };
  }

  return {
    level: "clear",
    label: "🟢 Sin objeción fuerte",
    penalty: 0,
    maxTechnicalSupport: 95,
    maxEstimatedProbability: 75,
    blocksRecommendation: false,
    blocksParlay: false,
  };
}

export function applyFiscalImpact({
  fiscalReview,
  confidenceCalibration,
  gateCoordinator,
  analysisInput,
}) {
  const severity = getFiscalSeverity(fiscalReview);

  const originalTechnicalSupport =
    confidenceCalibration?.technicalSupport ?? 0;

  const originalEstimatedProbability =
    confidenceCalibration?.estimatedProbability ?? 0;

  const adjustedTechnicalSupport = Math.max(
    0,
    Math.min(
      severity.maxTechnicalSupport,
      originalTechnicalSupport - severity.penalty
    )
  );

  const adjustedEstimatedProbability = Math.max(
    0,
    Math.min(
      severity.maxEstimatedProbability,
      originalEstimatedProbability - Math.round(severity.penalty / 2)
    )
  );

  const useCase = analysisInput?.uso || "analisis";

  const blocksParlay =
    severity.blocksParlay || useCase === "parlay" || gateCoordinator?.canUseInParlay !== true;

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
    originalEstimatedProbability,
    adjustedEstimatedProbability,
    maxTechnicalSupport: severity.maxTechnicalSupport,
    maxEstimatedProbability: severity.maxEstimatedProbability,
    blocksRecommendation,
    blocksParlay,
    objections,
    summary,
    operationalEffect: blocksRecommendation
      ? "No recomendar apuesta real en el estado actual."
      : "No bloquea recomendación por sí solo.",
    parlayEffect: blocksParlay
      ? "No apto para parlay."
      : "No bloquea parlay por sí solo.",
  };
}
