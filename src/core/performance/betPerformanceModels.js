export function createPerformanceBet(input = {}) {
  const {
    id,
    status,
    stake,
    profit,
    market,
    league,
    bookmaker,
    odds,
  } = input;

  if (!id) {
    throw new Error("bet id is required");
  }

  if (!["WON", "LOST", "VOID"].includes(status)) {
    throw new Error("invalid bet status");
  }

  if (!Number.isFinite(stake) || stake <= 0) {
    throw new Error("invalid stake");
  }

  if (!Number.isFinite(profit)) {
    throw new Error("invalid profit");
  }

  if (odds !== undefined && (!Number.isFinite(odds) || odds <= 1)) {
    throw new Error("invalid odds");
  }

  return {
    id,
    status,
    stake,
    profit,
    market: market ?? null,
    league: league ?? null,
    bookmaker: bookmaker ?? null,
    odds: odds ?? null,
  };
}
