function detectUseCaseLabel(useCase = "") {
  if (useCase === "parlay") return "Parlay";
  if (useCase === "apuesta_simple") return "Apuesta simple";
  if (useCase === "simple") return "Apuesta simple";
  return "Solo análisis";
}

function buildAvoidList({ marketGate, marketDataCoverage, analysisInput }) {
  const avoid = [];

  if (marketGate?.canUseInParlay === false) {
    avoid.push("No usar este mercado en parlay en el estado actual.");
  }

  if (marketGate?.canRecommend === false) {
    avoid.push("No convertir este análisis en apuesta real todavía.");
  }

  if (marketDataCoverage?.coverageLevel === "missing") {
    avoid.push(
      `No apostar ${analysisInput?.mercado || "este mercado"} sin una fuente complementaria.`
    );
  }

  if (marketDataCoverage?.missingExternalData?.length > 0) {
    avoid.push(
      "No decidir sin revisar los faltantes externos: línea de mercado, cuota y contexto adicional."
    );
  }

  return avoid;
}

function buildConditions({ marketDataCoverage, marketGate, gateCoordinator }) {
  const conditions = [];

  if (marketDataCoverage?.missingExternalData?.length > 0) {
    conditions.push(...marketDataCoverage.missingExternalData);
  }

  if (marketGate?.requiredAction) {
    conditions.push(marketGate.requiredAction);
  }

  if (gateCoordinator?.requiredAction) {
    conditions.push(gateCoordinator.requiredAction);
  }

  return Array.from(new Set(conditions));
}

function buildMainReasons({
  realFixtureLookup,
  realFixtureStatistics,
  marketDataCoverage,
  marketGate,
  sourceConfidence,
}) {
  const reasons = [];

  const fixture = realFixtureLookup?.selectedFixture;

  if (fixture) {
    reasons.push("Fixture real confirmado por API-FOOTBALL.");

    if (fixture?.referee?.confirmed) {
      reasons.push("Árbitro confirmado para el partido.");
    }

    if (fixture?.venue?.name) {
      reasons.push("Estadio confirmado.");
    }
  } else {
    reasons.push("No hay fixture real confirmado.");
  }

  if (realFixtureStatistics?.statistics?.qualityFlags?.hasStatistics) {
    reasons.push("Estadísticas reales disponibles para el fixture.");
  }

  if (marketDataCoverage?.coverageStatus) {
    reasons.push(`Cobertura del mercado: ${marketDataCoverage.coverageStatus}.`);
  }

  if (marketGate?.summary) {
    reasons.push(marketGate.summary);
  }

  if (sourceConfidence?.qualityLabel) {
    reasons.push(`Calidad informativa actual: ${sourceConfidence.qualityLabel}.`);
  }

  return reasons;
}

function buildActionLevel(gateCoordinator) {
  if (!gateCoordinator) {
    return {
      level: "Indeterminado",
      label: "Sin dictamen operativo",
    };
  }

  if (gateCoordinator.finalStatus === "blocked") {
    return {
      level: "Bloqueado",
      label: "No apostar",
    };
  }

  if (gateCoordinator.finalStatus === "limited") {
    return {
      level: "Exploratorio",
      label: "Solo análisis inicial",
    };
  }

  if (gateCoordinator.finalStatus === "preliminary") {
    return {
      level: "Preliminar",
      label: "Analizar, pero no apostar todavía",
    };
  }

  if (gateCoordinator.finalStatus === "parlay_blocked") {
    return {
      level: "Parlay bloqueado",
      label: "No usar en parlay",
    };
  }

  return {
    level: "Exploratorio",
    label: "No accionable todavía",
  };
}

export function buildDirectorAtlasVerdict({
  gateCoordinator,
  marketGate,
  marketDataCoverage,
  marketFocusedStats,
  realFixtureLookup,
  realFixtureStatistics,
  sourceConfidence,
  confidenceCalibration,
  fiscalImpact,
  analysisInput,
}) {
  const market = analysisInput?.mercado || "Mercado no especificado";
  const useCase = analysisInput?.uso || "analisis";

  const actionLevel = buildActionLevel(gateCoordinator);

  const canRecommend = gateCoordinator?.canRecommend === true;
  const canUseInParlay = gateCoordinator?.canUseInParlay === true;

  let verdict = "No apostar todavía.";
  let candidateSelection = "Sin selección accionable todavía.";
  let minimumAcceptableOdds = "Pendiente de línea/cuota real.";
  let preferredMarket = market;

  if (marketGate?.gateStatus === "blocked") {
    verdict = "Mercado descartado por falta de cobertura.";
    candidateSelection = "No seleccionar este mercado con la fuente actual.";
    preferredMarket = "Buscar mercado alternativo con datos disponibles.";
  } else if (marketGate?.gateStatus === "preliminary") {
    verdict = "Mercado viable para análisis preliminar, pero no accionable todavía.";
    candidateSelection = "Pendiente hasta conocer línea y cuota.";
    preferredMarket = marketDataCoverage?.marketLabel || market;
  } else if (marketGate?.gateStatus === "limited") {
    verdict = "Mercado limitado: revisar solo como contexto.";
    candidateSelection = "No usar como selección principal.";
  }

  if (canRecommend) {
    verdict = "Apuesta candidata aceptable bajo condiciones.";
    candidateSelection = "Pendiente de selección específica según línea disponible.";
  }

  if (fiscalImpact?.fiscalLevel === "strong") {
    verdict = "No apostar todavía por objeción fuerte del Fiscal.";
    candidateSelection = "Sin selección accionable hasta resolver objeciones fiscales.";
  } else if (fiscalImpact?.fiscalLevel === "medium") {
    verdict = "Análisis limitado por objeciones del Fiscal.";
    candidateSelection = "No convertir en apuesta real hasta resolver riesgos detectados.";
  } else if (fiscalImpact?.fiscalLevel === "low" && !canRecommend) {
    verdict = "Mercado observable, pero con advertencia fiscal.";
  }

  return {
    title: "Dictamen del Director Atlas",
    verdict,
    actionLevel,
    market,
    preferredMarket,
    useCase: detectUseCaseLabel(useCase),
    candidateSelection,
    minimumAcceptableOdds,
    informationScore:
      sourceConfidence?.informationScore ??
      sourceConfidence?.score ??
      sourceConfidence?.qualityScore ??
      0,
    technicalSupport:
      fiscalImpact?.adjustedTechnicalSupport ??
      confidenceCalibration?.technicalSupport ??
      null,
    estimatedProbability:
      fiscalImpact?.adjustedEstimatedProbability ??
      confidenceCalibration?.estimatedProbability ??
      null,
    operationalLevel: confidenceCalibration?.operationalLevel || null,
    fiscalLevel: fiscalImpact?.fiscalLevel || "not_applied",
    fiscalLabel: fiscalImpact?.fiscalLabel || "Fiscal no aplicado",
    fiscalPenalty: fiscalImpact?.penalty ?? 0,
    canRecommend: fiscalImpact?.blocksRecommendation ? false : canRecommend,
    canUseInParlay: fiscalImpact?.blocksParlay ? false : canUseInParlay,
    mainReasons: buildMainReasons({
      realFixtureLookup,
      realFixtureStatistics,
      marketDataCoverage,
      marketGate,
      sourceConfidence,
    }),
    risks: [
      gateCoordinator?.primaryReason,
      ...(marketDataCoverage?.missingExternalData || []),
    ].filter(Boolean),
    requiredConditions: buildConditions({
      marketDataCoverage,
      marketGate,
      gateCoordinator,
    }),
    avoid: buildAvoidList({
      marketGate,
      marketDataCoverage,
      analysisInput,
    }),
    directorNote:
      "Este dictamen integra los módulos técnicos de Atlas. El respaldo técnico mide calidad del análisis; la probabilidad estimada no garantiza resultado; el nivel operativo define qué acción permite Atlas.",
  };
}
