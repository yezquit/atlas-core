import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { todayLocalDateString } from "../intelligence/dateTimeContext.js";
import { rankJourneyCandidatesByProbability, scanSportsJourney } from "../services/sportsIntelligenceService.js";
import { analyzeOperationalFixture } from "../services/operationalAnalysisService.js";

const clientPath = new URL("../../app/atlas-functional-client.js", import.meta.url);

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

function gateway({ fixturesForDate = [], fixturesByCompetition = null, history = null } = {}) {
  const resolvedHistory = history || Array.from({ length: 10 }, (_, index) => historicalFixture(index));
  return {
    runtime: { snapshot: () => ({ requestsUsed: 5, cacheHits: 0, cacheMisses: 5, deduplicated: 0, configuredBudget: 45, configuredBudgetRemaining: 40, budgetExhausted: false, quotaStatus: "available" }) },
    loadCompetitionMetadata: async () => ({
      status: DATA_LOAD_STATUS.SUCCESS,
      seasonMetadata: { year: 2026, coverage: { odds: true, fixtures: { statistics_fixtures: true, lineups: false }, injuries: false, standings: false } },
      availableSeasons: [2026],
      verificationStatus: "verified",
    }),
    loadFixtureById: async ({ fixtureId }) => ({ status: DATA_LOAD_STATUS.SUCCESS, selectedFixtureId: fixtureId, fixture: targetFixture(fixtureId) }),
    loadLeagueWindow: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: resolvedHistory }),
    loadTeamRecent: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: resolvedHistory }),
    loadFixtureStatistics: async (fixtureId) => {
      const item = resolvedHistory.find((candidate) => candidate.fixtureId === fixtureId);
      return { status: DATA_LOAD_STATUS.SUCCESS, fixtureId, statistics: fixtureStatistics(item || resolvedHistory[0]) };
    },
    loadFixturesForDate: async ({ competition } = {}) => {
      const fixtures = fixturesByCompetition ? (fixturesByCompetition[competition?.key] || []) : fixturesForDate;
      return {
        status: fixtures.length ? DATA_LOAD_STATUS.SUCCESS : DATA_LOAD_STATUS.EMPTY,
        fixtures,
        message: fixtures.length ? "Partidos disponibles" : "Sin partidos",
      };
    },
    loadFixtureOdds: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, response: [] }),
  };
}

const journeyBase = { date: "2026-08-01", competitionKeys: ["colombiaPrimeraA"], timezone: "America/Bogota" };

test("1. la fecha de hoy se calcula con getters locales, no con toISOString/UTC", () => {
  assert.equal(todayLocalDateString(new Date(2026, 7, 27, 1, 30)), "2026-08-27");
});

test("2. la fecha de hoy respeta año, mes y día locales sin desplazamiento", () => {
  assert.equal(todayLocalDateString(new Date(2026, 0, 5)), "2026-01-05");
});

test("3. la UI inicializa la fecha con todayLocalDateString y ya no la deja vacía", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.ok(source.includes('setDate((current) => current || todayLocalDateString())'));
  assert.ok(source.includes("setDate(todayLocalDateString())"));
  assert.equal(source.includes('setDate("")'), false);
});

test("4. escanear jornada analiza TODOS los fixtures elegibles, sin tope artificial de 50", async () => {
  const fixtures = Array.from({ length: 60 }, (_, index) => targetFixture(8_000 + index));
  const result = await scanSportsJourney(
    { ...journeyBase, marketIds: ["goals"] },
    gateway({ fixturesForDate: fixtures })
  );
  assert.equal(result.status, DATA_LOAD_STATUS.SUCCESS);
  assert.equal(result.fixturesReviewed, 60);
});

test("5. un maximumFixtures explícito ya no trunca el análisis (causa raíz eliminada)", async () => {
  const fixtures = Array.from({ length: 20 }, (_, index) => targetFixture(8_200 + index));
  const result = await scanSportsJourney(
    { ...journeyBase, marketIds: ["goals"], maximumFixtures: 12 },
    gateway({ fixturesForDate: fixtures })
  );
  assert.equal(result.fixturesReviewed, 20);
});

test("6. búsqueda general puede producir candidatos de varias familias soportadas a la vez", async () => {
  const fixtures = [targetFixture(8_400)];
  const result = await scanSportsJourney(
    { ...journeyBase, marketIds: ["goals", "corners"], maximumFixtures: 1 },
    gateway({ fixturesForDate: fixtures })
  );
  const families = new Set(result.candidates.map((candidate) => candidate.marketId));
  assert.ok(families.size >= 2);
});

test("7. jornada en modo mercado específico solo necesita la familia, sin dirección ni línea", async () => {
  const fixtures = [targetFixture(8_500)];
  const result = await scanSportsJourney(
    { ...journeyBase, marketIds: ["goals"], maximumFixtures: 1, analysisMode: "specific" },
    gateway({ fixturesForDate: fixtures })
  );
  const primary = result.candidates[0];
  assert.ok(primary);
  assert.ok(primary.direction === "over" || primary.direction === "under");
  assert.ok(Number.isFinite(primary.line));
});

test("8. partido individual: familia sola basta para que Atlas determine dirección y línea", async () => {
  const result = await analyzeOperationalFixture(
    { date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026, fixtureId: 9_000, marketId: "goals", analysisMode: "specific", line: null, selection: null, manualOdds: null, manualCandidateOdds: [] },
    gateway({ fixturesForDate: [] }),
    { now: () => "2026-08-01T12:00:00.000Z", idFactory: () => "v-family-only" }
  );
  assert.equal(result.marketSelection.analysis_mode, "specific");
  assert.equal(result.marketSelection.requested_market_family, "goals");
  const primary = result.marketSelection.primary;
  assert.ok(primary);
  assert.ok(primary.direction === "over" || primary.direction === "under");
  assert.ok(Number.isFinite(primary.line));
});

test("9. partido individual general produce análisis deportivo sin ningún dato de Gemini, y la UI lo muestra antes de exigir Gemini", async () => {
  const result = await analyzeOperationalFixture(
    { date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026, fixtureId: 9_100, marketId: "open", analysisMode: "general", manualOdds: null, manualCandidateOdds: [] },
    gateway({ fixturesForDate: [] }),
    { now: () => "2026-08-01T12:00:00.000Z", idFactory: () => "v-general-no-gemini" }
  );
  assert.equal(result.status, DATA_LOAD_STATUS.SUCCESS);
  assert.ok(result.director);
  assert.ok(result.marketSelection.primary);

  const source = await readFile(clientPath, "utf8");
  // La vista simple muestra el análisis inicial (deportivo) mientras no exista
  // contexto de Gemini; solo cambia a DirectorResult cuando analysisCompleted
  // (que depende de Gemini) es true.
  assert.ok(source.includes("{analysisCompleted ? ("));
  assert.ok(source.includes("<InitialAnalysisResult analysis={analysis} />"));
  // El botón que dispara el análisis deportivo nunca depende del estado de Gemini.
  assert.ok(source.includes('disabled={analysisState.status === "loading" || !selectedFixtureId || !specificOptionReady}'));
});

test("10. la cuota no cambia la probabilidad ni la clasificación del candidato ganador", async () => {
  const input = { date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026, fixtureId: 9_200, marketId: "goals", analysisMode: "specific", line: null, selection: null, manualCandidateOdds: [] };
  const withoutOdds = await analyzeOperationalFixture(
    { ...input, manualOdds: null },
    gateway({ fixturesForDate: [] }),
    { now: () => "2026-08-01T12:00:00.000Z", idFactory: () => "v-no-odds" }
  );
  const primaryWithoutOdds = withoutOdds.marketSelection.primary;
  const withOdds = await analyzeOperationalFixture(
    { ...input, reanalysis: true, manualOdds: { marketFamily: "goals", bookmaker: "Betano", direction: primaryWithoutOdds.direction, selection: primaryWithoutOdds.selection, line: String(primaryWithoutOdds.line), decimalOdds: "1.8", consultedAt: "2026-08-01T11:00:00.000Z", timezone: "America/Bogota" } },
    gateway({ fixturesForDate: [] }),
    { now: () => "2026-08-01T12:00:00.000Z", idFactory: () => "v-with-odds" }
  );
  const primaryWithOdds = withOdds.marketSelection.primary;
  // Confirma que la cuota realmente se incorporó (no fue ignorada en silencio
  // por un contrato de manualOdds inválido), para que la comparación de abajo
  // sea significativa y no trivial.
  assert.notEqual(primaryWithOdds.price_status, "unavailable");
  assert.equal(primaryWithOdds.probability_percent, primaryWithoutOdds.probability_percent);
  assert.equal(primaryWithOdds.probability_classification, primaryWithoutOdds.probability_classification);
  assert.equal(primaryWithOdds.selection, primaryWithoutOdds.selection);
});

test("11. las tarjetas simples usan probability_percent y probability_classification, no sports_score, como cifra principal", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.ok(source.includes("candidate.probabilityPercent"));
  assert.ok(source.includes("candidate.probabilityClassification"));
  // DirectorResult ya no referencia probability_percent/probability_classification
  // inline: delega en candidateProbabilityDisplay(analysis.marketSelection?.primary),
  // cuyo branch clásico sigue leyendo esos mismos campos (source?.probability_percent
  // / .probability_classification), nunca sports_score, como cifra principal.
  assert.ok(source.includes("const primaryProbabilityDisplay = candidateProbabilityDisplay(analysis.marketSelection?.primary)"));
  const directorResultBlock = source.slice(source.indexOf("function DirectorResult"), source.indexOf("function MarketAssessment"));
  assert.match(directorResultBlock, /primaryProbabilityDisplay\.formatted/);
  assert.ok(directorResultBlock.includes("analysis.marketSelection?.primary?.probability_classification"));
  const probabilityDisplayFn = source.slice(source.indexOf("function candidateProbabilityDisplay"), source.indexOf("const SETTLEMENT_OUTCOME_LABELS"));
  assert.match(probabilityDisplayFn, /source\?\.probability_percent/);
  assert.equal(directorResultBlock.includes("sports_verdict?.sports_score"), false);
});

test("12. un fixture revisado sin candidato evaluable sigue apareciendo en los diagnósticos de la jornada", async () => {
  const insufficientHistory = Array.from({ length: 2 }, (_, index) => historicalFixture(index));
  const result = await scanSportsJourney(
    { ...journeyBase, marketIds: ["goals"], maximumFixtures: 1 },
    gateway({ fixturesForDate: [targetFixture(8_600)], history: insufficientHistory })
  );
  assert.equal(result.fixturesReviewed, 1);
  assert.equal(result.analysisDiagnostics.length, 1);
  assert.equal(result.analysisDiagnostics[0].rankedCandidateCount, 0);
});

test("13. un fixture sin candidato evaluable no aparece con 0% ni en la lista de opciones destacadas", async () => {
  const insufficientHistory = Array.from({ length: 2 }, (_, index) => historicalFixture(index));
  const result = await scanSportsJourney(
    { ...journeyBase, marketIds: ["goals"], maximumFixtures: 1 },
    gateway({ fixturesForDate: [targetFixture(8_700)], history: insufficientHistory })
  );
  const diagnostic = result.analysisDiagnostics[0];
  assert.equal(diagnostic.rankedCandidateCount, 0);
  assert.equal(diagnostic.marketStatuses.every((market) => market.candidate === false), true);
  assert.equal(result.candidates.some((candidate) => candidate.fixtureId === 8_700), false);
});

test("14. Jornada muestra todos los revisados (incluidos los sin candidato) como 'No evaluable', nunca como 0%, y el destacado no sustituye la lista completa", async () => {
  const source = await readFile(clientPath, "utf8");

  // El destacado (JourneyCandidateCard) y la lista completa de revisados
  // (JourneyMatchesReviewed) se renderizan juntos: uno no excluye al otro.
  const journeySection = source.slice(
    source.indexOf('{mainMode === "journey" ? ('),
    source.indexOf(') : mainMode === "match" ? (')
  );
  assert.ok(journeySection.includes("<JourneyCandidateCard"));
  assert.ok(journeySection.includes("<JourneyMatchesReviewed"));

  // JourneyMatchesReviewed recorre TODA la colección de diagnósticos, sin
  // filtrarla antes de mapearla (un fixture con 0 candidatos sigue siendo
  // renderizable, no desaparece de la lista).
  const reviewedBlock = source.slice(
    source.indexOf("function JourneyMatchesReviewed"),
    source.indexOf("function JourneyTechnicalDetails")
  );
  assert.ok(reviewedBlock.includes("const diagnostics = journey.analysisDiagnostics || [];"));
  assert.ok(reviewedBlock.includes("{diagnostics.map((item) =>"));
  assert.equal(reviewedBlock.includes("diagnostics.filter("), false);

  // Un fixture sin candidato queda etiquetado explícitamente como
  // "No evaluable", nunca con un porcentaje ni con 0%.
  assert.ok(reviewedBlock.includes('item.rankedCandidateCount > 0 ? "Evaluado" : "No evaluable"'));
  assert.ok(reviewedBlock.includes('market.candidate ? "Opción evaluable" : "No evaluable"'));
  assert.equal(reviewedBlock.includes("rankedCandidateCount}%"), false);
  assert.equal(reviewedBlock.includes("0%"), false);
});

test("15. la UI no importa ni ejecuta el clasificador de probabilidad (solo consume campos ya calculados por el backend)", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.equal(source.includes("@/core/intelligence/probabilityClassification"), false);
  assert.equal(source.includes("classifyProbability("), false);
  assert.equal(source.includes("toProbabilityPercent("), false);
  assert.equal(source.includes('"MUY ALTA"'), false);
  assert.equal(source.includes("'MUY ALTA'"), false);
  // Consumir el dato ya calculado SÍ está permitido y se exige:
  assert.ok(source.includes("candidate.probabilityClassification"));
  assert.ok(source.includes("analysis.marketSelection?.primary?.probability_classification"));
});

test("16. specificOptionReady solo exige familia sola o el refinamiento completo (dirección+línea); una sola de las dos queda inválida", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.ok(source.includes(
    "const exactRefinementComplete = (!hasDirection && !hasLine) || (hasDirection && hasLine);"
  ));
  assert.ok(source.includes(
    'const specificOptionReady = analysisMode !== "specific" || Boolean(marketId && marketId !== "open" && exactRefinementComplete);'
  ));
  assert.ok(source.includes("Para forzar una selección exacta debes completar Dirección y Línea."));

  // Misma fórmula ya confirmada arriba en el código real, evaluada aquí como
  // tabla de verdad para las 4 combinaciones posibles.
  const exactRefinementComplete = (hasDirection, hasLine) => (!hasDirection && !hasLine) || (hasDirection && hasLine);
  assert.equal(exactRefinementComplete(false, false), true); // familia sola
  assert.equal(exactRefinementComplete(true, false), false); // solo dirección
  assert.equal(exactRefinementComplete(false, true), false); // solo línea
  assert.equal(exactRefinementComplete(true, true), true); // dirección + línea
});

test("17. jornada revisa fixtures de varias competiciones distintas a la vez", async () => {
  const fixtureA = targetFixture(8_800);
  const fixtureB = targetFixture(8_900);
  const result = await scanSportsJourney(
    { ...journeyBase, competitionKeys: ["colombiaPrimeraA", "colombiaPrimeraB"], marketIds: ["goals"], maximumFixtures: 50 },
    gateway({ fixturesByCompetition: { colombiaPrimeraA: [fixtureA], colombiaPrimeraB: [fixtureB] } })
  );
  assert.equal(result.status, DATA_LOAD_STATUS.SUCCESS);
  assert.equal(result.fixturesFound, 2);
  assert.equal(result.fixturesReviewed, 2);
  const reviewedIds = new Set(result.analysisDiagnostics.map((item) => item.fixtureId));
  assert.ok(reviewedIds.has(8_800));
  assert.ok(reviewedIds.has(8_900));
});

test("18. rankJourneyCandidatesByProbability: manda estimated_probability sobre sports_score, sin fallback a preliminary_probability", () => {
  const entry = (id, family, fixtureId, overrides) => ({
    analysis: { fixture: { fixtureId } },
    candidate: { candidate_id: id, market_family: family, ...overrides },
  });
  const A = entry("a", "goals", 1, { sports_score: 55, estimated_probability: 0.90, ranking_eligible: true });
  const B = entry("b", "corners", 2, { sports_score: 80, estimated_probability: 0.68, ranking_eligible: true });
  const D = entry("d", "total_shots", 4, { estimated_probability: null, preliminary_probability: 0.99, ranking_eligible: true });
  const E = entry("e", "shots_on_goal", 5, { estimated_probability: 0.50, ranking_eligible: true });

  const ranked = rankJourneyCandidatesByProbability([B, D, E, A]);
  // A (0.90) antes que B (0.68) pese a que B tiene mayor sports_score (80 > 55).
  assert.deepEqual(ranked.map((item) => item.candidate.candidate_id), ["a", "b", "e", "d"]);
  assert.equal(ranked.slice(0, 1)[0].candidate.candidate_id, "a");
  // D (estimated_probability null, preliminary_probability .99) no sube como si tuviera 99%: sin fallback, queda al final.
  assert.equal(ranked[ranked.length - 1].candidate.candidate_id, "d");
});

test("19. scanSportsJourney filtra ranking_eligible antes de rankear y truncar la colección pública (protección de integración)", async () => {
  const source = await readFile(
    new URL("../services/sportsIntelligenceService.js", import.meta.url),
    "utf8"
  );
  const highlightedLine = source.slice(
    source.indexOf("const highlightedSports ="),
    source.indexOf(";", source.indexOf("const highlightedSports ="))
  );
  assert.ok(highlightedLine.includes("rankJourneyCandidatesByDecision("));
  assert.ok(highlightedLine.includes("analysisCandidates.filter((entry) => entry.candidate?.ranking_eligible === true)"));
  assert.ok(highlightedLine.includes(").slice(0, maximumCandidates)"));
  // El filtro de elegibilidad debe ocurrir DENTRO de la llamada a la frontera de decisión
  // (es decir, antes del ranking y del slice), no después.
  assert.ok(
    highlightedLine.indexOf("analysisCandidates.filter(") <
      highlightedLine.indexOf(").slice(0, maximumCandidates)")
  );
});
