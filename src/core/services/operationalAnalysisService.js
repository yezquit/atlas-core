import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { OPERATIONAL_ENGINE_VERSION, phaseForKickoff } from "../contracts/operationalContracts.js";
import { calculateAnalysisConfidence } from "../intelligence/analysisConfidence.js";
import { buildAnalysisVersion, compareAnalysisVersions } from "../intelligence/analysisVersions.js";
import { buildGeminiResearchPrompt, parseGeminiResponse, selectGeminiItems } from "../intelligence/geminiManualContext.js";
import { assessMarketSuitability } from "../intelligence/marketSuitability.js";
import { createManualOdds, normalizeProviderOdds, selectBestComparableOdds } from "../intelligence/oddsIntelligence.js";
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
  const base = await analyzeSportsFixture(input, gateway);
  if (base.status !== DATA_LOAD_STATUS.SUCCESS || !base.fixture) return { ...base, operational: null };
  const resource = await loadPreMatchResources({ base, gateway, analyzedAt });
  const oddsResult = resource.oddsRaw.status === DATA_LOAD_STATUS.SUCCESS
    ? normalizeProviderOdds({ response: resource.oddsRaw.response, fixtureId: base.fixture.fixtureId, now: analyzedAt })
    : { contract: "OddsResult", version: 1, fixture_id: base.fixture.fixtureId, status: "unavailable", quotes: [], warnings: [resource.oddsRaw.errorCode || "odds_unavailable"] };
  const manualQuote = createManualOdds({
    fixtureId: base.fixture.fixtureId,
    bookmaker: input.manualOdds?.bookmaker,
    marketFamily: base.selectedMarket?.market_family || input.marketId,
    marketName: base.selectedMarket?.market_label,
    selection: input.manualOdds?.selection,
    line: input.manualOdds?.line ?? input.line,
    decimalOdds: input.manualOdds?.decimalOdds ?? input.odds,
    receivedAt: analyzedAt,
  });
  if (manualQuote) oddsResult.quotes.push(manualQuote);
  const requestedLine = input.manualOdds?.line ?? input.line ?? null;
  const requestedSelection = input.manualOdds?.selection ?? input.selection ?? null;
  const bestProviderOdds = selectBestComparableOdds(oddsResult.quotes, {
    marketFamily: base.selectedMarket?.market_family,
    selection: requestedSelection,
    line: requestedLine,
  });
  const selectedOdds = bestProviderOdds || manualQuote || oddsResult.quotes.find((quote) =>
    quote.market_family === base.selectedMarket?.market_family && (!requestedLine || quote.line === String(requestedLine))
  ) || null;
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
      expectedOdds: selectedOdds?.decimal_odds || input.odds,
      receivedAt: analyzedAt,
    });
  }
  if (geminiContext && Array.isArray(input.selectedGeminiItemIds)) {
    geminiContext = selectGeminiItems(geminiContext, input.selectedGeminiItemIds);
  } else if (geminiContext) {
    geminiContext = { ...geminiContext, selected_items: (geminiContext.items || []).filter((item) => item.selected) };
  }
  const selectedGemini = geminiContext?.valid_for_reanalysis ? geminiContext.selected_items || [] : [];
  const contradictions = selectedGemini.filter((item) => item.kind === "contradiction").map((item) => item.text);
  const requirements = base.selectedMarket?.data_requirements?.length || 0;
  const available = base.selectedMarket?.available_evidence?.length || 0;
  const sampleSize = base.selectedMarket?.sample_size || 0;
  const telemetry = gateway.runtime.snapshot();
  const confidence = calculateAnalysisConfidence({
    source_quality: base.status === DATA_LOAD_STATUS.SUCCESS ? 0.9 : 0.2,
    freshness: selectedOdds?.freshness === "fresh" ? 1 : selectedOdds ? 0.55 : 0.35,
    sample_size: ratio(sampleSize, 10),
    variable_coverage: ratio(available, requirements),
    source_concordance: contradictions.length ? Math.max(0, 1 - contradictions.length * 0.25) : 0.85,
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
    marketCandidate: base.selectedMarket?.candidate,
    sampleSufficient: sampleSize >= 5,
    requiredEvidenceAvailable: requirements > 0 && available === requirements,
    criticalContradictions: contradictions.length,
    line: selectedOdds?.line || requestedLine,
    oddsQuote: selectedOdds,
    contextBlocked: Boolean(geminiContext && !geminiContext.valid_for_reanalysis && input.geminiResponse),
    confidenceScore: confidence.analysis_confidence_score,
  });
  const phaseInfo = phaseForKickoff(base.fixture.date.utc, analyzedAt);
  const prompt = buildGeminiResearchPrompt({
    fixture: base.fixture,
    competition: base.competition,
    market: base.selectedMarket,
    oddsQuote: selectedOdds,
    verifiedData: [`Fixture ${base.fixture.fixtureId} verificado por API-FOOTBALL.`, `${available} de ${requirements} requisitos de mercado disponibles.`],
    missingData: base.selectedMarket?.missing_evidence || [],
    risks: [...(base.selectedMarket?.risk_flags || []), ...(context.lineups.warnings || []), ...(context.injuries.warnings || [])],
    analyzedAt,
  });
  const supportingEvidence = (base.selectedMarket?.available_evidence || []).map((item) => item.requirement);
  const opposingEvidence = selectedGemini.filter((item) => ["rumor", "probable"].includes(item.kind)).map((item) => item.text);
  const director = buildOperationalDirectorVerdict({
    fixture: base.fixture,
    competition: base.competition,
    analyzedAt,
    phase: input.phase || phaseInfo.phase,
    marketAssessment: base.selectedMarket,
    oddsQuote: selectedOdds,
    confidence,
    suitability,
    supportingEvidence,
    opposingEvidence,
    contradictions,
    missingData: base.selectedMarket?.missing_evidence || [],
    risks: [...(base.selectedMarket?.risk_flags || []), ...(oddsResult.warnings || [])],
    evidenceRefs: base.evidenceRefs,
    parlayAuthorization: "unsupported",
  });
  const evidence = asEvidence(base, oddsResult, context, geminiContext);
  const parlay = buildConservativeParlays(director.apt_for_consideration ? [{ fixture_id: base.fixture.fixtureId, market_family: base.selectedMarket?.market_family, line: director.line, selection: director.selection, decimal_odds: director.odds, odds_source_status: director.odds_source_status, freshness: selectedOdds?.freshness, market_suitability: director.market_suitability }] : []);
  director.parlay_authorization = parlay.status;
  const version = buildAnalysisVersion({
    fixture: base.fixture,
    phase: input.phase,
    inputs: { ...input, geminiResponse: input.geminiResponse ? "stored_in_gemini_context" : null, lineup_status: context.lineups.status, injury_status: context.injuries.status, referee_status: base.refereeProfile?.status, weather_status: base.venueWeatherContext?.weather_status },
    evidence,
    odds: oddsResult.quotes,
    geminiContext,
    analysisConfidence: confidence,
    director,
    parlay,
    engineVersion: OPERATIONAL_ENGINE_VERSION,
  }, { idFactory, now: () => analyzedAt });
  const changes = previousVersion ? compareAnalysisVersions(previousVersion, version) : null;
  return {
    ...base,
    contract: "AtlasOperationalAnalysis",
    version: 3,
    message: "Análisis operativo finalizado y conservado como una nueva versión inmutable.",
    odds: oddsResult,
    bestComparableOdds: bestProviderOdds,
    selectedOdds,
    preMatchContext: context,
    gemini: { prompt, context: geminiContext, applied_items: selectedGemini },
    confidence,
    suitability,
    parlay,
    director,
    analysisVersion: version,
    changesSincePrevious: changes,
    telemetry,
  };
}
