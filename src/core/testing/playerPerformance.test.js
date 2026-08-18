import test from "node:test";
import assert from "node:assert/strict";

import {
  calculatePlayerPerformance,
} from "../performance/playerPerformance.js";


test("calcula rendimiento básico de un jugador", () => {
  const bets = [
    {
      playerId: "oscar",
      stake: 100,
      profit: 80,
      status: "won",
    },
    {
      playerId: "oscar",
      stake: 100,
      profit: -100,
      status: "lost",
    },
  ];

  const result = calculatePlayerPerformance(
    bets,
    "oscar"
  );

  assert.equal(result.totalBets, 2);
  assert.equal(result.wonBets, 1);
  assert.equal(result.lostBets, 1);
  assert.equal(result.totalStake, 200);
  assert.equal(result.netProfit, -20);
});


test("ignora apuestas de otros jugadores", () => {
  const bets = [
    {
      playerId: "oscar",
      stake: 100,
      profit: 50,
      status: "won",
    },
    {
      playerId: "juan",
      stake: 300,
      profit: 200,
      status: "won",
    },
  ];

  const result = calculatePlayerPerformance(
    bets,
    "oscar"
  );

  assert.equal(result.totalBets, 1);
  assert.equal(result.netProfit, 50);
});


test("calcula ROI correctamente", () => {
  const bets = [
    {
      playerId: "oscar",
      stake: 200,
      profit: 100,
      status: "won",
    },
  ];

  const result = calculatePlayerPerformance(
    bets,
    "oscar"
  );

  assert.equal(result.roi, 50);
});
