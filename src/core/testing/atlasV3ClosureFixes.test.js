import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { scanSportsJourney } from "../services/sportsIntelligenceService.js";
import { selectExactRequestedCandidate } from "../services/operationalAnalysisService.js";
import { buildRankedMarketSelection } from "../intelligence/marketCandidateRanker.js";
import { generateCandidateLines } from "../intelligence/candidateLineGenerator.js";
import { buildAtlasCombination } from "../intelligence/atlasCombinationEngine.js";
import { findFixtureQuoteEntry, fixtureSelectionKey } from "../intelligence/fixtureQuoteLedger.js";

const testingDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientPath = path.resolve(testingDirectory, "../../app/atlas-functional-client.js");
const combinationBuilderPath = path.resolve(testingDirectory, "../../app/atlas-combination-builder.js");

// ---- Perfiles realistas reutilizables (mismo patrón que selectionEngine.test.js) ----
const VALUES = { cards: [6, 7, 4, 6, 8, 5, 7, 3, 6, 9], goals: [1, 2, 0, 3, 1, 2, 1, 0, 2, 1] };
function eventSamples(limit, values) {
  return {
    cards: { match_totals: values.cards.slice(0, limit) },
    goals: { match_totals: values.goals.slice(0, limit) },
  };
}
function profiles() {
  const team = {
    quality_status: "verified",
    last_5: { event_samples: eventSamples(5, VALUES) },
    last_10: { event_samples: eventSamples(10, VALUES) },
    as_home: { event_samples: eventSamples(5, VALUES) },
    as_away: { event_samples: eventSamples(5, VALUES) },
  };
  return {
    leagueProfile: { quality_status: "verified", event_samples: eventSamples(10, VALUES) },
    homeTeamProfile: structuredClone(team),
    awayTeamProfile: structuredClone(team),
    refereeProfile: { status: "confirmed", quality_status: "verified", event_samples: { cards: { match_totals: VALUES.cards } } },
  };
}
function cardsAssessment() {
  return [{
    market_family: "cards",
    market_label: "Tarjetas",
    technical_support_score: 80,
    sample_size: 10,
    candidate: true,
    data_requirements: ["league", "home", "away"],
    available_evidence: [{ requirement: "league" }, { requirement: "home" }, { requirement: "away" }],
    missing_evidence: [],
    risk_flags: [],
  }];
}

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
    ...targetFixture(9_000 + index),
    date: { utc: `2026-07-${String((index % 27) + 1).padStart(2, "0")}T20:00:00.000Z` },
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
function gateway(fixturesForDate) {
  const resolvedHistory = Array.from({ length: 10 }, (_, index) => historicalFixture(index));
  return {
    runtime: { snapshot: () => ({ requestsUsed: 5, cacheHits: 0, cacheMisses: 5, deduplicated: 0, configuredBudget: 2500, configuredBudgetRemaining: 2495, budgetExhausted: false, quotaStatus: "available" }) },
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
    loadFixturesForDate: async () => ({ status: fixturesForDate.length ? DATA_LOAD_STATUS.SUCCESS : DATA_LOAD_STATUS.EMPTY, fixtures: fixturesForDate, message: "ok" }),
    loadFixtureOdds: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, response: [] }),
  };
}
const journeyBase = { date: "2026-08-01", competitionKeys: ["colombiaPrimeraA"], timezone: "America/Bogota", marketIds: ["goals"] };

test("1. la UI de Jornada permite seleccionar y deseleccionar todas las competiciones en un clic", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, />Seleccionar todas</);
  assert.match(source, />Deseleccionar todas</);
});

test("2. un escaneo produce EL MISMO conjunto de fixture_id en ejecuciones repetidas con la misma entrada", async () => {
  const fixtures = Array.from({ length: 30 }, (_, index) => targetFixture(10_000 + index));
  const gw = gateway(fixtures);
  const first = await scanSportsJourney({ ...journeyBase }, gw);
  const second = await scanSportsJourney({ ...journeyBase }, gw);
  const firstIds = first.analysisDiagnostics.map((item) => item.fixtureId).sort((a, b) => a - b);
  const secondIds = second.analysisDiagnostics.map((item) => item.fixtureId).sort((a, b) => a - b);
  assert.equal(first.fixturesReviewed, 30);
  assert.equal(second.fixturesReviewed, 30);
  assert.deepEqual(firstIds, secondIds);
});

test("3. no hay filtrado de fixtures antes del análisis: todos los elegibles se revisan", async () => {
  const fixtures = Array.from({ length: 45 }, (_, index) => targetFixture(11_000 + index));
  const result = await scanSportsJourney({ ...journeyBase }, gateway(fixtures));
  assert.equal(result.fixturesReviewed, result.prematchFixturesFound);
  assert.equal(result.fixturesReviewed, 45);
});

test("4. la línea exacta escrita por el usuario (under 6.5) permanece 6.5, nunca se sustituye", () => {
  const marketSelection = buildRankedMarketSelection({
    analysisMode: "specific",
    requestedMarketId: "cards",
    marketAssessments: cardsAssessment(),
    ...profiles(),
    exactLine: 6.5,
  });
  const result = selectExactRequestedCandidate(marketSelection, { marketFamily: "cards", requestedLine: "6.5", requestedSelection: "under" });
  assert.equal(result.primary.market_family, "cards");
  assert.equal(result.primary.line, 6.5);
  assert.equal(result.primary.direction, "under");
});

test("5. cambiar la línea solicitada de 7.5 a 6.5 obliga a recalcular y no reutiliza la probabilidad anterior", () => {
  const buildFor = (line) => {
    const marketSelection = buildRankedMarketSelection({
      analysisMode: "specific",
      requestedMarketId: "cards",
      marketAssessments: cardsAssessment(),
      ...profiles(),
      exactLine: line,
    });
    return selectExactRequestedCandidate(marketSelection, { marketFamily: "cards", requestedLine: String(line), requestedSelection: "under" });
  };
  const at75 = buildFor(7.5);
  const at65 = buildFor(6.5);
  assert.equal(at75.primary.line, 7.5);
  assert.equal(at65.primary.line, 6.5);
  assert.notEqual(at75.primary.estimated_probability, at65.primary.estimated_probability);
});

test("6. distintas líneas del mismo fixture y familia pueden tener probabilidades distintas", () => {
  const result = generateCandidateLines({ marketFamily: "cards", exactLine: 6.5, ...profiles() });
  const overByLine = new Map(result.candidates.filter((item) => item.direction === "over").map((item) => [item.line, item.estimated_probability]));
  const distinctValues = new Set(overByLine.values());
  assert.ok(distinctValues.size > 1, "las probabilidades de distintas líneas no deben ser todas iguales");
});

test("7. las alternativas viables de la misma familia no desaparecen porque otra línea tenga mayor probabilidad", () => {
  const marketSelection = buildRankedMarketSelection({
    analysisMode: "specific",
    requestedMarketId: "cards",
    marketAssessments: cardsAssessment(),
    ...profiles(),
  });
  const primaryFamily = marketSelection.primary?.market_family;
  assert.equal(primaryFamily, "cards");
  const sameFamilyAlternative = marketSelection.alternatives.some((candidate) => candidate.market_family === "cards" && candidate.line !== marketSelection.primary.line);
  assert.ok(sameFamilyAlternative, "debe existir al menos una alternativa de otra línea de la misma familia");
});

test("8. una cuota de fixture 500 + cards + under + 7.5 no puede reutilizarse para fixture 500 + cards + under + 6.5", () => {
  const entryAt75 = {
    selection_key: fixtureSelectionKey({ fixtureId: 500, marketId: "cards", direction: "under", line: 7.5 }),
    fixture_id: 500,
    market_family: "cards",
    direction: "under",
    line: "7.5",
    active_quote: { fixture_id: 500, market_family: "cards", direction: "under", line: 7.5, decimal_odds: 1.8, verification_status: "verified_provider", freshness: "fresh" },
  };
  const ledger = { contract: "FixtureQuoteLedger", version: 1, fixture_id: 500, entries: [entryAt75] };

  const candidateAt65 = { fixtureId: 500, marketId: "cards", direction: "under", line: 6.5 };
  assert.equal(findFixtureQuoteEntry(ledger, candidateAt65), null);

  const candidateAt75 = { fixtureId: 500, marketId: "cards", direction: "under", line: 7.5 };
  const matchedEntry = findFixtureQuoteEntry(ledger, candidateAt75);
  assert.ok(matchedEntry);
  assert.equal(matchedEntry.active_quote.line, 7.5);
});

test("9. Parlay/Soñadora no reutiliza la probabilidad de otra línea al corregir una pierna", () => {
  const original = { fixtureId: 700, marketId: "cards", direction: "under", line: 7.5, selection: "Under 7.5", sportsScore: 80, ranking_eligible: true, estimated_probability: 0.75, active_quote: null };
  const corrected = { ...original, line: 6.5, selection: "Under 6.5", estimated_probability: 0.55, active_quote: null };
  const other = { fixtureId: 701, marketId: "goals", direction: "over", line: 1.5, selection: "Over 1.5", sportsScore: 80, ranking_eligible: true, estimated_probability: 0.7, active_quote: null };
  const result = buildAtlasCombination({ candidates: [corrected, other], product: "parlay", mode: "automatic", selections: 2 });
  assert.equal(result.status, "ready");
  const leg = result.selections.find((item) => item.fixture_id === 700);
  assert.equal(leg.line, 6.5);
  assert.equal(leg.estimated_probability, 0.55);
  assert.notEqual(leg.estimated_probability, original.estimated_probability);
});

test("10. Parlay/Soñadora inicia con la fecha local de hoy, no una fecha fija hardcodeada", async () => {
  const source = await readFile(combinationBuilderPath, "utf8");
  assert.match(source, /todayLocalDateString/);
  assert.doesNotMatch(source, /useState\(\["2026-08-28"\]\)/);
});

test("11. el flujo manual de Gemini (Deep Research + Pro normal) sigue intacto", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /Copiar prompt para Gemini Pro \+ Deep Research/);
  assert.match(source, /Copiar prompt para Gemini Pro normal/);
});
