import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { OPERATIONAL_ENGINE_VERSION, phaseForKickoff } from "../contracts/operationalContracts.js";
import { calculateAnalysisConfidence } from "../intelligence/analysisConfidence.js";
import { buildAnalysisVersion, compareAnalysisVersions } from "../intelligence/analysisVersions.js";
import { buildGeminiResearchPrompt, parseGeminiResponse, selectGeminiItems } from "../intelligence/geminiManualContext.js";
import { mapGeminiImpacts } from "../intelligence/geminiImpactMapper.js";
import { buildRankedMarketSelection } from "../intelligence/marketCandidateRanker.js";
import { assessMarketSuitability } from "../intelligence/marketSuitability.js";
import { createManualOdds, normalizeProviderOdds, selectBestComparableOdds, validateManualOddsInput } from "../intelligence/oddsIntelligence.js";
import { buildConservativeParlays } from "../intelligence/parlayPolicy.js";
import { createUnavailablePreMatchItem, normalizeInjuries, normalizeLineups } from "../intelligence/preMatchContext.js";
import { buildOperationalDirectorVerdict } from "../modules/directorAtlas.js";
import { analyzeSportsFixture } from "./sportsIntelligenceService.js";

function coverageFlag(coverage, path) {
  return path.reduce((value, key) => value?.[key], coverage) === true;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? Math.max(0, Math.min(1, numerator / denominator)) : 0;
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
  const isBeforeKickoff = Date.parse(analyzedAt) <= Date.parse(fixture.date?.utc);
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
  const base = await analyzeSportsFixture(input, gateway);
  if (base.status !== DATA_LOAD_STATUS.SUCCESS || !base.fixture) return { ...base, operational: null };
  const resource = await loadPreMatchResources({ base, gateway, analyzedAt });
  const oddsResult = resource.oddsRaw.status === DATA_LOAD_STATUS.SUCCESS
    ? normalizeProviderOdds({ response: resource.oddsRaw.response, fixtureId: base.fixture.fixtureId, now: analyzedAt, kickoff: base.fixture.date?.utc })
    : { contract: "OddsResult", version: 1, fixture_id: base.fixture.fixtureId, status: "unavailable", quotes: [], warnings: [resource.oddsRaw.errorCode || "odds_unavailable"] };
  const previousActiveQuote = Number(previousVersion?.fixture_id) === Number(base.fixture.fixtureId)
    ? previousVersion?.active_quote || null
    : null;
  const reusableActiveQuote = input.reanalysis ? previousActiveQuote : null;
  const rawRequestedLine = input.manualOdds?.line ?? input.line ?? reusableActiveQuote?.line ?? null;
  const requestedLine = rawRequestedLine === null || rawRequestedLine === undefined
    ? null
    : String(rawRequestedLine).replace(",", ".");
  const requestedSelection = input.manualOdds?.selection ?? input.selection ?? reusableActiveQuote?.selection ?? null;
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
  const geminiImpacts = mapGeminiImpacts(selectedGemini);
  const contradictions = selectedGemini.filter((item) => item.kind === "contradiction").map((item) => item.text);
  const geminiLimitations = selectedGemini.filter((item) => item.kind === "not_found").map((item) => item.text);
  const favorableGemini = selectedGemini.filter((item) => item.impact === "favorable").map((item) => item.text);
  const unfavorableGemini = selectedGemini.filter((item) => item.impact === "unfavorable").map((item) => item.text);
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
  const preferredQuote = manualQuote || reusableActiveQuote;
  if (preferredQuote && !oddsResult.quotes.some((quote) => quote.quote_id === preferredQuote.quote_id)) {
    oddsResult.quotes.push(preferredQuote);
  }
  if (oddsResult.quotes.length) oddsResult.status = "available";
  let marketSelection = buildRankedMarketSelection({
    analysisMode: requestedLine && manualMarketFamily ? "specific" : analysisMode,
    requestedMarketId: requestedLine && manualMarketFamily ? manualMarketFamily : analysisMode === "specific" ? input.marketId : null,
    marketAssessments: base.marketAssessments,
    leagueProfile: base.leagueProfile,
    homeTeamProfile: base.homeTeamProfile,
    awayTeamProfile: base.awayTeamProfile,
    refereeProfile: base.refereeProfile,
    contextItems: selectedGemini,
    contextImpacts: geminiImpacts,
    exactLine: requestedLine,
    quotes: oddsResult.quotes,
    preferredQuote,
  });
  if (requestedLine && requestedSelection) {
    const direction = /under|menos/i.test(requestedSelection) ? "under" : /over|más|mas/i.test(requestedSelection) ? "over" : null;
    const exactCandidate = marketSelection.ranked_candidates.find((candidate) =>
      candidate.market_family === manualMarketFamily &&
      Number(candidate.line) === Number(requestedLine) &&
      (!direction || candidate.direction === direction)
    );
    if (exactCandidate) {
      marketSelection = {
        ...marketSelection,
        primary: exactCandidate,
        alternatives: marketSelection.ranked_candidates.filter((candidate) => candidate.candidate_id !== exactCandidate.candidate_id).slice(0, 3),
        explanation: `${exactCandidate.selection} se evaluó con su probabilidad exacta porque corresponde a la línea reportada por el usuario.`,
      };
    }
  }
  const primaryCandidate = marketSelection.primary;
  const marketAssessment = base.marketAssessments.find((item) => item.market_family === primaryCandidate?.market_family) || null;
  const bestProviderOdds = primaryCandidate ? selectBestComparableOdds(oddsResult.quotes, {
    marketFamily: primaryCandidate.market_family,
    selection: primaryCandidate.selection,
    line: primaryCandidate.line,
  }) : null;
  const selectedOdds = primaryCandidate?.price_quote || bestProviderOdds || null;
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
  } : null;
  const requirements = marketAssessment?.data_requirements?.length || 0;
  const available = marketAssessment?.available_evidence?.length || 0;
  const sampleSize = primaryCandidate?.sample_size_effective || marketAssessment?.sample_size || 0;
  const telemetry = gateway.runtime.snapshot();
  const confidence = calculateAnalysisConfidence({
    source_quality: base.status === DATA_LOAD_STATUS.SUCCESS ? 0.9 : 0.2,
    freshness: selectedOdds?.freshness === "fresh" ? 1 : selectedOdds ? 0.55 : 0.35,
    sample_size: ratio(sampleSize, 10),
    variable_coverage: ratio(available, requirements),
    source_concordance: contradictions.length
      ? Math.max(0, 1 - contradictions.length * 0.25)
      : Math.min(0.92, 0.85 + favorableGemini.length * 0.02),
    contradiction_control: contradictions.length ? 0 : 1,
    contextual_coverage: [context.lineups.status, context.injuries.status, context.standings.status].filter((status) => ["confirmed", "probable", "no_reports", "verified"].includes(status)).length / 3,
    verified_market_data: selectedOdds?.verification_status === "verified_provider" ? 1 : selectedOdds ? 0.45 : 0,
    provider_stability: telemetry.budgetExhausted || telemetry.quotaStatus === "preventive_block" ? 0 : 1,
    extraordinaryEvidence: false,
    confirmedLineup: context.lineups.status === "confirmed",
    verifiedOdds: selectedOdds?.verification_status === "verified_provider",
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
    contextBlocked: Boolean(geminiContext && !geminiContext.valid_for_reanalysis && input.geminiResponse),
    confidenceScore: confidence.analysis_confidence_score,
    preliminaryProbability,
  });
  const phaseInfo = phaseForKickoff(base.fixture.date.utc, analyzedAt);
  const prompt = buildGeminiResearchPrompt({
    fixture: base.fixture,
    competition: base.competition,
    market: marketAssessment,
    oddsQuote: selectedOdds,
    verifiedData: [`Fixture ${base.fixture.fixtureId} verificado por API-FOOTBALL.`, `${available} de ${requirements} requisitos de mercado disponibles.`],
    missingData: marketAssessment?.missing_evidence || [],
    risks: [...(marketAssessment?.risk_flags || []), ...(context.lineups.warnings || []), ...(context.injuries.warnings || [])],
    analyzedAt,
  });
  const supportingEvidence = [
    ...(marketAssessment?.available_evidence || []).map((item) => item.requirement),
    ...favorableGemini,
  ];
  const opposingEvidence = [
    ...selectedGemini.filter((item) => ["rumor", "probable"].includes(item.kind) && item.impact !== "favorable").map((item) => item.text),
    ...unfavorableGemini,
  ];
  const priorSelection = previousVersion?.director?.sports_verdict?.selection || previousVersion?.director?.selection || null;
  const currentSelection = primaryCandidate?.selection || null;
  const contextReanalysisMessage = !selectedGemini.length
    ? null
    : geminiImpacts.length === 0
      ? "El contexto fue procesado, pero no contiene evidencia suficiente para modificar la distribución."
      : priorSelection && priorSelection !== currentSelection
        ? `Contexto incorporado. La mejor línea cambia de ${priorSelection} a ${currentSelection}.`
        : "Contexto incorporado. El candidato principal se mantiene.";
  const director = buildOperationalDirectorVerdict({
    fixture: base.fixture,
    competition: base.competition,
    analyzedAt,
    phase: input.phase || phaseInfo.phase,
    marketAssessment,
    marketCandidate: primaryCandidate,
    marketSelection,
    oddsQuote: selectedOdds,
    confidence,
    suitability,
    supportingEvidence,
    opposingEvidence,
    contradictions,
    missingData: [...(marketAssessment?.missing_evidence || []), ...geminiLimitations],
    risks: [...(marketAssessment?.risk_flags || []), ...(context.lineups.warnings || []), ...(context.injuries.warnings || []), ...(oddsResult.warnings || []), ...unfavorableGemini],
    evidenceRefs: base.evidenceRefs,
    parlayAuthorization: "insufficient_candidates",
    preliminaryProbability,
    intendedUse: input.intendedUse || "individual",
    contextReanalysisMessage,
  });
  const evidence = asEvidence(base, oddsResult, context, geminiContext);
  const parlayInput = director.parlay_eligibility === "eligible" ? [{ fixture_id: base.fixture.fixtureId, candidate_id: primaryCandidate?.candidate_id, ranking_version: primaryCandidate?.ranker_version, market_family: primaryCandidate?.market_family, line: director.line, selection: director.selection, decimal_odds: director.odds, odds_source_status: director.odds_source_status, freshness: selectedOdds?.freshness, market_suitability: director.market_suitability, preliminary_probability: preliminaryProbability, uncertainty_width: primaryCandidate?.uncertainty_high - primaryCandidate?.uncertainty_low, analysis_confidence_score: director.analysis_confidence_score }] : [];
  const parlay = buildConservativeParlays(parlayInput);
  director.parlay_authorization = parlay.status;
  const parlayCandidate = director.parlay_eligibility === "eligible" ? {
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
  } : null;
  const version = buildAnalysisVersion({
    fixture: base.fixture,
    phase: input.phase,
    inputs: { ...input, geminiResponse: input.geminiResponse ? "stored_in_gemini_context" : null, lineup_status: context.lineups.status, injury_status: context.injuries.status, referee_status: base.refereeProfile?.status, weather_status: base.venueWeatherContext?.weather_status },
    evidence,
    odds: oddsResult.quotes,
    activeQuote: selectedOdds,
    geminiContext,
    analysisConfidence: confidence,
    preliminaryProbability,
    parlayCandidate,
    director,
    parlay,
    engineVersion: OPERATIONAL_ENGINE_VERSION,
  }, { idFactory, now: () => analyzedAt });
  const changes = previousVersion ? compareAnalysisVersions(previousVersion, version) : null;
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
    status: director.authorizes_consideration ? "apt_for_consideration" : director.market_suitability,
    conditions: director.conditions,
    reasons: director.reasons,
    risks: director.risks,
    directive_to_bet: false,
  };
  return {
    ...base,
    contract: "AtlasOperationalAnalysis",
    version: 3,
    message: contextReanalysisMessage || "Análisis operativo finalizado y conservado como una nueva versión inmutable.",
    analysisMode: marketSelection.analysis_mode,
    marketSelection,
    selectedMarket: marketAssessment,
    odds: oddsResult,
    bestComparableOdds: bestProviderOdds,
    selectedOdds,
    activeQuote: selectedOdds,
    preMatchContext: context,
    gemini: { prompt, context: geminiContext, applied_items: selectedGemini, impacts: geminiImpacts, reanalysis_message: contextReanalysisMessage },
    confidence,
    preliminaryProbability,
    suitability,
    parlay,
    parlayCandidate,
    individualPick,
    director,
    analysisVersion: version,
    changesSincePrevious: changes,
    telemetry,
  };
}
