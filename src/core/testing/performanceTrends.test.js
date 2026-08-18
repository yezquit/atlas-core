import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateCurrentStreak,
  getRecentForm,
  calculatePerformanceTrend
} from "../performance/performanceTrends.js";


const bets = [
  {
    playerId: "player-1",
    result: "win",
    stake: 100,
    profit: 50,
    settledAt: "2026-08-01"
  },
  {
    playerId: "player-1",
    result: "loss",
    stake: 100,
    profit: -100,
    settledAt: "2026-08-02"
  },
  {
    playerId: "player-1",
    result: "win",
    stake: 100,
    profit: 80,
    settledAt: "2026-08-03"
  },
  {
    playerId: "player-1",
    result: "win",
    stake: 100,
    profit: 60,
    settledAt: "2026-08-04"
  },
  {
    playerId: "player-1",
    result: "win",
    stake: 100,
    profit: 40,
    settledAt: "2026-08-05"
  },
  {
    playerId: "player-2",
    result: "loss",
    stake: 100,
    profit: -100,
    settledAt: "2026-08-05"
  }
];


test("detecta racha actual de victorias", () => {
  const result = calculateCurrentStreak(
    bets.filter((bet) => bet.playerId === "player-1")
  );

  assert.equal(result.type, "win");
  assert.equal(result.count, 3);
});


test("obtiene forma reciente correctamente", () => {
  const result = getRecentForm(
    bets.filter((bet) => bet.playerId === "player-1"),
    5
  );

  assert.deepEqual(result, [
    "win",
    "win",
    "win",
    "loss",
    "win"
  ]);
});


test("ignora apuestas de otros jugadores", () => {
  const result = calculatePerformanceTrend(
    "player-1",
    bets
  );

  assert.equal(result.playerId, "player-1");
  assert.notEqual(result.recentForm.includes("loss"), false);
});


test("calcula tendencia de rendimiento", () => {
  const result = calculatePerformanceTrend(
    "player-1",
    bets
  );

  assert.equal(
    typeof result.recentROI,
    "number"
  );

  assert.equal(
    typeof result.historicalROI,
    "number"
  );

  assert.ok(
    [
      "improving",
      "declining",
      "stable"
    ].includes(result.trend)
  );
});
