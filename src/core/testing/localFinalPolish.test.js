import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { buildCompetitiveContext } from "../intelligence/competitiveContext.js";
import { buildGeminiResearchPrompt } from "../intelligence/geminiManualContext.js";
import { buildSimpleDirectorPresentation } from "../modules/directorAtlas.js";
import { analyzeOperationalFixture } from "../services/operationalAnalysisService.js";
import { analyzeSportsFixture } from "../services/sportsIntelligenceService.js";

const clientPath = new URL("../../app/atlas-functional-client.js", import.meta.url);

const fixture = {
  fixtureId: 1520819,
  competition: { id: 72, name: "Serie B", country: "Brazil", season: 2026, round: "Regular Season - 22" },
  date: { utc: "2026-08-16T22:00:00.000Z" },
  status: { isScheduled: true, isFinished: false, isLive: false, long: "Programado", short: "NS" },
  teams: { home: { id: 10, name: "Sport Recife" }, away: { id: 20, name: "Londrina" } },
  score: { goals: { home: null, away: null }, aggregate: null },
  referee: { name: null, confirmed: false },
  venue: { name: "Ilha do Retiro", city: "Recife" },
};

function historicalFixture(index) {
  return {
    ...fixture,
    fixtureId: 8_000 + index,
    date: { utc: `2026-07-${String(index + 1).padStart(2, "0")}T20:00:00.000Z` },
    status: { isScheduled: false, isFinished: true, isLive: false, long: "Finalizado", short: "FT" },
    score: { goals: { home: index % 3, away: index % 2 }, aggregate: null },
  };
}

function statisticsFor(item) {
  return {
    teams: [item.teams.home, item.teams.away].map((team) => ({
      team,
      statistics: {
        total_shots: { value: 10 },
        shots_on_goal: { value: 4 },
        yellow_cards: { value: 2 },
        red_cards: { value: 0 },
        fouls: { value: 11 },
        corner_kicks: { value: 4 },
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
      seasonMetadata: { year: 2026, coverage: { odds: false, fixtures: { statistics_fixtures: true, lineups: false }, injuries: false, standings: false } },
      availableSeasons: [2026],
      verificationStatus: "verified",
    }),
    loadFixtureById: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, selectedFixtureId: fixture.fixtureId, fixture }),
    loadLeagueWindow: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: history }),
    loadTeamRecent: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: history }),
    loadFixtureStatistics: async (fixtureId) => {
      const item = history.find((candidate) => candidate.fixtureId === fixtureId) || history[0];
      return { status: DATA_LOAD_STATUS.SUCCESS, fixtureId, statistics: statisticsFor(item) };
    },
  };
}

const sportsInput = {
  date: "2026-08-14",
  timezone: "America/Bogota",
  competitionKey: "brasilSerieB",
  season: 2026,
  fixtureId: fixture.fixtureId,
  marketId: "goals",
};

const prompt = buildGeminiResearchPrompt({
  fixture,
  competition: { localName: "Brasil Serie B" },
  market: { market_label: "Goles" },
  selection: { selection: "Under 2.5", line: 2.5 },
  competitiveContext: buildCompetitiveContext({ fixture }),
  analyzedAt: "2026-08-14T16:00:00.000Z",
});

let sportsResultPromise;
function sportsResult() {
  sportsResultPromise ||= analyzeSportsFixture(sportsInput, gateway());
  return sportsResultPromise;
}

function director(priceStatus = "marginal") {
  return {
    decision_code: priceStatus === "unfavorable" ? "no" : "caution",
    market_evaluated: { family: "goals", label: "Goles" },
    selection: "Under 2.5",
    sports_verdict: { status: "sports_candidate", selection: "Under 2.5" },
    price_assessment: {
      status: priceStatus,
      freshness: "fresh",
      source_status: "user_reported_current",
      bookmaker: "Betano",
      decimal_odds: 1.83,
      message: "La comparación de precio es marginal y el modelo preliminar no afirma valor esperado.",
    },
    simple_reasons: ["La distribución reciente es compatible con la línea."],
    conditions: [],
    analysis_confidence_score: 74,
  };
}

test("1. el prompt exige HECHO, IMPACTO, FUENTE, URL y FECHA", () => {
  for (const field of ["HECHO:", "IMPACTO:", "FUENTE:", "URL:", "FECHA:"]) assert.match(prompt, new RegExp(field));
});

test("2. el prompt declara que los cinco campos forman un bloque", () => {
  assert.match(prompt, /HECHO \+ IMPACTO \+ FUENTE \+ URL \+ FECHA forman UN MISMO BLOQUE/);
  assert.match(prompt, /Cada HECHO nuevo inicia un bloque nuevo/);
});

test("3. el prompt exige una URL directa que respalde el hecho", () => {
  assert.match(prompt, /URL directa completa que respalda específicamente el hecho/);
  assert.match(prompt, /portada general no es suficiente/);
});

test("4. el prompt prohíbe fuentes genéricas sin URL", () => {
  assert.match(prompt, /Google Sports Data, Google, resultados de búsqueda/);
});

test("5. un dato sin URL debe pasar a DATOS NO ENCONTRADOS", () => {
  assert.match(prompt, /no puedes proporcionar una URL directa verificable[\s\S]*pásalo a DATOS NO ENCONTRADOS/);
});

test("6. RUMORES espera únicamente NINGUNO cuando está vacío", () => {
  assert.match(prompt, /RUMORES\nSi no existen, escribe únicamente: NINGUNO/);
});

test("7. CONTRADICCIONES espera únicamente NINGUNO cuando está vacío", () => {
  assert.match(prompt, /CONTRADICCIONES\nSi no existen, escribe únicamente: NINGUNO/);
});

test("8. el prompt sigue prohibiendo recomendaciones y probabilidades", () => {
  assert.match(prompt, /No recomiendes apostar/);
  assert.match(prompt, /no generes probabilidades/i);
});

test("9. el prompt conserva fixture, mercado, selección y línea", () => {
  assert.match(prompt, /Fixture ID: 1520819/);
  assert.match(prompt, /Competición: Brasil Serie B/);
  assert.match(prompt, /Mercado: Goles/);
  assert.match(prompt, /Under 2\.5/);
  assert.match(prompt, /Línea exacta: 2\.5/);
  assert.match(prompt, /Fase o ronda: Regular Season - 22/);
  assert.match(prompt, /Formato: single_or_group_match/);
  assert.match(prompt, /Marcador agregado: No disponible/);
});

test("10. Sport Recife materializa Brasil Serie B", async () => {
  const context = (await sportsResult()).competitiveContext;
  assert.equal(context.competition.name, "Brasil Serie B");
  assert.equal(context.competition.type, "domestic_league");
});

test("11. Sport Recife materializa la temporada 2026", async () => {
  assert.equal((await sportsResult()).competitiveContext.competition.season, 2026);
});

test("12. Sport Recife materializa Regular Season - 22", async () => {
  assert.equal((await sportsResult()).competitiveContext.competition.round, "Regular Season - 22");
});

test("13. Sport Recife materializa local y visitante", async () => {
  assert.deepEqual((await sportsResult()).competitiveContext.fixture_role, { home_team: "Sport Recife", away_team: "Londrina" });
});

test("14. el contexto de liga no inventa marcador agregado", async () => {
  assert.equal((await sportsResult()).competitiveContext.aggregate, null);
});

test("15. una copa conserva la fase conocida", () => {
  const domestic = buildCompetitiveContext({ fixture: { ...fixture, competition: { id: 100, name: "Copa Brasil", country: "Brazil", season: 2026, round: "Semifinal - 2nd Leg" } } });
  const libertadores = buildCompetitiveContext({ fixture: { ...fixture, competition: { id: 13, name: "Copa Libertadores", country: "World", season: 2026, round: "Fase de grupos" } } });
  assert.equal(domestic.competition.type, "domestic_cup");
  assert.equal(domestic.competition.round, "Semifinal - 2nd Leg");
  assert.equal(libertadores.competition.type, "international");
  assert.equal(libertadores.competition.round, "Fase de grupos");
  assert.equal(libertadores.leg, "single_or_group_match");
});

test("16. ida o vuelta solo aparece con soporte en la ronda", () => {
  const secondLeg = buildCompetitiveContext({ fixture: { ...fixture, competition: { ...fixture.competition, name: "Copa Brasil", round: "Semifinal - 2nd Leg" } } });
  const unknownLeg = buildCompetitiveContext({ fixture: { ...fixture, competition: { ...fixture.competition, name: "Copa Brasil", round: "Semifinal" } } });
  assert.equal(secondLeg.leg, "second_leg");
  assert.equal(unknownLeg.leg, "single_or_group_match");
});

test("17. el agregado solo se materializa cuando existe", () => {
  const withoutAggregate = buildCompetitiveContext({ fixture });
  const withAggregate = buildCompetitiveContext({ fixture: { ...fixture, competition: { id: 11, name: "Copa Sudamericana", country: "World", season: 2026, round: "Octavos de final - Vuelta" }, score: { ...fixture.score, aggregate: { home: 1, away: 0 } } } });
  assert.equal(withoutAggregate.aggregate, null);
  assert.deepEqual(withAggregate.aggregate, { home: 1, away: 0 });
  assert.equal(withAggregate.competition.type, "international");
  assert.equal(withAggregate.leg, "second_leg");
});

test("18. el reanálisis Gemini conserva el contexto verificado por API", async () => {
  const initial = await analyzeOperationalFixture({
    ...sportsInput,
    analysisMode: "specific",
    line: "2.5",
    selection: "Under 2.5",
    evaluatePrice: false,
    transferredCandidate: { fixture_id: fixture.fixtureId, analysis_mode: "specific", market_family: "goals", direction: "under", line: 2.5, selection: "Under 2.5", preliminary_probability: 0.64, uncertainty: { low: 0.51, high: 0.75 }, sports_score: 82, rank: 1, overall_rank: 1, family_rank: 1 },
  }, gateway(), { now: () => "2026-08-14T16:00:00.000Z", idFactory: () => "initial-context" });
  const reanalyzed = await analyzeOperationalFixture({
    ...sportsInput,
    analysisMode: "specific",
    line: "2.5",
    selection: "Under 2.5",
    evaluatePrice: false,
    reanalysis: true,
    geminiResponse: "HECHOS CONFIRMADOS\nHECHO: Sport Recife vs Londrina mantiene la línea Under 2.5.\nIMPACTO: sin cambio.\nFUENTE: Dimayor\nURL: https://dimayor.com.co/noticia\nFECHA: 14/08/2026\nRUMORES\nNINGUNO\nCONTRADICCIONES\nNINGUNO\nDATOS NO ENCONTRADOS\n- Rotaciones no verificadas.",
  }, gateway(), { now: () => "2026-08-14T16:05:00.000Z", idFactory: () => "gemini-context", previousVersion: initial.analysisVersion });
  assert.equal(reanalyzed.competitiveContext.competition.name, "Brasil Serie B");
  assert.equal(reanalyzed.competitiveContext.competition.round, "Regular Season - 22");
  assert.deepEqual(reanalyzed.competitiveContext.fixture_role, initial.competitiveContext.fixture_role);
});

test("19. la voz sencilla positiva no muestra marginal", async () => {
  const source = await readFile(clientPath, "utf8");
  const simple = source.slice(source.indexOf("function DirectorResult"), source.indexOf("function MarketAssessment"));
  assert.doesNotMatch(simple, /marginal/i);
  assert.match(simple, /La cuota actual es suficiente para esta opción según el análisis de Atlas/);
});

test("20. la voz sencilla positiva no menciona valor esperado", async () => {
  const source = await readFile(clientPath, "utf8");
  const simple = source.slice(source.indexOf("function DirectorResult"), source.indexOf("function MarketAssessment"));
  assert.doesNotMatch(simple, /valor esperado|modelo preliminar|amplitud del intervalo/i);
});

test("21. APOSTAR conserva el estado económico interno marginal", () => {
  const input = director("marginal");
  const presentation = buildSimpleDirectorPresentation(input);
  assert.equal(presentation.price_decision.label, "APOSTAR");
  assert.equal(input.price_assessment.status, "marginal");
  assert.equal(input.analysis_confidence_score, 74);
  assert.equal(input.price_assessment.bookmaker, "Betano");
  assert.equal(input.price_assessment.decimal_odds, 1.83);
});

test("22. NO APOSTAR conserva el estado económico interno desfavorable", async () => {
  const input = director("unfavorable");
  const presentation = buildSimpleDirectorPresentation(input);
  assert.equal(presentation.price_decision.label, "NO APOSTAR");
  assert.equal(input.price_assessment.status, "unfavorable");
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /Me gusta el mercado, pero no lo jugaría a esta cuota/);
  assert.match(source, /Atlas no recomienda esta opción a la cuota actual/);
});

test("23. la cuota stale conserva el mensaje de actualización", () => {
  const result = buildSimpleDirectorPresentation({ ...director(), price_assessment: { status: "unavailable", freshness: "unavailable", source_status: "unavailable" } }, { historicalQuote: { bookmaker_name: "Betano", decimal_odds: 1.83 } });
  assert.equal(result.price_decision.explanation, "Cuota vencida — actualízala para tomar una decisión.");
});

test("24. el modo experto conserva vocabulario y contrato económico", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /expert-director/);
  assert.match(source, /marginal/);
  assert.match(source, /implied_probability/);
  assert.match(source, /price_assessment/);
});
