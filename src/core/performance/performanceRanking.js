export function buildPerformanceRanking(players = []) {
  return players
    .map((player) => {
      const totalBets = Number(player.totalBets || 0);
      const wins = Number(player.wins || 0);
      const profit = Number(player.profit || 0);
      const roi = Number(player.roi || 0);

      return {
        playerId: player.playerId,
        totalBets,
        wins,
        profit,
        roi,
        winRate: totalBets > 0 ? wins / totalBets : 0,
      };
    })
    .sort((a, b) => {
      if (b.roi !== a.roi) {
        return b.roi - a.roi;
      }

      if (b.profit !== a.profit) {
        return b.profit - a.profit;
      }

      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }

      return b.totalBets - a.totalBets;
    })
    .map((player, index) => ({
      rank: index + 1,
      ...player,
    }));
}
