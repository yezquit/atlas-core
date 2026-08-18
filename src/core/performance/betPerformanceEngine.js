export function calculateBetPerformance(bets = []) {
  const summary = {
    totalBets: 0,
    wins: 0,
    losses: 0,
    voids: 0,
    totalStake: 0,
    totalReturn: 0,
    netProfit: 0,
    roi: 0
  };

  for (const bet of bets) {
    if (!bet || bet.status !== "closed") {
      continue;
    }

    summary.totalBets += 1;

    const stake = Number(bet.stake ?? 0);
    const returned = Number(bet.returnAmount ?? 0);

    summary.totalStake += stake;
    summary.totalReturn += returned;

    if (bet.result === "win") {
      summary.wins += 1;
    }

    if (bet.result === "loss") {
      summary.losses += 1;
    }

    if (bet.result === "void") {
      summary.voids += 1;
    }
  }

  summary.netProfit = summary.totalReturn - summary.totalStake;

  if (summary.totalStake > 0) {
    summary.roi = Number(
      ((summary.netProfit / summary.totalStake) * 100).toFixed(2)
    );
  }

  return summary;
}
