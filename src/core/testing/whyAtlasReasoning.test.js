import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { analyzeOperationalFixture } from "../services/operationalAnalysisService.js";

// "¿POR QUÉ ATLAS LLEGA A ESTA CONCLUSIÓN?" (atlas-functional-client.js:
// buildAtlasReasoningBullets/WhyAtlasReasoning) es presentación pura: solo
// reordena simple_sports_reasons y market_model_audit.distribution_center,
// ya calculados por marketCandidateRanker/candidateLineGenerator. Estos
// tests verifican que esa evidencia sea real (no un texto genérico
// inventado) y que construirla no toca estimated_probability, sports_score
// ni la selección.
const clientPath = new URL("../../app/atlas-functional-client.js", import.meta.url);
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

test("1. total_shots: los motivos son evidencia real (equipos, muestras y porcentajes existentes), no texto genérico", async () => {
  const result = await analyzeOperationalFixture(
    { date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026, fixtureId: 72_001, marketId: "total_shots", analysisMode: "specific", line: "25.5", selection: "over", reanalysis: true, manualCandidateOdds: [], evaluatePrice: false },
    exactGateway(),
    { now: () => NOW, idFactory: () => "why-1" }
  );
  const reasons = result.marketSelection.primary.simple_sports_reasons;
  assert.ok(Array.isArray(reasons) && reasons.length > 0, "debe existir al menos un motivo real");
  assert.ok(reasons.some((reason) => reason.includes("Liverpool")), "el motivo debe nombrar al equipo real de la muestra");
  assert.ok(reasons.some((reason) => /\d+ de \d+ partidos \(\d+(\.\d+)?%\)/.test(reason)), "debe incluir el hit-rate real de la línea (X de Y partidos, Z%)");
  assert.ok(Number.isFinite(result.marketSelection.primary.market_model_audit?.distribution_center), "distribution_center ya calculado debe estar disponible para total_shots");
});

test("2. goals: los motivos son evidencia real (equipos, muestras y porcentajes existentes), no texto genérico", async () => {
  const result = await analyzeOperationalFixture(
    { date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026, fixtureId: 72_001, marketId: "goals", analysisMode: "specific", line: "2.5", selection: "over", reanalysis: true, manualCandidateOdds: [], evaluatePrice: false },
    exactGateway(),
    { now: () => NOW, idFactory: () => "why-2" }
  );
  const reasons = result.marketSelection.primary.simple_sports_reasons;
  assert.ok(Array.isArray(reasons) && reasons.length > 0, "debe existir al menos un motivo real");
  assert.ok(reasons.some((reason) => reason.includes("Liverpool") || reason.includes("Nottingham Forest")), "el motivo debe nombrar a un equipo real de la muestra");
  assert.ok(reasons.some((reason) => /\d+ de \d+ partidos \(\d+(\.\d+)?%\)/.test(reason)), "debe incluir el hit-rate real de la línea (X de Y partidos, Z%)");
});

test("3. sin motivos ni distribución disponibles, la sección no inventa texto genérico", async () => {
  const source = await readFile(clientPath, "utf8");
  const fnMatch = source.match(/function buildAtlasReasoningBullets\([\s\S]*?\n}\n/);
  assert.ok(fnMatch, "buildAtlasReasoningBullets debe existir");
  const fnBody = fnMatch[0];
  // Solo reordena datos ya calculados: no hay ninguna cadena de relleno tipo
  // "ATLAS no dispone de..." dentro de esta función.
  assert.doesNotMatch(fnBody, /no dispone de evidencia|texto genérico|placeholder/i);
  assert.match(fnBody, /simple_sports_reasons/);
  assert.match(fnBody, /distribution_center/);
  // WhyAtlasReasoning no renderiza nada si no hay bullets reales.
  assert.match(source, /function WhyAtlasReasoning[\s\S]*?if \(!bullets\.length\) return null;/);
});

test("4. construir los motivos no altera estimated_probability, sports_score ni la selección del candidato", async () => {
  const before = await analyzeOperationalFixture(
    { date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026, fixtureId: 72_001, marketId: "corners", analysisMode: "specific", line: "10.5", selection: "over", reanalysis: true, manualCandidateOdds: [], evaluatePrice: false },
    exactGateway(),
    { now: () => NOW, idFactory: () => "why-4-before" }
  );
  const after = await analyzeOperationalFixture(
    { date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026, fixtureId: 72_001, marketId: "corners", analysisMode: "specific", line: "10.5", selection: "over", reanalysis: true, manualCandidateOdds: [], evaluatePrice: false },
    exactGateway(),
    { now: () => NOW, idFactory: () => "why-4-after" }
  );
  for (const key of ["market_family", "direction", "line", "selection", "estimated_probability", "sports_score"]) {
    assert.equal(after.marketSelection.primary[key], before.marketSelection.primary[key]);
  }
  assert.deepEqual(after.marketSelection.primary.simple_sports_reasons, before.marketSelection.primary.simple_sports_reasons);

  // buildAtlasReasoningBullets es de solo lectura: nunca reasigna campos del
  // candidato (no hay "candidate.<campo> =" en su cuerpo).
  const source = await readFile(clientPath, "utf8");
  const fnBody = source.match(/function buildAtlasReasoningBullets\([\s\S]*?\n}\n/)[0];
  assert.doesNotMatch(fnBody, /candidate\.[a-zA-Z_]+\s*=[^=]/);
});
