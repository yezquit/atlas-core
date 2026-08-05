import { API_FOOTBALL_COMPETITIONS } from "../src/core/data/apiFootballLeagues.js";
import { createMemoryCache } from "../src/core/infrastructure/cacheStore.js";
import { createProviderRuntime } from "../src/core/infrastructure/providerRuntime.js";
import { createSportsDataGateway } from "../src/core/services/sportsDataGateway.js";
import { analyzeOperationalFixture } from "../src/core/services/operationalAnalysisService.js";

const HARD_REQUEST_LIMIT = 80;
const HARD_FIXTURE_LIMIT = 2;
const DEFAULT_DATE = "2026-08-08";

function argument(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function loadEnvironment() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // También acepta variables exportadas por el usuario.
  }
}

function publicTelemetry(runtime) {
  const value = runtime.snapshot();
  return {
    requestsUsed: value.requestsUsed,
    configuredBudget: value.configuredBudget,
    configuredBudgetRemaining: value.configuredBudgetRemaining,
    cacheHits: value.cacheHits,
    cacheMisses: value.cacheMisses,
    deduplicated: value.deduplicated,
    retries: value.retries,
    budgetStops: value.budgetStops,
    providerDailyLimit: value.providerDailyLimit,
    providerDailyRemaining: value.providerDailyRemaining,
    quotaStatus: value.quotaStatus,
  };
}

function summary(result) {
  const generatedLines = (result.marketSelection?.generated || []).map((item) => ({
    marketFamily: item.market_family,
    projectedMean: item.distribution?.projected_mean ?? null,
    median: item.distribution?.median ?? null,
    lines: [...new Set((item.candidates || []).map((candidate) => candidate.line))],
  }));
  const firstProviderQuote = result.odds?.quotes?.find((item) => item.source === "api-football") || null;
  return {
    fixtureId: result.selectedFixtureId,
    fixture: result.fixture ? `${result.fixture.teams.home.name} vs ${result.fixture.teams.away.name}` : null,
    status: result.status,
    analysisMode: result.analysisMode,
    generatedLines,
    sportsWinner: result.director?.sports_verdict || null,
    priceAssessment: result.director?.price_assessment || null,
    firstProviderLine: firstProviderQuote?.line || null,
    winnerSelectedBeforePrice: Boolean(result.marketSelection?.primary),
    odds: {
      status: result.odds?.status,
      quotes: result.odds?.quotes?.length || 0,
      selected: result.selectedOdds ? {
        bookmaker: result.selectedOdds.bookmaker_name,
        market: result.selectedOdds.market_family,
        selection: result.selectedOdds.selection,
        line: result.selectedOdds.line,
        decimalOdds: result.selectedOdds.decimal_odds,
        verificationStatus: result.selectedOdds.verification_status,
        freshness: result.selectedOdds.freshness,
      } : null,
    },
    lineups: result.preMatchContext?.lineups?.status,
    injuries: result.preMatchContext?.injuries?.status,
    standings: result.preMatchContext?.standings?.status,
    confidence: result.confidence?.analysis_confidence_score,
    probabilityStatus: result.director?.probability_status,
    suitability: result.director?.market_suitability,
    parlay: result.parlay?.status,
    prompt: result.gemini?.prompt || null,
    syntheticGemini: result.gemini?.context ? {
      markedAsTest: true,
      verificationStatus: result.gemini.context.verification_status,
      validForReanalysis: result.gemini.context.valid_for_reanalysis,
      sourceClassifications: result.gemini.context.items.flatMap((item) => item.source_classifications),
    } : null,
  };
}

async function main() {
  loadEnvironment();
  const date = argument("date", DEFAULT_DATE);
  const requestedMaximum = Number(argument("max-fixtures", HARD_FIXTURE_LIMIT));
  const maximumFixtures = Math.max(1, Math.min(HARD_FIXTURE_LIMIT, Number.isFinite(requestedMaximum) ? requestedMaximum : HARD_FIXTURE_LIMIT));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Usa --date=YYYY-MM-DD.");
  if (!process.env.API_FOOTBALL_KEY || !process.env.API_FOOTBALL_BASE_URL) {
    console.log(JSON.stringify({
      contract: "AtlasFinalControlledVerification",
      status: "unavailable",
      reason: "API-FOOTBALL no está configurado en este entorno.",
      reproducibleCommand: "npm run verify:operational -- --date=2026-08-08 --max-fixtures=1",
      hardRequestLimit: HARD_REQUEST_LIMIT,
      hardFixtureLimit: HARD_FIXTURE_LIMIT,
      geminiApiUsed: false,
    }, null, 2));
    process.exitCode = 2;
    return;
  }
  const runtime = createProviderRuntime({ apiKey: process.env.API_FOOTBALL_KEY, baseUrl: process.env.API_FOOTBALL_BASE_URL, budget: HARD_REQUEST_LIMIT, concurrency: 3, timeoutMs: 8_000, maxRetries: 1, cache: createMemoryCache() });
  const gateway = createSportsDataGateway(runtime);
  const competition = API_FOOTBALL_COMPETITIONS.find((item) => item.key === "colombiaPrimeraA");
  const fixtureLoad = await gateway.loadFixturesForDate({ competition, season: 2026, date });
  const fixtures = (fixtureLoad.fixtures || []).slice(0, maximumFixtures);
  const results = [];
  if (fixtures[0]) {
    const selected = fixtures[0];
    const general = await analyzeOperationalFixture({ date, competitionKey: competition.key, season: 2026, fixtureId: selected.fixtureId, analysisMode: "general", marketId: "open" }, gateway, { idFactory: () => `controlled-${selected.fixtureId}-general` });
    results.push(summary(general));
    if (!runtime.snapshot().budgetExhausted) {
      const specific = await analyzeOperationalFixture({ date, competitionKey: competition.key, season: 2026, fixtureId: selected.fixtureId, analysisMode: "specific", marketId: "goals" }, gateway, { idFactory: () => `controlled-${selected.fixtureId}-goals` });
      results.push(summary(specific));
    }
  }
  const telemetry = publicTelemetry(runtime);
  if (telemetry.requestsUsed > HARD_REQUEST_LIMIT) throw new Error("Se excedió el límite duro de 80 solicitudes.");
  console.log(JSON.stringify({
    contract: "AtlasFinalControlledVerification",
    version: 1,
    status: fixtures.length ? "success" : fixtureLoad.status,
    competition: competition.localName,
    season: 2026,
    date,
    fixturesFound: fixtureLoad.fixtures?.length || 0,
    fixturesAnalyzed: fixtures.length,
    analysesRun: results.length,
    analyses: results,
    telemetry,
    hardRequestLimit: HARD_REQUEST_LIMIT,
    hardFixtureLimit: HARD_FIXTURE_LIMIT,
    geminiApiUsed: false,
    sportsValidationClaimed: false,
    scannedCompetitionCount: 1,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "provider_error", reason: error?.message || "La verificación no pudo completarse.", hardRequestLimit: HARD_REQUEST_LIMIT, geminiApiUsed: false }, null, 2));
  process.exitCode = 1;
});
