function getScoreNumber(value) {
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const parsed = Number(value.replace("%", "").trim());
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function buildTechnicalLevel(score, marketGateStatus) {
  if (marketGateStatus === "blocked") {
    return {
      level: "No viable",
      label: "🔴 No viable técnicamente",
    };
  }

  if (score >= 80) {
    return {
      level: "Fuerte",
      label: "🟢 Fuerte técnicamente",
    };
  }

  if (score >= 65) {
    return {
      level: "Media-alta",
      label: "🟡 Técnica favorable preliminar",
    };
  }

  if (score >= 45) {
    return {
      level: "Media",
      label: "🟡 Viable para análisis",
    };
  }

  if (score >= 25) {
    return {
      level: "Débil",
      label: "🟠 Débil / incompleto",
    };
  }

  return {
    level: "Muy baja",
    label: "🔴 Sin base suficiente",
  };
}

function buildExposure({ technicalLevel, canRecommend, canUseInParlay }) {
  if (!canRecommend) {
    return {
      level: "Ninguna",
      label: "No ejecutar apuesta",
      reason:
        "Atlas no permite convertir este análisis en apuesta real con la información actual.",
    };
  }

  if (technicalLevel === "Fuerte" && canUseInParlay) {
    return {
      level: "Moderada",
      label: "Exposición moderada",
      reason:
        "El mercado tiene fuerza técnica alta y pasó filtros operativos. Aun así, requiere gestión prudente.",
    };
  }

  if (technicalLevel === "Fuerte" || technicalLevel === "Media-alta") {
    return {
      level: "Baja",
      label: "Exposición baja",
      reason:
        "El mercado tiene señales favorables, pero Atlas mantiene prudencia por riesgo residual.",
    };
  }

  return {
    level: "Observación",
    label: "Solo observación",
    reason:
      "El mercado puede analizarse, pero no tiene fuerza suficiente para exposición real.",
  };
}

export function buildTechnicalConfidence({
  sourceConfidence,
  marketGate,
  gateCoordinator,
  marketDataCoverage,
  realFixtureLookup,
  realFixtureStatistics,
  marketFocusedStats,
}) {
  const informationScore = getScoreNumber(
    sourceConfidence?.informationScore ??
      sourceConfidence?.score ??
      sourceConfidence?.qualityScore
  );

  let technicalScore = 0;

  const factors = [];
  const penalties = [];

  if (realFixtureLookup?.selectedFixture) {
    technicalScore += 15;
    factors.push("Fixture real confirmado.");
  } else {
    penalties.push("No hay fixture real confirmado.");
  }

  if (realFixtureLookup?.selectedFixture?.referee?.confirmed) {
    technicalScore += 15;
    factors.push("Árbitro confirmado.");
  }

  if (realFixtureStatistics?.statistics?.qualityFlags?.hasStatistics) {
    technicalScore += 15;
    factors.push("Estadísticas reales disponibles.");
  }

  if (marketDataCoverage?.coverageLevel === "covered") {
    technicalScore += 20;
    factors.push("Mercado cubierto por la fuente base.");
  } else if (marketDataCoverage?.coverageLevel === "partial") {
    technicalScore += 8;
    factors.push("Mercado parcialmente cubierto.");
    penalties.push("Cobertura incompleta del mercado.");
  } else if (marketDataCoverage?.coverageLevel === "missing") {
    penalties.push("Mercado no cubierto por la fuente actual.");
  }

  if (marketFocusedStats?.primaryAvailable?.length > 0) {
    technicalScore += 10;
    factors.push("Datos principales del mercado disponibles.");
  }

  if (marketFocusedStats?.primaryMissing?.length > 0) {
    technicalScore -= 12;
    penalties.push("Faltan datos principales del mercado.");
  }

  if (marketGate?.gateStatus === "blocked") {
    technicalScore = Math.min(technicalScore, 20);
    penalties.push("MarketGate bloqueó el mercado.");
  }

  if (gateCoordinator?.canRecommend !== true) {
    technicalScore = Math.min(technicalScore, 68);
    penalties.push("El GateCoordinator no permite recomendación real todavía.");
  }

  if (gateCoordinator?.canUseInParlay !== true) {
    penalties.push("No apto para parlay en el estado actual.");
  }

  technicalScore = Math.max(0, Math.min(100, technicalScore));

  const technicalLevel = buildTechnicalLevel(
    technicalScore,
    marketGate?.gateStatus
  );

  const exposure = buildExposure({
    technicalLevel: technicalLevel.level,
    canRecommend: gateCoordinator?.canRecommend === true,
    canUseInParlay: gateCoordinator?.canUseInParlay === true,
  });

  return {
    informationScore,
    technicalScore,
    technicalLevel,
    exposure,
    canRecommend: gateCoordinator?.canRecommend === true,
    canUseInParlay: gateCoordinator?.canUseInParlay === true,
    summary:
      gateCoordinator?.canRecommend === true
        ? "Atlas encuentra condiciones técnicas suficientes para considerar una recomendación bajo gestión prudente."
        : "Atlas puede analizar el mercado, pero todavía no permite ejecución de apuesta real.",
    factors,
    penalties,
  };
}
