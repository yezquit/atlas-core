import test from "node:test";
import assert from "node:assert/strict";

import {
  createPerformanceBet,
} from "../performance/betPerformanceModels.js";


test("crea una apuesta cerrada válida para análisis de rendimiento", () => {
  const bet = createPerformanceBet({
    id: "bet-001",
    status: "WON",
    stake: 100,
    profit: 83,
    market: "goals",
    league: "Premier League",
    bookmaker: "Betano",
    odds: 1.83,
  });

  assert.equal(bet.id, "bet-001");
  assert.equal(bet.status, "WON");
  assert.equal(bet.profit, 83);
  assert.equal(bet.market, "goals");
});


test("rechaza apuesta sin resultado cerrado", () => {
  assert.throws(() =>
    createPerformanceBet({
      id: "bet-002",
      stake: 100,
      profit: 0,
    })
  );
});


test("rechaza cuota inválida", () => {
  assert.throws(() =>
    createPerformanceBet({
      id: "bet-003",
      status: "WON",
      stake: 100,
      profit: 50,
      odds: 0,
    })
  );
});
