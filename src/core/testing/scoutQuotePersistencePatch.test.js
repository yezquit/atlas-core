import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildFixtureQuoteLedger,
  buildJourneyOperationalRanking,
  findFixtureQuoteEntry,
  fixtureSelectionKey,
} from "../intelligence/fixtureQuoteLedger.js";
import { createManualOdds, manualOddsCopyWarning, validateManualOddsInput } from "../intelligence/oddsIntelligence.js";
import { evaluateMarketPrice } from "../intelligence/marketSuitability.js";
import { buildConservativeParlays } from "../intelligence/parlayPolicy.js";
import { createMemoryOperationalHistory } from "../infrastructure/operationalHistory.js";
import { calculateSportsAnalysisConfidence } from "../services/operationalAnalysisService.js";

const FIXTURE_ID = 1_378_494;
const NOW = "2026-08-13T18:00:00.000Z";
const KICKOFF = "2026-08-13T23:00:00.000Z";
const clientPath = new URL("../../app/atlas-functional-client.js", import.meta.url);
const routePath = new URL("../../app/api/operational-history/route.js", import.meta.url);

function quote({ family, direction, line, odds, bookmaker = "Betano", receivedAt = "2026-08-13T17:50:00.000Z", version = "initial" }) {
  return createManualOdds({
    fixtureId: FIXTURE_ID,
    bookmaker,
    marketFamily: family,
    marketName: family,
    selection: `${direction === "under" ? "Under" : "Over"} ${line}`,
    direction,
    line,
    decimalOdds: odds,
    receivedAt,
    analyzedAt: NOW,
    kickoff: KICKOFF,
    timezone: "America/Bogota",
    analysisVersion: version,
  });
}

function version({ id, family, direction, line, probability, activeQuote = null, odds = activeQuote ? [activeQuote] : [], createdAt }) {
  const preliminary = {
    probability_status: "preliminary",
    point_estimate: probability,
    uncertainty_low: probability - 0.12,
    uncertainty_high: probability + 0.12,
    sample_size_effective: 10,
  };
  const price = activeQuote ? evaluateMarketPrice({
    oddsQuote: activeQuote,
    preliminaryProbability: preliminary,
    confidenceScore: 74,
    sampleSize: 10,
    phase: "hours_before",
  }) : null;
  return {
    analysis_id: id,
    fixture_id: FIXTURE_ID,
    created_at: createdAt,
    phase: "hours_before",
    odds,
    active_quote: activeQuote,
    analysis_confidence: { analysis_confidence_score: 74 },
    preliminary_probability: preliminary,
    director: {
      fixture: { kickoff_utc: KICKOFF },
      market_evaluated: { family },
      sports_verdict: { direction, selection: `${direction === "under" ? "Under" : "Over"} ${line}` },
      selection: `${direction === "under" ? "Under" : "Over"} ${line}`,
      line: String(line),
      price_assessment: price,
    },
  };
}

const quoteA = quote({ family: "goals", direction: "over", line: 1.5, odds: 1.28, receivedAt: "2026-08-13T17:50:00.000Z", version: "a" });
const quoteB = quote({ family: "corners", direction: "under", line: 10.5, odds: 1.67, receivedAt: "2026-08-13T17:52:00.000Z", version: "b" });
const versions = [
  version({ id: "santos-a", family: "goals", direction: "over", line: 1.5, probability: 0.673, activeQuote: quoteA, createdAt: "2026-08-13T18:01:00.000Z" }),
  version({ id: "santos-b", family: "corners", direction: "under", line: 10.5, probability: 0.697, activeQuote: quoteB, createdAt: "2026-08-13T18:02:00.000Z" }),
  version({ id: "santos-c", family: "shots_on_goal", direction: "under", line: 9.5, probability: 0.66, createdAt: "2026-08-13T18:03:00.000Z" }),
];
const ledger = buildFixtureQuoteLedger(versions, { fixtureId: FIXTURE_ID, now: NOW, kickoff: KICKOFF });
const candidates = [
  { fixtureId: FIXTURE_ID, fixture: "Santos vs Macará", marketId: "goals", direction: "over", line: 1.5, selection: "Over 1.5", probability: 0.673, uncertaintyLow: 0.553, uncertaintyHigh: 0.793, sportsScore: 78, generalRank: 1, familyRank: 1 },
  { fixtureId: FIXTURE_ID, fixture: "Santos vs Macará", marketId: "corners", direction: "under", line: 10.5, selection: "Under 10.5", probability: 0.697, uncertaintyLow: 0.577, uncertaintyHigh: 0.817, sportsScore: 73, generalRank: 2, familyRank: 1 },
  { fixtureId: FIXTURE_ID, fixture: "Santos vs Macará", marketId: "shots_on_goal", direction: "under", line: 9.5, selection: "Under 9.5", probability: 0.66, uncertaintyLow: 0.54, uncertaintyHigh: 0.78, sportsScore: 82, generalRank: 3, familyRank: 1 },
];
const entryA = findFixtureQuoteEntry(ledger, candidates[0]);
const entryB = findFixtureQuoteEntry(ledger, candidates[1]);
const entryC = findFixtureQuoteEntry(ledger, candidates[2]);

test("1. evaluar candidato Scout A con cuota conserva la evaluación", () => {
  assert.equal(entryA.active_quote.bookmaker_name, "Betano");
  assert.equal(entryA.active_quote.decimal_odds, 1.28);
  assert.equal(entryA.price_status, "unfavorable");
});

test("2. volver al Scout conserva la cuota A", () => {
  assert.equal(findFixtureQuoteEntry(ledger, candidates[0]).active_quote.quote_id, quoteA.quote_id);
});

test("3. evaluar candidato Scout B conserva otra cuota", () => {
  assert.equal(entryB.active_quote.bookmaker_name, "Betano");
  assert.equal(entryB.active_quote.decimal_odds, 1.67);
});

test("4. integración Santos vs Macará vuelve al Scout con A y B", () => {
  const ranking = buildJourneyOperationalRanking(candidates, { [FIXTURE_ID]: ledger });
  assert.deepEqual({
    sports: candidates.map((candidate) => candidate.selection),
    operational: ranking.map((item) => item.candidate.selection),
    a: [entryA.active_quote.decimal_odds, entryA.price_status, entryA.operational_decision],
    b: [entryB.active_quote.decimal_odds, entryB.price_status, entryB.operational_decision],
    c: [entryC.active_quote, entryC.operational_decision],
  }, {
    sports: ["Over 1.5", "Under 10.5", "Under 9.5"],
    operational: ["Under 10.5", "Over 1.5"],
    a: [1.28, "unfavorable", "No"],
    b: [1.67, "marginal", "Sí, pero con cautela"],
    c: [null, "Pendiente de precio"],
  });
});

test("5. A y B permanecen asociadas a fixture, familia, dirección y línea exacta", () => {
  assert.equal(fixtureSelectionKey({ ...candidates[1], line: "10,50" }), fixtureSelectionKey(candidates[1]));
  assert.equal(findFixtureQuoteEntry(ledger, { ...candidates[0], fixtureId: FIXTURE_ID + 1 }), null);
  assert.equal(findFixtureQuoteEntry(ledger, { ...candidates[0], marketId: "cards" }), null);
  assert.equal(findFixtureQuoteEntry(ledger, { ...candidates[0], direction: "under" }), null);
  assert.equal(findFixtureQuoteEntry(ledger, { ...candidates[0], line: 2.5 }), null);
});

test("6. candidato C sin cuota permanece pendiente", () => {
  assert.equal(entryC.active_quote, null);
  assert.equal(entryC.operational_decision, "Pendiente de precio");
});

test("7. el ranking deportivo no cambia", () => {
  const before = structuredClone(candidates);
  buildJourneyOperationalRanking(candidates, { [FIXTURE_ID]: ledger });
  assert.deepEqual(candidates, before);
});

test("8. el ranking operativo se construye con A y B", () => {
  const ranking = buildJourneyOperationalRanking(candidates, { [FIXTURE_ID]: ledger });
  assert.deepEqual(ranking.map((item) => item.candidate.selection).sort(), ["Over 1.5", "Under 10.5"]);
});

test("9. candidato sin precio no entra como evaluado al ranking operativo", () => {
  const ranking = buildJourneyOperationalRanking(candidates, { [FIXTURE_ID]: ledger });
  assert.equal(ranking.some((item) => item.candidate.selection === "Under 9.5"), false);
});

test("10. marginal supera operativamente a unfavorable", () => {
  const ranking = buildJourneyOperationalRanking(candidates, { [FIXTURE_ID]: ledger });
  assert.deepEqual(ranking.map((item) => item.candidate.selection), ["Under 10.5", "Over 1.5"]);
});

test("11. Over 1.5 @1.28 continúa NO", () => {
  assert.equal(entryA.price_status, "unfavorable");
  assert.equal(entryA.operational_decision, "No");
});

test("12. Under 10.5 @1.67 continúa con cautela", () => {
  assert.equal(entryB.price_status, "marginal");
  assert.equal(entryB.operational_decision, "Sí, pero con cautela");
});

test("13. cotización stale no entra como actual", () => {
  const stale = quote({ family: "goals", direction: "over", line: 1.5, odds: 1.31, receivedAt: "2026-08-13T16:00:00.000Z", version: "stale" });
  const staleLedger = buildFixtureQuoteLedger([
    version({ id: "stale", family: "goals", direction: "over", line: 1.5, probability: 0.673, activeQuote: null, odds: [stale], createdAt: "2026-08-13T18:04:00.000Z" }),
  ], { fixtureId: FIXTURE_ID, now: NOW, kickoff: KICKOFF });
  assert.equal(staleLedger.entries[0].active_quote, null);
  assert.equal(staleLedger.entries[0].historical_quotes[0].freshness, "stale");
});

test("14. nueva cotización reemplaza active quote anterior", () => {
  const newer = quote({ family: "corners", direction: "under", line: 10.5, odds: 1.72, receivedAt: "2026-08-13T17:58:00.000Z", version: "new" });
  const updated = buildFixtureQuoteLedger([versions[1], version({ id: "new", family: "corners", direction: "under", line: 10.5, probability: 0.697, activeQuote: newer, createdAt: "2026-08-13T18:05:00.000Z" })], { fixtureId: FIXTURE_ID, now: NOW, kickoff: KICKOFF });
  assert.equal(updated.entries[0].active_quote.decimal_odds, 1.72);
  assert.equal(updated.entries.filter((entry) => entry.active_quote).length, 1);
});

test("15. cotización anterior queda histórica", () => {
  const newer = quote({ family: "corners", direction: "under", line: 10.5, odds: 1.72, receivedAt: "2026-08-13T17:58:00.000Z", version: "new" });
  const updated = buildFixtureQuoteLedger([versions[1], version({ id: "new", family: "corners", direction: "under", line: 10.5, probability: 0.697, activeQuote: newer, createdAt: "2026-08-13T18:05:00.000Z" })], { fixtureId: FIXTURE_ID, now: NOW, kickoff: KICKOFF });
  assert.equal(updated.entries[0].historical_quotes.some((item) => item.decimal_odds === 1.67), true);
  assert.equal(updated.entries[0].historical_quotes.every((item) => item.active === false), true);
});

test("16. cambio de bookmaker no contamina otra línea", () => {
  const other = quote({ family: "corners", direction: "under", line: 10.5, odds: 1.7, bookmaker: "Wplay", receivedAt: "2026-08-13T17:55:00.000Z", version: "wplay" });
  const mixed = buildFixtureQuoteLedger([versions[0], versions[1], version({ id: "wplay", family: "corners", direction: "under", line: 10.5, probability: 0.697, activeQuote: other, odds: [quoteA, quoteB, other], createdAt: "2026-08-13T18:04:00.000Z" })], { fixtureId: FIXTURE_ID, now: NOW, kickoff: KICKOFF });
  assert.equal(findFixtureQuoteEntry(mixed, candidates[0]).active_quote.bookmaker_name, "Betano");
  assert.equal(findFixtureQuoteEntry(mixed, candidates[1]).active_quote.bookmaker_name, "Wplay");
});

test("17. volver a comparar no crea un Scout deportivo distinto", async () => {
  const client = await readFile(clientPath, "utf8");
  const block = client.slice(client.indexOf("async function returnToJourneyComparison"), client.indexOf("return (", client.indexOf("async function returnToJourneyComparison")));
  assert.match(block, /refreshFixtureQuoteLedger/);
  assert.doesNotMatch(block, /scanJourney|setJourney\(null\)/);
  assert.match(client, /onClick=\{returnToJourneyComparison\}/);
});

test("18. probability no cambia al cotizar", () => {
  const before = candidates.map((candidate) => candidate.probability);
  buildJourneyOperationalRanking(candidates, { [FIXTURE_ID]: ledger });
  assert.deepEqual(candidates.map((candidate) => candidate.probability), before);
});

test("19. interval no cambia al cotizar", () => {
  const before = candidates.map((candidate) => [candidate.uncertaintyLow, candidate.uncertaintyHigh]);
  buildJourneyOperationalRanking(candidates, { [FIXTURE_ID]: ledger });
  assert.deepEqual(candidates.map((candidate) => [candidate.uncertaintyLow, candidate.uncertaintyHigh]), before);
});

test("20. sports_score no cambia al cotizar", () => {
  const before = candidates.map((candidate) => candidate.sportsScore);
  buildJourneyOperationalRanking(candidates, { [FIXTURE_ID]: ledger });
  assert.deepEqual(candidates.map((candidate) => candidate.sportsScore), before);
});

test("21. overall_rank no cambia al cotizar", () => {
  const before = candidates.map((candidate) => candidate.generalRank);
  buildJourneyOperationalRanking(candidates, { [FIXTURE_ID]: ledger });
  assert.deepEqual(candidates.map((candidate) => candidate.generalRank), before);
});

test("22. family_rank no cambia al cotizar", () => {
  const before = candidates.map((candidate) => candidate.familyRank);
  buildJourneyOperationalRanking(candidates, { [FIXTURE_ID]: ledger });
  assert.deepEqual(candidates.map((candidate) => candidate.familyRank), before);
});

test("23. confianza deportiva no cambia solo por introducir precio", () => {
  const sports = { source_quality: 0.9, sample_size: 1, variable_coverage: 0.8, source_concordance: 0.85, contradiction_control: 1, contextual_coverage: 2 / 3, provider_stability: 1 };
  const withoutPrice = calculateSportsAnalysisConfidence(sports);
  const withPrice = calculateSportsAnalysisConfidence({ ...sports, freshness: 1, verified_market_data: 1, verifiedOdds: true });
  assert.equal(withoutPrice.analysis_confidence_score, withPrice.analysis_confidence_score);
});

test("24. parlay puede cambiar por precio según reglas actuales", () => {
  const eligible = Array.from({ length: 6 }, (_, index) => ({
    fixture_id: FIXTURE_ID + index,
    candidate_id: `candidate-${index}`,
    ranking_version: "v1",
    market_family: "corners",
    line: 10.5,
    selection: "Under 10.5",
    decimal_odds: 1.67,
    odds_source_status: "user_reported",
    freshness: "fresh",
    market_suitability: "viable_with_caution",
    preliminary_probability: { probability_status: "preliminary" },
    uncertainty_width: 0.24,
    analysis_confidence_score: 74,
    price_status: "marginal",
    price_gap: 0.09,
  }));
  assert.equal(buildConservativeParlays(eligible).status, "allowed_with_caution");
  assert.equal(buildConservativeParlays(eligible.map((item) => ({ ...item, freshness: "stale" }))).status, "insufficient_candidates");
});

test("25. opción manual sigue independiente", async () => {
  const client = await readFile(clientPath, "utf8");
  assert.match(client, /manualMarketFamily/);
  assert.match(client, /analysisMode === "specific"/);
  assert.match(client, /Opción evaluada por solicitud del usuario/);
});

test("26. Gemini manual no regresa", async () => {
  const client = await readFile(clientPath, "utf8");
  assert.match(client, /function GeminiWorkflow/);
  assert.match(client, /Reanalizar con contexto/);
  assert.match(client, /geminiContext: reanalysis \? geminiContext : null/);
});

test("27. historial append-only no regresa", async () => {
  const repository = createMemoryOperationalHistory();
  await repository.appendAnalysis(versions[0]);
  await repository.appendAnalysis(versions[1]);
  assert.equal((await repository.list({ fixtureId: FIXTURE_ID })).length, 2);
  const route = await readFile(routePath, "utf8");
  assert.match(route, /view.*fixture_quotes/);
  assert.match(route, /exportJson/);
  assert.match(route, /appendArchiveAll/);
});

test("28. alerta de cuota atípica no bloquea un valor válido", () => {
  const input = { fixtureId: FIXTURE_ID, marketFamily: "corners", direction: "under", selection: "Under 10.5", line: 10.5, decimalOdds: 10.5, bookmaker: "Betano", consultedAt: NOW, timezone: "America/Bogota" };
  assert.match(manualOddsCopyWarning(input), /coincide con la línea 10.5/);
  assert.equal(validateManualOddsInput(input).valid, true);
  assert.equal(quote({ family: "corners", direction: "under", line: 10.5, odds: 10.5 }).decimal_odds, 10.5);
});

test("29. una cuota normal no dispara alerta", () => {
  assert.equal(manualOddsCopyWarning({ line: 10.5, decimalOdds: 1.67 }), null);
});
