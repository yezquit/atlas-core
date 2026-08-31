
import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { LINE_ORIGIN, OPERATIONAL_ENGINE_VERSION, phaseForKickoff } from "../contracts/operationalContracts.js";
import { calculateAnalysisConfidence } from "../intelligence/analysisConfidence.js";
import { buildAnalysisVersion, compareAnalysisVersions } from "../intelligence/analysisVersions.js";
import { buildGeminiCleanupPrompt, buildGeminiResearchPrompt, extractSupplementaryRefereeEvidence, parseGeminiResponse, selectGeminiItems } from "../intelligence/geminiManualContext.js";
import { mapGeminiImpacts } from "../intelligence/geminiImpactMapper.js";
import { evaluateExactMarketLine } from "../intelligence/candidateLineGenerator.js";
import { buildRankedMarketSelection, rankMarketCandidates } from "../intelligence/marketCandidateRanker.js";
import { buildOperationalRanking, buildScoutAtlas } from "../intelligence/scoutAtlas.js";
import { buildAtlasPreflight, buildRedTeamAtlas } from "../intelligence/redTeamAtlas.js";
import { assessMarketSuitability } from "../intelligence/marketSuitability.js";
import { createManualOdds, isCurrentOddsQuote, normalizeProviderOdds, refreshStoredOddsQuote, selectBestComparableOdds, validateManualOddsInput } from "../intelligence/oddsIntelligence.js";
import { buildConservativeParlays } from "../intelligence/parlayPolicy.js";
import { buildDreamParlays } from "../intelligence/dreamParlayEngine.js";
import { createUnavailablePreMatchItem, normalizeInjuries, normalizeLineups } from "../intelligence/preMatchContext.js";
import { buildOperationalDirectorVerdict } from "../modules/directorAtlas.js";
import { classifyProbability, toProbabilityPercent } from "../intelligence/probabilityClassification.js";
import { buildMarketOpportunityRadar, attachRadarContext } from "../intelligence/marketOpportunityRadar.js";
import { evaluateValueOpportunity } from "../intelligence/valueRadar.js";
import { analyzeSportsFixture } from "./sportsIntelligenceService.js";

function coverageFlag(coverage, path) {
  return path.reduce((value, key) => value?.[key], coverage) === true;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? Math.max(0, Math.min(1, numerator / denominator)) : 0;
}

function probabilityLabel(value) {
  return `${Number((Number(value) * 100).toFixed(1))}%`;
}

function isDirectMarketEvidence(item, marketFamily, impacts = []) {
  if (!item || !marketFamily) return false;
  if (item.affected_markets?.includes(marketFamily)) return true;
  return impacts.some((impact) => impact.source_item_id === item.id && impact.affected_markets?.includes(marketFamily));
}

// Fase 3B: adjunta el radar_context de la familia de CADA candidato al
// propio candidato, sin tocar ningún otro campo. Reutiliza attachRadarContext
// tal cual (Fase 3A) en vez de reimplementar su lógica de anotación; solo
// resuelve el caso de un catálogo con varias familias mezcladas (modo
// "general"), donde cada candidato necesita el resultado de SU familia, no
// el de otra.
function attachRadarContextByFamily(candidates, radarResults) {
  const radarByFamily = new Map(radarResults.map((radar) => [radar.market_family, radar]));
  return candidates.map((candidate) => attachRadarContext([candidate], radarByFamily.get(candidate.market_family) || null)[0]);
}

function summarizeMarketEvidence(items, marketFamily, impacts = []) {
  const direct = items.filter((item) => isDirectMarketEvidence(item, marketFamily, impacts));
  const general = items.filter((item) => !direct.includes(item));
  const asText = (itemsForStatus, status) => itemsForStatus
    .filter((item) => item.impact === status)
    .map((item) => item.summary || item.text);
  return {
    direct,
    general,
    summary: {
      favorable: asText(direct, "favorable"),
      unfavorable: asText(direct, "unfavorable"),
      limitations: direct.filter((item) => item.kind === "not_found" || item.impact === "limiting").map((item) => item.summary || item.text),
      neutral: asText(direct, "neutral"),
      general_context: general.map((item) => item.summary || item.text),
    },
  };
}

export function buildOperationalCompleteness({ oddsQuote = null, priceEvaluation = null } = {}) {
  if (!oddsQuote) {
    return {
      contract: "OperationalCompleteness",
      version: 1,
      status: "pending_price",
      complete: false,
      message: "La tesis deportiva está disponible; falta una cuota actual para completar la evaluación operativa.",
    };
  }
  if (!isCurrentOddsQuote(oddsQuote)) {
    return {
      contract: "OperationalCompleteness",
      version: 1,
      status: "stale_price",
      complete: false,
      message: "La cotización se conserva como histórica y no completa la evaluación operativa.",
    };
  }
  return {
    contract: "OperationalCompleteness",
    version: 1,
    status: "price_evaluated",
    complete: Boolean(priceEvaluation && priceEvaluation.status !== "unavailable"),
    message: "La cuota actual fue evaluada por separado de la confianza deportiva.",
  };
}

export function calculateSportsAnalysisConfidence(input = {}) {
  return calculateAnalysisConfidence({
    ...input,
    freshness: 0.35,
    verified_market_data: 0,
    verifiedOdds: false,
  });
}

export function buildGeminiEconomicReanalysisMessage({
  selectedItems = [],
  impacts = [],
  previousProbability = null,
  currentProbability = null,
  impliedProbability = null,
  decimalOdds = null,
  currentPriceStatus = null,
} = {}) {
  const unchangedMessage = "El contexto fue incorporado, pero no aportó evidencia suficiente para modificar la probabilidad, la evaluación económica ni el dictamen. La evidencia no fue suficiente para modificar el dictamen ni la evaluación económica y no aporta evidencia suficiente para modificar el resultado.";
  if (!selectedItems.length) return null;
  if (!impacts.length || !Number.isFinite(Number(previousProbability)) || !Number.isFinite(Number(currentProbability))) {
    return unchangedMessage;
  }
  const previous = Number(previousProbability);
  const current = Number(currentProbability);
  const implied = Number(impliedProbability);
  if (Math.abs(current - previous) < 0.0005) {
    return unchangedMessage;
  }
  const movement = current > previous ? "elevó" : "redujo";
  if (Number.isFinite(implied) && current < implied) {
    const ending = current < previous
      ? "La evidencia contraria refuerza el estado no viable a este precio."
      : `Continúa por debajo del ${probabilityLabel(implied)} implícito de la cuota ${decimalOdds}. La selección sigue sin ser viable a este precio.`;
    return `El contexto Gemini fue incorporado y ${movement} la estimación de ${probabilityLabel(previous)} a ${probabilityLabel(current)}. ${ending}`;
  }
  return `El contexto Gemini fue incorporado y ${movement} la estimación de ${probabilityLabel(previous)} a ${probabilityLabel(current)}. La evaluación de precio actual es ${currentPriceStatus || "marginal"}.`;
}

function normalizedDirection(value) {
  const candidate = String(value || "").toLowerCase();
  if (/under|menos/.test(candidate)) return "under";
  if (/over|mas|más/.test(candidate)) return "over";
  return null;
}

function isExactCurrentQuoteForCandidate(quote, { fixtureId, candidate } = {}) {
  return Boolean(
    isCurrentOddsQuote(quote) &&
    Number(quote.fixture_id) === Number(fixtureId) &&
    quote.market_family === candidate?.market_family &&
    normalizedDirection(quote.direction || quote.selection) === candidate?.direction &&
    Number(quote.line) === Number(candidate?.line)
  );
}

function selectActiveOddsQuote({ fixtureId, candidate, manualQuote = null, fallbacks = [] } = {}) {
  const justReportedManualQuote = manualQuote?.source === "manual_user_input" &&
    manualQuote?.source_status === "user_reported_current" &&
    isExactCurrentQuoteForCandidate(manualQuote, { fixtureId, candidate })
    ? manualQuote
    : null;
  return justReportedManualQuote || fallbacks.find((quote) =>
    isExactCurrentQuoteForCandidate(quote, { fixtureId, candidate })
  ) || null;
}

function snapshotCandidate(previousVersion) {
  const director = previousVersion?.director;
  const sports = director?.sports_verdict;
  const probability = previousVersion?.preliminary_probability;
  const direction = normalizedDirection(sports?.direction || director?.selection);
  const line = Number(director?.line ?? sports?.line);
  const family = director?.market_evaluated?.family;
  if (!family || !direction || !Number.isFinite(line) || probability?.probability_status !== "preliminary" || !Number.isFinite(Number(probability.point_estimate))) return null;
  // El atajo de "solo precio" reutiliza el snapshot deportivo ya calculado:
  // NUNCA recalcula estimated_probability ni sports_score (siguen viniendo
  // de previousVersion). probability_percent/probability_classification son
  // presentación derivada del mismo valor (idénticas funciones que usa
  // rankMarketCandidates para el candidato completo) — omitirlas dejaba a la
  // UI mostrando "No disponible" pese a que la probabilidad sí existía.
  return {
    candidate_id: `snapshot:${previousVersion.analysis_id}`,
    market_family: family,
    direction,
    selection: sports?.selection || director?.selection,
    line,
    preliminary_probability: probability.point_estimate,
    estimated_probability: probability.point_estimate,
    probability_percent: toProbabilityPercent(probability.point_estimate),
    probability_classification: classifyProbability(probability.point_estimate),
    probability_status: probability.probability_status,
    uncertainty_low: probability.uncertainty_low,
    uncertainty_high: probability.uncertainty_high,
    sample_size_effective: probability.sample_size_effective,
    sports_score: sports?.sports_score,
    technical_support_score: sports?.technical_support_score,
    side_comparison: director?.side_comparison || null,
    limitations: probability.limitations || director?.probability_limitations || [],
    asian_settlement_profile: probability.asian_settlement_profile || null,
  };
}

function snapshotFixture(previousVersion) {
  const fixture = previousVersion?.director?.fixture;
  if (!fixture?.fixture_id) return null;
  return {
    fixtureId: fixture.fixture_id,
    teams: { home: { name: fixture.home_team }, away: { name: fixture.away_team } },
    date: { utc: fixture.kickoff_utc || fixture.kickoff, timezone: fixture.timezone || null },
    competition: { name: fixture.competition, season: fixture.season },
  };
}

function geminiSelectionSignature(originalText, selectedIds) {
  if (!originalText) return null;
  return `${originalText}::${[...new Set(selectedIds || [])].sort().join(",")}`;
}

// El atajo de "solo precio" solo es válido cuando el contexto Gemini que
// llega en esta solicitud es EXACTAMENTE el mismo que ya quedó incorporado
// en previousVersion (mismo texto original + mismos elementos seleccionados).
// Gemini SÍ puede desplazar estimated_probability (reanálisis intencional,
// ver F47b) — reutilizar el snapshot cuando Gemini cambió dejaría esa
// probabilidad desactualizada y, además, el gemini_context del snapshot
// nunca se actualizaba: ordenar cuota->Gemini reincorporaba Gemini en la
// misma llamada que reenvía la cuota ya evaluada, así que el atajo se
// activaba de nuevo y descartaba el Gemini recién validado en silencio.
function geminiCompatibleWithSnapshot(input, previousVersion) {
  const incoming = geminiSelectionSignature(input.geminiContext?.original_text, input.selectedGeminiItemIds);
  const existing = geminiSelectionSignature(
    previousVersion?.gemini_context?.original_text,
    (previousVersion?.gemini_context?.selected_items || []).map((item) => item.id)
  );
  return incoming === existing;
}

export function isCompatiblePriceSnapshot(input, previousVersion) {
  const candidate = snapshotCandidate(previousVersion);
  const quote = input.manualOdds;
  if (!input.evaluatePrice || !input.sourceAnalysisId || !candidate || !quote) return false;
  return Number(input.fixtureId) === Number(previousVersion.fixture_id) &&
    quote.marketFamily === candidate.market_family &&
    normalizedDirection(quote.direction || quote.selection) === candidate.direction &&
    Number(quote.line) === Number(candidate.line) &&
    Number(input.line) === Number(candidate.line) &&
    normalizedDirection(input.selection) === candidate.direction &&
    geminiCompatibleWithSnapshot(input, previousVersion);
}

function priceOnlySnapshotResult(input, previousVersion, { now, idFactory }) {
  if (!isCompatiblePriceSnapshot(input, previousVersion)) return null;
  const candidate = snapshotCandidate(previousVersion);
  const fixture = snapshotFixture(previousVersion);
  if (!fixture) return null;
  const analyzedAt = now();
  const quote = createManualOdds({
    fixtureId: fixture.fixtureId,
    bookmaker: input.manualOdds.bookmaker,
    marketFamily: candidate.market_family,
    marketName: previousVersion.director.market_evaluated?.label,
    selection: candidate.selection,
    direction: candidate.direction,
    line: candidate.line,
    decimalOdds: input.manualOdds.decimalOdds,
    receivedAt: input.manualOdds.consultedAt,
    analyzedAt,
    kickoff: fixture.date.utc,
    timezone: input.manualOdds.timezone || input.timezone,
    analysisVersion: previousVersion.analysis_id,
  });
  if (!quote) return null;
  const oppositeOddsQuote = input.manualOppositeOdds && Number(String(input.manualOppositeOdds.decimalOdds || "").replace(",", ".")) > 1
    ? createManualOdds({
      fixtureId: fixture.fixtureId,
      bookmaker: input.manualOppositeOdds.bookmaker,
      marketFamily: candidate.market_family,
      marketName: previousVersion.director.market_evaluated?.label,
      selection: `${candidate.direction === "over" ? "Menos de" : "Más de"} ${candidate.line}`,
      direction: candidate.direction === "over" ? "under" : "over",
      line: candidate.line,
      decimalOdds: input.manualOppositeOdds.decimalOdds,
      receivedAt: input.manualOppositeOdds.consultedAt,
      analyzedAt,
      kickoff: fixture.date.utc,
      timezone: input.manualOppositeOdds.timezone || input.timezone,
      analysisVersion: previousVersion.analysis_id,
    })
    : null;
  const confidence = previousVersion.analysis_confidence || {
    analysis_confidence_score: previousVersion.director?.analysis_confidence_score || 0,
    confidence_label: previousVersion.director?.confidence_label || "baja",
  };
  const suitability = assessMarketSuitability({
    fixtureVerified: true,
    marketCandidate: Number(candidate.sports_score) >= 45,
    sampleSufficient: Number(candidate.sample_size_effective) >= 5,
    requiredEvidenceAvailable: true,
    line: candidate.line,
    oddsQuote: quote,
    confidenceScore: confidence.analysis_confidence_score,
    preliminaryProbability: previousVersion.preliminary_probability,
    sampleSize: candidate.sample_size_effective,
    phase: previousVersion.phase,
    marketFamily: candidate.market_family,
    asianSettlementProfile: previousVersion.preliminary_probability?.asian_settlement_profile || null,
  });
  const marketAssessment = {
    market_family: candidate.market_family,
    market_label: previousVersion.director.market_evaluated?.label || candidate.market_family,
    available_evidence: ["snapshot_sports_analysis"],
    data_requirements: ["snapshot_sports_analysis"],
    missing_evidence: previousVersion.director.missing_data || [],
    risk_flags: previousVersion.director.risks || [],
  };
  const marketSelection = {
    analysis_mode: "specific",
    primary: candidate,
    ranked_candidates: [candidate],
    catalog_candidates: [candidate],
    alternatives: [],
    exact_requested_line_unavailable: false,
    exact_line_available: true,
    ready_for_pricing: true,
  };
  const director = buildOperationalDirectorVerdict({
    fixture,
    competition: { localName: fixture.competition.name },
    analyzedAt,
    phase: previousVersion.phase,
    marketAssessment,
    marketCandidate: candidate,
    marketSelection,
    oddsQuote: quote,
    oppositeOddsQuote,
    confidence,
    suitability,
    supportingEvidence: previousVersion.director.reasons || [],
    opposingEvidence: previousVersion.director.risks || [],
    missingData: previousVersion.director.missing_data || [],
    risks: previousVersion.director.risks || [],
    evidenceRefs: previousVersion.evidence?.map((item) => item.source_ref || item.id).filter(Boolean) || [],
    preliminaryProbability: previousVersion.preliminary_probability,
    intendedUse: input.intendedUse || "individual",
  });
  attachLineOriginToDirector(director, previousVersion.line_origin || LINE_ORIGIN.USER_SELECTED, previousVersion.director.context_summary || {});
  const valueRadar = evaluateValueOpportunity({ candidate: { ...candidate, fixture_id: fixture.fixtureId }, quote, asianSettlementProfile: candidate.asian_settlement_profile });
  const version = { ...buildAnalysisVersion({
    fixture,
    phase: previousVersion.phase,
    inputs: { ...input, sourceAnalysisId: previousVersion.analysis_id, price_only_snapshot: true },
    evidence: previousVersion.evidence || [],
    odds: [...(previousVersion.odds || []), quote],
    activeQuote: quote,
    lineOrigin: previousVersion.line_origin,
    geminiContext: previousVersion.gemini_context,
    analysisConfidence: confidence,
    preliminaryProbability: previousVersion.preliminary_probability,
    director,
    engineVersion: OPERATIONAL_ENGINE_VERSION,
  }, { idFactory, now: () => analyzedAt }), value_radar: valueRadar };
  return {
    status: DATA_LOAD_STATUS.SUCCESS,
    selectedFixtureId: fixture.fixtureId,
    fixture,
    analysisMode: "specific",
    message: "Cuota actual evaluada sobre el análisis deportivo existente.",
    marketSelection,
    exactSelection: { fixture_id: fixture.fixtureId, market_family: candidate.market_family, direction: candidate.direction, line: candidate.line, estimated_probability: candidate.estimated_probability, sports_score: candidate.sports_score, uncertainty: { low: candidate.uncertainty_low, high: candidate.uncertainty_high }, support: candidate.technical_support_score, ready_for_pricing: true },
    preliminaryProbability: previousVersion.preliminary_probability,
    selectedOdds: quote,
    activeQuote: quote,
    director,
    valueRadar,
    gemini: { context: previousVersion.gemini_context, applied_items: previousVersion.gemini_context?.selected_items || [] },
    analysisVersion: version,
    changesSincePrevious: compareAnalysisVersions(previousVersion, version),
  };
}

export function resolveLineOrigin(input = {}, previousVersion = null, { requestedLine = null, requestedSelection = null } = {}) {
  const validOrigins = new Set(Object.values(LINE_ORIGIN));
  const previousOrigin = previousVersion?.line_origin;
  const previousLine = previousVersion?.director?.line;
  const previousDirection = previousVersion?.director?.sports_verdict?.direction || previousVersion?.director?.direction;
  const previousFamily = previousVersion?.director?.market_evaluated?.family;
  const requestedFamily = input.manualOdds?.marketFamily || input.marketId;
  const sameLine = requestedLine === null || requestedLine === undefined || Number(requestedLine) === Number(previousLine);
  const sameDirection = !requestedSelection || !previousDirection || normalizedDirection(requestedSelection) === normalizedDirection(previousDirection);
  const sameFamily = !requestedFamily || requestedFamily === "open" || !previousFamily || requestedFamily === previousFamily;
  if (input.reanalysis && validOrigins.has(previousOrigin) && sameLine && sameDirection && sameFamily) return previousOrigin;
  if (validOrigins.has(input.lineOrigin)) return input.lineOrigin;
  if (validOrigins.has(input.transferredCandidate?.line_origin)) return input.transferredCandidate.line_origin;
  if (input.transferredCandidate) return LINE_ORIGIN.TRANSFERRED_CANDIDATE;
  if ((input.analysisMode === "specific" || (input.marketId && input.marketId !== "open")) && requestedLine !== null && requestedLine !== undefined) {
    return LINE_ORIGIN.USER_SELECTED;
  }
  return LINE_ORIGIN.ATLAS_SELECTED;
}

export function lineOriginMessage(lineOrigin) {
  if (lineOrigin === LINE_ORIGIN.USER_SELECTED) return "Esta línea fue elegida manualmente por el usuario.";
  if (lineOrigin === LINE_ORIGIN.PROVIDER_QUOTE) return "Esta línea proviene de la cotización del proveedor.";
  return "Esta línea fue seleccionada por Atlas.";
}

export function attachLineOriginToDirector(director, lineOrigin, contextSummary = {}) {
  director.line_origin = lineOrigin;
  director.line_origin_message = lineOriginMessage(lineOrigin);
  director.user_requested_option = lineOrigin === LINE_ORIGIN.USER_SELECTED;
  director.context_summary = contextSummary;
  return director;
}

export function exactLineExplanation(selection, input = {}) {
  const origin = input.lineOrigin || (input.transferredCandidate ? LINE_ORIGIN.TRANSFERRED_CANDIDATE : LINE_ORIGIN.USER_SELECTED);
  return `${selection} se evaluó con su probabilidad exacta. ${lineOriginMessage(origin)}`;
}

export function selectExactRequestedCandidate(marketSelection, { marketFamily, requestedLine, requestedSelection, lineOrigin } = {}) {
  if (!marketSelection || requestedLine === null || requestedLine === undefined || !requestedSelection) return marketSelection;
  const direction = normalizedDirection(requestedSelection);
  const exactCandidate = (marketSelection.ranked_candidates || []).find((candidate) =>
    candidate.market_family === marketFamily &&
    Number(candidate.line) === Number(requestedLine) &&
    (!direction || candidate.direction === direction)
  );
  // La línea escrita por el usuario es una restricción dura: si Atlas no
  // puede calcular exactamente esa línea, lo declara explícitamente en vez
  // de sustituirla en silencio por otra línea del mismo mercado. El mejor
  // candidato general queda disponible solo como alternativa, nunca como
  // respuesta al pedido exacto.
  if (!exactCandidate) {
    const sameFamilyAlternatives = (marketSelection.ranked_candidates || []).filter((candidate) => candidate.market_family === marketFamily);
    return {
      ...marketSelection,
      primary: null,
      alternatives: sameFamilyAlternatives.slice(0, 3),
      exact_requested_line_unavailable: true,
      exact_line_available: false,
      ready_for_pricing: false,
      requested_line: Number(requestedLine),
      requested_direction: direction,
      explanation: `Atlas no tiene información suficiente para calcular exactamente ${requestedSelection} ${requestedLine}${marketFamily ? ` (${marketFamily})` : ""}. No se sustituye por otra línea.`,
    };
  }
  return {
    ...marketSelection,
    primary: exactCandidate,
    alternatives: marketSelection.ranked_candidates.filter((candidate) => candidate.candidate_id !== exactCandidate.candidate_id).slice(0, 3),
    exact_requested_line_unavailable: false,
    explanation: exactLineExplanation(exactCandidate.selection, { lineOrigin }),
  };
}

export function resolveManualExactSelection({
  marketSelection,
  marketFamily,
  requestedLine,
  requestedSelection,
  lineOrigin,
  marketAssessments = [],
  leagueProfile,
  homeTeamProfile,
  awayTeamProfile,
  refereeProfile,
  contextItems = [],
  contextImpacts = [],
  quotes = [],
  preferredQuote = null,
  allowSpecificLimitedSample = false,
} = {}) {
  if (!marketSelection || requestedLine === null || requestedLine === undefined || !marketFamily || !requestedSelection) {
    return marketSelection;
  }
  const direction = normalizedDirection(requestedSelection);
  if (!direction) return selectExactRequestedCandidate(marketSelection, { marketFamily, requestedLine, requestedSelection, lineOrigin });

  // A manually requested line is evaluated on demand from the fixture's own
  // distribution. It is not required to have appeared in Atlas's proactive
  // catalogue and never inherits a neighbour's probability.
  const exactEvaluation = evaluateExactMarketLine({
    marketFamily,
    direction,
    line: requestedLine,
    leagueProfile,
    homeTeamProfile,
    awayTeamProfile,
    refereeProfile,
    contextItems,
    contextImpacts,
    allowSpecificLimitedSample,
  });
  if (!exactEvaluation.exact_selection_ready) {
    const unavailable = selectExactRequestedCandidate(marketSelection, { marketFamily, requestedLine, requestedSelection, lineOrigin });
    return {
      ...unavailable,
      unavailable_reason: exactEvaluation.reason,
      explanation: `Atlas no pudo calcular exactamente ${requestedSelection} ${requestedLine}: ${exactEvaluation.reason}. No se sustituye por otra línea.`,
    };
  }
  const exactCandidate = rankMarketCandidates([exactEvaluation.candidate], {
    quotes,
    preferredQuote,
    marketAssessments,
    homeTeamProfile,
    awayTeamProfile,
  })[0];
  const primary = {
    ...exactCandidate,
    exact_line_available: true,
    ready_for_pricing: true,
  };
  const catalogueWithoutExact = (marketSelection.ranked_candidates || []).filter((candidate) => candidate.candidate_id !== primary.candidate_id);
  return {
    ...marketSelection,
    primary,
    ranked_candidates: [primary, ...catalogueWithoutExact],
    catalog_candidates: [primary, ...catalogueWithoutExact],
    alternatives: catalogueWithoutExact.slice(0, 3),
    exact_requested_line_unavailable: false,
    requested_line: Number(requestedLine),
    requested_direction: direction,
    exact_line_available: true,
    ready_for_pricing: true,
    explanation: exactLineExplanation(primary.selection, { lineOrigin }),
  };
}

function asEvidence(base, odds, context, gemini) {
  const evidence = (base.evidenceRefs || []).map((ref) => ({ id: ref, source_ref: ref, status: "verified_provider" }));
  for (const quote of odds.quotes || []) evidence.push({ id: quote.quote_id, source_ref: quote.quote_id, status: quote.verification_status, observed_at: quote.updated_at });
  for (const item of gemini?.selected_items || []) evidence.push({ id: item.id, source_ref: item.urls?.[0] || item.id, status: "user_reported", kind: item.kind });
  evidence.push({ id: "context:lineups", status: context.lineups.status, source_ref: "api-football:lineups" });
  evidence.push({ id: "context:injuries", status: context.injuries.status, source_ref: "api-football:injuries" });
  return evidence;
}

async function loadPreMatchResources({ base, gateway, analyzedAt }) {
  const fixture = base.fixture;
  const coverage = base.competitionMetadata?.seasonMetadata?.coverage || {};
  const isBeforeKickoff = Date.parse(analyzedAt) < Date.parse(fixture.date?.utc);
  const oddsCovered = coverageFlag(coverage, ["odds"]);
  const lineupsCovered = coverageFlag(coverage, ["fixtures", "lineups"]);
  const injuriesCovered = coverageFlag(coverage, ["injuries"]);
  const standingsCovered = coverageFlag(coverage, ["standings"]);
  if (!isBeforeKickoff) {
    return {
      oddsRaw: { status: DATA_LOAD_STATUS.UNAVAILABLE, response: [], errorCode: "post_kickoff_data_rejected" },
      lineupsRaw: { status: DATA_LOAD_STATUS.UNAVAILABLE, response: [] },
      injuriesRaw: { status: DATA_LOAD_STATUS.UNAVAILABLE, response: [] },
      standingsRaw: { status: DATA_LOAD_STATUS.UNAVAILABLE, response: [] },
      coverage: { oddsCovered, lineupsCovered, injuriesCovered, standingsCovered },
      isBeforeKickoff,
    };
  }
  const [oddsRaw, lineupsRaw, injuriesRaw, standingsRaw] = await Promise.all([
    oddsCovered ? gateway.loadFixtureOdds(fixture.fixtureId) : Promise.resolve({ status: DATA_LOAD_STATUS.UNAVAILABLE, response: [], errorCode: "odds_not_covered" }),
    lineupsCovered ? gateway.loadFixtureLineups(fixture.fixtureId) : Promise.resolve({ status: DATA_LOAD_STATUS.UNAVAILABLE, response: [], errorCode: "lineups_not_covered" }),
    injuriesCovered ? gateway.loadFixtureInjuries(fixture.fixtureId) : Promise.resolve({ status: DATA_LOAD_STATUS.UNAVAILABLE, response: [], errorCode: "injuries_not_covered" }),
    standingsCovered ? gateway.loadStandings({ competition: base.competition, season: fixture.competition.season }) : Promise.resolve({ status: DATA_LOAD_STATUS.UNAVAILABLE, response: [], errorCode: "standings_not_covered" }),
  ]);
  return { oddsRaw, lineupsRaw, injuriesRaw, standingsRaw, coverage: { oddsCovered, lineupsCovered, injuriesCovered, standingsCovered }, isBeforeKickoff };
}

export async function analyzeOperationalFixture(input, gateway, { now = () => new Date().toISOString(), idFactory, previousVersion = null } = {}) {
  const analyzedAt = now();
  if (input.manualOdds) {
    const manualValidation = validateManualOddsInput({
      ...input.manualOdds,
      fixtureId: input.fixtureId,
      direction: input.manualOdds.direction || input.manualOdds.selection,
    });
    if (!manualValidation.valid) {
      return {
        status: DATA_LOAD_STATUS.UNAVAILABLE,
        errorCode: "invalid_manual_odds",
        message: "La cuota manual no cumple el contrato requerido.",
        validationErrors: manualValidation.errors,
        selectedFixtureId: Number(input.fixtureId) || null,
        fixture: null,
        operational: null,
      };
    }
  }
  for (const candidateOdds of input.manualCandidateOdds || []) {
    const validation = validateManualOddsInput({
      ...candidateOdds,
      fixtureId: input.fixtureId,
      direction: candidateOdds.direction || candidateOdds.selection,
    });
    if (!validation.valid) {
      return {
        status: DATA_LOAD_STATUS.UNAVAILABLE,
        errorCode: "invalid_candidate_odds",
        message: "Una cotización de candidato no cumple el contrato requerido.",
        validationErrors: validation.errors,
        selectedFixtureId: Number(input.fixtureId) || null,
        fixture: null,
        operational: null,
      };
    }
  }
  const snapshotPriceResult = priceOnlySnapshotResult(input, previousVersion, { now, idFactory });
  if (snapshotPriceResult) return snapshotPriceResult;
  const base = await analyzeSportsFixture({
    ...input,
    odds: null,
    manualOdds: null,
    manualCandidateOdds: [],
    prematchOnly: true,
    analyzedAt,
  }, gateway);
  if (base.status !== DATA_LOAD_STATUS.SUCCESS || !base.fixture) return { ...base, operational: null };
  const resource = await loadPreMatchResources({ base, gateway, analyzedAt });
  const oddsResult = resource.oddsRaw.status === DATA_LOAD_STATUS.SUCCESS
    ? normalizeProviderOdds({ response: resource.oddsRaw.response, fixtureId: base.fixture.fixtureId, now: analyzedAt, kickoff: base.fixture.date?.utc })
    : { contract: "OddsResult", version: 1, fixture_id: base.fixture.fixtureId, status: "unavailable", quotes: [], warnings: [resource.oddsRaw.errorCode || "odds_unavailable"] };
  const previousActiveQuote = Number(previousVersion?.fixture_id) === Number(base.fixture.fixtureId)
    ? refreshStoredOddsQuote(previousVersion?.active_quote || null, { now: analyzedAt, kickoff: base.fixture.date?.utc })
    : null;
  const reusableActiveQuote = input.reanalysis && isCurrentOddsQuote(previousActiveQuote) ? previousActiveQuote : null;
  const previousHistoricalQuote = input.reanalysis && previousActiveQuote && !isCurrentOddsQuote(previousActiveQuote)
    ? previousActiveQuote
    : null;
  const rawRequestedLine = input.manualOdds?.line ?? input.line ?? reusableActiveQuote?.line ?? null;
  const requestedLine = rawRequestedLine === null || rawRequestedLine === undefined
    ? null
    : String(rawRequestedLine).replace(",", ".");
  const requestedSelection = input.manualOdds?.selection ?? input.selection ?? reusableActiveQuote?.selection ?? null;
  const lineOrigin = resolveLineOrigin(input, previousVersion, { requestedLine, requestedSelection });
  const context = {
    lineups: resource.coverage.lineupsCovered
      ? normalizeLineups({ response: resource.lineupsRaw.response, fixture: base.fixture, coverageAvailable: true, fetchedAt: resource.lineupsRaw.requestMeta?.fetchedAt || analyzedAt })
      : createUnavailablePreMatchItem("lineups", "lineups_not_covered"),
    injuries: resource.coverage.injuriesCovered
      ? normalizeInjuries({ response: resource.injuriesRaw.response, fixture: base.fixture, coverageAvailable: true, fetchedAt: resource.injuriesRaw.requestMeta?.fetchedAt || analyzedAt })
      : createUnavailablePreMatchItem("injuries", "injuries_not_covered"),
    sidelined: createUnavailablePreMatchItem("sidelined", "no_safe_fixture_endpoint_configured"),
    standings: { status: resource.standingsRaw.status === DATA_LOAD_STATUS.SUCCESS ? "verified" : "data_unavailable", data: resource.standingsRaw.response || [], source: "api-football", fetched_at: resource.standingsRaw.requestMeta?.fetchedAt || null },
    pre_match_cutoff_respected: resource.isBeforeKickoff,
  };
  let geminiContext = input.geminiContext || null;
  if (!geminiContext && input.geminiResponse) {
    geminiContext = parseGeminiResponse(input.geminiResponse, {
      fixture: base.fixture,
      expectedLine: requestedLine,
      expectedOdds: input.manualOdds?.decimalOdds ?? input.odds,
      receivedAt: analyzedAt,
    });
  }
  if (geminiContext && Array.isArray(input.selectedGeminiItemIds)) {
    geminiContext = selectGeminiItems(geminiContext, input.selectedGeminiItemIds);
  } else if (geminiContext) {
    geminiContext = { ...geminiContext, selected_items: (geminiContext.items || []).filter((item) => item.selected) };
  }
  const selectedGemini = geminiContext?.valid_for_reanalysis ? geminiContext.selected_items || [] : [];
  const supplementaryRefereeEvidence = extractSupplementaryRefereeEvidence(selectedGemini);
  const geminiImpacts = mapGeminiImpacts(selectedGemini);
  const contradictions = selectedGemini.filter((item) => item.kind === "contradiction").map((item) => item.text);
  const geminiLimitations = selectedGemini.filter((item) => item.kind === "not_found" || item.impact === "limiting").map((item) => item.summary || item.text);
  const favorableGemini = selectedGemini.filter((item) => item.impact === "favorable").map((item) => item.summary || item.text);
  const unfavorableGemini = selectedGemini.filter((item) => item.impact === "unfavorable").map((item) => item.summary || item.text);
  let contextSummary = {
    favorable: favorableGemini,
    unfavorable: unfavorableGemini,
    limitations: geminiLimitations,
    neutral: selectedGemini.filter((item) => item.impact === "neutral").map((item) => item.summary || item.text),
  };
  const analysisMode = input.analysisMode === "specific" || (input.marketId && input.marketId !== "open") ? "specific" : "general";
  const initialSelection = buildRankedMarketSelection({
    analysisMode,
    requestedMarketId: analysisMode === "specific" ? input.marketId : null,
    marketAssessments: base.marketAssessments,
    leagueProfile: base.leagueProfile,
    homeTeamProfile: base.homeTeamProfile,
    awayTeamProfile: base.awayTeamProfile,
    refereeProfile: base.refereeProfile,
    contextItems: selectedGemini,
    contextImpacts: geminiImpacts,
  });
  const scout = buildScoutAtlas({
    marketSelection: initialSelection,
    marketAssessments: base.marketAssessments,
    lineOrigin,
  });
  const manualMarketFamily = input.manualOdds?.marketFamily || reusableActiveQuote?.market_family || (analysisMode === "specific" ? input.marketId : initialSelection.primary?.market_family);
  const manualQuote = input.manualOdds ? createManualOdds({
    fixtureId: base.fixture.fixtureId,
    bookmaker: input.manualOdds.bookmaker,
    marketFamily: manualMarketFamily,
    marketName: base.marketAssessments.find((item) => item.market_family === manualMarketFamily)?.market_label,
    selection: requestedSelection,
    direction: input.manualOdds.direction,
    line: requestedLine,
    decimalOdds: input.manualOdds.decimalOdds,
    receivedAt: input.manualOdds.consultedAt,
    analyzedAt,
    kickoff: base.fixture.date?.utc,
    timezone: input.manualOdds.timezone || input.timezone,
    analysisVersion: input.manualOdds.analysisVersion || previousVersion?.analysis_id || "initial",
  }) : null;
  const candidateManualQuotes = (input.manualCandidateOdds || []).map((candidateOdds) => createManualOdds({
    fixtureId: base.fixture.fixtureId,
    bookmaker: candidateOdds.bookmaker,
    marketFamily: candidateOdds.marketFamily,
    marketName: base.marketAssessments.find((item) => item.market_family === candidateOdds.marketFamily)?.market_label,
    selection: candidateOdds.selection,
    direction: candidateOdds.direction,
    line: candidateOdds.line,
    decimalOdds: candidateOdds.decimalOdds,
    receivedAt: candidateOdds.consultedAt,
    analyzedAt,
    kickoff: base.fixture.date?.utc,
    timezone: candidateOdds.timezone || input.timezone,
    analysisVersion: candidateOdds.analysisVersion || previousVersion?.analysis_id || "initial",
  })).filter(Boolean);
  const preferredQuote = manualQuote || reusableActiveQuote;
  if (preferredQuote && !oddsResult.quotes.some((quote) => quote.quote_id === preferredQuote.quote_id)) {
    oddsResult.quotes.push(preferredQuote);
  }
  for (const quote of candidateManualQuotes) {
    if (!oddsResult.quotes.some((current) => current.quote_id === quote.quote_id)) {
      oddsResult.quotes.push(quote);
    }
  }
  if (previousHistoricalQuote && !oddsResult.quotes.some((quote) => quote.quote_id === previousHistoricalQuote.quote_id)) {
    oddsResult.quotes.push(previousHistoricalQuote);
  }
  if (oddsResult.quotes.length) oddsResult.status = "available";
  const hasCandidateOdds = candidateManualQuotes.length > 0 && !manualQuote;
  // Una solicitud explícita de mercado específico + línea (analysisMode
  // "specific") es una restricción dura del usuario y nunca debe cederse
  // solo porque existan cuotas de candidato de otra familia/flujo (Bloque 3).
  // hasCandidateOdds solo puede suprimir la línea exacta en modo general.
  const explicitSpecificLineRequest = analysisMode === "specific" && Boolean(requestedLine) && Boolean(manualMarketFamily);
  const suppressExactLineForCandidateOdds = hasCandidateOdds && !explicitSpecificLineRequest;
  let marketSelection = buildRankedMarketSelection({
    analysisMode: requestedLine && manualMarketFamily && !suppressExactLineForCandidateOdds ? "specific" : analysisMode,
    requestedMarketId: requestedLine && manualMarketFamily && !suppressExactLineForCandidateOdds ? manualMarketFamily : analysisMode === "specific" ? input.marketId : null,
    marketAssessments: base.marketAssessments,
    leagueProfile: base.leagueProfile,
    homeTeamProfile: base.homeTeamProfile,
    awayTeamProfile: base.awayTeamProfile,
    refereeProfile: base.refereeProfile,
    contextItems: selectedGemini,
    contextImpacts: geminiImpacts,
    quotes: oddsResult.quotes,
    preferredQuote,
  });
  if (!suppressExactLineForCandidateOdds) {
    marketSelection = resolveManualExactSelection({
      marketSelection,
      marketFamily: manualMarketFamily,
      requestedLine,
      requestedSelection,
      lineOrigin,
      marketAssessments: base.marketAssessments,
      leagueProfile: base.leagueProfile,
      homeTeamProfile: base.homeTeamProfile,
      awayTeamProfile: base.awayTeamProfile,
      refereeProfile: base.refereeProfile,
      contextItems: selectedGemini,
      contextImpacts: geminiImpacts,
      quotes: oddsResult.quotes,
      preferredQuote,
      allowSpecificLimitedSample: analysisMode === "specific",
    });
  }
  // Fase 3B: MarketOpportunityRadar corre por familia de mercado, consumiendo
  // exactamente marketSelection.generated (ya calculado por
  // buildRankedMarketSelection: distribución + líneas generadas + auditoría
  // por candidato) — no se recalcula distribución, componentes ni
  // observaciones canónicas. El Radar NO elige línea exacta ni usa cuotas,
  // y no se le pasa nada relacionado con oddsResult. contextItems/
  // contextImpacts van SIN filtrar por familia: cada llamada al Radar aplica
  // internamente su propio gating por affected_markets, así una evidencia de
  // shots_on_goal nunca contamina una tesis de corners. El resultado se
  // adjunta como radar_context (anotación) sobre los candidatos que
  // DecisionFrontier ya eligió dentro de buildRankedMarketSelection; nunca
  // sustituye esa selección ni toca estimated_probability/sports_score.
  const marketOpportunityRadar = (marketSelection.generated || []).map((generatedLinesForFamily) =>
    buildMarketOpportunityRadar({ generatedLines: generatedLinesForFamily, contextItems: selectedGemini, contextImpacts: geminiImpacts })
  );
  // ranked_candidates y catalog_candidates se enriquecen POR SEPARADO, cada
  // uno desde su propio campo original — nunca uno derivado del otro — para
  // no reducir ni alterar el catálogo si en algún momento dejan de ser la
  // misma referencia.
  const enrichedRankedCandidates = attachRadarContextByFamily(marketSelection.ranked_candidates || [], marketOpportunityRadar);
  const enrichedCatalogCandidates = attachRadarContextByFamily(marketSelection.catalog_candidates || [], marketOpportunityRadar);
  const enrichedRankedById = new Map(enrichedRankedCandidates.map((candidate) => [candidate.candidate_id, candidate]));
  marketSelection = {
    ...marketSelection,
    ranked_candidates: enrichedRankedCandidates,
    catalog_candidates: enrichedCatalogCandidates,
    // primary/alternatives se resuelven contra enrichedRankedCandidates por
    // candidate_id: el candidato que DecisionFrontier ya eligió sigue siendo
    // el mismo (mismo candidate_id, misma estimated_probability/sports_score/
    // probability_classification/línea/orden); solo gana radar_context.
    primary: marketSelection.primary ? (enrichedRankedById.get(marketSelection.primary.candidate_id) || marketSelection.primary) : null,
    alternatives: (marketSelection.alternatives || []).map((candidate) => enrichedRankedById.get(candidate.candidate_id) || candidate),
  };

  const phaseInfo = phaseForKickoff(base.fixture.date.utc, analyzedAt);
  const operationalRanking = buildOperationalRanking({
    scout,
    quotes: oddsResult.quotes,
    phase: input.phase || phaseInfo.phase,
  });
  const operationalCandidate = operationalRanking.candidates[0]?.candidate || null;
  const shouldUseOperationalCandidate = !input.manualOdds &&
    analysisMode === "general" &&
    (input.manualCandidateOdds?.length || 0) > 0;
  const primaryCandidate = shouldUseOperationalCandidate && operationalCandidate
    ? operationalCandidate
    : marketSelection.primary;
  const marketAssessment = base.marketAssessments.find((item) => item.market_family === (primaryCandidate?.market_family || manualMarketFamily)) || null;
  // Cuota del lado contrario de una línea binaria Over/Under X.5: opcional,
  // nunca inventada. Solo se construye si el usuario la introdujo; el lado
  // (over/under) es siempre el complemento exacto del candidato seleccionado,
  // nunca una familia/línea distinta.
  const oppositeOddsQuote = input.manualOppositeOdds && primaryCandidate?.direction && Number(String(input.manualOppositeOdds.decimalOdds || "").replace(",", ".")) > 1
    ? createManualOdds({
      fixtureId: base.fixture.fixtureId,
      bookmaker: input.manualOppositeOdds.bookmaker,
      marketFamily: primaryCandidate.market_family,
      marketName: marketAssessment?.market_label,
      selection: `${primaryCandidate.direction === "over" ? "Menos de" : "Más de"} ${primaryCandidate.line}`,
      direction: primaryCandidate.direction === "over" ? "under" : "over",
      line: primaryCandidate.line,
      decimalOdds: input.manualOppositeOdds.decimalOdds,
      receivedAt: input.manualOppositeOdds.consultedAt,
      analyzedAt,
      kickoff: base.fixture.date?.utc,
      timezone: input.manualOppositeOdds.timezone || input.timezone,
      analysisVersion: input.manualOppositeOdds.analysisVersion || previousVersion?.analysis_id || "initial",
    })
    : null;
  const marketEvidence = summarizeMarketEvidence(selectedGemini, primaryCandidate?.market_family || manualMarketFamily, geminiImpacts);
  contextSummary = marketEvidence.summary;
  const bestProviderOdds = primaryCandidate ? selectBestComparableOdds(oddsResult.quotes, {
    marketFamily: primaryCandidate.market_family,
    selection: primaryCandidate.selection,
    line: primaryCandidate.line,
  }) : null;
  const operationalSelectedOdds = operationalRanking.candidates.find(
    (item) => item.candidate.candidate_id === primaryCandidate?.candidate_id
  )?.quote || null;
  const selectedOdds = input.evaluatePrice === false
    ? null
    : selectActiveOddsQuote({
      fixtureId: base.fixture.fixtureId,
      candidate: primaryCandidate,
      manualQuote,
      fallbacks: [operationalSelectedOdds, primaryCandidate?.price_quote, bestProviderOdds],
    });
  const compatibleHistoricalOdds = (oddsResult.quotes || []).filter((quote) =>
    !isCurrentOddsQuote(quote) &&
    quote.market_family === primaryCandidate?.market_family &&
    normalizedDirection(quote.direction || quote.selection) === primaryCandidate?.direction &&
    Number(quote.line) === Number(primaryCandidate?.line)
  ).sort((left, right) => Number(left.age_minutes ?? Infinity) - Number(right.age_minutes ?? Infinity));
  const historicalQuote = compatibleHistoricalOdds[0] || null;
  const preliminaryProbability = primaryCandidate ? {
    contract: "PreliminaryMarketProbability",
    version: 1,
    probability_status: primaryCandidate.probability_status,
    point_estimate: primaryCandidate.preliminary_probability,
    uncertainty_low: primaryCandidate.uncertainty_low,
    uncertainty_high: primaryCandidate.uncertainty_high,
    sample_size_effective: primaryCandidate.sample_size_effective,
    exact_line: primaryCandidate.line,
    selection_direction: primaryCandidate.direction,
    inputs_used: primaryCandidate.input_sources,
    limitations: primaryCandidate.limitations,
    methodology_version: primaryCandidate.methodology_version,
    model_validation_status: "preliminary_unvalidated",
    represents_confidence: false,
    asian_settlement_profile: primaryCandidate.asian_settlement_profile || null,
  } : null;
  const requirements = marketAssessment?.data_requirements?.length || 0;
  const available = marketAssessment?.available_evidence?.length || 0;
  const sampleSize = primaryCandidate?.sample_size_effective || marketAssessment?.sample_size || 0;
  const telemetry = gateway.runtime.snapshot();
  const confidence = calculateSportsAnalysisConfidence({
    source_quality: base.status === DATA_LOAD_STATUS.SUCCESS ? 0.9 : 0.2,
    sample_size: ratio(sampleSize, 10),
    variable_coverage: ratio(available, requirements),
    source_concordance: contradictions.length
      ? Math.max(0, 1 - contradictions.length * 0.25)
      : Math.min(0.92, 0.85 + marketEvidence.summary.favorable.length * 0.02),
    contradiction_control: contradictions.length ? 0 : 1,
    contextual_coverage: [context.lineups.status, context.injuries.status, context.standings.status].filter((status) => ["confirmed", "probable", "no_reports", "verified"].includes(status)).length / 3,
    provider_stability: telemetry.budgetExhausted || telemetry.quotaStatus === "preventive_block" ? 0 : 1,
    extraordinaryEvidence: false,
    confirmedLineup: context.lineups.status === "confirmed",
    criticalContradictions: contradictions.length,
  });
  const suitability = assessMarketSuitability({
    fixtureVerified: Number(base.selectedFixtureId) === Number(base.fixture.fixtureId),
    blocked: telemetry.budgetExhausted || telemetry.quotaStatus === "preventive_block" || !resource.isBeforeKickoff,
    marketCandidate: Boolean(primaryCandidate && primaryCandidate.sports_score >= 45),
    sampleSufficient: sampleSize >= 5,
    requiredEvidenceAvailable: requirements > 0 && available / requirements >= 0.7,
    criticalContradictions: contradictions.length,
    line: primaryCandidate?.line || requestedLine,
    oddsQuote: selectedOdds,
    contextBlocked: Boolean(geminiContext && !geminiContext.valid_for_reanalysis),
    confidenceScore: confidence.analysis_confidence_score,
    preliminaryProbability,
    sampleSize,
    phase: input.phase || phaseInfo.phase,
    marketFamily: primaryCandidate?.market_family || null,
    asianSettlementProfile: primaryCandidate?.asian_settlement_profile || null,
  });
  const operationalCompleteness = buildOperationalCompleteness({
    oddsQuote: selectedOdds,
    priceEvaluation: suitability.price_evaluation,
  });
  const prompt = buildGeminiResearchPrompt({
    fixture: base.fixture,
    competition: base.competition,
    market: marketAssessment,
    selection: primaryCandidate,
    competitiveContext: base.competitiveContext,
    oddsQuote: selectedOdds,
    verifiedData: [`Fixture ${base.fixture.fixtureId} verificado por API-FOOTBALL.`, `${available} de ${requirements} requisitos de mercado disponibles.`],
    missingData: marketAssessment?.missing_evidence || [],
    risks: [...(marketAssessment?.risk_flags || []), ...(context.lineups.warnings || []), ...(context.injuries.warnings || [])],
    analyzedAt,
  });
  const cleanupPrompt = buildGeminiCleanupPrompt({
    fixture: base.fixture,
    competition: base.competition,
    market: marketAssessment,
    selection: primaryCandidate,
    analyzedAt,
  });
  const supportingEvidence = [
    ...(marketAssessment?.available_evidence || []).map((item) => item.requirement),
    ...marketEvidence.summary.favorable,
  ];
  const opposingEvidence = [
    ...marketEvidence.direct.filter((item) => ["rumor", "probable"].includes(item.kind) && item.impact !== "favorable").map((item) => item.text),
    ...marketEvidence.summary.unfavorable,
  ];
  const priorSelection = previousVersion?.director?.sports_verdict?.selection || previousVersion?.director?.selection || null;
  const currentSelection = primaryCandidate?.selection || null;
  const contextReanalysisMessage = buildGeminiEconomicReanalysisMessage({
    selectedItems: selectedGemini,
    impacts: geminiImpacts,
    previousProbability: previousVersion?.preliminary_probability?.point_estimate,
    currentProbability: primaryCandidate?.preliminary_probability,
    impliedProbability: selectedOdds?.implied_probability,
    decimalOdds: selectedOdds?.decimal_odds,
    currentPriceStatus: suitability.price_evaluation?.status,
  }) || (selectedGemini.length && priorSelection && priorSelection !== currentSelection
    ? `Contexto incorporado. La mejor línea cambia de ${priorSelection} a ${currentSelection}.`
    : null);
  const directorRisks = [
    ...(marketAssessment?.risk_flags || []),
    ...(context.lineups.warnings || []),
    ...(context.injuries.warnings || []),
    ...(oddsResult.warnings || []),
    ...marketEvidence.summary.unfavorable,
  ];
  const redTeam = buildRedTeamAtlas({
    candidate: primaryCandidate,
    marketAssessment,
    competitiveContext: base.competitiveContext,
    preMatchContext: context,
    opposingEvidence,
    contradictions,
  });
  const preflight = buildAtlasPreflight({
    fixture: base.fixture,
    candidate: primaryCandidate,
    competitiveContext: base.competitiveContext,
    oddsQuote: selectedOdds,
    preMatchContext: context,
    manualContext: geminiContext,
    blocked: suitability.status === "blocked",
  });
  const director = buildOperationalDirectorVerdict({
    fixture: base.fixture,
    competition: base.competition,
    analyzedAt,
    phase: input.phase || phaseInfo.phase,
    marketAssessment,
    marketCandidate: primaryCandidate,
    marketSelection,
    oddsQuote: selectedOdds,
    oppositeOddsQuote,
    confidence,
    suitability,
    supportingEvidence,
    opposingEvidence,
    contradictions,
    missingData: [...(marketAssessment?.missing_evidence || []), ...marketEvidence.summary.limitations],
    risks: directorRisks,
    evidenceRefs: base.evidenceRefs,
    parlayAuthorization: "insufficient_candidates",
    preliminaryProbability,
    intendedUse: input.intendedUse || "individual",
    contextReanalysisMessage,
  });
  attachLineOriginToDirector(director, lineOrigin, contextSummary);
  director.operational_completion = operationalCompleteness;
  director.red_team = redTeam;
  director.preflight = preflight;
  director.scout = {
    primary_candidate_id: scout.primary_candidate_id,
    candidate_count: scout.candidates.length,
    price_inputs_used: false,
  };
  director.operational_ranking = {
    candidate_count: operationalRanking.candidates.length,
    primary_candidate_id: operationalRanking.primary_candidate_id,
    differs_from_sports_ranking: operationalRanking.differs_from_sports_ranking,
    explanation: operationalRanking.explanation,
  };
  const evidence = asEvidence(base, oddsResult, context, geminiContext);
  const eligibleForParlayReview = ["eligible", "eligible_with_caution"].includes(director.parlay_eligibility);
  const parlayInput = eligibleForParlayReview ? [{ fixture_id: base.fixture.fixtureId, candidate_id: primaryCandidate?.candidate_id, ranking_version: primaryCandidate?.ranker_version, market_family: primaryCandidate?.market_family, line: director.line, selection: director.selection, decimal_odds: director.odds, odds_source_status: director.odds_source_status, freshness: selectedOdds?.freshness, market_suitability: director.market_suitability, preliminary_probability: preliminaryProbability, uncertainty_width: primaryCandidate?.uncertainty_high - primaryCandidate?.uncertainty_low, analysis_confidence_score: director.analysis_confidence_score, price_status: director.price_assessment.status, price_gap: director.price_assessment.price_gap }] : [];
  const parlay = buildConservativeParlays(parlayInput);

  director.parlay_authorization = parlay.status;
  const parlayCandidate = eligibleForParlayReview ? {
    fixture_id: base.fixture.fixtureId,
    candidate_id: primaryCandidate?.candidate_id,
    ranking_version: primaryCandidate?.ranker_version,
    market_family: primaryCandidate?.market_family,
    selection: director.selection,
    line: director.line,
    decimal_odds: director.odds,
    recorded_at: analyzedAt,
    analysis_confidence_score: director.analysis_confidence_score,
    preliminary_probability: preliminaryProbability,
    risks: director.risks,
    odds_source_status: director.odds_source_status,
    freshness: selectedOdds?.freshness,
    market_suitability: director.market_suitability,
    uncertainty_width: primaryCandidate?.uncertainty_high - primaryCandidate?.uncertainty_low,
    price_status: director.price_assessment.status,
    price_gap: director.price_assessment.price_gap,
  } : null;
const dreamParlayCandidates = parlayCandidate
? [parlayCandidate]
: [];

const dreamParlays = buildDreamParlays(
dreamParlayCandidates,
{
targetOdds: input.targetDreamOdds || 20,
selections: input.dreamSelections || 5,
}
);
  const valueRadar = evaluateValueOpportunity({ candidate: { ...primaryCandidate, fixture_id: base.fixture.fixtureId }, quote: selectedOdds, asianSettlementProfile: primaryCandidate?.asian_settlement_profile });
  const version = { ...buildAnalysisVersion({
    fixture: base.fixture,
    phase: input.phase,
    inputs: { ...input, lineOrigin, geminiResponse: input.geminiResponse ? "stored_in_gemini_context" : null, lineup_status: context.lineups.status, injury_status: context.injuries.status, referee_status: base.refereeProfile?.status, weather_status: base.venueWeatherContext?.weather_status },
    evidence,
    odds: oddsResult.quotes,
    activeQuote: selectedOdds,
    lineOrigin,
    geminiContext,
    analysisConfidence: confidence,
    preliminaryProbability,
    parlayCandidate,
    director,
    parlay,
    engineVersion: OPERATIONAL_ENGINE_VERSION,
  }, { idFactory, now: () => analyzedAt }), value_radar: valueRadar };
  const changes = previousVersion || input.reanalysis ? compareAnalysisVersions(previousVersion, version) : null;
  const individualPick = {
    contract: "IndividualPickAssessment",
    version: 1,
    fixture_id: base.fixture.fixtureId,
    market: director.market_evaluated,
    selection: director.selection,
    line: director.line,
    decimal_odds: director.odds,
    odds_source_status: director.odds_source_status,
    market_suitability: director.market_suitability,
    analysis_confidence_score: director.analysis_confidence_score,
    preliminary_probability: preliminaryProbability,
    status: director.individual_eligibility,
    conditions: director.conditions,
    reasons: director.reasons,
    risks: director.risks,
    directive_to_bet: false,
  };
  const exactSelection = primaryCandidate ? {
    fixture_id: base.fixture.fixtureId,
    market_family: primaryCandidate.market_family,
    direction: primaryCandidate.direction,
    line: primaryCandidate.line,
    estimated_probability: primaryCandidate.estimated_probability,
    sports_score: primaryCandidate.sports_score,
    uncertainty: { low: primaryCandidate.uncertainty_low, high: primaryCandidate.uncertainty_high },
    support: primaryCandidate.technical_support_score,
    ready_for_pricing: marketSelection.ready_for_pricing === true,
  } : null;
  // Contexto explicable en español para la familia actualmente seleccionada
  // (Fase 3B, punto 5): dirección, señales, resultado adversarial y
  // coherencia del modelo, tal cual los produce el Radar — sin reconstruir
  // ni parafrasear su cálculo.
  const primaryMarketOpportunityRadar = marketOpportunityRadar.find(
    (radar) => radar.market_family === (primaryCandidate?.market_family || manualMarketFamily)
  ) || null;
  return {
    ...base,
    contract: "AtlasOperationalAnalysis",
    version: 3,
    message: contextReanalysisMessage || "Análisis operativo finalizado y conservado como una nueva versión inmutable.",
    analysisMode: marketSelection.analysis_mode,
    marketSelection,
    exactSelection,
    marketOpportunityRadar,
    primaryMarketOpportunityRadar,
    scout,
    operationalRanking,
    redTeam,
    preflight,
    selectedMarket: marketAssessment,
    odds: oddsResult,
    bestComparableOdds: bestProviderOdds,
    selectedOdds,
    activeQuote: selectedOdds,
    historicalOdds: compatibleHistoricalOdds,
    historicalQuote,
    lineOrigin,
    preMatchContext: context,
    gemini: { prompt, cleanupPrompt, context: geminiContext, applied_items: marketEvidence.direct, general_context_items: marketEvidence.general, impacts: geminiImpacts, summary: contextSummary, supplementary_referee_evidence: supplementaryRefereeEvidence, reanalysis_message: contextReanalysisMessage },
    confidence,
    operationalCompleteness,
    preliminaryProbability,
    suitability,
    parlay,
    parlayCandidate,
    dreamParlays,
    individualPick,
    director,
    valueRadar,
    analysisVersion: version,
    changesSincePrevious: changes,
    telemetry,
  };
}
