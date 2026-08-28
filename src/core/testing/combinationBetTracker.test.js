import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createBetRecord,
  createCombinationBetRecord,
  createMemoryBetLedger,
  settleBetRecord,
} from "../infrastructure/betLedger.js";
import {
  buildAtlasCombination,
  removeCombinationSelection,
} from "../intelligence/atlasCombinationEngine.js";

function leg(index, overrides = {}) {
  return {
    fixture_id: 7000 + index,
    competition: "Liga de prueba",
    home_team: `Local ${index}`,
    away_team: `Visitante ${index}`,
    kickoff_utc: `2026-08-${20 + index}T20:00:00.000Z`,
    market_family: "goals",
    selection: "Over 1.5",
    direction: "over",
    line: 1.5,
    sports_score: 80 - index,
    preliminary_probability: 0.62,
    decimal_odds: 1.5,
    economic_status: "available",
    ...overrides,
  };
}

function combinationBet(overrides = {}) {
  return createCombinationBetRecord({
    betId: "combination-bet-1",
    combinationId: "combination-1",
    product: "parlay",
    mode: "automatic",
    legs: [leg(1), leg(2, { market_family: "corners", line: 8.5, selection: "Over 8.5" })],
    bookmaker: "Betano",
    decimalOdds: 3.4,
    oddsSource: "manual_user_input",
    stakeAmount: 10000,
    currency: "COP",
    placedAt: "2026-08-26T12:00:00.000Z",
    ...overrides,
  });
}

function engineCandidate(index, overrides = {}) {
  const fixtureId = overrides.fixtureId ?? 9000 + index;
  const marketId = overrides.marketId ?? "goals";
  const lineValue = overrides.line ?? 1.5;
  return {
    fixtureId,
    fixture: `Local ${index} vs Visitante ${index}`,
    marketId,
    market: marketId,
    direction: "over",
    line: lineValue,
    selection: `Over ${lineValue}`,
    sportsScore: 85 - index,
    probability: 0.62,
    uncertaintyLow: 0.5,
    uncertaintyHigh: 0.72,
    sampleSize: 20,
    status: "sports_candidate_pending_price",
    ranking_eligible: true,
    estimated_probability: 0.62,
    active_quote: null,
    ...overrides,
  };
}

test("1. BetRecord simple v1 conserva su contrato", () => {
  const bet = createBetRecord({
    betId: "simple-1",
    analysisId: "analysis-1",
    fixtureId: 1,
    bookmaker: "Casa",
    decimalOdds: 1.8,
    stakeAmount: 1000,
  });
  assert.equal(bet.version, 1);
  assert.equal(bet.bet_type, undefined);
  assert.equal(bet.analysis_id, "analysis-1");
});

test("2. registra un Parlay como una apuesta con varias patas", () => {
  const bet = combinationBet();
  assert.equal(bet.version, 2);
  assert.equal(bet.bet_type, "combination");
  assert.equal(bet.product, "parlay");
  assert.equal(bet.legs.length, 2);
});

test("3. registra una Soñadora con las cinco familias reales", () => {
  const families = ["goals", "corners", "cards", "total_shots", "shots_on_goal"];
  const bet = combinationBet({
    product: "dream",
    mode: "mixed",
    legs: families.map((marketFamily, index) => leg(index + 1, { market_family: marketFamily })),
  });
  assert.equal(bet.product, "dream");
  assert.equal(bet.mode, "mixed");
  assert.deepEqual(bet.legs.map((item) => item.market_family), families);
});

test("4. el snapshot de patas es inmutable e independiente de la entrada", () => {
  const sourceLegs = [leg(1), leg(2, { market_family: "cards" })];
  const bet = combinationBet({ legs: sourceLegs });
  sourceLegs[0].selection = "Under 9.5";
  assert.equal(bet.legs[0].selection, "Over 1.5");
  assert.equal(Object.isFrozen(bet.legs), true);
  assert.equal(Object.isFrozen(bet.legs[0]), true);
});

test("5. un Parlay cuenta como una sola apuesta en el resumen", async () => {
  const ledger = createMemoryBetLedger();
  await ledger.appendBet(combinationBet());
  const summary = await ledger.summary();
  assert.equal(summary.bet_count, 1);
  assert.equal(summary.pending_count, 1);
});

test("6. una combinada ganada usa la cuota total para payout y P/L", () => {
  const settled = settleBetRecord(combinationBet({ decimalOdds: 5.5 }), { outcome: "won" });
  assert.equal(settled.payout, 55000);
  assert.equal(settled.profit_loss, 45000);
});

test("7. una combinada perdida descuenta el stake una sola vez", () => {
  const settled = settleBetRecord(combinationBet(), { outcome: "lost" });
  assert.equal(settled.payout, 0);
  assert.equal(settled.profit_loss, -10000);
});

test("8. una combinada nula devuelve el stake", () => {
  const settled = settleBetRecord(combinationBet(), { outcome: "void" });
  assert.equal(settled.payout, 10000);
  assert.equal(settled.profit_loss, 0);
});

test("9. registros legacy y combinados se listan y exportan juntos", async () => {
  const legacy = createBetRecord({
    betId: "legacy-1",
    analysisId: "legacy-analysis",
    fixtureId: 44,
    bookmaker: "Casa",
    decimalOdds: 1.8,
    stakeAmount: 1000,
  });
  const ledger = createMemoryBetLedger();
  await ledger.appendBet(legacy);
  await ledger.appendBet(combinationBet());
  const listed = await ledger.list();
  const exported = JSON.parse(await ledger.exportJson());
  assert.deepEqual(new Set(listed.map((item) => item.version)), new Set([1, 2]));
  assert.equal(exported.bets.length, 2);
  assert.ok(exported.bets.some((item) => item.analysis_id === "legacy-analysis"));
});

test("10. no admite combinaciones por debajo del mínimo", () => {
  assert.throws(
    () => combinationBet({ legs: [leg(1)] }),
    /invalid_combination_leg_count/
  );
});

test("11. no crea una apuesta combinada sin cuota total", () => {
  assert.throws(
    () => combinationBet({ decimalOdds: null }),
    /decimal_odds_must_be_positive/
  );
});

test("12. conserva una cuota total introducida manualmente y su origen", () => {
  const bet = combinationBet({ decimalOdds: 4.75, oddsSource: "manual_user_input" });
  assert.equal(bet.decimal_odds, 4.75);
  assert.equal(bet.odds_source, "manual_user_input");
});

test("13. la UI exige el mínimo y mantiene generación y Quitar", async () => {
  const source = await readFile(new URL("../../app/atlas-combination-builder.js", import.meta.url), "utf8");
  assert.match(source, /count >= limits\.minimum/);
  assert.match(source, /Registrar apuesta/);
  assert.match(source, /Atlas no recalcula ni inventa este precio/);
  assert.match(source, /no se multiplican automáticamente las cuotas de las patas/);

  const candidates = [
    engineCandidate(1, { fixtureId: 77, marketId: "goals" }),
    engineCandidate(2, { fixtureId: 77, marketId: "corners", line: 8.5 }),
  ];
  const combination = buildAtlasCombination({ candidates, product: "parlay", mode: "automatic", selections: 2 });
  const edited = removeCombinationSelection(combination, combination.selections[0].selection_key);
  assert.equal(combination.status, "ready");
  assert.equal(edited.selections.length, 1);
  assert.equal(edited.status, "editing");
});
