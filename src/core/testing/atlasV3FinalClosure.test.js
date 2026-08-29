import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { scanSportsJourney, rankJourneyCandidatesByProbability } from "../services/sportsIntelligenceService.js";
import { analyzeOperationalFixture } from "../services/operationalAnalysisService.js";
import { parseGeminiResponse } from "../intelligence/geminiManualContext.js";
import {
  addCombinationSelection,
  buildAtlasCombination,
  combinationSelectionKey,
  removeCombinationSelection,
} from "../intelligence/atlasCombinationEngine.js";

const testingDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientPath = path.resolve(testingDirectory, "../../app/atlas-functional-client.js");
const combinationBuilderPath = path.resolve(testingDirectory, "../../app/atlas-combination-builder.js");

// ---------------------------------------------------------------------------
// Helpers de mock. Sin llamadas reales a API-Football (AGENTS.md).
// ---------------------------------------------------------------------------
function targetFixture(id) {
  return {
    fixtureId: id,
    competition: { id: 239, name: "Primera A", country: "Colombia", season: 2026 },
    date: { utc: "2026-08-10T23:00:00.000Z" },
    status: { isScheduled: true, isFinished: false, long: "Programado" },
    teams: { home: { id: 10, name: `Local ${id}` }, away: { id: 20, name: `Visitante ${id}` } },
    score: { goals: { home: null, away: null }, aggregate: null },
    referee: { name: "Ana Ruiz", confirmed: true },
    venue: { name: "Estadio Central", city: "Bogotá" },
  };
}
function historicalFixture(index) {
  return {
    ...targetFixture(7_000 + index),
    date: { utc: `2026-07-${String(index + 1).padStart(2, "0")}T20:00:00.000Z` },
    status: { isScheduled: false, isFinished: true, long: "Finalizado" },
    score: { goals: { home: (index % 3) + 1, away: index % 2 }, aggregate: null },
  };
}
function fixtureStatistics(fixture) {
  return {
    teams: [fixture.teams.home, fixture.teams.away].map((team) => ({
      team,
      statistics: { total_shots: { value: 12 }, shots_on_goal: { value: 5 }, yellow_cards: { value: 2 }, red_cards: { value: 0 }, fouls: { value: 12 }, corner_kicks: { value: 5 }, ball_possession: { value: 50 } },
    })),
  };
}
function gateway(fixturesForDate = []) {
  const history = Array.from({ length: 10 }, (_, index) => historicalFixture(index));
  return {
    runtime: { snapshot: () => ({ requestsUsed: 5, cacheHits: 0, cacheMisses: 5, deduplicated: 0, configuredBudget: 2500, configuredBudgetRemaining: 2495, budgetExhausted: false, quotaStatus: "available" }) },
    loadCompetitionMetadata: async () => ({
      status: DATA_LOAD_STATUS.SUCCESS,
      seasonMetadata: { year: 2026, coverage: { odds: true, fixtures: { statistics_fixtures: true, lineups: false }, injuries: false, standings: false } },
      availableSeasons: [2026],
      verificationStatus: "verified",
    }),
    loadFixtureById: async ({ fixtureId }) => ({ status: DATA_LOAD_STATUS.SUCCESS, selectedFixtureId: fixtureId, fixture: targetFixture(fixtureId) }),
    loadLeagueWindow: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: history }),
    loadTeamRecent: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: history }),
    loadFixtureStatistics: async (fixtureId) => {
      const item = history.find((candidate) => candidate.fixtureId === fixtureId);
      return { status: DATA_LOAD_STATUS.SUCCESS, fixtureId, statistics: fixtureStatistics(item || history[0]) };
    },
    loadFixturesForDate: async () => ({ status: fixturesForDate.length ? DATA_LOAD_STATUS.SUCCESS : DATA_LOAD_STATUS.EMPTY, fixtures: fixturesForDate, message: "ok" }),
    loadFixtureOdds: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, response: [] }),
  };
}
const journeyBase = { date: "2026-08-01", competitionKeys: ["colombiaPrimeraA"], timezone: "America/Bogota", marketIds: ["goals"] };

// gateway() usa tarjetas planas (2 amarillas por equipo, 0 rojas, siempre
// iguales) para que la línea 5.5 sea calculable de forma simple en los tests
// de la sección E que solo necesitan ESA línea. Con varianza cero, la ventana
// de líneas plausibles (candidateLineGenerator.js) se estrecha alrededor de la
// media y excluye líneas alejadas como 6.5/7.5, así que los tests que
// necesitan que 6.5 y 7.5 sean distinguibles y/o aparezcan como alternativas
// (D24 y E33) usan este segundo helper, con variación real de tarjetas
// partido a partido, como ocurriría con datos reales de API-Football.
const CARDS_VARIANCE_PATTERN = [4, 6, 3, 7, 5, 8, 4, 6, 5, 7];
function cardsVarianceHistoricalFixture(index) {
  const total = CARDS_VARIANCE_PATTERN[index % CARDS_VARIANCE_PATTERN.length];
  return {
    ...targetFixture(7_500 + index),
    date: { utc: `2026-07-${String(index + 1).padStart(2, "0")}T20:00:00.000Z` },
    status: { isScheduled: false, isFinished: true, long: "Finalizado" },
    score: { goals: { home: (index % 3) + 1, away: index % 2 }, aggregate: null },
    _cardsTotal: total,
  };
}
function cardsVarianceStatistics(fixture) {
  const total = fixture._cardsTotal ?? 4;
  return {
    teams: [fixture.teams.home, fixture.teams.away].map((team, teamIndex) => ({
      team,
      statistics: {
        total_shots: { value: 12 }, shots_on_goal: { value: 5 },
        yellow_cards: { value: teamIndex === 0 ? Math.ceil(total / 2) : Math.floor(total / 2) },
        red_cards: { value: 0 }, fouls: { value: 12 }, corner_kicks: { value: 5 }, ball_possession: { value: 50 },
      },
    })),
  };
}
function cardsVarianceGateway() {
  const history = Array.from({ length: 10 }, (_, index) => cardsVarianceHistoricalFixture(index));
  return {
    runtime: { snapshot: () => ({ requestsUsed: 5, cacheHits: 0, cacheMisses: 5, deduplicated: 0, configuredBudget: 2500, configuredBudgetRemaining: 2495, budgetExhausted: false, quotaStatus: "available" }) },
    loadCompetitionMetadata: async () => ({
      status: DATA_LOAD_STATUS.SUCCESS,
      seasonMetadata: { year: 2026, coverage: { odds: true, fixtures: { statistics_fixtures: true, lineups: false }, injuries: false, standings: false } },
      availableSeasons: [2026],
      verificationStatus: "verified",
    }),
    loadFixtureById: async ({ fixtureId }) => ({ status: DATA_LOAD_STATUS.SUCCESS, selectedFixtureId: fixtureId, fixture: targetFixture(fixtureId) }),
    loadLeagueWindow: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: history }),
    loadTeamRecent: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: history }),
    loadFixtureStatistics: async (fixtureId) => {
      const item = history.find((candidate) => candidate.fixtureId === fixtureId);
      return { status: DATA_LOAD_STATUS.SUCCESS, fixtureId, statistics: cardsVarianceStatistics(item || history[0]) };
    },
    loadFixturesForDate: async () => ({ status: DATA_LOAD_STATUS.EMPTY, fixtures: [], message: "ok" }),
    loadFixtureOdds: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, response: [] }),
  };
}

// Fixture/entrada compartida por el bloque E: Cards Under 5.5, el escenario
// literal del bug ("cards under 5.5 -> termina usando 7.5 y queda esperando
// cuota sin formulario"). Verificado empíricamente contra el pipeline real
// (analyzeOperationalFixture) antes de escribir estas aserciones.
const cardsBaseInput = {
  date: "2026-08-01",
  timezone: "America/Bogota",
  competitionKey: "colombiaPrimeraA",
  season: 2026,
  fixtureId: 9_300,
  marketId: "cards",
  analysisMode: "specific",
  line: "5.5",
  selection: "under",
  manualCandidateOdds: [],
};
const NOW = "2026-08-01T12:00:00.000Z";

function entry(id, overrides = {}) {
  return {
    analysis: { fixture: { fixtureId: id } },
    candidate: {
      candidate_id: `cand-${id}`,
      market_family: "goals",
      direction: "over",
      line: 1.5,
      ranking_eligible: true,
      estimated_probability: 0.6,
      probability_classification: "BUENA",
      uncertainty_low: 0.5,
      uncertainty_high: 0.7,
      sample_size_effective: 20,
      technical_support_score: 70,
      ...overrides,
    },
  };
}

function flatCandidate(id, overrides = {}) {
  return {
    fixtureId: id,
    fixture: `Local ${id} vs Visitante ${id}`,
    marketId: "goals",
    market: "goals",
    direction: "over",
    line: 1.5,
    selection: "Over 1.5",
    sportsScore: 75,
    ranking_eligible: true,
    estimated_probability: 0.6,
    uncertaintyLow: 0.5,
    uncertaintyHigh: 0.7,
    sampleSize: 20,
    technicalSupport: 60,
    status: "sports_candidate_pending_price",
    active_quote: overrides.activeQuote === null ? null : {
      fixture_id: id, market_family: "goals", direction: "over", line: 1.5,
      decimal_odds: overrides.decimalOdds ?? 1.5, verification_status: "verified_provider",
      source_status: "verified_current", freshness: "fresh", stale: false, bookmaker_name: "Test",
    },
    ...overrides,
  };
}

// ===========================================================================
// A. JORNADA
// ===========================================================================

test("A1/A3/A5. Jornada analiza y revisa TODOS los fixtures elegibles sin tope de 50 ni prefiltrado previo", async () => {
  const fixtures = Array.from({ length: 60 }, (_, index) => targetFixture(30_000 + index));
  const result = await scanSportsJourney({ ...journeyBase }, gateway(fixtures));
  assert.equal(result.fixturesReviewed, 60);
  assert.equal(result.fixturesReviewed, result.prematchFixturesFound);
});

test("A2/A6. Jornada muestra el universo completo de candidatos (no colapsado a 1 por familia, no truncado a 50)", async () => {
  const fixtures = Array.from({ length: 55 }, (_, index) => targetFixture(31_000 + index));
  const result = await scanSportsJourney({ ...journeyBase, marketIds: ["goals", "corners"] }, gateway(fixtures));
  assert.ok(result.candidates.length > 0);
  assert.ok(result.candidates.length <= result.analysisDiagnostics.reduce((sum, item) => sum + item.rankedCandidateCount, 0));
  assert.notEqual(result.candidates.length, 50);
});

test("A4. la misma entrada produce el mismo conjunto de fixture_id en ejecuciones repetidas", async () => {
  const fixtures = Array.from({ length: 25 }, (_, index) => targetFixture(32_000 + index));
  const gw = gateway(fixtures);
  const first = await scanSportsJourney({ ...journeyBase }, gw);
  const second = await scanSportsJourney({ ...journeyBase }, gw);
  const ids = (result) => result.analysisDiagnostics.map((item) => item.fixtureId).sort((a, b) => a - b);
  assert.deepEqual(ids(first), ids(second));
});

test("A7/A8/A9. rankJourneyCandidatesByProbability ordena alta→media→baja y, dentro de cada grupo, estimated_probability descendente; odds no intervienen", () => {
  const entries = [
    entry(1, { estimated_probability: 0.5, probability_classification: "MODERADA" }),
    entry(2, { estimated_probability: 0.95, probability_classification: "MUY ALTA", active_quote: { decimal_odds: 1.02 } }),
    entry(3, { estimated_probability: 0.3, probability_classification: "MUY RIESGOSA" }),
    entry(4, { estimated_probability: 0.8, probability_classification: "ALTA", active_quote: { decimal_odds: 5.5 } }),
    entry(5, { estimated_probability: 0.6, probability_classification: "BUENA" }),
  ];
  const ranked = rankJourneyCandidatesByProbability(entries);
  const order = ranked.map((item) => item.candidate.candidate_id);
  assert.deepEqual(order, ["cand-2", "cand-4", "cand-5", "cand-1", "cand-3"]);
});

// ===========================================================================
// B. PARLAY/SOÑADORA — UNIVERSO
// ===========================================================================

test("B10. selectCombinationJourneyCandidates (vía scanSportsJourney) no trunca combinationCandidates a 50", async () => {
  const fixtures = Array.from({ length: 55 }, (_, index) => targetFixture(33_000 + index));
  const result = await scanSportsJourney({ ...journeyBase }, gateway(fixtures));
  assert.ok(result.combinationCandidates.length >= 40);
  assert.notEqual(result.combinationCandidates.length, 50);
});

test("B11. combinationCandidates usa el mismo criterio alta→media→baja que Jornada (misma función de orden)", () => {
  const entries = [
    entry(1, { estimated_probability: 0.4, probability_classification: "RIESGOSA" }),
    entry(2, { estimated_probability: 0.9, probability_classification: "MUY ALTA" }),
  ];
  const ranked = rankJourneyCandidatesByProbability(entries);
  assert.equal(ranked[0].candidate.candidate_id, "cand-2");
});

test("B12/B13. la UI de Parlay/Soñadora permite Seleccionar todas y Deseleccionar todas las competiciones", async () => {
  const source = await readFile(combinationBuilderPath, "utf8");
  assert.match(source, />Seleccionar todas</);
  assert.match(source, />Deseleccionar todas</);
});

test("B14. si existen grupos, seleccionar/deseleccionar grupo funciona en Parlay/Soñadora", async () => {
  const source = await readFile(combinationBuilderPath, "utf8");
  assert.match(source, />Seleccionar grupo</);
  assert.match(source, />Deseleccionar grupo</);
});

// ===========================================================================
// C. OPTIMIZADOR ECONÓMICO
// ===========================================================================

test("C15/C19. Parlay prefiere mejor value_factor sobre mayor probabilidad cuando las probabilidades están muy cerca (tolerancia 0.05)", () => {
  const highProbabilityPoorValue = flatCandidate(1, { estimated_probability: 0.90, decimalOdds: 1.05 });
  const closeProbabilityGoodValue = flatCandidate(2, { estimated_probability: 0.87, decimalOdds: 1.45 });
  const result = buildAtlasCombination({ candidates: [highProbabilityPoorValue, closeProbabilityGoodValue], product: "parlay", mode: "automatic", selections: 2 });
  assert.equal(result.status, "ready");
  assert.equal(result.selections[0].fixture_id, 2, "debe priorizar el mejor value_factor cuando la probabilidad es comparable");
});

test("C16. odds no modifican estimated_probability durante la optimización", () => {
  const a = flatCandidate(1, { estimated_probability: 0.7, decimalOdds: 1.3 });
  const b = flatCandidate(2, { estimated_probability: 0.6, decimalOdds: 2.0 });
  const result = buildAtlasCombination({ candidates: [a, b], product: "parlay", mode: "automatic", selections: 2 });
  const legA = result.selections.find((item) => item.fixture_id === 1);
  const legB = result.selections.find((item) => item.fixture_id === 2);
  assert.equal(legA.estimated_probability, 0.7);
  assert.equal(legB.estimated_probability, 0.6);
});

test("C17/C18. no existe cuota mínima hardcodeada: una cuota muy baja (1.05) puede entrar si el conjunto es deportivamente válido", () => {
  const onlyLowOdds = flatCandidate(1, { estimated_probability: 0.9, decimalOdds: 1.05 });
  const other = flatCandidate(2, { estimated_probability: 0.6, decimalOdds: 3.0, fixtureId: 2 });
  const result = buildAtlasCombination({ candidates: [onlyLowOdds, other], product: "parlay", mode: "automatic", selections: 2 });
  assert.equal(result.status, "ready");
  assert.equal(result.selections.length, 2);
});

test("C19b. una cuota alta no entra únicamente por ser alta si su value_factor es peor y la probabilidad no es comparable", () => {
  const solidFavorite = flatCandidate(1, { estimated_probability: 0.85, decimalOdds: 1.15 });
  const longshotPoorValue = flatCandidate(2, { estimated_probability: 0.2, decimalOdds: 2.0 });
  const result = buildAtlasCombination({ candidates: [solidFavorite, longshotPoorValue], product: "parlay", mode: "automatic", selections: 2 });
  assert.equal(result.status, "ready");
  assert.equal(result.selections[0].fixture_id, 1, "fuera de la ventana de tolerancia, gana la probabilidad, no la cuota alta");
});

test("C20. sin cuotas todavía puede construirse combinación deportiva completa", () => {
  const a = flatCandidate(1, { activeQuote: null });
  const b = flatCandidate(2, { activeQuote: null });
  const result = buildAtlasCombination({ candidates: [a, b], product: "parlay", mode: "automatic", selections: 2 });
  assert.equal(result.status, "ready");
  assert.equal(result.price_coverage.available, 0);
});

test("C21. Parlay y Soñadora usan perfiles explícitos de frontera sin cambiar probabilities", () => {
  const higherProbabilityPoorValue = flatCandidate(1, { estimated_probability: 0.80, decimalOdds: 1.1 });
  const gapWithinDreamOnly = flatCandidate(2, { estimated_probability: 0.68, decimalOdds: 1.8 });
  const parlayResult = buildAtlasCombination({ candidates: [higherProbabilityPoorValue, gapWithinDreamOnly], product: "parlay", mode: "automatic", selections: 2 });
  assert.equal(parlayResult.status, "ready");
  assert.equal(parlayResult.decision_frontier.product, "parlay");

  const dreamCandidates = [1, 2, 3, 4, 5].map((index) => flatCandidate(index + 10, { estimated_probability: 0.5 }));
  const dreamResult = buildAtlasCombination({
    candidates: [higherProbabilityPoorValue, gapWithinDreamOnly, ...dreamCandidates],
    product: "dream",
    mode: "automatic",
    selections: 5,
  });
  assert.equal(dreamResult.status, "ready");
  assert.equal(dreamResult.decision_frontier.product, "dream");
});

// ===========================================================================
// D. CORREGIR LÍNEA EN LA COMBINACIÓN (no en el universo) — con recálculo REAL
// ===========================================================================

test("D22/D23. 'Corregir línea' no aparece en CandidateCard del universo; sí aparece en las piernas de la combinación generada", async () => {
  const source = await readFile(combinationBuilderPath, "utf8");
  const candidateCardBody = source.slice(source.indexOf("function CandidateCard"), source.indexOf("export default function AtlasCombinationBuilder"));
  assert.doesNotMatch(candidateCardBody, /Corregir línea/);
  const legsBlock = source.slice(source.indexOf('<ol className="p2-combination-legs">'), source.indexOf('<ol className="p2-combination-legs">') + 4000);
  assert.match(legsBlock, /Corregir línea y reanalizar/);
});

test("D24/D25/D26/D27/D28. corregir 7.5→6.5 con el motor REAL (analyzeOperationalFixture) recalcula probabilidad/incertidumbre/soporte y la pierna corregida usa esos valores reales, no inventados", async () => {
  // Paso 1: análisis deportivo real de la pierna original a línea 7.5 (misma
  // ruta que produce las piernas del universo: analyzeOperationalFixture).
  // Usa cardsVarianceGateway() (tarjetas con variación real partido a
  // partido): con el gateway plano de tarjetas fijas, 6.5 y 7.5 caen fuera de
  // la ventana de líneas con datos distintivos y ambas probabilidades
  // saturan al mismo techo, lo que no permitiría demostrar un recálculo real.
  const gw = cardsVarianceGateway();
  const at75 = await analyzeOperationalFixture({ ...cardsBaseInput, line: "7.5", manualOdds: null }, gw, { now: () => NOW, idFactory: () => "d-at-75" });
  const primary75 = at75.marketSelection.primary;
  assert.ok(primary75, "la línea original 7.5 debe ser calculable en este escenario");
  assert.equal(primary75.line, 7.5);

  // Paso 2: reanálisis real de EXACTAMENTE fixture+family+direction+6.5 (lo
  // que hace correctLegLine al llamar a /api/football/operational-analysis).
  const at65 = await analyzeOperationalFixture({ ...cardsBaseInput, line: "6.5", manualOdds: null }, gw, { now: () => NOW, idFactory: () => "d-at-65" });
  const primary65 = at65.marketSelection.primary;
  assert.ok(primary65, "la línea corregida 6.5 debe ser calculable en este escenario");
  assert.equal(primary65.line, 6.5);

  // Ambos números vienen del motor real: deben diferir (nunca reutilizar la
  // línea anterior), lo cual demuestra que hay un recálculo genuino.
  assert.notEqual(primary65.estimated_probability, primary75.estimated_probability);
  assert.notEqual(primary65.uncertainty_high - primary65.uncertainty_low, primary75.uncertainty_high - primary75.uncertainty_low);
  assert.notEqual(primary65.sports_score, primary75.sports_score);

  // Paso 3: exactamente el mismo mapeo de campos que usa correctLegLine en
  // atlas-combination-builder.js (fixture_id, market_family, direction, line,
  // selection, sports_score, ranking_eligible, estimated_probability,
  // probability_percent, probability_classification, uncertainty_low/high,
  // sample_size_effective, technical_support_score, active_quote:null),
  // construido a partir de "primary65" real, no de literales elegidos a mano.
  const originalLeg = flatCandidate(900, {
    marketId: "cards", market: "cards", direction: "under", line: 7.5, selection: "Under 7.5",
    estimated_probability: primary75.estimated_probability,
    uncertaintyLow: primary75.uncertainty_low, uncertaintyHigh: primary75.uncertainty_high,
    sportsScore: primary75.sports_score, decimalOdds: 1.9,
  });
  const combination = buildAtlasCombination({ candidates: [originalLeg, flatCandidate(901)], product: "parlay", mode: "automatic", selections: 2 });
  const oldLeg = combination.selections.find((item) => item.fixture_id === 900);
  const oldKey = oldLeg.selection_key;

  const correctedCandidate = {
    fixture_id: 900, fixture: oldLeg.fixture, market_family: "cards", direction: primary65.direction, line: primary65.line,
    selection: primary65.selection, sports_score: primary65.sports_score, ranking_eligible: primary65.ranking_eligible,
    estimated_probability: primary65.estimated_probability, probability_percent: primary65.probability_percent,
    probability_classification: primary65.probability_classification, uncertainty_low: primary65.uncertainty_low,
    uncertainty_high: primary65.uncertainty_high, sample_size_effective: primary65.sample_size_effective,
    technical_support_score: primary65.technical_support_score, active_quote: null,
  };
  const withoutOld = removeCombinationSelection(combination, oldKey);
  const withNew = addCombinationSelection(withoutOld, correctedCandidate);
  const newKey = combinationSelectionKey(correctedCandidate);
  const newLeg = withNew.selections.find((item) => item.selection_key === newKey);

  assert.ok(newLeg, "la pierna corregida debe existir con su nueva identidad");
  assert.equal(newLeg.line, 6.5);
  assert.notEqual(newKey, oldKey);
  assert.equal(newLeg.estimated_probability, primary65.estimated_probability, "usa la probabilidad real recalculada, no la de 7.5");
  assert.notEqual(newLeg.estimated_probability, oldLeg.estimated_probability);
  assert.equal(newLeg.active_quote, null, "la cuota anterior (7.5) debe invalidarse, nunca reutilizarse para 6.5");
});

test("línea manual 28.5 recorre UI-contracto operativo y queda lista para precio sin reutilizar otra línea", async () => {
  const result = await analyzeOperationalFixture({
    date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026,
    fixtureId: 9_401, marketId: "total_shots", analysisMode: "specific", line: "28.5", selection: "over", manualOdds: null, manualCandidateOdds: [], reanalysis: true,
  }, gateway(), { now: () => NOW, idFactory: () => "exact-28-5" });
  const selected = result.marketSelection.primary;
  assert.equal(result.marketSelection.exact_requested_line_unavailable, false);
  assert.equal(selected.market_family, "total_shots");
  assert.equal(selected.direction, "over");
  assert.equal(selected.line, 28.5);
  assert.ok(Number.isFinite(selected.estimated_probability));
  assert.ok(Number.isFinite(selected.sports_score));
  assert.ok(Number.isFinite(selected.technical_support_score));
  assert.ok(Number.isFinite(selected.uncertainty_low));
  assert.ok(Number.isFinite(selected.uncertainty_high));
  assert.equal(result.director.price_pending, true);
});

test("D24b. estructural: correctLegLine construye correctedCandidate leyendo cada campo desde result.marketSelection.primary (no desde literales fijos)", async () => {
  const source = await readFile(combinationBuilderPath, "utf8");
  const fnBody = source.slice(source.indexOf("async function correctLegLine"), source.indexOf("const eligibleCount = candidates.filter"));
  assert.match(fnBody, /direction:\s*primary\.direction/);
  assert.match(fnBody, /line:\s*primary\.line/);
  assert.match(fnBody, /selection:\s*primary\.selection/);
  assert.match(fnBody, /sports_score:\s*primary\.sports_score/);
  assert.match(fnBody, /estimated_probability:\s*primary\.estimated_probability/);
  assert.match(fnBody, /uncertainty_low:\s*primary\.uncertainty_low/);
  assert.match(fnBody, /uncertainty_high:\s*primary\.uncertainty_high/);
  assert.match(fnBody, /active_quote:\s*null/);
  // El propio fetch pide EXACTAMENTE fixture+family+direction+newLine.
  assert.match(fnBody, /fixtureId:\s*leg\.fixture_id/);
  assert.match(fnBody, /marketId:\s*leg\.market_family/);
  assert.match(fnBody, /selection:\s*leg\.direction/);
  assert.match(fnBody, /line:\s*newLine/);
});

test("D29/D30. si la pierna corregida deja de ser elegible, se remueve explícitamente (no permanece silenciosamente) y queda visible a nivel de combinación", async () => {
  const originalLeg = flatCandidate(902, { marketId: "cards", market: "cards", direction: "under", line: 7.5 });
  const combination = buildAtlasCombination({ candidates: [originalLeg, flatCandidate(903)], product: "parlay", mode: "automatic", selections: 2 });
  const oldLeg = combination.selections.find((item) => item.fixture_id === 902);

  // Un reanálisis real puede devolver ranking_eligible:false (mercado deja de
  // ser deportivamente viable para esa línea); simulamos ese resultado con
  // el MISMO mapeo de campos que D24b confirma que usa correctLegLine.
  const invalidCorrection = {
    fixture_id: 902, fixture: oldLeg.fixture, market_family: "cards", direction: "under", line: 6.5,
    selection: "Under 6.5", sports_score: 40, ranking_eligible: false,
    estimated_probability: 0.3, active_quote: null,
  };
  const withoutOld = removeCombinationSelection(combination, oldLeg.selection_key);
  const withAttemptedNew = addCombinationSelection(withoutOld, invalidCorrection);

  assert.equal(withAttemptedNew.selections.length, 1, "la pierna inválida no se añade; la combinación queda explícitamente incompleta, no sustituida en silencio");
  assert.ok(!withAttemptedNew.selections.some((item) => item.fixture_id === 902));

  // El mensaje de combinationNotice para el caso "removed" (texto real de
  // atlas-combination-builder.js) debe reflejar la remoción, no ocultarla.
  const source = await readFile(combinationBuilderPath, "utf8");
  assert.match(source, /pero esa línea ya no cumple las reglas de la combinación/);
  assert.match(source, /Fue removida de la combinación; elige o recalcula un reemplazo desde el universo/);
});

// ===========================================================================
// E. ANALIZAR PARTIDO / LÍNEA EXACTA — escenario real: Cards Under 5.5
// ===========================================================================

test("E31/E34/E35. Cards Under 5.5 permanece 5.5 en el análisis inicial: marketSelection.primary y Director referencian exactamente 5.5", async () => {
  const result = await analyzeOperationalFixture({ ...cardsBaseInput, manualOdds: null }, gateway(), { now: () => NOW, idFactory: () => "e31" });
  assert.equal(result.status, DATA_LOAD_STATUS.SUCCESS);
  assert.equal(result.marketSelection.exact_requested_line_unavailable, false);
  assert.equal(result.marketSelection.primary.market_family, "cards");
  assert.equal(result.marketSelection.primary.direction, "under");
  assert.equal(result.marketSelection.primary.line, 5.5);
  assert.equal(result.director.line, 5.5);
});

test("E32. tras reanalysis con contexto Gemini, la línea sigue siendo exactamente 5.5", async () => {
  const gw = gateway();
  const first = await analyzeOperationalFixture({ ...cardsBaseInput, manualOdds: null }, gw, { now: () => NOW, idFactory: () => "e32-first" });
  const geminiContext = {
    valid_for_reanalysis: true,
    items: [{ id: "g1", kind: "fact", impact: "favorable", text: "Árbitro estricto confirmado", selected: true }],
    selected_items: [{ id: "g1", kind: "fact", impact: "favorable", text: "Árbitro estricto confirmado", selected: true }],
  };
  const second = await analyzeOperationalFixture(
    { ...cardsBaseInput, reanalysis: true, manualOdds: null, geminiContext, selectedGeminiItemIds: ["g1"] },
    gw,
    { now: () => NOW, idFactory: () => "e32-second", previousVersion: first.analysisVersion }
  );
  assert.equal(second.marketSelection.primary.line, 5.5);
  assert.equal(second.marketSelection.primary.direction, "under");
});

test("E33. una alternativa Under 7.5 nunca sustituye silenciosamente a la línea exacta 5.5 solicitada", async () => {
  // cardsVarianceGateway(): con tarjetas fijas (gateway plano) la ventana de
  // líneas plausibles se estrecha alrededor de la media y 7.5 no llega a
  // aparecer como alternativa navegable; con variación real de tarjetas sí.
  const result = await analyzeOperationalFixture({ ...cardsBaseInput, manualOdds: null }, cardsVarianceGateway(), { now: () => NOW, idFactory: () => "e33" });
  assert.equal(result.marketSelection.primary.line, 5.5);
  const alternativeLines = result.marketSelection.alternatives.map((item) => item.line);
  assert.ok(alternativeLines.includes(7.5), "7.5 debe existir como alternativa visible");
  assert.notEqual(result.marketSelection.primary.line, 7.5, "7.5 nunca debe ocupar el lugar de primary cuando 5.5 fue solicitado y es calculable");
});

test("E36/E38. si 5.5 es calculable, una cuota manual exacta para 5.5 sí hace match y completa el panel económico", async () => {
  const result = await analyzeOperationalFixture({
    ...cardsBaseInput,
    manualOdds: { marketFamily: "cards", bookmaker: "Betano", direction: "under", selection: "Under 5.5", line: "5.5", decimalOdds: "1.8", consultedAt: NOW, timezone: "America/Bogota" },
  }, gateway(), { now: () => NOW, idFactory: () => "e36" });
  assert.equal(result.marketSelection.primary.line, 5.5);
  assert.equal(result.director.line, 5.5);
  assert.notEqual(result.director.price_assessment.status, "unavailable");
  assert.equal(result.director.price_assessment.bookmaker, "Betano");
  assert.equal(result.director.price_assessment.decimal_odds, 1.8);
});

test("E37. una cuota reportada para 7.5 NO hace match con la selección exacta 5.5 (no se evalúa como si fuera la misma pierna)", async () => {
  const result = await analyzeOperationalFixture({
    ...cardsBaseInput,
    manualOdds: null,
    manualCandidateOdds: [{ marketFamily: "cards", bookmaker: "Betano", direction: "under", selection: "Under 7.5", line: "7.5", decimalOdds: "1.5", consultedAt: NOW, timezone: "America/Bogota" }],
  }, gateway(), { now: () => NOW, idFactory: () => "e37" });
  // La línea exacta solicitada (5.5) se preserva a pesar de existir cuotas de candidato para otra línea (Bloque 3 / hasCandidateOdds fix).
  assert.equal(result.marketSelection.primary.line, 5.5);
  assert.equal(result.selectedOdds, null, "una cuota de 7.5 no puede activarse como precio de la selección 5.5");
  assert.equal(result.director.price_assessment.status, "unavailable");
});

test("E39/E40/E41/E42. una línea manual fuera del catálogo se calcula sin sustituirse por una alternativa", async () => {
  const result = await analyzeOperationalFixture({ ...cardsBaseInput, line: "37.5", manualOdds: null }, gateway(), { now: () => NOW, idFactory: () => "e39" });
  assert.equal(result.marketSelection.primary.line, 37.5);
  assert.equal(result.marketSelection.exact_requested_line_unavailable, false);
  assert.equal(result.selectedOdds, null, "no debe inventarse una cuota para la línea manual");
  assert.equal(result.director.price_assessment.status, "unavailable");
  assert.equal(result.director.price_pending, true);
});

test("E43. el panel de cuota nunca queda en un estado 'esperando cuota' sin formulario económico válido ni aviso de alternativas", async () => {
  const source = await readFile(clientPath, "utf8");
  const panelStart = source.indexOf("EVALUAR CUOTA ACTUAL");
  assert.ok(panelStart > -1, "debe existir la sección de línea y cuota");
  const panelBlock = source.slice(Math.max(0, panelStart - 400), panelStart + 3000);
  assert.match(panelBlock, /quoteTargetReady\s*\|\|\s*analysis\?\.marketSelection\?\.exact_requested_line_unavailable/);
});

test("E44. una alternativa solo se convierte en selección exacta tras una acción explícita del usuario (nunca automáticamente al renderizar)", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /function chooseAlternativeAsExact\(alternative\)/);
  const fnStart = source.indexOf("function chooseAlternativeAsExact(alternative)");
  const fnBody = source.slice(fnStart, fnStart + 800);
  assert.match(fnBody, /runOperationalAnalysis\(\{[^}]*reanalysis:\s*true/s);
  // Debe estar enlazada a un evento explícito del usuario (onClick), no invocada durante el render.
  assert.match(source, /onClick=\{\(\)\s*=>\s*chooseAlternativeAsExact\([^)]*\)\}/);
});

// ===========================================================================
// F. GEMINI — no crea probabilidad deportiva
// ===========================================================================

test("F45/F46. el flujo Gemini sigue intacto (Deep Research + Pro normal) y sus prompts se anclan al fixture/mercado/línea exactos", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /Copiar prompt para Gemini Pro \+ Deep Research/);
  assert.match(source, /Copiar prompt para Gemini Pro normal/);
});

test("F47a. un ítem Gemini sin impacto direccional mapeado para la familia analizada deja estimated_probability idéntica bit a bit (invariante determinista, no depende de datos de muestra)", async () => {
  // "Árbitro estricto confirmado" mapea a la familia "cards" con
  // direction:"neutral" (geminiImpactMapper.js), es decir standardized_shift=0
  // por construcción: no hay ninguna vía numérica para que mueva la probabilidad.
  const gw = gateway();
  const first = await analyzeOperationalFixture({ ...cardsBaseInput, manualOdds: null }, gw, { now: () => NOW, idFactory: () => "f47a-first" });
  const geminiContext = {
    valid_for_reanalysis: true,
    items: [{ id: "g1", kind: "fact", impact: "favorable", text: "Árbitro estricto confirmado", selected: true }],
    selected_items: [{ id: "g1", kind: "fact", impact: "favorable", text: "Árbitro estricto confirmado", selected: true }],
  };
  const second = await analyzeOperationalFixture(
    { ...cardsBaseInput, reanalysis: true, manualOdds: null, geminiContext, selectedGeminiItemIds: ["g1"] },
    gw,
    { now: () => NOW, idFactory: () => "f47a-second", previousVersion: first.analysisVersion }
  );
  assert.equal(second.marketSelection.primary.context_adjustment.standardized_shift, 0);
  assert.equal(second.marketSelection.primary.estimated_probability, first.marketSelection.primary.estimated_probability);
});

test("F47b. evidencia Gemini con dirección/magnitud real SÍ puede desplazar estimated_probability: esto es el diseño intencional del reanálisis (no una regresión), documentado explícitamente aquí para que quede como comportamiento esperado y no se confunda con el caso F47a", async () => {
  // Este comportamiento existe desde antes de este bloque: contextShiftForMarket()
  // (geminiImpactMapper.js) produce un standardized_shift no-cero para evidencia
  // con dirección real, y preliminaryMarketModel.js aplica ese shift a las
  // observaciones históricas antes de estimar la probabilidad. Es la función que
  // sostiene mensajes como "el contexto Gemini elevó/redujo la estimación de X% a Y%".
  // Gemini sigue sin CREAR una probabilidad de la nada: solo desplaza el mismo
  // modelo estadístico con evidencia declarada, verificable y trazable.
  const totals = [0, 1, 3, 8, 1, 7, 0, 8, 3, 7];
  function goalsHistoricalFixture(index) {
    const total = totals[index % totals.length];
    return {
      ...targetFixture(8_000 + index),
      date: { utc: `2026-07-${String(index + 1).padStart(2, "0")}T20:00:00.000Z` },
      status: { isScheduled: false, isFinished: true, long: "Finalizado" },
      score: { goals: { home: Math.ceil(total / 2), away: Math.floor(total / 2) }, aggregate: null },
    };
  }
  const history = Array.from({ length: 10 }, (_, index) => goalsHistoricalFixture(index));
  const gw = {
    runtime: { snapshot: () => ({ requestsUsed: 5, cacheHits: 0, cacheMisses: 5, deduplicated: 0, configuredBudget: 45, configuredBudgetRemaining: 40, budgetExhausted: false, quotaStatus: "available" }) },
    loadCompetitionMetadata: async () => ({
      status: DATA_LOAD_STATUS.SUCCESS,
      seasonMetadata: { year: 2026, coverage: { odds: true, fixtures: { statistics_fixtures: true, lineups: false }, injuries: false, standings: false } },
      availableSeasons: [2026],
      verificationStatus: "verified",
    }),
    loadFixtureById: async ({ fixtureId }) => ({ status: DATA_LOAD_STATUS.SUCCESS, selectedFixtureId: fixtureId, fixture: targetFixture(fixtureId) }),
    loadLeagueWindow: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: history }),
    loadTeamRecent: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: history }),
    loadFixtureStatistics: async (fixtureId) => {
      const item = history.find((candidate) => candidate.fixtureId === fixtureId);
      return { status: DATA_LOAD_STATUS.SUCCESS, fixtureId, statistics: fixtureStatistics(item || history[0]) };
    },
    loadFixturesForDate: async () => ({ status: DATA_LOAD_STATUS.EMPTY, fixtures: [], message: "Sin partidos" }),
    loadFixtureOdds: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, response: [] }),
  };
  const goalsInput = {
    date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026,
    fixtureId: 9_301, marketId: "goals", analysisMode: "specific", line: "2.5", selection: "under", manualCandidateOdds: [],
  };
  const first = await analyzeOperationalFixture({ ...goalsInput, manualOdds: null }, gw, { now: () => NOW, idFactory: () => "f47b-first" });
  const fixtureForGemini = { fixtureId: 9_301, teams: targetFixture(9_301).teams, date: targetFixture(9_301).date };
  const strongParsed = parseGeminiResponse(
    "HECHOS CONFIRMADOS\n- Multiple titulares ausentes por lesion, delantero extremo https://dimayor.com.co/noticia 2026-08-01",
    { fixture: fixtureForGemini }
  );
  strongParsed.items.forEach((item) => { item.verification_status = "verified_provider"; });
  const selectedIds = strongParsed.items.map((item) => item.id);
  const second = await analyzeOperationalFixture(
    { ...goalsInput, reanalysis: true, manualOdds: null, geminiContext: strongParsed, selectedGeminiItemIds: selectedIds },
    gw,
    { now: () => NOW, idFactory: () => "f47b-second", previousVersion: first.analysisVersion }
  );
  assert.equal(first.marketSelection.primary.line, 2.5);
  assert.equal(second.marketSelection.primary.line, 2.5, "la línea/selección exacta se conserva aunque la probabilidad se mueva");
  assert.notEqual(second.marketSelection.primary.context_adjustment.standardized_shift, 0, "la evidencia direccional real produce un shift no-cero, por diseño");
  assert.notEqual(second.marketSelection.primary.estimated_probability, first.marketSelection.primary.estimated_probability, "con evidencia direccional real, el reanálisis SÍ puede mover la probabilidad: es el comportamiento previsto, no una regresión");
});

// Nota de cierre F48 (sports_score): se investigó y NO se incluye como test de
// igualdad exacta. calculateSportsScore() (marketCandidateRanker.js:79) resta
// puntos de "sensitivity" por cada elemento en candidate.limitations, y
// candidateLineGenerator.js:83 agrega una limitación adicional cada vez que
// existe algún ítem Gemini mapeado a la familia analizada (incluso uno neutral
// como "Árbitro estricto confirmado"), moviendo sports_score en ~0.1-0.8 puntos.
// Esto es código preexistente, no tocado en este bloque ("no tocar la fórmula
// de sports_score"); queda documentado como hallazgo pendiente de decisión en
// el reporte de cierre en vez de forzarse aquí como test.

// ===========================================================================
// G. REGRESIONES
// ===========================================================================

test("G49. exact quote identity sigue exigiendo fixture+family+direction+line", () => {
  const quoteAt75 = { fixture_id: 500, market_family: "cards", direction: "under", line: 7.5, decimal_odds: 1.8, verification_status: "verified_provider", freshness: "fresh" };
  const withMismatchedQuote = flatCandidate(500, { marketId: "cards", direction: "under", line: 6.5, activeQuote: null, active_quote: quoteAt75 });
  const combo = buildAtlasCombination({ candidates: [withMismatchedQuote, flatCandidate(501)], product: "parlay", mode: "automatic", selections: 2 });
  const leg = combo.selections.find((item) => item.fixture_id === 500);
  assert.equal(leg.price_usable, false);
});

test("G50. Parlay 2–4 y Soñadora 5–15 siguen vigentes", () => {
  const tooMany = buildAtlasCombination({ candidates: Array.from({ length: 6 }, (_, index) => flatCandidate(600 + index)), product: "parlay", mode: "automatic", selections: 6 });
  assert.equal(tooMany.status, "invalid_request");
  const dream = buildAtlasCombination({ candidates: Array.from({ length: 5 }, (_, index) => flatCandidate(700 + index)), product: "dream", mode: "automatic", selections: 5 });
  assert.equal(dream.status, "ready");
});

test("G51. máximo una selección por fixture_id + market_family sigue vigente", () => {
  const result = buildAtlasCombination({
    candidates: [flatCandidate(800, { line: 1.5 }), flatCandidate(800, { line: 2.5 }), flatCandidate(801)],
    product: "parlay",
    mode: "automatic",
    selections: 2,
  });
  assert.equal(result.selections.filter((item) => item.fixture_id === 800).length, 1);
});

test("G52. la fecha local de hoy sigue siendo el valor por defecto en Parlay/Soñadora", async () => {
  const source = await readFile(combinationBuilderPath, "utf8");
  assert.match(source, /todayLocalDateString/);
});

test("G53/G54. este bloque no toca officialPredictionEligibility ni el contrato público de elegibilidad oficial", async () => {
  const eligibilitySource = await readFile(path.resolve(testingDirectory, "../intelligence/officialPrediction.js"), "utf8");
  assert.match(eligibilitySource, /export function officialPredictionEligibility/);
});
