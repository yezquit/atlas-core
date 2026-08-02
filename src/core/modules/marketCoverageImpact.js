function getScoreNumber(value) {
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const parsed = Number(value.replace("%", "").trim());
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function getQualityLabel(score) {
  if (score >= 80) return "Alta";
  if (score >= 60) return "Media-alta";
  if (score >= 40) return "Media";
  if (score >= 25) return "Baja controlada";
  return "Baja";
}

export function applyMarketCoverageToSourceConfidence({
  sourceConfidence,
  marketDataCoverage,
}) {
  const coverageLevel = marketDataCoverage?.coverageLevel || "unknown";

  let scoreAdded = 0;
  let blocksMarket = false;
  let summary = "No se aplicó impacto de cobertura de mercado.";
  const hasLineAndOdds = Boolean(
    marketDataCoverage?.hasLine && marketDataCoverage?.hasOdds
  );

  if (coverageLevel === "covered") {
    scoreAdded = 15;
    summary = hasLineAndOdds
      ? "El mercado tiene datos estadísticos base y línea/cuota reportadas; los valores aún requieren validación."
      : "El mercado tiene datos estadísticos base; aún falta reportar línea y/o cuota.";
  }

  if (coverageLevel === "partial") {
    scoreAdded = 6;
    summary =
      "El mercado tiene cobertura parcial. Atlas puede analizar contexto, pero no debe emitir decisión fuerte.";
  }

  if (coverageLevel === "missing") {
    scoreAdded = 0;
    blocksMarket = true;
    summary =
      "El mercado no está cubierto por API-FOOTBALL en este fixture. Requiere fuente complementaria.";
  }

  if (coverageLevel === "unknown") {
    scoreAdded = 0;
    summary =
      "Atlas todavía no tiene regla de cobertura para este mercado.";
  }

  const originalScore = getScoreNumber(
    sourceConfidence?.informationScore ??
      sourceConfidence?.score ??
      sourceConfidence?.qualityScore
  );

  // La cobertura estadística no basta para elevar la calidad informativa sin validación integral.
  const marketCoverageCap =
    coverageLevel === "covered"
      ? 68
      : coverageLevel === "partial"
        ? 50
        : 35;

  const newScore = Math.min(marketCoverageCap, originalScore + scoreAdded);

  return {
    ...sourceConfidence,
    informationScore: newScore,
    score: newScore,
    qualityScore: newScore,
    qualityLabel: getQualityLabel(newScore),
    marketCoverageImpact: {
      applied: true,
      marketLabel: marketDataCoverage?.marketLabel || "Mercado no identificado",
      coverageLevel,
      coverageStatus: marketDataCoverage?.coverageStatus || "No evaluado",
      blocksMarket,
      scoreAdded,
      originalScore,
      newScore,
      cap: marketCoverageCap,
      summary,
      missingRequiredStats: marketDataCoverage?.missingRequiredStats || [],
      missingExternalData: marketDataCoverage?.missingExternalData || [],
    },
  };
}
