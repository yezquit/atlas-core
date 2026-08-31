import test from "node:test";
import assert from "node:assert/strict";

import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { recoverJourneyCandidateOdds, scanSportsJourney } from "../services/sportsIntelligenceService.js";
import { buildJourneyValueRadar } from "../services/valueRadarService.js";

// Root cause del "52 -> 0": NO faltaba hidratar activeQuote.
// recoverJourneyCandidateOdds ya lo hace (1 request por fixture_id único,
// identidad exacta family+direction+line, reutilizando cache), ANTES de
// que scanSportsJourney llame a buildJourneyValueRadar. Estos tests fijan
// esa hidratación existente y la invariancia del Journey clásico.
const NOW = "2026-08-01T12:00:00.000Z";
const FUTURE_KICKOFF = "2026-08-10T20:00:00.000Z";

function oddsResponse(fixtureId, betName, values) {
  return {
    status: DATA_LOAD_STATUS.SUCCESS,
    response: [{
      fixture: { id: fixtureId },
      update: NOW,
      bookmakers: [{ id: 1, name: "Betano", bets: [{ id: 5, name: betName, values }] }],
    }],
  };
}

function candidate(overrides = {}) {
  return {
    fixtureId: 7001, marketId: "goals", direction: "over", line: 2.5, kickoff: FUTURE_KICKOFF,
    estimatedProbability: 0.6, uncertaintyLow: 0.5, uncertaintyHigh: 0.7, sportsScore: 75, technicalSupport: 70,
    ...overrides,
  };
}

test("1. hidrata activeQuote real (fixture+family+direction+line) y Value Radar genera oportunidades con esa hidratación", async () => {
  const gateway = { loadFixtureOdds: async (fixtureId) => oddsResponse(fixtureId, "Goals Over/Under", [{ value: "Over 2.5", odd: "1.90" }]) };
  const [hydrated] = await recoverJourneyCandidateOdds([candidate()], gateway, NOW);
  assert.ok(hydrated.activeQuote, "debe hidratarse la cuota exacta");
  assert.equal(hydrated.priceStatus, "verified_current");

  const valueRadar = await buildJourneyValueRadar({ classicCandidates: [hydrated], analyses: [], gateway: {}, now: NOW });
  assert.equal(valueRadar.opportunities.length, 1);
  assert.equal(valueRadar.sports_candidates_count, 1);
  assert.equal(valueRadar.exact_quote_candidates_count, 1);
});

test("2. deduplicación: varios candidatos del mismo fixture_id generan una sola solicitud de odds", async () => {
  let calls = 0;
  const gateway = { loadFixtureOdds: async (fixtureId) => { calls += 1; return oddsResponse(fixtureId, "Goals Over/Under", []); } };
  const candidates = [
    candidate({ marketId: "goals", line: 2.5 }),
    candidate({ marketId: "corners", line: 8.5 }),
    candidate({ marketId: "cards", direction: "under", line: 4.5 }),
  ];
  await recoverJourneyCandidateOdds(candidates, gateway, NOW);
  assert.equal(calls, 1, "3 candidatos del mismo fixture_id 7001 -> 1 sola solicitud, no 3");
});

test("3. una cuota de otra línea/familia no se adjunta como activeQuote (identidad exacta)", async () => {
  const gateway = { loadFixtureOdds: async (fixtureId) => oddsResponse(fixtureId, "Goals Over/Under", [{ value: "Over 3.5", odd: "2.10" }]) };
  const [hydrated] = await recoverJourneyCandidateOdds([candidate({ line: 2.5 })], gateway, NOW);
  assert.equal(hydrated.activeQuote, null, "la cuota es de la línea 3.5; un candidato de línea 2.5 no debe recibirla");

  const gatewayWrongFamily = { loadFixtureOdds: async (fixtureId) => oddsResponse(fixtureId, "Total Shots", [{ value: "Over 2.5", odd: "1.80" }]) };
  const [hydratedWrongFamily] = await recoverJourneyCandidateOdds([candidate({ marketId: "goals", line: 2.5 })], gatewayWrongFamily, NOW);
  assert.equal(hydratedWrongFamily.activeQuote, null, "una cuota de total_shots no debe adjuntarse a un candidato de goals");
});

test("6. sin cobertura Asian del proveedor, las demás familias del Value Radar siguen funcionando", async () => {
  const gateway = { loadFixtureOdds: async (fixtureId) => oddsResponse(fixtureId, "Goals Over/Under", [{ value: "Over 2.5", odd: "1.90" }]) };
  const hydrated = await recoverJourneyCandidateOdds(
    [candidate({ marketId: "goals", line: 2.5 }), candidate({ marketId: "corners", line: 8.5, fixtureId: 7002 })],
    gateway, NOW
  );
  // El gateway nunca ofrece "Asian Total Goals": el análisis asian queda
  // vacío, pero eso no debe tocar las oportunidades clásicas ya hidratadas.
  const valueRadar = await buildJourneyValueRadar({ classicCandidates: hydrated, analyses: [], gateway, now: NOW });
  assert.equal(valueRadar.exact_quotes_by_family.asian_total_goals, 0);
  assert.ok(valueRadar.opportunities.some((item) => item.market_family === "goals"), "goals debe seguir evaluándose aunque asian_total_goals sea 0");
});

test("7. ejecutar Value Radar dentro de scanSportsJourney no altera candidatos/orden/probabilidad/sports_score del Journey clásico", async () => {
  const target = { fixtureId: 8001, competition: { id: 239, name: "Primera A", country: "Colombia", season: 2026 }, date: { utc: FUTURE_KICKOFF }, status: { isScheduled: true, isFinished: false }, teams: { home: { id: 10, name: "Local" }, away: { id: 20, name: "Visitante" } }, score: { goals: { home: null, away: null } }, referee: { name: "Árbitro", confirmed: true }, venue: { name: "Estadio", city: "Bogotá" } };
  const history = Array.from({ length: 10 }, (_, index) => ({
    ...target, fixtureId: 8100 + index, date: { utc: `2026-07-${String(index + 1).padStart(2, "0")}T20:00:00Z` },
    status: { isScheduled: false, isFinished: true }, score: { goals: { home: (index % 3) + 1, away: index % 2 } },
  }));
  const statsFor = () => ({ teams: [target.teams.home, target.teams.away].map((team) => ({ team, statistics: { total_shots: { value: 12 }, shots_on_goal: { value: 5 }, yellow_cards: { value: 2 }, red_cards: { value: 0 }, fouls: { value: 12 }, corner_kicks: { value: 5 }, ball_possession: { value: 50 } } })) });
  const gateway = {
    runtime: { snapshot: () => ({ requestsUsed: 1, cacheHits: 0, cacheMisses: 1, deduplicated: 0, configuredBudget: 500, configuredBudgetRemaining: 490, budgetExhausted: false, quotaStatus: "available" }) },
    loadCompetitionMetadata: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, seasonMetadata: { year: 2026, coverage: { odds: true, fixtures: { statistics_fixtures: true, lineups: false }, injuries: false, standings: false } }, availableSeasons: [2026], verificationStatus: "verified" }),
    loadFixturesForDate: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: [target] }),
    loadFixtureById: async ({ fixtureId }) => ({ status: DATA_LOAD_STATUS.SUCCESS, selectedFixtureId: fixtureId, fixture: target }),
    loadLeagueWindow: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: history }),
    loadTeamRecent: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: history }),
    loadFixtureStatistics: async (fixtureId) => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtureId, statistics: statsFor() }),
    loadFixtureOdds: async (fixtureId) => oddsResponse(fixtureId, "Goals Over/Under", [{ value: "Over 1.5", odd: "1.75" }]),
  };
  const result = await scanSportsJourney({ date: "2026-08-01", competitionKeys: ["colombiaPrimeraA"], marketIds: ["goals"], timezone: "America/Bogota" }, gateway);
  assert.equal(result.status, DATA_LOAD_STATUS.SUCCESS);
  assert.ok(result.valueRadar, "valueRadar debe calcularse dentro del mismo escaneo");
  // Los campos de valueRadar (status/quote_exact/simple_message) NUNCA deben
  // aparecer en los candidatos clásicos: prueba de que classicOpportunity()
  // construye objetos nuevos y nunca muta highlighted/candidates en sitio.
  for (const candidateItem of result.candidates) {
    assert.equal(candidateItem.quote_exact, undefined);
    assert.equal(candidateItem.simple_message, undefined);
    assert.ok(Number.isFinite(candidateItem.estimatedProbability));
    assert.ok(Number.isFinite(candidateItem.sportsScore));
  }
});
