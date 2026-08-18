import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPerformanceDashboard
} from "../performance/performanceDashboard.js";


test("genera dashboard completo de rendimiento de jugador", () => {
const bets = [
  {
    playerId: "player-1",
    status: "won",
    result: "won",
    stake: 100,
    profit: 20,
    settledAt: "2026-08-01"
  },
  {
    playerId: "player-1",
    status: "lost",
    result: "lost",
    stake: 100,
    profit: -100,
    settledAt: "2026-08-02"
  },
  {
    playerId: "player-1",
    status: "lost",
    result: "lost",
    stake: 100,
    profit: -100,
    settledAt: "2026-08-03"
  },
  {
    playerId: "player-1",
    status: "won",
    result: "won",
    stake: 100,
    profit: 150,
    settledAt: "2026-08-09"
  },
  {
    playerId: "player-1",
    status: "won",
    result: "won",
    stake: 100,
    profit: 150,
    settledAt: "2026-08-10"
  }
];
});
