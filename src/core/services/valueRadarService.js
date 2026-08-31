import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { evaluateExactMarketLine } from "../intelligence/candidateLineGenerator.js";
import { rankMarketCandidates } from "../intelligence/marketCandidateRanker.js";
import { normalizeProviderOdds } from "../intelligence/oddsIntelligence.js";
import { ASIAN_TOTAL_GOALS_FAMILY, ASIAN_TOTAL_GOALS_LABEL, asianSettlementExplanation } from "../intelligence/asianTotalGoals.js";
import { evaluateValueOpportunity, rankValueOpportunities } from "../intelligence/valueRadar.js";

function classicOpportunity(candidate) {
  const normalized = {
    fixture_id: candidate.fixtureId,
    market_family: candidate.marketId,
    direction: candidate.direction,
    line: candidate.line,
    estimated_probability: candidate.estimatedProbability,
    uncertainty_low: candidate.uncertaintyLow,
    uncertainty_high: candidate.uncertaintyHigh,
    sports_score: candidate.sportsScore,
    technical_support_score: candidate.technicalSupport,
  };
  return {
    ...candidate,
    ...evaluateValueOpportunity({ candidate: normalized, quote: candidate.activeQuote }),
    activeQuote: candidate.activeQuote || null,
  };
}

function asianJourneyCandidate(analysis, candidate, quote) {
  return {
    competition: analysis.competition.localName,
    competitionKey: analysis.competition.key,
    season: analysis.fixture.competition.season,
    fixtureId: analysis.fixture.fixtureId,
    fixture: `${analysis.fixture.teams.home.name} vs ${analysis.fixture.teams.away.name}`,
    kickoff: analysis.fixture.date.utc,
    kickoffLocal: analysis.fixture.date.kickoff_local,
    timezone: analysis.fixture.date.timezone,
    localCalendarDate: analysis.fixture.date.local_calendar_date,
    market: ASIAN_TOTAL_GOALS_LABEL,
    marketId: ASIAN_TOTAL_GOALS_FAMILY,
    analysisMode: "specific",
    selection: candidate.selection,
    direction: candidate.direction,
    line: candidate.line,
    probability: candidate.estimated_probability,
    estimatedProbability: candidate.estimated_probability,
    uncertaintyLow: candidate.uncertainty_low,
    uncertaintyHigh: candidate.uncertainty_high,
    sportsScore: candidate.sports_score,
    technicalSupport: candidate.technical_support_score ?? candidate.sports_score,
    sampleSize: candidate.sample_size_effective,
    methodologyVersion: candidate.methodology_version,
    activeQuote: quote,
    asianSettlementProfile: candidate.asian_settlement_profile,
    asianSettlementExplanation: asianSettlementExplanation({ line: candidate.line, direction: candidate.direction }),
    transferredCandidate: {
      fixture_id: analysis.fixture.fixtureId,
      analysis_mode: "specific",
      market_family: ASIAN_TOTAL_GOALS_FAMILY,
      direction: candidate.direction,
      line: candidate.line,
      selection: candidate.selection,
      preliminary_probability: candidate.estimated_probability,
      uncertainty: { low: candidate.uncertainty_low, high: candidate.uncertainty_high },
      sports_score: candidate.sports_score,
      technical_support_score: candidate.technical_support_score,
      sample_size_effective: candidate.sample_size_effective,
      methodology_version: candidate.methodology_version,
      asian_settlement_profile: candidate.asian_settlement_profile,
    },
  };
}

export async function buildJourneyValueRadar({ classicCandidates = [], analyses = [], gateway, now, oddsByFixture = null } = {}) {
  const classic = classicCandidates.filter((candidate) => candidate.activeQuote).map(classicOpportunity);
  const asian = [];
  if (typeof gateway?.loadFixtureOdds === "function") {
    for (const analysis of analyses) {
      const fixtureId = Number(analysis.fixture.fixtureId);
      let normalizedQuotes = oddsByFixture instanceof Map ? oddsByFixture.get(fixtureId) : null;
      if (!normalizedQuotes) {
        let raw;
        try {
          raw = await gateway.loadFixtureOdds(fixtureId);
        } catch {
          continue;
        }
        if (raw.status !== DATA_LOAD_STATUS.SUCCESS) continue;
        normalizedQuotes = normalizeProviderOdds({ response: raw.response, fixtureId, now, kickoff: analysis.fixture.date.utc }).quotes;
      }
      const quotes = normalizedQuotes
        .filter((quote) => quote.market_family === ASIAN_TOTAL_GOALS_FAMILY && quote.freshness === "fresh");
      for (const quote of quotes) {
        const direction = /^(under|menos)/i.test(quote.direction || quote.selection) ? "under" : "over";
        const exact = evaluateExactMarketLine({
          marketFamily: ASIAN_TOTAL_GOALS_FAMILY,
          direction,
          line: Number(quote.line),
          leagueProfile: analysis.leagueProfile,
          homeTeamProfile: analysis.homeTeamProfile,
          awayTeamProfile: analysis.awayTeamProfile,
          refereeProfile: analysis.refereeProfile,
        });
        if (!exact.candidate) continue;
        const ranked = rankMarketCandidates([exact.candidate], { quotes: [quote], preferredQuote: quote })[0];
        const candidate = asianJourneyCandidate(analysis, ranked, quote);
        asian.push({
          ...candidate,
          ...evaluateValueOpportunity({
            candidate: {
              fixture_id: fixtureId,
              market_family: ASIAN_TOTAL_GOALS_FAMILY,
              direction,
              line: Number(quote.line),
              estimated_probability: ranked.estimated_probability,
              uncertainty_low: ranked.uncertainty_low,
              uncertainty_high: ranked.uncertainty_high,
              sports_score: ranked.sports_score,
              technical_support_score: ranked.technical_support_score,
            },
            quote,
            asianSettlementProfile: ranked.asian_settlement_profile,
          }),
        });
      }
    }
  }
  const opportunities = rankValueOpportunities([...classic, ...asian]);
  return {
    contract: "AtlasValueRadarResult",
    version: 1,
    status: opportunities.length ? "available" : "not_evaluable",
    opportunities,
    exact_quotes_only: true,
    limitations: opportunities.length ? [] : ["No hay cuotas exactas vigentes para el universo deportivo analizado."],
  };
}
