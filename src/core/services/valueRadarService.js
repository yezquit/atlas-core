import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { evaluateExactMarketLine } from "../intelligence/candidateLineGenerator.js";
import { rankMarketCandidates } from "../intelligence/marketCandidateRanker.js";
import { normalizeProviderOdds } from "../intelligence/oddsIntelligence.js";
import { ASIAN_TOTAL_GOALS_FAMILY, ASIAN_TOTAL_GOALS_LABEL, asianSettlementExplanation } from "../intelligence/asianTotalGoals.js";
import { evaluateValueOpportunity, rankValueOpportunities } from "../intelligence/valueRadar.js";

const VALUE_RADAR_FAMILIES = Object.freeze(["goals", "corners", "cards", "total_shots", "shots_on_goal", ASIAN_TOTAL_GOALS_FAMILY]);

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

  // Diagnóstico visible: distingue "no hay candidatos deportivos" de "hay
  // candidatos pero ninguno tiene cuota exacta" — nunca inventa un motivo,
  // solo cuenta lo que ya se calculó arriba. sports_candidates_count
  // refleja exactamente el universo clásico recibido (el mismo que "104
  // candidatos deportivos" del diagnóstico); exact_quote_candidates_count
  // son los que YA traían activeQuote (hidratado antes de llamar a esta
  // función, vía recoverJourneyCandidateOdds — no se recalcula aquí).
  const sportsCandidatesCount = classicCandidates.length;
  const exactQuoteCandidatesCount = classicCandidates.filter((candidate) => candidate.activeQuote).length;
  const exactQuotesByFamily = Object.fromEntries(VALUE_RADAR_FAMILIES.map((family) => [family, 0]));
  for (const opportunity of opportunities) {
    if (opportunity.quote_exact && exactQuotesByFamily[opportunity.market_family] !== undefined) {
      exactQuotesByFamily[opportunity.market_family] += 1;
    }
  }
  const message = sportsCandidatesCount === 0
    ? "Atlas no encontró candidatos deportivos para evaluar en esta jornada."
    : exactQuoteCandidatesCount === 0 && asian.length === 0
      ? `Atlas encontró ${sportsCandidatesCount} candidatos deportivos, pero ninguno tiene una cuota exacta disponible para evaluar valor en este momento.`
      : `${exactQuoteCandidatesCount} de ${sportsCandidatesCount} candidatos tienen precio exacto disponible.`;

  return {
    contract: "AtlasValueRadarResult",
    version: 2,
    status: opportunities.length ? "available" : "not_evaluable",
    opportunities,
    exact_quotes_only: true,
    sports_candidates_count: sportsCandidatesCount,
    exact_quote_candidates_count: exactQuoteCandidatesCount,
    evaluated_opportunities_count: opportunities.length,
    exact_quotes_by_family: exactQuotesByFamily,
    message,
    limitations: opportunities.length ? [] : [message],
  };
}
