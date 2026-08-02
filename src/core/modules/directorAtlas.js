import {
  PARLAY_STATUS,
  POLICY_STATUS,
  PROBABILITY_STATUS,
  createDirectorVerdict,
} from "../contracts/atlasContracts.js";

function normalizeText(value = "") {
  return value
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function filterResolvedExternalMissing(items = [], marketLineContext) {
  const hasLine = Boolean(marketLineContext?.lineText);
  const hasOdds = Boolean(marketLineContext?.oddsText);

  return items.filter((item) => {
    const normalized = normalizeText(item);
    if (hasLine && normalized.includes("linea")) return false;
    if (hasOdds && normalized.includes("cuota")) return false;
    return true;
  });
}

function detectUseCaseLabel(useCase = "") {
  if (useCase === "parlay") return "Parlay (no soportado en Fase 0)";
  if (["apuesta_simple", "simple"].includes(useCase)) {
    return "Apuesta simple";
  }
  return "Solo análisis";
}

function resolvePolicyStatus(gateCoordinator) {
  const status = gateCoordinator?.status || gateCoordinator?.finalStatus;
  return Object.values(POLICY_STATUS).includes(status)
    ? status
    : POLICY_STATUS.EXPLORATORY;
}

function buildActionLevel(policyStatus, canRecommend) {
  if (policyStatus === POLICY_STATUS.BLOCKED) {
    return { level: "Bloqueado", label: "No apostar" };
  }
  if (policyStatus === POLICY_STATUS.LIMITED) {
    return { level: "Limitado", label: "Solo análisis inicial" };
  }
  if (policyStatus === POLICY_STATUS.PRELIMINARY) {
    return { level: "Preliminar", label: "Analizar, no apostar" };
  }
  if (policyStatus === POLICY_STATUS.READY && !canRecommend) {
    return {
      level: "Evaluación incompleta",
      label: "Modelo deportivo no disponible",
    };
  }
  if (canRecommend) {
    return { level: "Accionable", label: "Evaluar bajo condiciones" };
  }
  return { level: "Exploratorio", label: "No accionable" };
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
    reasons.push("La fuente de fixtures devolvió una única coincidencia.");
    if (fixture?.referee?.confirmed) reasons.push("Árbitro confirmado.");
    if (fixture?.venue?.name) reasons.push("Sede identificada.");
  } else if (realFixtureLookup?.status === "ambiguous") {
    reasons.push(
      "La coincidencia del fixture es ambigua y no se presenta como confirmada."
    );
  } else {
    reasons.push("No hay fixture confirmado.");
  }

  if (realFixtureStatistics?.statistics?.qualityFlags?.hasStatistics) {
    reasons.push("Hay estadísticas normalizadas para el fixture.");
  }
  if (marketDataCoverage?.coverageStatus) {
    reasons.push(`Cobertura del mercado: ${marketDataCoverage.coverageStatus}.`);
  }
  if (marketGate?.summary) reasons.push(marketGate.summary);
  if (sourceConfidence?.informationQuality) {
    reasons.push(
      `Calidad informativa actual: ${sourceConfidence.informationQuality}.`
    );
  }

  return Array.from(new Set(reasons));
}

function buildConditions({
  marketDataCoverage,
  marketGate,
  gateCoordinator,
  marketLineContext,
}) {
  const conditions = filterResolvedExternalMissing(
    marketDataCoverage?.missingExternalData || [],
    marketLineContext
  );
  if (marketGate?.requiredAction) conditions.push(marketGate.requiredAction);
  if (gateCoordinator?.requiredAction) {
    conditions.push(gateCoordinator.requiredAction);
  }
  conditions.push(
    "Validar un modelo deportivo antes de estimar probabilidad o autorizar una recomendación."
  );
  return Array.from(new Set(conditions));
}

function buildAvoidList({ marketGate, marketDataCoverage, analysisInput }) {
  const avoid = ["No usar parlay: capacidad no soportada en Fase 0."];
  if (marketGate?.canRecommend === false) {
    avoid.push("No convertir este análisis en apuesta real todavía.");
  }
  if (marketDataCoverage?.coverageLevel === "missing") {
    avoid.push(
      `No apostar ${analysisInput?.mercado || "este mercado"} sin evidencia estadística suficiente.`
    );
  }
  return Array.from(new Set(avoid));
}

export function buildDirectorAtlasVerdict({
  gateCoordinator,
  marketGate,
  marketDataCoverage,
  realFixtureLookup,
  realFixtureStatistics,
  sourceConfidence,
  confidenceCalibration,
  fiscalImpact,
  refereeProfile,
  teamRecentProfile,
  marketLineContext,
  complementarySourceCoverage,
  analysisInput,
}) {
  const market = analysisInput?.mercado || "Mercado no especificado";
  const policyStatus = resolvePolicyStatus(gateCoordinator);
  const probabilityStatus = PROBABILITY_STATUS.UNAVAILABLE;
  const hasOperationalBlock = Boolean(
    fiscalImpact?.blocksRecommendation ||
      marketLineContext?.blocksDecision ||
      complementarySourceCoverage?.blocksDecision ||
      realFixtureLookup?.status === "ambiguous"
  );
  const canRecommend = Boolean(
    gateCoordinator?.canRecommend === true &&
      confidenceCalibration?.canRecommend === true &&
      !hasOperationalBlock
  );
  const actionLevel = buildActionLevel(policyStatus, canRecommend);
  const mainReasons = buildMainReasons({
    realFixtureLookup,
    realFixtureStatistics,
    marketDataCoverage,
    marketGate,
    sourceConfidence,
  });
  const requiredConditions = buildConditions({
    marketDataCoverage,
    marketGate,
    gateCoordinator,
    marketLineContext,
  });
  const unresolvedExternalMissing = filterResolvedExternalMissing(
    marketDataCoverage?.missingExternalData || [],
    marketLineContext
  );

  let verdict =
    "No apostar todavía: Atlas no dispone de un modelo deportivo validado.";
  let preferredMarket = market;
  let candidateSelection = "Sin selección accionable en Fase 0.";

  if (policyStatus === POLICY_STATUS.BLOCKED) {
    verdict = "No apostar: una validación crítica bloqueó el análisis.";
  }
  if (marketGate?.gateStatus === "blocked") {
    verdict = "Mercado descartado por falta de cobertura estadística.";
    preferredMarket = "Ningún mercado alternativo evaluado";
  }
  if (realFixtureLookup?.status === "ambiguous") {
    verdict = "No apostar: el fixture es ambiguo y no está confirmado.";
  }
  if (fiscalImpact?.fiscalLevel === "strong") {
    verdict = "No apostar: el Fiscal mantiene una objeción fuerte.";
  }
  if (complementarySourceCoverage?.blocksDecision) {
    verdict = "No apostar: la cobertura de evidencia es insuficiente.";
  }
  if (marketLineContext?.status !== "available") {
    candidateSelection =
      "Sin selección accionable hasta completar línea y cuota.";
  } else {
    candidateSelection =
      "Línea y cuota conservadas como datos reportados; selección no autorizada.";
  }

  const lineAndOdds =
    marketLineContext?.status === "available"
      ? `Línea reportada: ${marketLineContext.lineText}. Cuota reportada: ${marketLineContext.oddsText}. Pendientes de validación.`
      : "Línea y/o cuota no reportadas por completo.";
  const risks = [
    gateCoordinator?.primaryReason,
    ...unresolvedExternalMissing,
    ...(refereeProfile?.sourceImpact?.shouldLimitConfidence
      ? [refereeProfile.sourceImpact.reason]
      : []),
    ...(teamRecentProfile?.sourceImpact?.shouldLimitConfidence
      ? [teamRecentProfile.sourceImpact.reason]
      : []),
  ].filter(Boolean);

  return createDirectorVerdict({
    verdict,
    market,
    technicalSupport:
      fiscalImpact?.adjustedTechnicalSupport ??
      confidenceCalibration?.technicalSupport ??
      null,
    estimatedProbability: null,
    probabilityStatus,
    policyStatus,
    canRecommend,
    parlayStatus: PARLAY_STATUS.UNSUPPORTED,
    reasons: mainReasons,
    risks: Array.from(new Set(risks)),
    missingData: requiredConditions,
    avoid: buildAvoidList({ marketGate, marketDataCoverage, analysisInput }),
    nextAction:
      requiredConditions[0] || "Mantener el caso como análisis no accionable.",
    title: "Dictamen del Director Atlas",
    actionLevel,
    preferredMarket,
    useCase: detectUseCaseLabel(analysisInput?.uso),
    candidateSelection,
    minimumAcceptableOdds: lineAndOdds,
    informationScore:
      sourceConfidence?.informationScore ??
      sourceConfidence?.score ??
      sourceConfidence?.qualityScore ??
      0,
    operationalLevel: confidenceCalibration?.operationalLevel || null,
    fiscalLevel: fiscalImpact?.fiscalLevel || "not_applied",
    fiscalLabel: fiscalImpact?.fiscalLabel || "Fiscal no aplicado",
    fiscalPenalty: fiscalImpact?.penalty ?? 0,
    lineContextStatus: marketLineContext?.status || "not_applied",
    complementaryCoverageStatus:
      complementarySourceCoverage?.coverageStatus || "not_applied",
    mainReasons,
    requiredConditions,
    directorNote:
      "DirectorAtlas integra la evidencia y es la única voz pública. Los demás módulos permanecen como soporte técnico auditable.",
  });
}
