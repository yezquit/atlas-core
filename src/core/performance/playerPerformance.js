export function calculatePlayerPerformance(bets, playerId) {
  const playerBets = bets.filter(
    (bet) => bet.playerId === playerId
  );

  const totalBets = playerBets.length;

  const wonBets = playerBets.filter(
    (bet) => bet.status === "won"
  ).length;

  const lostBets = playerBets.filter(
    (bet) => bet.status === "lost"
  ).length;

  const totalStake = playerBets.reduce(
    (sum, bet) => sum + bet.stake,
    0
  );

  const netProfit = playerBets.reduce(
    (sum, bet) => sum + bet.profit,
    0
  );

  const roi =
    totalStake > 0
      ? (netProfit / totalStake) * 100
      : 0;

  return {
    playerId,
    totalBets,
    wonBets,
    lostBets,
    totalStake,
    netProfit,
    roi,
  };
}
