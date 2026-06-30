function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function getNumber(value) {
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const parsed = Number(value.replace("%", "").trim());
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function getOperationalLevel({ technicalSupport, estimatedProbability, canRecommend, canUseInParlay, marketBlocked }) {
  if (marketBlocked) {
    return {
      id: "do_not_bet",
      label: "🔴 No apostar",
      description: "El mercado no tiene cobertura suficiente para una decisión responsable.",
    };
  }

  if (!canRecommend) {
    if (technicalSupport >= 60) {
      return {
        id: "analyzable_not_actionable",
        label: "🟡 Analizable, pero no accionable",
        description: "Hay base técnica para estudiar el mercado, pero faltan condiciones para ejecutar apuesta.",
      };
    }

    return {
      id: "observation_only",
      label: "🟠 Solo observación",
      description: "La información permite mirar contexto, pero no tomar acción.",
    };
  }

  if (technicalSupport >= 86 && estimatedProbability >= 70) {
    return {
      id: "high_conviction",
      label: "🟣 Alta convicción técnica",
      description: "El análisis tiene respaldo fuerte y una probabilidad estimada favorable, sin implicar garantía.",
    };
  }

  if (technicalSupport >= 76 && estimatedProbability >= 62) {
    return {
      id: "actionable_conditions",
      label: "🟢 Accionable bajo condiciones",
      description: "El mercado puede considerarse si se mantienen las condiciones detectadas.",
    };
  }

  if (technicalSupport >= 66 && estimatedProbability >= 56) {
    return {
      id: "viable_caution",
      label: "🔵 Viable con cautela",
      description: "El mercado tiene señales útiles, pero requiere prudencia operativa.",
    };
  }

  return {
    id: "analyzable_not_actionable",
    label: "🟡 Analizable, pero no accionable",
    description: "La evidencia no alcanza para recomendación operativa.",
  };
}

function buildCaps({
  marketGate,
  marketDataCoverage,
  realFixtureLookup,
  realFixtureStatistics,
  marketFocusedStats,
  gateCoordinator,
}) {
  const caps = [];
  let maxTechnicalSupport = 95;
  let maxEstimatedProbability = 75;

  if (!realFixtureLookup?.selectedFixture) {
    maxTechnicalSupport = Math.min(maxTechnicalSupport, 20);
    maxEstimatedProbability = Math.min(maxEstimatedProbability, 50);
    caps.push("Sin fixture real confirmado: respaldo técnico máximo 20%.");
  }

  if (!realFixtureStatistics?.statistics?.qualityFlags?.hasStatistics) {
    maxTechnicalSupport = Math.min(maxTechnicalSupport, 35);
    maxEstimatedProbability = Math.min(maxEstimatedProbability, 52);
    caps.push("Sin estadísticas reales del fixture: respaldo técnico máximo 35%.");
  }

  if (marketDataCoverage?.coverageLevel === "missing") {
    maxTechnicalSupport = Math.min(maxTechnicalSupport, 25);
    maxEstimatedProbability = Math.min(maxEstimatedProbability, 50);
    caps.push("Mercado no cubierto por la fuente base: respaldo técnico máximo 25%.");
  }

  if (marketDataCoverage?.coverageLevel === "partial") {
    maxTechnicalSupport = Math.min(maxTechnicalSupport, 45);
    maxEstimatedProbability = Math.min(maxEstimatedProbability, 54);
    caps.push("Cobertura parcial del mercado: respaldo técnico máximo 45%.");
  }

  if (marketFocusedStats?.primaryMissing?.length > 0) {
    maxTechnicalSupport = Math.min(maxTechnicalSupport, 55);
    maxEstimatedProbability = Math.min(maxEstimatedProbability, 57);
    caps.push("Faltan datos principales del mercado: respaldo técnico máximo 55%.");
  }

  if (marketGate?.gateStatus === "blocked") {
    maxTechnicalSupport = Math.min(maxTechnicalSupport, 20);
    maxEstimatedProbability = Math.min(maxEstimatedProbability, 50);
    caps.push("MarketGate bloqueó el mercado: no puede superar 20% de respaldo técnico.");
  }

  if (gateCoordinator?.canRecommend !== true) {
    maxTechnicalSupport = Math.min(maxTechnicalSupport, 68);
    maxEstimatedProbability = Math.min(maxEstimatedProbability, 58);
    caps.push("GateCoordinator no permite recomendación: probabilidad estimada máxima 58%.");
  }

  if (gateCoordinator?.canUseInParlay !== true) {
    caps.push("No apto para parlay en el estado actual.");
  }

  return {
    maxTechnicalSupport,
    maxEstimatedProbability,
    caps,
  };
}

function estimateProbability({
  technicalSupport,
  marketGate,
  marketDataCoverage,
  gateCoordinator,
}) {
  let probability = 50;

  if (marketDataCoverage?.coverageLevel === "covered") {
    probability += 5;
  }

  if (technicalSupport >= 60) {
    probability += 4;
  }

  if (technicalSupport >= 76) {
    probability += 4;
  }

  if (marketGate?.gateStatus === "blocked") {
    probability = 50;
  }

  if (gateCoordinator?.canRecommend !== true) {
    probability = Math.min(probability, 58);
  }

  return clamp(probability, 0, 100);
}

export function calibrateConfidence({
  technicalConfidence,
  sourceConfidence,
  marketGate,
  marketDataCoverage,
  realFixtureLookup,
  realFixtureStatistics,
  marketFocusedStats,
  gateCoordinator,
}) {
  const rawTechnicalSupport = getNumber(technicalConfidence?.technicalScore);
  const informationScore = getNumber(sourceConfidence?.informationScore);

  const caps = buildCaps({
    marketGate,
    marketDataCoverage,
    realFixtureLookup,
    realFixtureStatistics,
    marketFocusedStats,
    gateCoordinator,
  });

  const technicalSupport = clamp(
    rawTechnicalSupport,
    0,
    caps.maxTechnicalSupport
  );

  const rawEstimatedProbability = estimateProbability({
    technicalSupport,
    marketGate,
    marketDataCoverage,
    gateCoordinator,
  });

  const estimatedProbability = clamp(
    rawEstimatedProbability,
    0,
    caps.maxEstimatedProbability
  );

  const operationalLevel = getOperationalLevel({
    technicalSupport,
    estimatedProbability,
    canRecommend: gateCoordinator?.canRecommend === true,
    canUseInParlay: gateCoordinator?.canUseInParlay === true,
    marketBlocked: marketGate?.gateStatus === "blocked",
  });

  const explanations = [];

  explanations.push(
    "Respaldo técnico mide qué tan completo y verificable está el análisis; no es probabilidad de acierto."
  );

  explanations.push(
    "Probabilidad estimada mide una lectura prudente del evento, sin prometer resultado."
  );

  if (caps.caps.length > 0) {
    explanations.push("Se aplicaron techos de prudencia por datos faltantes o bloqueos operativos.");
  }

  return {
    informationScore,
    rawTechnicalSupport,
    technicalSupport,
    rawEstimatedProbability,
    estimatedProbability,
    operationalLevel,
    maxTechnicalSupport: caps.maxTechnicalSupport,
    maxEstimatedProbability: caps.maxEstimatedProbability,
    capsApplied: caps.caps,
    canRecommend: gateCoordinator?.canRecommend === true,
    canUseInParlay: gateCoordinator?.canUseInParlay === true,
    summary:
      "Atlas separa respaldo técnico, probabilidad estimada y nivel operativo para evitar falsa certeza.",
    explanations,
  };
}
