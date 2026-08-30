import test from "node:test";
import assert from "node:assert/strict";

import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { analyzeOperationalFixture } from "../services/operationalAnalysisService.js";

const NOW = "2026-08-01T12:00:00.000Z";

function fixture(id, home, away, homeId, awayId) {
  return {
    fixtureId: id,
    competition: { id: 239, name: "Primera A", country: "Colombia", season: 2026 },
    date: { utc: "2026-08-10T20:00:00.000Z" },
    status: { isScheduled: true, isFinished: false, long: "Programado" },
    teams: { home: { id: homeId, name: home }, away: { id: awayId, name: away } },
    score: { goals: { home: null, away: null }, aggregate: null },
    referee: { name: "Árbitro de prueba", confirmed: true },
    venue: { name: "Estadio de prueba", city: "Bogotá" },
  };
}

function statistics(item) {
  const offset = item?.stat_offset || 0;
  const index = Number(String(item?.fixtureId || 0).slice(-1));
  const perTeam = {
    total_shots: { value: 26 + offset + (index % 3) },
    shots_on_goal: { value: 9 + (offset ? 2 : 0) + (index % 2) },
    yellow_cards: { value: 2 + (index % 3) },
    red_cards: { value: 0 },
    fouls: { value: 11 + (index % 4) },
    corner_kicks: { value: 4 + (index % 4) },
    ball_possession: { value: 50 },
  };
  return { teams: [item.teams.home, item.teams.away].map((team) => ({ team, statistics: structuredClone(perTeam) })) };
}

function runtime() {
  return { snapshot: () => ({ requestsUsed: 0, cacheHits: 0, cacheMisses: 0, deduplicated: 0, configuredBudget: 2500, configuredBudgetRemaining: 2500, budgetExhausted: false, quotaStatus: "available" }) };
}

function metadata() {
  return {
    status: DATA_LOAD_STATUS.SUCCESS,
    seasonMetadata: { year: 2026, coverage: { odds: false, fixtures: { statistics_fixtures: true, lineups: false }, injuries: false, standings: false } },
    availableSeasons: [2026], verificationStatus: "verified",
  };
}

function exactGateway() {
  const target = fixture(72_001, "Liverpool", "Nottingham Forest", 301, 302);
  const history = Array.from({ length: 10 }, (_, index) => ({
    ...fixture(72_100 + index, "Liverpool", `Rival ${index}`, 301, 302),
    date: { utc: `2026-07-${String(index + 1).padStart(2, "0")}T20:00:00.000Z` },
    status: { isScheduled: false, isFinished: true, long: "Finalizado" },
    score: { goals: { home: 1 + (index % 4), away: index % 2 }, aggregate: null },
  }));
  const byId = new Map([...history, target].map((item) => [item.fixtureId, item]));
  return {
    runtime: runtime(), loadCompetitionMetadata: async () => metadata(),
    loadFixtureById: async ({ fixtureId }) => ({ status: DATA_LOAD_STATUS.SUCCESS, selectedFixtureId: fixtureId, fixture: byId.get(fixtureId) }),
    loadLeagueWindow: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: history }),
    loadTeamRecent: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: history }),
    loadFixtureStatistics: async (fixtureId) => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtureId, statistics: statistics(byId.get(fixtureId)) }),
    loadFixtureOdds: async () => ({ status: DATA_LOAD_STATUS.UNAVAILABLE, response: [] }),
  };
}

test("1. total_shots Under 25.5: el lado contrario (Over 25.5) es exactamente el complemento", async () => {
  const result = await analyzeOperationalFixture(
    { date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026, fixtureId: 72_001, marketId: "total_shots", analysisMode: "specific", line: "25.5", selection: "under", reanalysis: true, manualCandidateOdds: [], evaluatePrice: false },
    exactGateway(),
    { now: () => NOW, idFactory: () => "opp-1" }
  );
  const primary = result.marketSelection.primary;
  const opposite = result.director.opposite_market;
  assert.equal(primary.direction, "under");
  assert.equal(opposite.direction, "over");
  assert.equal(opposite.selection, "Más de 25.5");
  assert.ok(Math.abs(primary.estimated_probability + opposite.estimated_probability - 1) < 0.000001);
});

test("2. goals Over 2.5: el lado contrario (Under 2.5) es exactamente el complemento", async () => {
  const result = await analyzeOperationalFixture(
    { date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026, fixtureId: 72_001, marketId: "goals", analysisMode: "specific", line: "2.5", selection: "over", reanalysis: true, manualCandidateOdds: [], evaluatePrice: false },
    exactGateway(),
    { now: () => NOW, idFactory: () => "opp-2" }
  );
  const primary = result.marketSelection.primary;
  const opposite = result.director.opposite_market;
  assert.equal(primary.direction, "over");
  assert.equal(opposite.direction, "under");
  assert.equal(opposite.selection, "Menos de 2.5");
  assert.ok(Math.abs(primary.estimated_probability + opposite.estimated_probability - 1) < 0.000001);
});

test("3. una sola cuota (lado seleccionado): evalúa solo esa y, si el lado contrario es el preferido deportivamente, lo informa sin inventar su cuota", async () => {
  const result = await analyzeOperationalFixture(
    {
      date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026, fixtureId: 72_001,
      marketId: "total_shots", analysisMode: "specific", line: "25.5", selection: "under",
      reanalysis: true, manualCandidateOdds: [], evaluatePrice: true,
      manualOdds: { bookmaker: "Betano", marketFamily: "total_shots", direction: "under", selection: "Menos de 25.5", line: "25.5", decimalOdds: "1.82", consultedAt: NOW, timezone: "America/Bogota" },
    },
    exactGateway(),
    { now: () => NOW, idFactory: () => "opp-3" }
  );
  assert.equal(result.director.opposite_market.has_quote, false);
  assert.equal(result.director.opposite_market.price_assessment, null);
  assert.ok(Number.isFinite(result.director.price_assessment.price_gap_percentage_points));
  // El lado deportivamente preferido en este fixture es Over (complemento de una
  // probabilidad baja de Under); Atlas debe decirlo sin fabricar su cuota.
  assert.equal(result.director.side_comparison.sports_preferred_side, "over");
  assert.match(result.director.sports_price_conclusion, /Más de 25\.5/);
  assert.match(result.director.sports_price_conclusion, /no se introdujo una cuota/);
});

test("4. dos cuotas (seleccionada y contraria): Atlas compara ambos edges y separa preferencia deportiva de valoración económica", async () => {
  const result = await analyzeOperationalFixture(
    {
      date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026, fixtureId: 72_001,
      marketId: "total_shots", analysisMode: "specific", line: "25.5", selection: "under",
      reanalysis: true, manualCandidateOdds: [], evaluatePrice: true,
      manualOdds: { bookmaker: "Betano", marketFamily: "total_shots", direction: "under", selection: "Menos de 25.5", line: "25.5", decimalOdds: "1.82", consultedAt: NOW, timezone: "America/Bogota" },
      manualOppositeOdds: { bookmaker: "Betano", decimalOdds: "1.93", consultedAt: NOW, timezone: "America/Bogota" },
    },
    exactGateway(),
    { now: () => NOW, idFactory: () => "opp-4" }
  );
  assert.equal(result.director.opposite_market.has_quote, true);
  assert.ok(Number.isFinite(result.director.price_assessment.price_gap_percentage_points));
  assert.ok(Number.isFinite(result.director.opposite_market.price_assessment.price_gap_percentage_points));
  assert.notEqual(result.director.price_assessment.status, undefined);
  assert.notEqual(result.director.opposite_market.price_assessment.status, undefined);
  assert.ok(result.director.sports_price_conclusion?.length > 0);
});

test("5. actualizar la cuota (con o sin cuota contraria) conserva estimated_probability y sports_score", async () => {
  const baseInput = { date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026, fixtureId: 72_001, marketId: "corners", analysisMode: "specific", line: "10.5", selection: "over" };
  const before = await analyzeOperationalFixture({ ...baseInput, reanalysis: true, manualCandidateOdds: [], evaluatePrice: false }, exactGateway(), { now: () => NOW, idFactory: () => "opp-5-before" });
  const after = await analyzeOperationalFixture({
    ...baseInput, reanalysis: true, manualCandidateOdds: [], evaluatePrice: true,
    manualOdds: { bookmaker: "BetPlay", marketFamily: "corners", direction: "over", selection: "Más de 10.5", line: "10.5", decimalOdds: "1.75", consultedAt: NOW, timezone: "America/Bogota" },
    manualOppositeOdds: { bookmaker: "BetPlay", decimalOdds: "2.05", consultedAt: NOW, timezone: "America/Bogota" },
  }, exactGateway(), { now: () => NOW, idFactory: () => "opp-5-after" });
  for (const key of ["market_family", "direction", "line", "estimated_probability", "sports_score", "uncertainty_low", "uncertainty_high"]) {
    assert.equal(after.marketSelection.primary[key], before.marketSelection.primary[key]);
  }
  assert.equal(after.director.estimated_probability, before.director.estimated_probability);
  assert.equal(after.director.sports_verdict.sports_score, before.director.sports_verdict.sports_score);
});

test("6. la cuota contraria nunca sustituye la selección original (familia/dirección/línea)", async () => {
  const result = await analyzeOperationalFixture(
    {
      date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026, fixtureId: 72_001,
      marketId: "cards", analysisMode: "specific", line: "9.5", selection: "under",
      reanalysis: true, manualCandidateOdds: [], evaluatePrice: true,
      manualOdds: { bookmaker: "Betano", marketFamily: "cards", direction: "under", selection: "Menos de 9.5", line: "9.5", decimalOdds: "1.70", consultedAt: NOW, timezone: "America/Bogota" },
      manualOppositeOdds: { bookmaker: "Betano", decimalOdds: "2.10", consultedAt: NOW, timezone: "America/Bogota" },
    },
    exactGateway(),
    { now: () => NOW, idFactory: () => "opp-6" }
  );
  assert.equal(result.marketSelection.primary.market_family, "cards");
  assert.equal(result.marketSelection.primary.direction, "under");
  assert.equal(result.marketSelection.primary.line, 9.5);
  assert.equal(result.director.opposite_market.market_family, "cards");
  assert.equal(result.director.opposite_market.direction, "over");
  assert.equal(result.director.opposite_market.line, 9.5);
});

test("7. el contrato de lado contrario cubre goals, total_shots y una familia adicional (shots_on_goal)", async () => {
  for (const [marketId, line, selection] of [["goals", "2.5", "over"], ["total_shots", "25.5", "under"], ["shots_on_goal", "8.5", "over"]]) {
    const result = await analyzeOperationalFixture(
      { date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026, fixtureId: 72_001, marketId, analysisMode: "specific", line, selection, reanalysis: true, manualCandidateOdds: [], evaluatePrice: false },
      exactGateway(),
      { now: () => NOW, idFactory: () => `opp-7-${marketId}` }
    );
    const primary = result.marketSelection.primary;
    const opposite = result.director.opposite_market;
    assert.equal(opposite.market_family, marketId, `familia ${marketId}`);
    assert.notEqual(opposite.direction, primary.direction, `dirección contraria en ${marketId}`);
    assert.ok(Math.abs(primary.estimated_probability + opposite.estimated_probability - 1) < 0.000001, `complemento en ${marketId}`);
  }
});
