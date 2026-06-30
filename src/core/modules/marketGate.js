export function runMarketGate({
  marketDataCoverage,
  marketFocusedStats,
  sourceConfidence,
  analysisInput,
}) {
  const coverageLevel = marketDataCoverage?.coverageLevel || "unknown";
  const marketLabel = marketDataCoverage?.marketLabel || analysisInput?.mercado || "Mercado no especificado";

  const missingExternalData = marketDataCoverage?.missingExternalData || [];
  const missingRequiredStats = marketDataCoverage?.missingRequiredStats || [];

  const informationScore =
    sourceConfidence?.informationScore ??
    sourceConfidence?.score ??
    sourceConfidence?.qualityScore ??
    0;

  if (coverageLevel === "missing") {
    return {
      gateStatus: "blocked",
      gateLabel: "🔴 Mercado bloqueado",
      marketLabel,
      permission: "No emitir recomendación para este mercado.",
      reason:
        "La fuente base no entrega los datos estadísticos necesarios para evaluar este mercado.",
      requiredAction:
        "Conectar fuente complementaria o elegir un mercado con cobertura disponible.",
      canAnalyze: false,
      canRecommend: false,
      canUseInParlay: false,
      missingRequiredStats,
      missingExternalData,
      informationScore,
      summary:
        "Atlas bloquea este mercado porque no tiene datos base suficientes para evaluarlo.",
    };
  }

  if (coverageLevel === "partial") {
    return {
      gateStatus: "limited",
      gateLabel: "🟠 Cobertura parcial",
      marketLabel,
      permission: "Solo análisis inicial.",
      reason:
        "La fuente base entrega parte de los datos, pero el mercado sigue incompleto.",
      requiredAction:
        "Validar datos faltantes antes de considerar una recomendación.",
      canAnalyze: true,
      canRecommend: false,
      canUseInParlay: false,
      missingRequiredStats,
      missingExternalData,
      informationScore,
      summary:
        "Atlas permite revisar contexto, pero no permite decisión operativa fuerte.",
    };
  }

  if (coverageLevel === "covered") {
    return {
      gateStatus: "preliminary",
      gateLabel: "🟡 Mercado cubierto preliminarmente",
      marketLabel,
      permission: "Análisis técnico preliminar permitido.",
      reason:
        "La fuente base entrega los datos estadísticos principales del mercado, pero aún faltan línea/cuota y validación final.",
      requiredAction:
        "Agregar línea de mercado, cuota y comparación contra promedios antes de decidir.",
      canAnalyze: true,
      canRecommend: false,
      canUseInParlay: false,
      missingRequiredStats,
      missingExternalData,
      informationScore,
      summary:
        "Atlas puede analizar este mercado, pero todavía no debe emitir recomendación real.",
    };
  }

  return {
    gateStatus: "unknown",
    gateLabel: "🔵 Mercado no clasificado",
    marketLabel,
    permission: "Solo exploración.",
    reason:
      "Atlas todavía no tiene regla de cobertura para este mercado.",
    requiredAction:
      "Crear regla de cobertura o clasificar manualmente el mercado.",
    canAnalyze: true,
    canRecommend: false,
    canUseInParlay: false,
    missingRequiredStats,
    missingExternalData,
    informationScore,
    summary:
      "Atlas no bloquea completamente, pero no permite decisión operativa.",
  };
}
