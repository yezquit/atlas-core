export function getRecentForm(bets, limit = 5) {
  return bets
    .slice()
    .sort((a, b) => new Date(b.settledAt) - new Date(a.settledAt))
    .slice(0, limit)
    .map((bet) => bet.result);
}

export function calculateCurrentStreak(bets) {
  const ordered = bets
    .slice()
    .sort((a, b) => new Date(b.settledAt) - new Date(a.settledAt));

  if (ordered.length === 0) {
    return {
      type: null,
      count: 0
    };
  }

  const firstResult = ordered[0].result;
  let count = 0;

  for (const bet of ordered) {
    if (bet.result === firstResult) {
      count++;
    } else {
      break;
    }
  }

  return {
    type: firstResult,
    count
  };
}

export function calculateROI(bets) {
  if (bets.length === 0) {
    return 0;
  }

  const totalStake = bets.reduce(
    (sum, bet) => sum + bet.stake,
    0
  );

  const totalProfit = bets.reduce(
    (sum, bet) => sum + bet.profit,
    0
  );

  if (totalStake === 0) {
    return 0;
  }

  return totalProfit / totalStake;
}

export function compareROITrend(recentROI, historicalROI) {
  const difference = recentROI - historicalROI;

  if (difference > 0.05) {
    return "improving";
  }

  if (difference < -0.05) {
    return "declining";
  }

  return "stable";
}

export function calculatePerformanceTrend(playerId, bets) {
  const playerBets = bets.filter(
    (bet) => bet.playerId === playerId
  );

  const ordered = playerBets
    .slice()
    .sort((a, b) => new Date(a.settledAt) - new Date(b.settledAt));

  const recentBets = ordered.slice(-5);

  const recentROI = calculateROI(recentBets);
  const historicalROI = calculateROI(ordered);

  return {
    playerId,
    currentStreak: calculateCurrentStreak(playerBets),
    recentForm: getRecentForm(playerBets),
    recentROI,
    historicalROI,
    trend: compareROITrend(
      recentROI,
      historicalROI
    )
  };
}
