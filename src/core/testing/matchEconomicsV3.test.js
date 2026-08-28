import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { buildGeminiResearchPrompt, parseGeminiResponse } from "../intelligence/geminiManualContext.js";
import { analyzeOperationalFixture } from "../services/operationalAnalysisService.js";

const clientPath = new URL("../../app/atlas-functional-client.js", import.meta.url);
const directorPath = new URL("../modules/directorAtlas.js", import.meta.url);

function targetFixture(id) {
  return {
    fixtureId: id,
    competition: { id: 239, name: "Primera A", country: "Colombia", season: 2026 },
    date: { utc: "2026-08-10T23:00:00.000Z" },
    status: { isScheduled: true, isFinished: false, long: "Programado" },
    teams: { home: { id: 10, name: "Local Betano" }, away: { id: 20, name: "Visitante Betano" } },
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
      statistics: {
        total_shots: { value: 12 },
        shots_on_goal: { value: 5 },
        yellow_cards: { value: 2 },
        red_cards: { value: 0 },
        fouls: { value: 12 },
        corner_kicks: { value: 5 },
        ball_possession: { value: 50 },
      },
    })),
  };
}

function gateway() {
  const history = Array.from({ length: 10 }, (_, index) => historicalFixture(index));
  return {
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
}

test("Bloque 3: manualOdds y geminiContext viajan juntos en reanalysis:true, y el reanálisis final conserva selección/probabilidad/precio", async () => {
  const baseInput = {
    date: "2026-08-01",
    timezone: "America/Bogota",
    competitionKey: "colombiaPrimeraA",
    season: 2026,
    fixtureId: 9_300,
    marketId: "goals",
    analysisMode: "specific",
    line: null,
    selection: null,
    manualCandidateOdds: [],
  };
  const now = "2026-08-01T12:00:00.000Z";
  const consultedAt = "2026-08-01T11:45:00.000Z";

  // Paso 1: análisis deportivo puro (sin cuota, sin Gemini) — línea base a preservar.
  const sportsOnly = await analyzeOperationalFixture(
    { ...baseInput, manualOdds: null },
    gateway(),
    { now: () => now, idFactory: () => "v-sports-only" }
  );
  const primaryBeforeGemini = sportsOnly.marketSelection.primary;
  assert.ok(primaryBeforeGemini, "el análisis deportivo debe producir un candidato ganador");

  const manualOddsPayload = {
    marketFamily: primaryBeforeGemini.market_family,
    bookmaker: "Betano",
    direction: primaryBeforeGemini.direction,
    selection: primaryBeforeGemini.selection,
    line: String(primaryBeforeGemini.line),
    decimalOdds: "1.75",
    consultedAt,
    timezone: "America/Bogota",
    analysisVersion: "v-sports-only",
  };

  // Paso 2: manualOdds con geminiContext null — la evaluación económica debe funcionar sola.
  const withOddsEvaluated = await analyzeOperationalFixture(
    { ...baseInput, reanalysis: true, manualOdds: manualOddsPayload, geminiContext: null },
    gateway(),
    { now: () => now, idFactory: () => "v-with-odds" }
  );
  assert.equal(withOddsEvaluated.status, DATA_LOAD_STATUS.SUCCESS);
  assert.notEqual(withOddsEvaluated.director.price_assessment.status, "unavailable");
  assert.equal(withOddsEvaluated.director.price_assessment.bookmaker, "Betano");
  assert.equal(withOddsEvaluated.director.price_assessment.decimal_odds, 1.75);
  assert.equal(withOddsEvaluated.director.odds_updated_at, consultedAt);

  // Paso 3: se construye un geminiContext válido (mismo mecanismo que la UI: parseGeminiResponse).
  const fixtureForGemini = { fixtureId: 9_300, teams: targetFixture(9_300).teams, date: targetFixture(9_300).date };
  const parsedContext = parseGeminiResponse(
    "HECHOS CONFIRMADOS\n- Delantero titular ausente por lesión https://dimayor.com.co/noticia 2026-08-01",
    { fixture: fixtureForGemini }
  );
  assert.equal(parsedContext.valid_for_reanalysis, true, "el contexto Gemini construido debe ser válido para reanálisis");

  // Paso 4: reanalysis:true con manualOdds Y geminiContext simultáneamente (igual que reanalyzeWithContext en la UI).
  const finalResult = await analyzeOperationalFixture(
    {
      ...baseInput,
      reanalysis: true,
      manualOdds: manualOddsPayload,
      geminiContext: parsedContext,
      selectedGeminiItemIds: ["gemini-1"],
    },
    gateway(),
    { now: () => now, idFactory: () => "v-final-with-gemini" }
  );

  assert.equal(finalResult.status, DATA_LOAD_STATUS.SUCCESS);
  assert.ok(finalResult.gemini?.context, "el resultado final debe traer el geminiContext aplicado");
  assert.equal(finalResult.gemini.applied_items.length, 1);
  assert.notEqual(finalResult.director.price_assessment.status, "unavailable");

  // El resultado final conserva selección deportiva, probabilidad, clasificación y precio.
  const primaryFinal = finalResult.marketSelection.primary;
  assert.equal(primaryFinal.market_family, primaryBeforeGemini.market_family);
  assert.equal(primaryFinal.direction, primaryBeforeGemini.direction);
  assert.equal(primaryFinal.line, primaryBeforeGemini.line);
  assert.equal(primaryFinal.selection, primaryBeforeGemini.selection);
  assert.equal(primaryFinal.estimated_probability, primaryBeforeGemini.estimated_probability);
  assert.equal(primaryFinal.probability_classification, primaryBeforeGemini.probability_classification);
  assert.equal(finalResult.director.price_assessment.bookmaker, withOddsEvaluated.director.price_assessment.bookmaker);
  assert.equal(finalResult.director.price_assessment.decimal_odds, withOddsEvaluated.director.price_assessment.decimal_odds);
});

test("la cuota manual toma familia/dirección/línea de marketSelection.primary antes que del candidato transferido o del fallback legacy", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.ok(source.includes(
    "const manualMarketFamily = currentAnalysis?.marketSelection?.primary?.market_family || transferredCandidate?.market_family || (analysisMode === \"specific\" ? marketId : currentAnalysis?.director?.market_evaluated?.family);"
  ));
  assert.ok(source.includes(
    "const requestedLine = line.trim() || currentAnalysis?.marketSelection?.primary?.line || transferredCandidate?.line || (reanalysis ? currentAnalysis?.director?.line : null);"
  ));
  assert.ok(source.includes(
    "const reportedDirection = selection.trim() || currentAnalysis?.marketSelection?.primary?.direction || transferredCandidate?.direction || currentAnalysis?.director?.sports_verdict?.direction || \"\";"
  ));
});

test("explicabilidad: A favor sale exclusivamente de contextSummary.favorable, sin mezclar baseReasons por el resultado final", async () => {
  const source = await readFile(clientPath, "utf8");
  const directorResultBlock = source.slice(source.indexOf("function DirectorResult"), source.indexOf("function MarketAssessment"));
  assert.ok(directorResultBlock.includes('const decisionReasons = [...new Set(contextSummary.favorable || [])].slice(0, 3);'));
  assert.equal(directorResultBlock.includes("analysisDecision.status === \"no\""), false);
  assert.ok(directorResultBlock.includes('const balanceReasons = [...new Set(baseReasons)].slice(0, 3);'));
  assert.ok(directorResultBlock.includes('<ListBlock title="A favor"'));
  assert.ok(directorResultBlock.includes('<ListBlock title="En contra"'));
  assert.ok(directorResultBlock.includes('<ListBlock title="Balance"'));
});

test("prompt Gemini exige búsqueda obligatoria si está disponible, ventana de 24h, NO VERIFICADO, fixture/mercado exactos, árbitro confirmado y evidencia de plantilla", () => {
  const fixture = {
    fixtureId: 9_400,
    teams: { home: { name: "Local Prompt" }, away: { name: "Visitante Prompt" } },
    date: { utc: "2026-08-10T23:00:00.000Z" },
    competition: { season: 2026 },
  };
  const prompt = buildGeminiResearchPrompt({
    fixture,
    competition: { localName: "Colombia Primera A" },
    market: { market_label: "Goles", market_family: "goals" },
    selection: { selection: "Over 2.5", line: 2.5 },
    oddsQuote: { decimal_odds: 1.75, selection: "Over 2.5", line: 2.5 },
  });
  assert.match(prompt, /búsqueda o navegación web/i);
  assert.match(prompt, /tienes la OBLIGACIÓN de usarla/i);
  assert.match(prompt, /genuinamente no dispones de ninguna función de búsqueda o navegación/i);
  assert.match(prompt, /ESTADO DE BÚSQUEDA WEB: \[USADA o NO DISPONIBLE\]/);
  assert.match(prompt, /Nunca escribas ambos estados/i);
  assert.match(prompt, /últimas 24 horas/i);
  assert.match(prompt, /NO VERIFICADO/);
  assert.match(prompt, /Fixture ID: 9400/);
  assert.match(prompt, /Mercado: Goles/);
  assert.match(prompt, /Selección exacta que Atlas está estudiando: Over 2.5/);
  assert.match(prompt, /árbitro/i);
  assert.match(prompt, /alineaciones/i);
  assert.match(prompt, /lesionados y suspendidos/i);
});

test("las tres decisiones públicas del Director permanecen intactas", async () => {
  const source = await readFile(directorPath, "utf8");
  assert.ok(source.includes('"SÍ, ME GUSTA ESTA OPCIÓN"'));
  assert.ok(source.includes('"ESPERAR"'));
  assert.ok(source.includes('"NO ME GUSTA ESTA OPCIÓN"'));
});
