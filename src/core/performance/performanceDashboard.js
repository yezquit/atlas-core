import { calculatePlayerPerformance } from "./playerPerformance.js";
import { calculatePerformanceTrend } from "./performanceTrends.js";
import { buildPerformanceRanking } from "./performanceRanking.js";
import { buildPerformanceInsights } from "./performanceInsights.js";

export function buildPerformanceDashboard({
  bets,
  players,
  playerId
}) {
  const performance =
    calculatePlayerPerformance(
      bets,
      playerId
    );

  const trend =
    calculatePerformanceTrend(
      playerId,
      bets
    );

  const ranking =
    buildPerformanceRanking(
      players
    );

  const playerRanking =
    ranking.find(
      (item) =>
        item.playerId === playerId
    );

  const insights =
    buildPerformanceInsights({
      player: playerId,
      performance,
      ranking: {
        position: playerRanking?.rank
      },
      trend: {
        direction: trend.trend
      }
    });

  return {
    playerId,
    performance,
    trend,
    ranking: playerRanking || null,
    insights
  };
}
