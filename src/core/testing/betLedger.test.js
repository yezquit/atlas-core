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
