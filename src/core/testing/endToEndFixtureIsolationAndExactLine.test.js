import test from "node:test";
import assert from "node:assert/strict";

import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { analyzeOperationalFixture } from "../services/operationalAnalysisService.js";
import { scanSportsJourney } from "../services/sportsIntelligenceService.js";

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

function historyFor({ prefix, home, homeId, awayId, goals }) {
  return Array.from({ length: 10 }, (_, index) => ({
    ...fixture(60_000 + (prefix === "A" ? 0 : 100) + index, home, `${prefix} Rival ${index}`, homeId, awayId),
    date: { utc: `2026-07-${String(index + 1).padStart(2, "0")}T20:00:00.000Z` },
    status: { isScheduled: false, isFinished: true, long: "Finalizado" },
    score: { goals: { home: goals[index], away: 0 }, aggregate: null },
    evidence_marker: `EVIDENCIA_${prefix}`,
    stat_offset: prefix === "A" ? 0 : 7,
  }));
}

function statistics(item) {
  const offset = item?.stat_offset || 0;
  const index = Number(String(item?.fixtureId || 0).slice(-1));
  const perTeam = {
    total_shots: { value: 12 + offset + (index % 3) },
    shots_on_goal: { value: 5 + (offset ? 2 : 0) + (index % 2) },
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

test("Jornada conserva objeto, muestras y evidencia propios de cada fixture", async () => {
  const fixtureA = fixture(71_001, "A1", "A2", 101, 102);
  const fixtureB = fixture(71_002, "B1", "B2", 201, 202);
  const historyA = historyFor({ prefix: "A", home: "A1", homeId: 101, awayId: 102, goals: [4, 4, 3, 4, 3, 4, 3, 4, 3, 4] });
  const historyB = historyFor({ prefix: "B", home: "B1", homeId: 201, awayId: 202, goals: [3, 2, 3, 2, 3, 3, 2, 3, 2, 3] });
  const allHistory = [...historyA, ...historyB];
  const byId = new Map([...allHistory, fixtureA, fixtureB].map((item) => [item.fixtureId, item]));
  const gateway = {
    runtime: runtime(), loadCompetitionMetadata: async () => metadata(),
    loadFixturesForDate: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: [fixtureA, fixtureB] }),
    loadFixtureById: async ({ fixtureId }) => ({ status: DATA_LOAD_STATUS.SUCCESS, selectedFixtureId: fixtureId, fixture: byId.get(fixtureId) }),
    loadLeagueWindow: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: allHistory }),
    loadTeamRecent: async ({ teamId }) => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: Number(teamId) === 101 || Number(teamId) === 102 ? historyA : historyB }),
    loadFixtureStatistics: async (fixtureId) => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtureId, statistics: statistics(byId.get(fixtureId)) }),
    loadFixtureOdds: async () => ({ status: DATA_LOAD_STATUS.UNAVAILABLE, response: [] }),
  };
  const result = await scanSportsJourney({ date: "2026-08-01", timezone: "America/Bogota", competitionKeys: ["colombiaPrimeraA"], marketIds: ["goals"], analysisMode: "specific" }, gateway);
  const a = result.candidates.find((candidate) => candidate.fixtureId === 71_001 && candidate.marketId === "goals" && candidate.direction === "over" && candidate.line === 2.5);
  const b = result.candidates.find((candidate) => candidate.fixtureId === 71_002 && candidate.marketId === "goals" && candidate.direction === "over" && candidate.line === 2.5);
  assert.ok(a && b, "ambos fixtures deben conservar el mismo candidato de línea para detectar colisiones de identidad");
  const aText = JSON.stringify(a);
  const bText = JSON.stringify(b);
  assert.match(aText, /A1|EVIDENCIA_A/);
  assert.match(bText, /B1|EVIDENCIA_B/);
  assert.doesNotMatch(aText, /B1|EVIDENCIA_B/);
  assert.doesNotMatch(bText, /A1|EVIDENCIA_A/);
  assert.notEqual(a.estimatedProbability, b.estimatedProbability, "la métrica de B debe provenir de su propia muestra");
  assert.notDeepEqual(a.fixtureEvidence, b.fixtureEvidence);
});

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

for (const [marketId, line] of [["goals", "6.5"], ["corners", "15.5"], ["cards", "9.5"], ["total_shots", "28.5"], ["shots_on_goal", "20.5"]]) {
  test(`línea manual ${marketId} ${line} recorre el servicio operativo y queda lista para precio`, async () => {
    const result = await analyzeOperationalFixture({ date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026, fixtureId: 72_001, marketId, analysisMode: "specific", line, selection: "over", reanalysis: true, manualCandidateOdds: [], evaluatePrice: false }, exactGateway(), { now: () => NOW, idFactory: () => `exact-${marketId}` });
    const primary = result.marketSelection.primary;
    assert.ok(primary, `${result.status}:${result.errorCode || "no_error"}:${result.marketSelection?.explanation || "no_selection"}`);
    assert.equal(result.selectedFixtureId, 72_001);
    assert.equal(primary.market_family, marketId);
    assert.equal(primary.direction, "over");
    assert.equal(primary.line, Number(line));
    assert.ok(Number.isFinite(primary.estimated_probability));
    assert.ok(Number.isFinite(primary.uncertainty_low) && Number.isFinite(primary.uncertainty_high));
    assert.ok(Number.isFinite(primary.sports_score));
    assert.equal(primary.ready_for_pricing, true);
    assert.equal(result.marketSelection.ready_for_pricing, true);
    assert.equal(result.director.price_pending, true);
  });
}

test("la cuota exacta solo agrega evaluación económica a la tesis manual", async () => {
  const baseInput = { date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026, fixtureId: 72_001, marketId: "total_shots", analysisMode: "specific", line: "28.5", selection: "over", reanalysis: true, manualCandidateOdds: [], evaluatePrice: false };
  const before = await analyzeOperationalFixture(baseInput, exactGateway(), { now: () => NOW, idFactory: () => "exact-before" });
  const after = await analyzeOperationalFixture({ ...baseInput, evaluatePrice: true, manualOdds: { bookmaker: "BetPlay", marketFamily: "total_shots", direction: "over", selection: "Más de 28.5", line: "28.5", decimalOdds: "1.85", consultedAt: NOW, timezone: "America/Bogota" } }, exactGateway(), { now: () => NOW, idFactory: () => "exact-after" });
  for (const key of ["market_family", "direction", "line", "estimated_probability", "sports_score", "uncertainty_low", "uncertainty_high", "technical_support_score"]) assert.equal(after.marketSelection.primary[key], before.marketSelection.primary[key]);
  assert.equal(after.selectedOdds.decimal_odds, 1.85);
});

test("Analyze Match / Analizar Partido exact-line pricing flow conserva la tesis después de Gemini", async () => {
  const input = { date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026, fixtureId: 72_001, marketId: "corners", analysisMode: "specific", line: "10.5", selection: "over", manualCandidateOdds: [], evaluatePrice: false };
  const initial = await analyzeOperationalFixture(input, exactGateway(), { now: () => NOW, idFactory: () => "analyze-match-initial" });
  const afterGemini = await analyzeOperationalFixture({ ...input, reanalysis: true, geminiContext: { valid_for_reanalysis: true, selected_items: [], items: [] } }, exactGateway(), { now: () => NOW, idFactory: () => "analyze-match-gemini", previousVersion: initial.analysisVersion });
  assert.equal(afterGemini.exactSelection.fixture_id, 72_001);
  assert.equal(afterGemini.exactSelection.market_family, "corners");
  assert.equal(afterGemini.exactSelection.direction, "over");
  assert.equal(afterGemini.exactSelection.line, 10.5);
  assert.ok(Number.isFinite(afterGemini.exactSelection.estimated_probability));
  assert.equal(afterGemini.exactSelection.ready_for_pricing, true);
  assert.equal(afterGemini.marketSelection.primary.line, initial.marketSelection.primary.line);
  assert.equal(afterGemini.marketSelection.primary.estimated_probability, initial.marketSelection.primary.estimated_probability);
});

test("cuota 1.98 se aplica a corners 10.5 sin alterar la tesis deportiva", async () => {
  const input = { date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026, fixtureId: 72_001, marketId: "corners", analysisMode: "specific", line: "10.5", selection: "over", reanalysis: true, manualCandidateOdds: [], evaluatePrice: false };
  const before = await analyzeOperationalFixture(input, exactGateway(), { now: () => NOW, idFactory: () => "corners-before" });
  const after = await analyzeOperationalFixture({ ...input, evaluatePrice: true, manualOdds: { bookmaker: "Betano", marketFamily: "corners", direction: "over", selection: "Más de 10.5", line: "10.5", decimalOdds: "1.98", consultedAt: NOW, timezone: "America/Bogota" } }, exactGateway(), { now: () => NOW, idFactory: () => "corners-quote" });
  assert.equal(after.selectedOdds.decimal_odds, 1.98);
  assert.ok(Math.abs(after.selectedOdds.implied_probability - (1 / 1.98)) < 0.000001);
  assert.ok(after.suitability.price_evaluation);
  for (const key of ["line", "estimated_probability", "sports_score", "uncertainty_low", "uncertainty_high", "technical_support_score"]) assert.equal(after.marketSelection.primary[key], before.marketSelection.primary[key]);
});

test("Analizar Partido conserva probabilidades complementarias entre Over y Under de la misma línea", async () => {
  const base = { date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026, fixtureId: 72_001, marketId: "corners", analysisMode: "specific", line: "10.5", reanalysis: true, manualCandidateOdds: [], evaluatePrice: false };
  const over = await analyzeOperationalFixture({ ...base, selection: "over" }, exactGateway(), { now: () => NOW, idFactory: () => "corners-over" });
  const under = await analyzeOperationalFixture({ ...base, selection: "under" }, exactGateway(), { now: () => NOW, idFactory: () => "corners-under" });
  assert.ok(Math.abs(over.exactSelection.estimated_probability + under.exactSelection.estimated_probability - 1) < 0.000001);
  assert.equal(over.director.probability_effective_sample, under.director.probability_effective_sample);
  assert.equal(over.director.side_comparison.complementary_sum, 1);
});

test("la auditoría de conteo expone señales de ambos ataques sin sumarlas como total", async () => {
  const result = await analyzeOperationalFixture({ date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026, fixtureId: 72_001, marketId: "corners", analysisMode: "specific", line: "10.5", selection: "under", reanalysis: true, manualCandidateOdds: [], evaluatePrice: false }, exactGateway(), { now: () => NOW, idFactory: () => "corners-audit" });
  const audit = result.marketSelection.primary.market_model_audit;
  assert.equal(audit.market_family, "corners");
  assert.ok("home_for" in audit && "away_against" in audit && "away_for" in audit && "home_against" in audit);
  assert.ok(Number.isFinite(audit.expected_home_component));
  assert.ok(Number.isFinite(audit.expected_away_component));
  assert.ok(Number.isFinite(audit.expected_total));
  assert.ok(Number.isFinite(audit.distribution_center));
  assert.ok(audit.source_weights.length >= 3);
});

test("las cuotas no cambian la lectura deportiva de Over ni Under 10.5", async () => {
  const base = { date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026, fixtureId: 72_001, marketId: "corners", analysisMode: "specific", line: "10.5", reanalysis: true, manualCandidateOdds: [] };
  for (const direction of ["over", "under"]) {
    const sport = await analyzeOperationalFixture({ ...base, selection: direction, evaluatePrice: false }, exactGateway(), { now: () => NOW, idFactory: () => `${direction}-sport` });
    for (const decimalOdds of ["1.30", "1.78", "2.50"]) {
      const priced = await analyzeOperationalFixture({ ...base, selection: direction, evaluatePrice: true, manualOdds: { bookmaker: "Betano", marketFamily: "corners", direction, selection: `${direction} 10.5`, line: "10.5", decimalOdds, consultedAt: NOW, timezone: "America/Bogota" } }, exactGateway(), { now: () => NOW, idFactory: () => `${direction}-${decimalOdds}` });
      for (const key of ["estimated_probability", "sports_score", "uncertainty_low", "uncertainty_high", "technical_support_score"]) assert.equal(priced.marketSelection.primary[key], sport.marketSelection.primary[key]);
      assert.equal(priced.director.side_comparison.sports_preferred_side, sport.director.side_comparison.sports_preferred_side);
      assert.equal(priced.selectedOdds.decimal_odds, Number(decimalOdds));
    }
  }
});

test("evidencia de tiros a puerta queda como contexto general, no como tesis de córners", async () => {
  const geminiContext = { valid_for_reanalysis: true, items: [{ id: "shots-only", selected: true, kind: "confirmed", impact: "favorable", summary: "Everton intentó diez tiros al arco.", text: "Everton intentó diez tiros al arco.", affected_markets: ["shots_on_goal"], verification_status: "user_reported" }] };
  const result = await analyzeOperationalFixture({ date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026, fixtureId: 72_001, marketId: "corners", analysisMode: "specific", line: "10.5", selection: "under", reanalysis: true, geminiContext, manualCandidateOdds: [], evaluatePrice: false }, exactGateway(), { now: () => NOW, idFactory: () => "corners-gemini-gate" });
  assert.deepEqual(result.gemini.applied_items, []);
  assert.equal(result.gemini.summary.favorable.length, 0);
  assert.equal(result.gemini.general_context_items.length, 1);
  assert.doesNotMatch(result.director.supporting_evidence.join(" "), /tiros al arco/i);
});

test("una familia sin muestra informa una causa auditable de línea exacta unavailable", async () => {
  const gateway = exactGateway();
  gateway.loadFixtureStatistics = async (fixtureId) => ({
    status: DATA_LOAD_STATUS.SUCCESS,
    fixtureId,
    statistics: { teams: [{ team: { id: 301, name: "Liverpool" }, statistics: { yellow_cards: { value: 2 } } }, { team: { id: 302, name: "Nottingham Forest" }, statistics: { yellow_cards: { value: 2 } } }] },
  });
  const result = await analyzeOperationalFixture({ date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026, fixtureId: 72_001, marketId: "total_shots", analysisMode: "specific", line: "28.5", selection: "over", reanalysis: true, manualCandidateOdds: [] }, gateway, { now: () => NOW, idFactory: () => "missing-shots" });
  assert.equal(result.marketSelection.primary, null);
  assert.match(result.marketSelection.unavailable_reason, /^missing_(home|away|league)_total_shots_sample$|^distribution_unavailable$/);
  assert.equal(result.marketSelection.ready_for_pricing, false);
});
