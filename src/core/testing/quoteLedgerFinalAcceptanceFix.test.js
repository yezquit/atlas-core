import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildFixtureQuoteLedger,
  buildJourneyOperationalRanking,
  diagnoseFixtureQuoteEntry,
  findFixtureQuoteEntry,
  summarizeJourneyQuoteCoverage,
} from "../intelligence/fixtureQuoteLedger.js";
import { createManualOdds } from "../intelligence/oddsIntelligence.js";
import { evaluateMarketPrice } from "../intelligence/marketSuitability.js";
import { createMemoryOperationalHistory } from "../infrastructure/operationalHistory.js";

const FIXTURE_ID = 1_606_076;
const KICKOFF = "2026-08-13T22:00:00.000Z";
const clientPath = new URL("../../app/atlas-functional-client.js", import.meta.url);

const candidates = [
  { fixtureId: FIXTURE_ID, marketId: "goals", direction: "over", line: 1.5, selection: "Over 1.5", generalRank: 2 },
  { fixtureId: FIXTURE_ID, marketId: "corners", direction: "under", line: 10.5, selection: "Under 10.5", generalRank: 3 },
  { fixtureId: FIXTURE_ID, marketId: "shots_on_goal", direction: "under", line: 9.5, selection: "Under 9.5", generalRank: 1 },
];

function manualQuote({ family, direction, line, odds, observedAt, analyzedAt, analysisVersion }) {
  return createManualOdds({
    fixtureId: FIXTURE_ID,
    bookmaker: "Betano",
    marketFamily: family,
    marketName: family,
    selection: `${direction === "under" ? "Under" : "Over"} ${line}`,
    direction,
    line,
    decimalOdds: odds,
    receivedAt: observedAt,
    analyzedAt,
    kickoff: KICKOFF,
    timezone: "America/Bogota",
    analysisVersion,
  });
}

function analysisVersion({ id, family, direction, line, probability, quote, createdAt }) {
  const preliminaryProbability = {
    probability_status: "preliminary",
    point_estimate: probability,
    uncertainty_low: probability - 0.12,
    uncertainty_high: probability + 0.12,
    sample_size_effective: 10,
  };
  const price = quote ? evaluateMarketPrice({
    oddsQuote: quote,
    preliminaryProbability,
    confidenceScore: 74,
    sampleSize: 10,
    phase: "one_hour_before",
  }) : null;
  return {
    analysis_id: id,
    fixture_id: FIXTURE_ID,
    created_at: createdAt,
    phase: "one_hour_before",
    odds: quote ? [quote] : [],
    active_quote: quote || null,
    analysis_confidence: { analysis_confidence_score: 74 },
    preliminary_probability: preliminaryProbability,
    director: {
      fixture: { kickoff_utc: KICKOFF },
      market_evaluated: { family },
      sports_verdict: { direction, selection: `${direction === "under" ? "Under" : "Over"} ${line}` },
      selection: `${direction === "under" ? "Under" : "Over"} ${line}`,
      line,
      price_assessment: price,
    },
  };
}

const aQuote = manualQuote({
  family: "goals",
  direction: "over",
  line: 1.5,
  odds: 1.28,
  observedAt: "2026-08-13T21:10:00.000Z",
  analyzedAt: "2026-08-13T21:10:30.000Z",
  analysisVersion: "initial",
});
const aVersion = analysisVersion({
  id: "santos-goals-a",
  family: "goals",
  direction: "over",
  line: 1.5,
  probability: 0.673,
  quote: aQuote,
  createdAt: "2026-08-13T21:10:30.000Z",
});
const bQuote = manualQuote({
  family: "corners",
  direction: "under",
  line: 10.5,
  odds: 1.67,
  observedAt: "2026-08-13T21:12:00.000Z",
  analyzedAt: "2026-08-13T21:12:30.000Z",
  analysisVersion: "initial",
});
const bVersion = analysisVersion({
  id: "santos-corners-b",
  family: "corners",
  direction: "under",
  line: 10.5,
  probability: 0.697,
  quote: bQuote,
  createdAt: "2026-08-13T21:12:30.000Z",
});

async function sequentialLedgers() {
  const repository = createMemoryOperationalHistory();
  await repository.appendAnalysis(aVersion);
  const afterA = buildFixtureQuoteLedger(await repository.list({ fixtureId: FIXTURE_ID }), {
    fixtureId: FIXTURE_ID,
    now: "2026-08-13T21:10:31.000Z",
    kickoff: KICKOFF,
  });
  await repository.appendAnalysis(bVersion);
  const afterB = buildFixtureQuoteLedger(await repository.list({ fixtureId: FIXTURE_ID }), {
    fixtureId: FIXTURE_ID,
    now: "2026-08-13T21:12:31.000Z",
    kickoff: KICKOFF,
  });
  return { afterA, afterB };
}

test("1. A permanece activo después de evaluar B", async () => {
  const { afterA, afterB } = await sequentialLedgers();
  assert.equal(findFixtureQuoteEntry(afterA, candidates[0]).active_quote.decimal_odds, 1.28);
  assert.equal(findFixtureQuoteEntry(afterB, candidates[0]).active_quote.decimal_odds, 1.28);
});

test("2. B no sobrescribe A", async () => {
  const { afterB } = await sequentialLedgers();
  assert.equal(findFixtureQuoteEntry(afterB, candidates[0]).active_quote.quote_id, aQuote.quote_id);
  assert.equal(findFixtureQuoteEntry(afterB, candidates[1]).active_quote.quote_id, bQuote.quote_id);
});

test("3. identidades exactas distintas coexisten", async () => {
  const { afterB } = await sequentialLedgers();
  assert.deepEqual(afterB.entries.filter((entry) => entry.active_quote).map((entry) => entry.selection_key).sort(), [
    `${FIXTURE_ID}:corners:under:10.5`,
    `${FIXTURE_ID}:goals:over:1.5`,
  ]);
});

test("4. user_reported_current recién creada no desaparece", async () => {
  const { afterB } = await sequentialLedgers();
  const a = findFixtureQuoteEntry(afterB, candidates[0]);
  const b = findFixtureQuoteEntry(afterB, candidates[1]);
  assert.deepEqual([a.quote_state, a.active_quote.freshness, a.active_quote.age_minutes, a.active_quote.freshness_limit_minutes], ["current", "fresh", 2.52, 15]);
  assert.deepEqual([b.quote_state, b.active_quote.freshness, b.active_quote.age_minutes, b.active_quote.freshness_limit_minutes], ["current", "fresh", 0.52, 15]);
});

test("5. diagnóstico demuestra stale y la UI lo muestra como vencido", async () => {
  const realAQuote = manualQuote({
    family: "goals",
    direction: "over",
    line: 1.5,
    odds: 1.28,
    observedAt: "2026-08-13T20:41:00.000Z",
    analyzedAt: "2026-08-13T20:42:00.535Z",
    analysisVersion: "initial",
  });
  const realAVersion = analysisVersion({
    id: "1067f8c9-7e07-42bf-a743-7543478abf05",
    family: "goals",
    direction: "over",
    line: 1.5,
    probability: 0.673,
    quote: realAQuote,
    createdAt: "2026-08-13T20:42:00.535Z",
  });
  const diagnostic = diagnoseFixtureQuoteEntry([realAVersion], {
    fixtureId: FIXTURE_ID,
    candidate: candidates[0],
    now: "2026-08-13T21:44:26.373Z",
    kickoff: KICKOFF,
  });
  assert.deepEqual({
    analysis_id: diagnostic.analysis_id,
    observed_at: diagnostic.observed_at,
    identity_key: diagnostic.identity_key,
    persisted_state: diagnostic.persisted_state,
    persisted_verification_status: diagnostic.persisted_verification_status,
    persisted_freshness: diagnostic.persisted_freshness,
    queried_state: diagnostic.queried_state,
    queried_verification_status: diagnostic.queried_verification_status,
    queried_freshness: diagnostic.queried_freshness,
    queried_age_minutes: diagnostic.queried_age_minutes,
    freshness_limit_minutes: diagnostic.freshness_limit_minutes,
    ranking_included: diagnostic.ranking_included,
  }, {
    analysis_id: "1067f8c9-7e07-42bf-a743-7543478abf05",
    observed_at: "2026-08-13T20:41:00.000Z",
    identity_key: `${FIXTURE_ID}:goals:over:1.5`,
    persisted_state: "active_quote",
    persisted_verification_status: "user_reported",
    persisted_freshness: "fresh",
    queried_state: "stale",
    queried_verification_status: "stale",
    queried_freshness: "stale",
    queried_age_minutes: 63.44,
    freshness_limit_minutes: 15,
    ranking_included: false,
  });
  assert.match(diagnostic.ranking_exclusion_reason, /63.44 minutos.*límite de 15 minutos/);
  const client = await readFile(clientPath, "utf8");
  assert.match(client, /Cuota vencida — actualizar precio/);
});

test("6. el ranking operativo incluye A y B cuando siguen vigentes", async () => {
  const { afterB } = await sequentialLedgers();
  const ranking = buildJourneyOperationalRanking(candidates, { [FIXTURE_ID]: afterB });
  assert.deepEqual(ranking.map((item) => [item.candidate.selection, item.operation.price_status, item.operation.operational_decision]), [
    ["Under 10.5", "marginal", "Sí, pero con cautela"],
    ["Over 1.5", "unfavorable", "No"],
  ]);
});

test("7. cabecera parcial cuando hay evaluadas y pendientes", async () => {
  const { afterB } = await sequentialLedgers();
  const summary = summarizeJourneyQuoteCoverage(candidates, { [FIXTURE_ID]: afterB });
  assert.deepEqual([summary.status, summary.tone, summary.message, summary.current, summary.pending], [
    "partial",
    "operational_partial",
    "Hay opciones con precio evaluado y otras pendientes.",
    2,
    1,
  ]);
});

test("8. cabecera disponible cuando todos los candidatos están cotizados", () => {
  const allQuoted = [
    { ...buildFixtureQuoteLedger([aVersion], { fixtureId: FIXTURE_ID, now: "2026-08-13T21:12:31.000Z", kickoff: KICKOFF }).entries[0] },
    { ...buildFixtureQuoteLedger([bVersion], { fixtureId: FIXTURE_ID, now: "2026-08-13T21:12:31.000Z", kickoff: KICKOFF }).entries[0] },
  ];
  const ledger = { entries: allQuoted };
  const summary = summarizeJourneyQuoteCoverage(candidates.slice(0, 2), { [FIXTURE_ID]: ledger });
  assert.deepEqual([summary.status, summary.tone, summary.message, summary.current], [
    "available",
    "operational_available",
    "Todas las opciones relevantes tienen precio vigente evaluado.",
    2,
  ]);
});
