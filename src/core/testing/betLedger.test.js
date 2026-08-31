import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_LOCAL_USER_ID,
  createBetRecord,
  createMemoryBetLedger,
  settleBetRecord,
} from "../infrastructure/betLedger.js";

function exampleBet(overrides = {}) {
  return createBetRecord({
    betId: "bet-001",
    userId: DEFAULT_LOCAL_USER_ID,
    analysisId: "analysis-001",
    fixtureId: 1520819,
    competition: "Brasil Serie B",
    homeTeam: "Sport Recife",
    awayTeam: "Londrina",
    kickoffUtc: "2026-08-16T22:00:00.000Z",
    marketFamily: "goals",
    selection: "Under 2.5",
    line: 2.5,
    analysisConfidenceScore: 74,
    preliminaryProbability: 0.686,
    atlasSportsVerdict: "yes",
    atlasPriceDecision: "bet",
    bookmaker: "Betano",
    decimalOdds: 1.83,
    stakeAmount: 50000,
    currency: "COP",
    analyzedAt: "2026-08-14T16:00:00.000Z",
    placedAt: "2026-08-14T16:10:00.000Z",
    ...overrides,
  });
}

test("crea una apuesta pendiente vinculada al análisis original", () => {
  const bet = exampleBet();

  assert.equal(bet.contract, "BetRecord");
  assert.equal(bet.user_id, "local-user");
  assert.equal(bet.analysis_id, "analysis-001");
  assert.equal(bet.fixture_id, 1520819);
  assert.equal(bet.bookmaker, "Betano");
  assert.equal(bet.decimal_odds, 1.83);
  assert.equal(bet.stake_amount, 50000);
  assert.equal(bet.status, "pending");
});

test("una apuesta ganada calcula retorno y ganancia neta", () => {
  const settled = settleBetRecord(exampleBet(), {
    outcome: "won",
    actualTotal: 1,
    resultSource: "api_football",
    settledAt: "2026-08-16T23:59:00.000Z",
  });

  assert.equal(settled.status, "won");
  assert.equal(settled.payout, 91500);
  assert.equal(settled.profit_loss, 41500);
  assert.equal(settled.actual_total, 1);
  assert.equal(settled.result_source, "api_football");
});

test("una apuesta perdida descuenta el stake completo", () => {
  const settled = settleBetRecord(exampleBet(), {
    outcome: "lost",
  });

  assert.equal(settled.payout, 0);
  assert.equal(settled.profit_loss, -50000);
});

test("una apuesta nula devuelve el stake y no genera ganancia ni pérdida", () => {
  const settled = settleBetRecord(exampleBet(), {
    outcome: "void",
  });

  assert.equal(settled.payout, 50000);
  assert.equal(settled.profit_loss, 0);
});

test("el ledger mantiene separados los usuarios", async () => {
  const ledger = createMemoryBetLedger();

  await ledger.appendBet(exampleBet());

  await ledger.appendBet(
    exampleBet({
      betId: "bet-johan-001",
      userId: "johan-local",
      analysisId: "analysis-johan-001",
    })
  );

  const oscar = await ledger.list({ userId: "local-user" });
  const johan = await ledger.list({ userId: "johan-local" });

  assert.equal(oscar.length, 1);
  assert.equal(johan.length, 1);

  assert.equal(oscar[0].user_id, "local-user");
  assert.equal(johan[0].user_id, "johan-local");
});

test("el resumen personal calcula ganadas, perdidas y ROI", async () => {
  const first = exampleBet();

  const second = exampleBet({
    betId: "bet-002",
    analysisId: "analysis-002",
    fixtureId: 1520820,
    stakeAmount: 50000,
    decimalOdds: 2,
  });

  const ledger = createMemoryBetLedger();

  await ledger.appendBet(first);
  await ledger.appendBet(second);

  await ledger.appendSettlement(
    settleBetRecord(first, { outcome: "won" })
  );

  await ledger.appendSettlement(
    settleBetRecord(second, { outcome: "lost" })
  );

  const summary = await ledger.summary("local-user");

  assert.equal(summary.bet_count, 2);
  assert.equal(summary.pending_count, 0);
  assert.equal(summary.won_count, 1);
  assert.equal(summary.lost_count, 1);
  assert.equal(summary.total_staked, 100000);
  assert.equal(summary.net_profit_loss, -8500);
  assert.equal(summary.roi, -0.085);
});

test("una apuesta ya cerrada no puede cerrarse una segunda vez", async () => {
  const bet = exampleBet();
  const ledger = createMemoryBetLedger();

  await ledger.appendBet(bet);
  await ledger.appendSettlement(
    settleBetRecord(bet, { outcome: "won" })
  );

  await assert.rejects(
    () =>
      ledger.appendSettlement(
        settleBetRecord(bet, { outcome: "lost" })
      ),
    /bet_already_settled/
  );
});

test("rechaza stake, cuota o resultado inválidos", () => {
  assert.throws(
    () => exampleBet({ stakeAmount: 0 }),
    /stake_amount_must_be_positive/
  );

  assert.throws(
    () => exampleBet({ decimalOdds: 0 }),
    /decimal_odds_must_be_positive/
  );

  assert.throws(
    () => settleBetRecord(exampleBet(), { outcome: "banana" }),
    /invalid_bet_outcome/
  );
});

test("una apuesta individual conserva direction y sports_score en el snapshot", () => {
  const bet = exampleBet({ direction: "under", sportsScore: 78 });
  assert.equal(bet.direction, "under");
  assert.equal(bet.sports_score, 78);
});

test("push devuelve el stake completo y no genera ganancia ni pérdida", () => {
  const settled = settleBetRecord(exampleBet(), { outcome: "push" });
  assert.equal(settled.payout, 50000);
  assert.equal(settled.profit_loss, 0);
});

test("una apuesta pendiente nunca se reporta como lost sin liquidarse explícitamente", () => {
  const bet = exampleBet();
  assert.equal(bet.status, "pending");
  assert.notEqual(bet.status, "lost");
  assert.equal(bet.profit_loss, null);
  assert.equal(bet.payout, null);
});

test("Asian Total Goals: full_win, push y full_loss calculan el monto financiero real", () => {
  const asianBet = exampleBet({ marketFamily: "asian_total_goals", line: 2.5, decimalOdds: 2, stakeAmount: 100 });

  const fullWin = settleBetRecord(asianBet, { outcome: "won" });
  assert.deepEqual([fullWin.payout, fullWin.profit_loss], [200, 100]);

  const pushResult = settleBetRecord(asianBet, { outcome: "push" });
  assert.deepEqual([pushResult.payout, pushResult.profit_loss], [100, 0]);

  const fullLoss = settleBetRecord(asianBet, { outcome: "lost" });
  assert.deepEqual([fullLoss.payout, fullLoss.profit_loss], [0, -100]);
});

test("liquidar una apuesta nunca modifica preliminary_probability ni sports_score del snapshot original", () => {
  const bet = exampleBet({ preliminaryProbability: 0.686, sportsScore: 78 });
  const settled = settleBetRecord(bet, { outcome: "won" });
  assert.equal(settled.preliminary_probability, bet.preliminary_probability);
  assert.equal(settled.sports_score, bet.sports_score);
  assert.equal(settled.decimal_odds, bet.decimal_odds);
});

test("un registro legacy sin direction/sports_score sigue siendo legible por el ledger", async () => {
  const ledger = createMemoryBetLedger();
  const legacyBet = Object.freeze({
    contract: "BetRecord",
    version: 1,
    bet_id: "legacy-plain-1",
    user_id: DEFAULT_LOCAL_USER_ID,
    owner_id: "personal",
    analysis_id: "legacy-analysis-plain",
    fixture_id: 999,
    market_family: "goals",
    selection: "Under 2.5",
    line: 2.5,
    bookmaker: "Casa",
    decimal_odds: 1.8,
    stake_amount: 1000,
    currency: "COP",
    status: "pending",
    result_source: null,
    actual_total: null,
    payout: null,
    profit_loss: null,
    placed_at: "2026-01-01T00:00:00.000Z",
    settled_at: null,
  });
  await ledger.appendBet(legacyBet);
  const stored = await ledger.getById("legacy-plain-1");
  assert.equal(stored.analysis_id, "legacy-analysis-plain");
  assert.equal(stored.direction, undefined);
  assert.equal(stored.sports_score, undefined);
});
