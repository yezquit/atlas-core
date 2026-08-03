import { API_FOOTBALL_COMPETITIONS } from "../src/core/data/apiFootballLeagues.js";
import { createMemoryCache } from "../src/core/infrastructure/cacheStore.js";
import { createProviderRuntime } from "../src/core/infrastructure/providerRuntime.js";
import { createSportsDataGateway } from "../src/core/services/sportsDataGateway.js";
import { analyzeSportsFixture } from "../src/core/services/sportsIntelligenceService.js";

const MAX_REAL_REQUESTS = 150;
const MAX_REAL_FIXTURES = 2;
const DEFAULT_DATE = "2026-08-02";
const COLOMBIA_PRIMERA_A_KEY = "colombiaPrimeraA";

function argument(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function loadLocalEnvironment() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // El script también acepta variables ya exportadas en la sesión.
  }
}

function safeTelemetry(runtime) {
  const snapshot = runtime.snapshot();
  return {
    requestsUsed: snapshot.requestsUsed,
    cacheHits: snapshot.cacheHits,
    cacheMisses: snapshot.cacheMisses,
    deduplicated: snapshot.deduplicated,
    retries: snapshot.retries,
    configuredBudget: snapshot.configuredBudget,
    configuredBudgetRemaining: snapshot.configuredBudgetRemaining,
    budgetStops: snapshot.budgetStops,
    budgetExhausted: snapshot.budgetExhausted,
    providerDailyLimit: snapshot.providerDailyLimit,
    providerDailyRemaining: snapshot.providerDailyRemaining,
  };
}

function catalogSummary(competition, result) {
  return {
    key: competition.key,
    configuredId: competition.id,
    configuredName: competition.localName,
    status: result.status,
    errorCode: result.errorCode || null,
    verifiedId: result.competition?.id || null,
    verifiedName: result.competition?.name || null,
    availableSeasons: result.availableSeasons || [],
    requestedSeasonCoverage: result.seasonMetadata?.coverage || null,
    reason: result.message || null,
  };
}

function analysisSummary(analysis) {
  return {
    status: analysis.status,
    errorCode: analysis.errorCode,
    fixtureId: analysis.selectedFixtureId,
    fixture: analysis.fixture
      ? `${analysis.fixture.teams.home.name} vs ${analysis.fixture.teams.away.name}`
      : null,
    competition: analysis.competition?.localName || null,
    leagueProfile: analysis.leagueProfile
      ? {
          season: analysis.leagueProfile.season,
          windowStart: analysis.leagueProfile.window_start,
          windowEnd: analysis.leagueProfile.window_end,
          sampleSize: analysis.leagueProfile.sample_size,
          qualityStatus: analysis.leagueProfile.quality_status,
          labels: analysis.leagueProfile.labels,
          unavailableMetrics: analysis.leagueProfile.unavailable_metrics,
        }
      : null,
    teams: [analysis.homeTeamProfile, analysis.awayTeamProfile]
      .filter(Boolean)
      .map((profile) => ({
        name: profile.team_name,
        season: profile.season,
        sampleSize: profile.sample_size,
        homeSampleSize: profile.as_home?.sample_size || 0,
        awaySampleSize: profile.as_away?.sample_size || 0,
        fixtureIds: profile.fixture_ids,
        qualityStatus: profile.quality_status,
        warnings: profile.warnings,
      })),
    referee: analysis.refereeProfile
      ? {
          name: analysis.refereeProfile.referee_name,
          status: analysis.refereeProfile.status,
          sampleSize: analysis.refereeProfile.sample_size,
          qualityStatus: analysis.refereeProfile.quality_status,
          warnings: analysis.refereeProfile.warnings,
        }
      : null,
    venueWeather: analysis.venueWeatherContext
      ? {
          venue: analysis.venueWeatherContext.venue,
          city: analysis.venueWeatherContext.city,
          weatherStatus: analysis.venueWeatherContext.weather_status,
          riskFlags: analysis.venueWeatherContext.risk_flags,
          warnings: analysis.venueWeatherContext.warnings,
        }
      : null,
    markets: (analysis.marketAssessments || []).map((market) => ({
      family: market.market_family,
      technicalSupport: market.technical_support_score,
      sampleSize: market.sample_size,
      qualityStatus: market.quality_status,
      candidate: market.candidate,
      probabilityStatus: market.probabilityStatus,
      estimatedProbability: market.estimatedProbability,
      risks: market.risk_flags,
      missingEvidence: market.missing_evidence,
    })),
    director: analysis.director
      ? {
          verdict: analysis.director.verdict,
          status: analysis.director.status,
          displayStatus: analysis.director.display_status,
          market: analysis.director.market_evaluated,
          technicalSupport: analysis.director.technical_support,
          estimatedProbability: analysis.director.estimated_probability,
          probabilityStatus: analysis.director.probability_status,
          parlayAuthorization: analysis.director.parlay_authorization,
          risks: analysis.director.risks,
          missingData: analysis.director.missing_data,
          nextAction: analysis.director.next_action,
        }
      : null,
  };
}

async function main() {
  loadLocalEnvironment();
  const date = argument("date", DEFAULT_DATE);
  const requestedMaximum = Number(argument("max-fixtures", MAX_REAL_FIXTURES));
  const maximumFixtures = Math.max(
    1,
    Math.min(MAX_REAL_FIXTURES, Number.isFinite(requestedMaximum) ? requestedMaximum : 1)
  );
  const verifyCatalog = process.argv.includes("--verify-catalog");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Usa --date=YYYY-MM-DD.");
  }
  if (!process.env.API_FOOTBALL_KEY || !process.env.API_FOOTBALL_BASE_URL) {
    console.log(JSON.stringify({
      status: "unavailable",
      reason: "Configura API_FOOTBALL_KEY y API_FOOTBALL_BASE_URL en .env.local.",
      command:
        "npm run verify:phase2 -- --date=2026-08-02 --max-fixtures=2 --verify-catalog",
      hardRequestLimit: MAX_REAL_REQUESTS,
      hardFixtureLimit: MAX_REAL_FIXTURES,
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  const runtime = createProviderRuntime({
    apiKey: process.env.API_FOOTBALL_KEY,
    baseUrl: process.env.API_FOOTBALL_BASE_URL,
    budget: MAX_REAL_REQUESTS,
    concurrency: 3,
    timeoutMs: 8_000,
    maxRetries: 1,
    cache: createMemoryCache(),
  });
  const gateway = createSportsDataGateway(runtime);
  const colombia = API_FOOTBALL_COMPETITIONS.find(
    (competition) => competition.key === COLOMBIA_PRIMERA_A_KEY
  );
  const catalog = [];
  if (verifyCatalog) {
    for (const competition of API_FOOTBALL_COMPETITIONS) {
      const result = await gateway.loadCompetitionMetadata(
        competition,
        competition.currentSeason
      );
      catalog.push(catalogSummary(competition, result));
    }
  }

  const fixtureResult = await gateway.loadFixturesForDate({
    competition: colombia,
    date,
    season: 2026,
  });
  const chosenFixtures = (fixtureResult.fixtures || []).slice(0, maximumFixtures);
  const analyses = [];
  for (const fixture of chosenFixtures) {
    const result = await analyzeSportsFixture(
      {
        date,
        competitionKey: colombia.key,
        season: 2026,
        fixtureId: fixture.fixtureId,
        marketId: "open",
      },
      gateway
    );
    analyses.push(analysisSummary(result));
  }

  let cacheVerification = null;
  if (chosenFixtures[0] && !runtime.snapshot().budgetExhausted) {
    const before = safeTelemetry(runtime);
    await analyzeSportsFixture(
      {
        date,
        competitionKey: colombia.key,
        season: 2026,
        fixtureId: chosenFixtures[0].fixtureId,
        marketId: "open",
      },
      gateway
    );
    const after = safeTelemetry(runtime);
    cacheVerification = {
      requestsBefore: before.requestsUsed,
      requestsAfter: after.requestsUsed,
      additionalCacheHits: after.cacheHits - before.cacheHits,
      repeatedAnalysisAvoidedNetwork: after.requestsUsed === before.requestsUsed,
    };
  }

  const telemetry = safeTelemetry(runtime);
  if (telemetry.requestsUsed > MAX_REAL_REQUESTS) {
    throw new Error("El límite duro de 150 solicitudes fue excedido.");
  }
  console.log(JSON.stringify({
    contract: "AtlasPhase2ControlledVerification",
    version: 1,
    status:
      fixtureResult.status === "success" && analyses.length > 0
        ? "success"
        : fixtureResult.status,
    date,
    competition: colombia.localName,
    season: 2026,
    fixtureLimit: maximumFixtures,
    fixtureLoad: {
      status: fixtureResult.status,
      errorCode: fixtureResult.errorCode || null,
      message: fixtureResult.message,
      fixturesFound: fixtureResult.fixtures?.length || 0,
      fixturesAnalyzed: analyses.length,
    },
    catalog,
    analyses,
    cacheVerification,
    telemetry,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: "provider_error",
    reason: error?.message || "La verificación no pudo completarse.",
    hardRequestLimit: MAX_REAL_REQUESTS,
  }, null, 2));
  process.exitCode = 1;
});
