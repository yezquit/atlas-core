import test from "node:test";
import assert from "node:assert/strict";

import { evaluateExactMarketLine, generateCandidateLines } from "../intelligence/candidateLineGenerator.js";
import { rankMarketCandidates } from "../intelligence/marketCandidateRanker.js";

const samples = {
  goals: [1, 2, 3, 2, 1, 2, 3, 2, 1, 2],
  corners: [8, 10, 11, 9, 10, 12, 9, 11, 10, 8],
  cards: [3, 4, 5, 4, 3, 5, 4, 3, 4, 5],
  total_shots: [22, 25, 27, 24, 26, 23, 28, 25, 24, 26],
  shots_on_goal: [7, 9, 10, 8, 9, 11, 8, 10, 9, 7],
};

function profile() {
  const eventSamples = Object.fromEntries(Object.entries(samples).map(([family, values]) => [family, { match_totals: values }]));
  return { quality_status: "verified", event_samples: eventSamples, last_5: { event_samples: eventSamples }, last_10: { event_samples: eventSamples }, as_home: { event_samples: eventSamples }, as_away: { event_samples: eventSamples } };
}

function context() {
  return { leagueProfile: { quality_status: "verified", event_samples: profile().event_samples }, homeTeamProfile: profile(), awayTeamProfile: profile(), refereeProfile: { status: "confirmed", quality_status: "verified", event_samples: { cards: { match_totals: samples.cards } } } };
}

for (const [family, line] of [["goals", 6.5], ["corners", 15.5], ["cards", 9.5], ["total_shots", 32.5], ["shots_on_goal", 20.5]]) {
  test(`${family}: una línea manual fuera del catálogo se calcula exactamente`, () => {
    const base = generateCandidateLines({ marketFamily: family, ...context() });
    assert.equal(base.candidates.some((candidate) => candidate.line === line), false);
    const result = evaluateExactMarketLine({ marketFamily: family, direction: "over", line, ...context() });
    assert.equal(result.status, "ready_for_pricing");
    assert.equal(result.candidate.line, line);
    assert.equal(result.candidate.direction, "over");
    assert.equal(result.candidate.market_family, family);
  });
}

test("sin datos reales de la familia, la línea exacta queda unavailable", () => {
  const result = evaluateExactMarketLine({ marketFamily: "goals", direction: "over", line: 6.5, leagueProfile: { quality_status: "verified", event_samples: {} }, homeTeamProfile: { quality_status: "verified" }, awayTeamProfile: { quality_status: "verified" } });
  assert.equal(result.status, "unavailable");
});

test("corners evalúa una escalera de umbrales directamente desde la misma distribución", () => {
  const over = [9.5, 10.5, 11.5].map((line) => evaluateExactMarketLine({ marketFamily: "corners", direction: "over", line, ...context() }).candidate);
  const under = [9.5, 10.5, 11.5].map((line) => evaluateExactMarketLine({ marketFamily: "corners", direction: "under", line, ...context() }).candidate);
  assert.ok(over.every(Boolean));
  assert.ok(under.every(Boolean));
  assert.ok(over[0].estimated_probability >= over[1].estimated_probability);
  assert.ok(over[1].estimated_probability >= over[2].estimated_probability);
  assert.ok(under[0].estimated_probability <= under[1].estimated_probability);
  assert.ok(under[1].estimated_probability <= under[2].estimated_probability);
});

test("los dos lados de una media línea proceden de la misma distribución canónica", () => {
  const over = evaluateExactMarketLine({ marketFamily: "corners", direction: "over", line: 10.5, ...context() }).candidate;
  const under = evaluateExactMarketLine({ marketFamily: "corners", direction: "under", line: 10.5, ...context() }).candidate;
  assert.ok(Math.abs(over.estimated_probability + under.estimated_probability - 1) < 0.000001);
  assert.equal(over.sample_size_effective, under.sample_size_effective);
  assert.deepEqual(
    over.input_sources.map(({ source, sample_size }) => ({ source, sample_size })),
    under.input_sources.map(({ source, sample_size }) => ({ source, sample_size }))
  );
  assert.equal(over.side_comparison.complementary_sum, 1);
});

test("el contrato canónico se mantiene para las cinco familias de conteo", () => {
  for (const [family, line] of [["goals", 2.5], ["corners", 10.5], ["cards", 4.5], ["total_shots", 25.5], ["shots_on_goal", 8.5]]) {
    const over = evaluateExactMarketLine({ marketFamily: family, direction: "over", line, ...context() }).candidate;
    const under = evaluateExactMarketLine({ marketFamily: family, direction: "under", line, ...context() }).candidate;
    assert.ok(over && under, family);
    assert.ok(Math.abs(over.estimated_probability + under.estimated_probability - 1) < 0.000001, family);
  }
});

test("la insuficiencia solo se produce cuando falta una muestra subyacente del mercado", () => {
  const incomplete = context();
  incomplete.awayTeamProfile = { quality_status: "verified", last_5: { event_samples: {} }, last_10: { event_samples: {} }, as_away: { event_samples: {} } };
  const result = evaluateExactMarketLine({ marketFamily: "corners", direction: "over", line: 10.5, ...incomplete });
  assert.equal(result.status, "unavailable");
  assert.match(result.reason, /^missing_away_corners_sample$/);
});

test("una cuota exacta no modifica la probabilidad ni el sports score de la línea manual", () => {
  const exact = evaluateExactMarketLine({ marketFamily: "total_shots", direction: "over", line: 32.5, ...context() }).candidate;
  const before = rankMarketCandidates([exact])[0];
  const after = rankMarketCandidates([exact], { quotes: [{ market_family: "total_shots", direction: "over", line: 32.5, decimal_odds: 1.85, verification_status: "verified_provider", freshness: "fresh" }] })[0];
  assert.equal(after.estimated_probability, before.estimated_probability);
  assert.equal(after.sports_score, before.sports_score);
  assert.equal(after.price_status, "verified_current");
});

test("una selección del lado no preferido no queda apta aunque tenga cuota exacta", () => {
  const over = evaluateExactMarketLine({ marketFamily: "corners", direction: "over", line: 10.5, ...context() }).candidate;
  const under = evaluateExactMarketLine({ marketFamily: "corners", direction: "under", line: 10.5, ...context() }).candidate;
  const quote = (candidate) => ({ market_family: "corners", direction: candidate.direction, line: 10.5, decimal_odds: 1.9, verification_status: "verified_provider", freshness: "fresh" });
  const ranked = [over, under].map((candidate) => rankMarketCandidates([candidate], { quotes: [quote(candidate)] })[0]);
  assert.ok(ranked.some((candidate) => candidate.overall_status === "not_viable"));
  assert.ok(ranked.filter((candidate) => candidate.overall_status !== "not_viable").length <= 1);
});

test("la explicación cuantitativa de córners no usa métricas de remates", () => {
  const candidate = evaluateExactMarketLine({ marketFamily: "corners", direction: "over", line: 10.5, ...context() }).candidate;
  const homeTeamProfile = { team_name: "Local", as_home: { sample_size: 3, event_samples: { corners: { for: [4, 5, 6], conceded: [3, 4, 5] } } } };
  const awayTeamProfile = { team_name: "Visitante", as_away: { sample_size: 3, event_samples: { corners: { for: [4, 5, 6], conceded: [6, 7, 8] } } } };
  const ranked = rankMarketCandidates([candidate], { homeTeamProfile, awayTeamProfile })[0];
  assert.ok(ranked.simple_sports_reasons.some((reason) => /córners/.test(reason)));
  assert.ok(ranked.simple_sports_reasons.every((reason) => !/remates/i.test(reason)));
});
