import {
  DATA_LOAD_STATUS,
  DIRECTOR_STATUS,
  PARLAY_STATUS,
  POLICY_STATUS,
  PROBABILITY_STATUS,
  createDirectorVerdict,
} from "../contracts/atlasContracts.js";
import { MARKET_SUITABILITY } from "../contracts/operationalContracts.js";

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

export function buildPhaseOneDirectorVerdict({
  dataStatus,
  dataErrorCode = null,
  fixture = null,
  statisticsResult = null,
  marketAssessment = null,
  evidence = [],
}) {
  const market = marketAssessment?.marketLabel || "Mercado no evaluado";
  const blockingCodes = new Set([
    "invalid_fixture_id",
    "fixture_selection_mismatch",
    "ambiguous_fixture_id",
    "unsupported_market",
  ]);
  const allRequiredEvidenceVerified = Boolean(
    marketAssessment?.actionable === true &&
      marketAssessment?.historicalSampleSize > 0 &&
      marketAssessment?.missingData?.length === 0 &&
      marketAssessment?.evidence?.length > 0 &&
      marketAssessment.evidence.every((item) => item.status === "verified")
  );
  const currentVerifiedCount = marketAssessment?.verifiedData?.length || 0;

  let status = DIRECTOR_STATUS.INSUFFICIENT_DATA;
  let policyStatus = POLICY_STATUS.LIMITED;
  let verdict =
    "Datos insuficientes para una evaluación deportiva responsable.";
  let nextAction =
    "Esperar datos históricos verificables antes de considerar este mercado.";

  if (blockingCodes.has(dataErrorCode) || dataStatus === DATA_LOAD_STATUS.AMBIGUOUS) {
    status = DIRECTOR_STATUS.BLOCKED;
    policyStatus = POLICY_STATUS.BLOCKED;
    verdict =
      "Análisis bloqueado: el fixture o mercado no cumple el contrato de selección.";
    nextAction = "Corregir la selección explícita antes de volver a analizar.";
  } else if (
    [DATA_LOAD_STATUS.UNAVAILABLE, DATA_LOAD_STATUS.PROVIDER_ERROR].includes(
      dataStatus
    )
  ) {
    status = DIRECTOR_STATUS.UNAVAILABLE;
    policyStatus = POLICY_STATUS.LIMITED;
    verdict =
      "Análisis no disponible por una limitación real de datos o del proveedor.";
    nextAction =
      "Revisar la limitación informada o intentar con una temporada disponible.";
  } else if (allRequiredEvidenceVerified) {
    status = DIRECTOR_STATUS.VIABLE_WITH_CAUTION;
    policyStatus = POLICY_STATUS.READY;
    verdict =
      "Mercado viable con cautela por cobertura verificada, sin probabilidad estimada.";
    nextAction = "Mantener cautela y revisar el expediente técnico completo.";
  } else if (fixture && currentVerifiedCount > 0) {
    status = DIRECTOR_STATUS.ANALYZABLE_NOT_ACTIONABLE;
    policyStatus = POLICY_STATUS.PRELIMINARY;
    verdict =
      "El fixture es analizable, pero no existe respaldo histórico para un pick accionable.";
  }

  const reasons = [];
  if (fixture) {
    reasons.push(
      `Fixture ${fixture.fixtureId} verificado por ID, fecha, liga y temporada.`
    );
  }
  if (
    statisticsResult?.loadStatus === DATA_LOAD_STATUS.SUCCESS ||
    statisticsResult?.status === "available"
  ) {
    reasons.push(
      "Las estadísticas disponibles pertenecen únicamente al fixture seleccionado."
    );
  }
  if (currentVerifiedCount > 0) {
    reasons.push(
      `${currentVerifiedCount} requisito(s) actual(es) del mercado tienen evidencia verificada.`
    );
  }
  reasons.push(
    "Atlas no interpreta un único partido como forma reciente de los equipos."
  );

  const missingData = Array.from(
    new Set(marketAssessment?.missingData || ["Evidencia de mercado verificable"])
  );
  const risks = [
    ...missingData,
    "No existe un modelo deportivo validado para estimar probabilidad.",
  ];

  return createDirectorVerdict({
    status,
    verdict,
    market,
    technicalSupport: marketAssessment?.technicalSupport ?? 0,
    estimatedProbability: null,
    probabilityStatus: PROBABILITY_STATUS.UNAVAILABLE,
    policyStatus,
    canRecommend: false,
    parlayStatus: PARLAY_STATUS.UNSUPPORTED,
    reasons,
    risks,
    missingData,
    avoid: [
      "No presentar este mercado como seguro.",
      "No generar un pick accionable sin histórico suficiente.",
      "No usar parlay: capacidad no soportada.",
    ],
    nextAction,
    title: "Dictamen del Director Atlas",
    actionLevel: {
      level: status,
      label: status.replaceAll("_", " "),
    },
    candidateSelection: "Sin pick accionable en Fase 1.",
    selectedFixtureId: fixture?.fixtureId || null,
    dataStatus,
    dataErrorCode,
    evidenceRefs: evidence.map((item) => item.id).filter(Boolean),
    directorNote:
      "DirectorAtlas es la única voz pública; la evidencia técnica no constituye recomendación.",
  });
}

const PHASE_TWO_DISPLAY_STATUS = Object.freeze({
  [DIRECTOR_STATUS.UNAVAILABLE]: "Datos no disponibles",
  [DIRECTOR_STATUS.INSUFFICIENT_DATA]: "Información insuficiente",
  [DIRECTOR_STATUS.ANALYZABLE_NOT_ACTIONABLE]:
    "Analizable, pero aún no accionable",
  [DIRECTOR_STATUS.CANDIDATE_FOR_MARKET_REVIEW]:
    "Candidato para revisar línea y cuota",
  [DIRECTOR_STATUS.VIABLE_WITH_CAUTION]: "Viable con cautela",
  [DIRECTOR_STATUS.BLOCKED]: "Análisis bloqueado",
});

export function buildPhaseTwoDirectorVerdict({
  dataStatus,
  dataErrorCode = null,
  fixture = null,
  competition = null,
  marketAssessment = null,
  evidenceRefs = [],
  engineVersion = "atlas-sports-v2",
}) {
  const blockingCodes = new Set([
    "invalid_fixture_id",
    "fixture_selection_mismatch",
    "ambiguous_fixture_id",
    "request_budget_exhausted",
  ]);
  let status = DIRECTOR_STATUS.INSUFFICIENT_DATA;
  let verdict = "Atlas no dispone todavía de una muestra suficiente para este partido.";
  let operationalLevel = "observe_only";

  if (blockingCodes.has(dataErrorCode) || dataStatus === DATA_LOAD_STATUS.BLOCKED) {
    status = DIRECTOR_STATUS.BLOCKED;
    verdict = "El análisis se detuvo por una regla crítica de identidad o presupuesto.";
    operationalLevel = "blocked";
  } else if (
    [DATA_LOAD_STATUS.UNAVAILABLE, DATA_LOAD_STATUS.PROVIDER_ERROR].includes(dataStatus)
  ) {
    status = DIRECTOR_STATUS.UNAVAILABLE;
    verdict = "Los datos necesarios no están disponibles de forma verificable.";
    operationalLevel = "unavailable";
  } else if (marketAssessment?.candidate) {
    const hasLineAndOdds = Boolean(marketAssessment.line && marketAssessment.odds);
    status = hasLineAndOdds
      ? DIRECTOR_STATUS.VIABLE_WITH_CAUTION
      : DIRECTOR_STATUS.CANDIDATE_FOR_MARKET_REVIEW;
    verdict = hasLineAndOdds
      ? "La evidencia permite revisar la línea y cuota con cautela; no autoriza una apuesta."
      : "El mercado tiene respaldo suficiente para revisar una línea y cuota verificables.";
    operationalLevel = "market_review_only";
  } else if (fixture && marketAssessment?.available_evidence?.length > 0) {
    status = DIRECTOR_STATUS.ANALYZABLE_NOT_ACTIONABLE;
    verdict = "El partido es analizable, pero el mercado aún no cumple todos los requisitos.";
    operationalLevel = "analysis_only";
  }

  const reasons = [
    ...(fixture
      ? [`Fixture ${fixture.fixtureId} conservado y verificado por ID.`]
      : []),
    ...(marketAssessment?.available_evidence || []).map(
      (item) => item.requirement
    ),
  ];
  const missingData = marketAssessment?.missing_evidence || [
    "Histórico deportivo verificable",
  ];
  const risks = [
    ...(marketAssessment?.risk_flags || []),
    ...missingData,
    "No existe un modelo deportivo validado para estimar probabilidad.",
  ];

  return {
    contract: "DirectorVerdict",
    version: 2,
    status,
    verdict,
    display_status: PHASE_TWO_DISPLAY_STATUS[status],
    fixture: fixture
      ? {
          fixture_id: fixture.fixtureId,
          home_team: fixture.teams?.home?.name || null,
          away_team: fixture.teams?.away?.name || null,
          kickoff: fixture.date?.utc || null,
          competition: competition?.localName || fixture.competition?.name || null,
          season: fixture.competition?.season || null,
        }
      : null,
    market_evaluated: marketAssessment
      ? {
          family: marketAssessment.market_family,
          label: marketAssessment.market_label,
        }
      : null,
    technical_support: marketAssessment?.technical_support_score ?? 0,
    estimated_probability: null,
    probability_status: PROBABILITY_STATUS.UNAVAILABLE,
    operational_level: operationalLevel,
    reasons: [...new Set(reasons)],
    risks: [...new Set(risks)],
    missing_data: [...new Set(missingData)],
    avoid: [
      "No presentar el mercado como seguro.",
      "No interpretar respaldo técnico como probabilidad.",
      "No usar parlay: capacidad no soportada.",
    ],
    parlay_authorization: PARLAY_STATUS.UNSUPPORTED,
    next_action:
      marketAssessment?.next_action ||
      "Completar la principal evidencia faltante antes de revisar el mercado.",
    evidence_refs: [...new Set(evidenceRefs)].filter(Boolean),
    engine_version: engineVersion,
    can_recommend: false,
    data_status: dataStatus,
    data_error_code: dataErrorCode,
  };
}

export function buildOperationalDirectorVerdict({
  fixture,
  competition,
  analyzedAt,
  phase,
  marketAssessment,
  marketCandidate = null,
  marketSelection = null,
  oddsQuote,
  confidence,
  suitability,
  supportingEvidence = [],
  opposingEvidence = [],
  contradictions = [],
  missingData = [],
  risks = [],
  evidenceRefs = [],
  parlayAuthorization = "unsupported",
  preliminaryProbability = null,
  intendedUse = "individual",
  contextReanalysisMessage = null,
  engineVersion = "atlas-operational-v1",
}) {
  const requestedSuitability = suitability?.status || MARKET_SUITABILITY.INSUFFICIENT_DATA;
  const probabilityAvailable = marketCandidate?.probability_status === "preliminary" || preliminaryProbability?.probability_status === "preliminary";
  const probability = marketCandidate?.preliminary_probability ?? preliminaryProbability?.point_estimate ?? null;
  const uncertaintyLow = marketCandidate?.uncertainty_low ?? preliminaryProbability?.uncertainty_low ?? null;
  const uncertaintyHigh = marketCandidate?.uncertainty_high ?? preliminaryProbability?.uncertainty_high ?? null;
  const priceStatus = marketCandidate?.price_status || (oddsQuote
    ? oddsQuote.freshness === "stale" || oddsQuote.verification_status === "stale"
      ? "stale"
      : oddsQuote.verification_status === "verified_provider"
        ? "verified_current"
        : "user_reported_current"
    : "unavailable");
  const pricePending = ["unavailable", "stale", "incompatible_line", "incompatible_selection"].includes(priceStatus);
  let suitabilityStatus = requestedSuitability;
  if (requestedSuitability !== MARKET_SUITABILITY.BLOCKED) {
    if (!marketCandidate || !probabilityAvailable) suitabilityStatus = MARKET_SUITABILITY.INSUFFICIENT_DATA;
    else if ((marketCandidate.sports_score ?? 0) < 45) suitabilityStatus = MARKET_SUITABILITY.NOT_VIABLE;
    else if (pricePending) suitabilityStatus = MARKET_SUITABILITY.REVIEW_ONLY;
    else if (priceStatus === "user_reported_current" || (marketCandidate.sports_score ?? 0) < 70) suitabilityStatus = MARKET_SUITABILITY.VIABLE_WITH_CAUTION;
    else suitabilityStatus = MARKET_SUITABILITY.SUITABLE_UNDER_CONDITIONS;
  }
  const displayStatuses = {
    blocked: "Análisis bloqueado",
    not_viable: "No — mercado no viable",
    insufficient_data: "Información insuficiente",
    review_only: "Todavía no — falta evaluar la cuota",
    viable_with_caution: "Solo con cautela",
    suitable_under_conditions: "Sí — apto para consideración",
  };
  const verdicts = {
    blocked: "No es posible considerar este mercado mientras exista un bloqueo crítico.",
    not_viable: "No veo este mercado viable con la evidencia actual.",
    insufficient_data: "No hay información suficiente para emitir una conclusión responsable.",
    review_only: "Atlas ya identificó la mejor opción deportiva. Falta una cuota actual y compatible para evaluar el precio.",
    viable_with_caution: "Este mercado es viable únicamente para revisión cautelosa; aún requiere verificación adicional.",
    suitable_under_conditions: "Este mercado es apto para consideración a la línea indicada, sujeto a las condiciones informadas.",
  };
  const selectionLabel = marketCandidate?.selection || oddsQuote?.selection || marketAssessment?.market_label || "el mercado evaluado";
  verdicts.suitable_under_conditions = `Sí. Atlas considera apto para consideración ${selectionLabel} a la línea y cuota indicadas, sujeto a las condiciones informadas.`;
  verdicts.viable_with_caution = `Sí, pero con cautela. ${selectionLabel} conserva respaldo, aunque requiere verificación adicional antes del inicio.`;
  verdicts.review_only = priceStatus === "stale"
    ? `Todavía no. La cuota anterior no se usa para evaluar el precio; el pronóstico deportivo ${selectionLabel} se mantiene.`
    : `Todavía no. ${selectionLabel} es el candidato deportivo actual, pero falta una cuota vigente y compatible.`;
  verdicts.not_viable = `No. ${selectionLabel} no es viable con los datos actuales.`;
  const decisionCodes = {
    blocked: "blocked",
    not_viable: "no",
    insufficient_data: "insufficient",
    review_only: "not_yet",
    viable_with_caution: "not_yet",
    suitable_under_conditions: "yes",
  };
  const conditions = [...new Set(suitability?.conditions || [])];
  if (pricePending && !conditions.some((item) => /cuota/i.test(item))) conditions.unshift("Introducir una cuota actual para la línea exacta seleccionada.");
  const reasons = [
    `Confianza del análisis: ${confidence?.analysis_confidence_score || 0}%, ${String(confidence?.confidence_label || "baja").replaceAll("_", " ")}. Este porcentaje mide calidad y coherencia de evidencia, no probabilidad de acierto.`,
    ...supportingEvidence,
    ...(preliminaryProbability?.probability_status === "preliminary"
      ? [`La frecuencia estimada procede de ${preliminaryProbability.sample_size_effective} observaciones efectivas y ajuste hacia la base de liga.`]
      : []),
  ];
  const uncertaintyWidth = probabilityAvailable ? uncertaintyHigh - uncertaintyLow : null;
  const currentPrice = ["verified_current", "user_reported_current"].includes(priceStatus);
  const parlayEligibility = suitabilityStatus === MARKET_SUITABILITY.BLOCKED
    ? "blocked"
    : currentPrice && probabilityAvailable && uncertaintyWidth <= 0.35 && (confidence?.analysis_confidence_score || 0) >= 60 && [MARKET_SUITABILITY.SUITABLE_UNDER_CONDITIONS, MARKET_SUITABILITY.VIABLE_WITH_CAUTION].includes(suitabilityStatus)
      ? "eligible"
      : marketCandidate && [MARKET_SUITABILITY.REVIEW_ONLY, MARKET_SUITABILITY.VIABLE_WITH_CAUTION].includes(suitabilityStatus)
        ? "review_only"
        : "not_eligible";
  const individualEligibility = {
    [MARKET_SUITABILITY.SUITABLE_UNDER_CONDITIONS]: "eligible_under_conditions",
    [MARKET_SUITABILITY.VIABLE_WITH_CAUTION]: "viable_with_caution",
    [MARKET_SUITABILITY.REVIEW_ONLY]: "review_only",
    [MARKET_SUITABILITY.NOT_VIABLE]: "not_viable",
    [MARKET_SUITABILITY.BLOCKED]: "blocked",
    [MARKET_SUITABILITY.INSUFFICIENT_DATA]: "insufficient_data",
  }[suitabilityStatus] || "insufficient_data";
  const nextReviewByPhase = {
    early_review: "Revisar nuevamente el día anterior al partido o cuando cambien la línea, la cuota o el contexto.",
    day_before: "Revisar tres horas antes del inicio y al publicarse novedades de alineación.",
    three_hours_before: "Revisar una hora antes del inicio o ante movimientos de cuota.",
    one_hour_before: "Revisar treinta minutos antes del inicio y confirmar alineaciones.",
    thirty_minutes_before: "Hacer la revisión prepartido final si cambian alineaciones o cuota.",
    final_pre_match: "No reutilizar este dictamen después del inicio; crear una nueva revisión si el partido sigue pendiente.",
  };
  const temporalStatus = contextReanalysisMessage
    ? "updated_forecast"
    : phase === "early_review"
      ? "early_forecast"
      : phase === "final_pre_match"
        ? "final_pre_match_forecast"
        : "provisional_forecast";
  const impliedProbability = oddsQuote?.implied_probability ?? null;
  const preliminaryDifference = probabilityAvailable && Number.isFinite(impliedProbability)
    ? Number((probability - impliedProbability).toFixed(4))
    : null;
  const priceMessage = priceStatus === "unavailable"
    ? "Atlas ya identificó la mejor opción deportiva. Falta una cuota actual para evaluar el precio."
    : priceStatus === "stale"
      ? "La cuota anterior no se usa para evaluar el precio. El pronóstico deportivo se mantiene."
      : priceStatus === "incompatible_line"
        ? "La cuota no coincide con la línea deportiva evaluada."
        : priceStatus === "incompatible_selection"
          ? "La cuota no coincide con la dirección deportiva evaluada."
          : preliminaryDifference === null
            ? "La cuota está disponible, pero la comparación deportiva permanece limitada."
            : "La estimación preliminar se compara con la probabilidad implícita, pero no permite afirmar valor esperado.";
  const sportsVerdict = marketCandidate ? {
    status: (marketCandidate.sports_score ?? 0) >= 58 ? "sports_candidate" : "review_only",
    market_family: marketCandidate.market_family,
    selection: marketCandidate.selection,
    direction: marketCandidate.direction,
    line: marketCandidate.line,
    preliminary_probability: probabilityAvailable ? probability : null,
    uncertainty_low: probabilityAvailable ? uncertaintyLow : null,
    uncertainty_high: probabilityAvailable ? uncertaintyHigh : null,
    sports_score: marketCandidate.sports_score ?? 0,
    confidence_score: confidence?.analysis_confidence_score || 0,
    temporal_status: temporalStatus,
    provisional: temporalStatus !== "final_pre_match_forecast",
    explanation: marketSelection?.explanation || "Candidato ordenado por calidad deportiva sin usar la cuota.",
  } : {
    status: "insufficient_information",
    market_family: marketAssessment?.market_family || null,
    selection: null,
    line: null,
    preliminary_probability: null,
    temporal_status: temporalStatus,
    provisional: true,
  };
  const priceAssessment = {
    status: priceStatus,
    message: priceMessage,
    bookmaker: oddsQuote?.bookmaker_name || null,
    decimal_odds: oddsQuote?.decimal_odds || null,
    implied_probability: impliedProbability,
    freshness: oddsQuote?.freshness || "unavailable",
    market_matches: !["unavailable", "incompatible_line", "incompatible_selection"].includes(priceStatus),
    preliminary_difference: preliminaryDifference,
    expected_value_claimed: false,
  };
  const whatMayChange = [...new Set([
    ...missingData,
    ...(marketAssessment?.market_family === "cards" && marketCandidate?.context_adjustment?.applied_impacts?.length === 0 ? ["Confirmación y perfil del árbitro"] : []),
    "Alineaciones, bajas o rotaciones relevantes",
    "Clima, estado del campo o una nueva cuota",
  ])].slice(0, 3);
  const simpleReasons = [...new Set([
    marketSelection?.explanation,
    marketCandidate ? `La línea queda en ${marketCandidate.sports_score}/100 de equilibrio deportivo.` : null,
    supportingEvidence[0],
  ].filter(Boolean))].slice(0, 3);
  return {
    contract: "DirectorVerdict",
    version: 3,
    verdict: verdicts[suitabilityStatus],
    display_status: displayStatuses[suitabilityStatus],
    decision_code: decisionCodes[suitabilityStatus] || "insufficient",
    fixture: fixture ? {
      fixture_id: fixture.fixtureId,
      home_team: fixture.teams?.home?.name || null,
      away_team: fixture.teams?.away?.name || null,
      kickoff: fixture.date?.utc || null,
      kickoff_utc: fixture.date?.kickoff_utc || fixture.date?.utc || null,
      kickoff_local: fixture.date?.kickoff_local || null,
      timezone: fixture.date?.timezone || null,
      local_calendar_date: fixture.date?.local_calendar_date || null,
      competition: competition?.localName || fixture.competition?.name || null,
      season: fixture.competition?.season || null,
    } : null,
    analyzed_at: analyzedAt,
    analysis_phase: phase,
    market_evaluated: marketAssessment ? { family: marketAssessment.market_family, label: marketAssessment.market_label } : null,
    selection: marketCandidate?.selection || oddsQuote?.selection || null,
    line: marketCandidate?.line ?? oddsQuote?.line ?? marketAssessment?.line ?? null,
    odds: oddsQuote?.decimal_odds || (marketAssessment?.odds ? Number(marketAssessment.odds) : null),
    odds_source_status: oddsQuote?.verification_status || "unavailable",
    bookmaker: oddsQuote?.bookmaker_name || null,
    odds_source: oddsQuote?.source || null,
    odds_updated_at: oddsQuote?.updated_at || null,
    odds_consulted_at: oddsQuote?.consulted_at || null,
    odds_age_minutes: oddsQuote?.age_minutes ?? null,
    odds_freshness: oddsQuote?.freshness || "unavailable",
    odds_freshness_limit_minutes: oddsQuote?.freshness_limit_minutes ?? null,
    odds_stale_reason: oddsQuote?.stale_reason || null,
    implied_probability: impliedProbability,
    implied_probability_label: oddsQuote ? "Probabilidad implícita de la cuota" : null,
    analysis_confidence_score: confidence?.analysis_confidence_score || 0,
    confidence_label: confidence?.confidence_label || "baja",
    confidence_is_probability: false,
    estimated_probability: probabilityAvailable ? probability : null,
    probability_status: probabilityAvailable ? "preliminary" : "unavailable",
    probability_methodology: preliminaryProbability?.methodology_version || null,
    probability_uncertainty_low: probabilityAvailable ? uncertaintyLow : null,
    probability_uncertainty_high: probabilityAvailable ? uncertaintyHigh : null,
    probability_effective_sample: marketCandidate?.sample_size_effective || preliminaryProbability?.sample_size_effective || 0,
    probability_limitations: marketCandidate?.limitations || preliminaryProbability?.limitations || [],
    model_validation_status: "preliminary_unvalidated",
    sports_verdict: sportsVerdict,
    price_assessment: priceAssessment,
    market_ranking: marketSelection ? {
      analysis_mode: marketSelection.analysis_mode,
      explanation: marketSelection.explanation,
      alternatives: marketSelection.alternatives,
      line_profiles: marketSelection.line_profiles,
    } : null,
    temporal_status: temporalStatus,
    temporal_message: "Este es el dictamen con la información disponible ahora. Puede cambiar por alineaciones, bajas, árbitro, clima o cuotas.",
    context_reanalysis_message: contextReanalysisMessage,
    market_suitability: suitabilityStatus,
    apt_for_consideration: suitabilityStatus === MARKET_SUITABILITY.SUITABLE_UNDER_CONDITIONS,
    authorizes_consideration: suitabilityStatus === MARKET_SUITABILITY.SUITABLE_UNDER_CONDITIONS,
    reasons: [...new Set(reasons)],
    simple_reasons: simpleReasons,
    what_may_change: whatMayChange,
    primary_reason: reasons[0] || verdicts[suitabilityStatus],
    supporting_evidence: [...new Set(supportingEvidence)],
    primary_supporting_evidence: supportingEvidence[0] || null,
    opposing_evidence: [...new Set(opposingEvidence)],
    primary_opposing_evidence: opposingEvidence[0] || null,
    contradictions: [...new Set(contradictions)],
    risks: [...new Set(risks)],
    missing_data: [...new Set(missingData)],
    avoid: ["No presentar el mercado como seguro.", "No confundir probabilidad implícita con probabilidad estimada.", "No perseguir pérdidas ni asumir rentabilidad."],
    conditions: [...new Set(conditions)],
    blocking_condition: suitabilityStatus === MARKET_SUITABILITY.BLOCKED
      ? conditions[0] || risks[0] || "Existe una condición crítica sin resolver."
      : null,
    parlay_authorization: parlayAuthorization,
    intended_use: ["individual", "parlay", "both"].includes(intendedUse) ? intendedUse : "individual",
    individual_eligibility: individualEligibility,
    parlay_eligibility: parlayEligibility,
    next_action: pricePending ? "Buscar o introducir una cuota actual para la selección y línea exactas." : conditions[0] || "Revisar nuevamente el contexto entre 60 y 30 minutos antes del inicio.",
    next_review: nextReviewByPhase[phase] || nextReviewByPhase.early_review,
    evidence_refs: [...new Set(evidenceRefs)].filter(Boolean),
    engine_version: engineVersion,
    can_recommend: false,
  };
}
