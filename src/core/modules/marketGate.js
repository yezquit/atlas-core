import {
  MARKET_STATUS,
  PARLAY_STATUS,
} from "../contracts/atlasContracts.js";

export function runMarketGate({
  marketDataCoverage,
  marketFocusedStats,
  sourceConfidence,
  analysisInput,
}) {
  const coverageLevel = marketDataCoverage?.coverageLevel || "unknown";
  const marketLabel =
    marketDataCoverage?.marketLabel ||
    analysisInput?.mercado ||
    "Mercado no especificado";

  const missingExternalData = marketDataCoverage?.missingExternalData || [];
  const missingRequiredStats = marketDataCoverage?.missingRequiredStats || [];
  const hasLine = Boolean(
    marketDataCoverage?.hasLine || analysisInput?.lineaMercado?.trim()
  );
  const hasOdds = Boolean(
    marketDataCoverage?.hasOdds || analysisInput?.cuotaMercado?.trim()
  );

  const informationScore =
    sourceConfidence?.informationScore ??
    sourceConfidence?.score ??
    sourceConfidence?.qualityScore ??
    0;

  const common = {
    marketLabel,
    canUseInParlay: false,
    parlayStatus: PARLAY_STATUS.UNSUPPORTED,
    missingRequiredStats,
    missingExternalData,
    informationScore,
    focusedStatsStatus: marketFocusedStats?.status || null,
  };

  if (coverageLevel === "missing") {
    return {
      ...common,
      gateStatus: MARKET_STATUS.BLOCKED,
      gateLabel: "🔴 Mercado bloqueado",
      permission: "No emitir recomendación para este mercado.",
      reason:
        "La fuente base no entrega los datos estadísticos necesarios para evaluar este mercado.",
      requiredAction:
        "Conectar fuente complementaria o elegir un mercado con cobertura disponible.",
      canAnalyze: false,
      canRecommend: false,
      summary:
        "Atlas bloquea este mercado porque no tiene datos base suficientes para evaluarlo.",
    };
  }

  if (coverageLevel === "partial") {
    return {
      ...common,
      gateStatus: MARKET_STATUS.LIMITED,
      gateLabel: "🟠 Cobertura parcial",
      permission: "Solo análisis inicial.",
      reason:
        "La fuente base entrega parte de los datos, pero el mercado sigue incompleto.",
      requiredAction:
        "Validar datos faltantes antes de considerar una recomendación.",
      canAnalyze: true,
      canRecommend: false,
      summary:
        "Atlas permite revisar contexto, pero no permite decisión operativa fuerte.",
    };
  }

  if (coverageLevel === "covered") {
    const lineAndOddsMessage =
      hasLine && hasOdds
        ? "La línea y la cuota fueron reportadas; todavía requieren validación contra datos históricos y fuente de mercado."
        : "Todavía faltan línea y/o cuota para evaluar el contexto económico.";

    return {
      ...common,
      gateStatus: MARKET_STATUS.PRELIMINARY,
      gateLabel: "🟡 Mercado cubierto preliminarmente",
      permission: "Análisis técnico preliminar permitido.",
      reason: `La fuente base entrega los datos estadísticos principales. ${lineAndOddsMessage}`,
      requiredAction:
        hasLine && hasOdds
          ? "Validar la línea y la cuota reportadas y compararlas contra datos históricos verificables."
          : "Agregar los datos de línea o cuota que aún falten antes de decidir.",
      canAnalyze: true,
      canRecommend: false,
      summary:
        "Atlas puede analizar este mercado, pero todavía no debe emitir recomendación real.",
    };
  }

  return {
    ...common,
    gateStatus: MARKET_STATUS.UNCLASSIFIED,
    gateLabel: "🔵 Mercado no clasificado",
    permission: "Solo exploración.",
    reason: "Atlas todavía no tiene regla de cobertura para este mercado.",
    requiredAction: "Crear regla de cobertura o clasificar manualmente el mercado.",
    canAnalyze: true,
    canRecommend: false,
    summary:
      "Atlas no bloquea completamente, pero no permite decisión operativa.",
  };
}
