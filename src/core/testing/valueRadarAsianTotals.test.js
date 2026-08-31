import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  asianExpectedValue,
  asianFairOdds,
  buildAsianSettlementProfile,
  settleAsianTotalGoals,
  splitAsianTotalLine,
} from "../intelligence/asianTotalGoals.js";
import { evaluateValueOpportunity, rankValueOpportunities } from "../intelligence/valueRadar.js";
import { createBetRecord, settleBetRecord } from "../infrastructure/betLedger.js";
import { rankJourneyCandidatesByDecision } from "../services/sportsIntelligenceService.js";

const quote = (odds, family = "goals", line = 2.5) => ({ fixture_id: 1, market_family: family, direction: "over", line, decimal_odds: odds, bookmaker_name: "Betano", quote_id: `q-${family}-${line}` });
const candidate = (probability, odds = null) => ({ fixture_id: 1, market_family: "goals", direction: "over", line: 2.5, estimated_probability: probability, uncertainty_low: probability - 0.04, uncertainty_high: probability + 0.08, sports_score: 61, odds });

test("value binario usa probabilidad, no Solidez", () => {
  const result = evaluateValueOpportunity({ candidate: candidate(0.485), quote: quote(2.4) });
  assert.equal(result.status, "interesting");
  assert.ok(Math.abs(result.implied_probability - 0.416667) < 1e-6);
  assert.ok(Math.abs(result.fair_odds_atlas - 2.061856) < 1e-6);
  assert.equal(result.raw_edge_pp, 6.83);
  assert.equal(result.expected_roi, 0.164);
  assert.equal(result.sports_score, 61);
});

test("cuota alta sin valor pierde contra cuota menor con valor", () => {
  const highNoValue = evaluateValueOpportunity({ candidate: candidate(0.32), quote: quote(2.5) });
  const lowGoodValue = evaluateValueOpportunity({ candidate: candidate(0.64), quote: quote(1.8) });
  assert.equal(highNoValue.status, "no_value");
  assert.equal(lowGoodValue.status, "interesting");
  assert.equal(rankValueOpportunities([highNoValue, lowGoodValue])[0], lowGoodValue);
});

test("edge conservador usa uncertainty_low sin multiplicadores", () => {
  const result = evaluateValueOpportunity({ candidate: { ...candidate(0.6), uncertainty_low: 0.52 }, quote: quote(2) });
  assert.equal(result.conservative_edge_pp, 2);
  const unavailable = evaluateValueOpportunity({ candidate: { ...candidate(0.6), uncertainty_low: null }, quote: quote(2) });
  assert.equal(unavailable.conservative_edge_pp, null);
});

test("sin identidad exacta no hay evaluación de valor", () => {
  const result = evaluateValueOpportunity({ candidate: candidate(0.6), quote: quote(2, "goals", 3.5) });
  assert.equal(result.status, "not_evaluable");
  assert.equal(result.expected_roi, null);
});

test("split quarter-lines X.25 y X.75 es explícito y simétrico", () => {
  assert.deepEqual(splitAsianTotalLine(3.25, "over").map((item) => item.line), [3, 3.5]);
  assert.deepEqual(splitAsianTotalLine(3.75, "over").map((item) => item.line), [3.5, 4]);
  assert.deepEqual(splitAsianTotalLine(4.25, "under").map((item) => item.line), [4, 4.5]);
  assert.deepEqual(splitAsianTotalLine(4.75, "under").map((item) => item.line), [4.5, 5]);
});

test("Over 2.0 liquida full loss, push y full win", () => {
  assert.equal(settleAsianTotalGoals({ totalGoals: 1, line: 2, direction: "over" }).status, "full_loss");
  assert.equal(settleAsianTotalGoals({ totalGoals: 2, line: 2, direction: "over" }).status, "push");
  assert.equal(settleAsianTotalGoals({ totalGoals: 3, line: 2, direction: "over" }).status, "full_win");
});

test("Over 2.25 y 2.75 conservan half loss y half win", () => {
  assert.equal(settleAsianTotalGoals({ totalGoals: 2, line: 2.25, direction: "over" }).status, "half_loss");
  assert.equal(settleAsianTotalGoals({ totalGoals: 3, line: 2.25, direction: "over" }).status, "full_win");
  assert.equal(settleAsianTotalGoals({ totalGoals: 3, line: 2.75, direction: "over" }).status, "half_win");
  assert.equal(settleAsianTotalGoals({ totalGoals: 4, line: 2.75, direction: "over" }).status, "full_win");
});

test("Under 2.25 y 2.75 son simétricos", () => {
  assert.equal(settleAsianTotalGoals({ totalGoals: 2, line: 2.25, direction: "under" }).status, "half_win");
  assert.equal(settleAsianTotalGoals({ totalGoals: 3, line: 2.25, direction: "under" }).status, "full_loss");
  assert.equal(settleAsianTotalGoals({ totalGoals: 3, line: 2.75, direction: "under" }).status, "half_loss");
  assert.equal(settleAsianTotalGoals({ totalGoals: 2, line: 2.75, direction: "under" }).status, "full_win");
});

test("fair odds y EV asiáticos usan probabilidades de liquidación", () => {
  const canonical = {
    observations: [1, 2, 3, 4].map((value, index) => ({ fixture_id: index + 1, value, effective_weight: 0.25 })),
    fixture_ids: [1, 2, 3, 4], effective_sample_size: 4,
  };
  const profile = buildAsianSettlementProfile({ canonicalObservations: canonical, line: 2.25, direction: "over" });
  assert.equal(profile.probabilities.full_win, 0.5);
  assert.equal(profile.probabilities.half_loss, 0.25);
  assert.equal(profile.probabilities.full_loss, 0.25);
  assert.ok(Math.abs(asianFairOdds(profile) - 1.75) < 1e-6);
  assert.ok(Math.abs(asianExpectedValue(profile, 2) - 0.125) < 1e-6);
});

test("identidad asian no reutiliza quote goals", () => {
  const asianCandidate = { ...candidate(0.5), market_family: "asian_total_goals" };
  assert.equal(evaluateValueOpportunity({ candidate: asianCandidate, quote: quote(2, "goals") }).status, "not_evaluable");
});

test("Jornada clásica conserva orden y métricas aunque existan odds", () => {
  const source = [
    { candidate: { candidate_id: "a", ranking_eligible: true, overall_status: "sports_candidate_pending_price", preliminary_probability: 0.62, estimated_probability: 0.62, sports_score: 71, uncertainty_low: 0.5, uncertainty_high: 0.7, sample_size_effective: 8, technical_support_score: 70, line_stability_score: 80 } },
    { candidate: { candidate_id: "b", ranking_eligible: true, overall_status: "sports_candidate_pending_price", preliminary_probability: 0.58, estimated_probability: 0.58, sports_score: 78, uncertainty_low: 0.48, uncertainty_high: 0.68, sample_size_effective: 9, technical_support_score: 75, line_stability_score: 85 } },
  ];
  const before = rankJourneyCandidatesByDecision(structuredClone(source));
  const withOdds = structuredClone(source).map((entry, index) => ({ ...entry, candidate: { ...entry.candidate, decimal_odds: index ? 3 : 1.5 } }));
  const after = rankJourneyCandidatesByDecision(withOdds);
  assert.deepEqual(after.map((item) => item.candidate.candidate_id), before.map((item) => item.candidate.candidate_id));
  assert.deepEqual(after.map((item) => [item.candidate.estimated_probability, item.candidate.sports_score]), before.map((item) => [item.candidate.estimated_probability, item.candidate.sports_score]));
});

test("ledger asiático liquida medias ganancias y pérdidas retrocompatiblemente", () => {
  const bet = createBetRecord({ betId: "asian", analysisId: "a", fixtureId: 1, bookmaker: "Betano", decimalOdds: 2, stakeAmount: 100, marketFamily: "asian_total_goals", asianSettlementProfile: { line: 2.25 } });
  const halfWon = settleBetRecord(bet, { outcome: "half_won" });
  const halfLost = settleBetRecord(bet, { outcome: "half_lost" });
  assert.deepEqual([halfWon.payout, halfWon.profit_loss], [150, 50]);
  assert.deepEqual([halfLost.payout, halfLost.profit_loss], [50, -50]);
  assert.equal(bet.version, 1);
});

test("UI expone modo simple, detalle técnico y transferencia exacta", async () => {
  const source = await readFile(path.resolve("src/app/atlas-functional-client.js"), "utf8");
  assert.match(source, /RADAR DE VALOR ATLAS/);
  assert.match(source, /Ver detalle técnico/);
  assert.match(source, /candidate\.activeQuote/);
  assert.match(source, /setMarketId\(transferred\.market_family\)/);
  assert.match(source, /asian_total_goals/);
});
