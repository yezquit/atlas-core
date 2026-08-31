export const ASIAN_TOTAL_GOALS_FAMILY = "asian_total_goals";
export const ASIAN_TOTAL_GOALS_LABEL = "Asiático (Más/Menos) — Total de goles";

const OUTCOMES = Object.freeze(["full_win", "half_win", "push", "half_loss", "full_loss"]);

function round(value, decimals = 6) {
  return Number(Number(value).toFixed(decimals));
}

function validDirection(direction) {
  return ["over", "under"].includes(String(direction || "").toLowerCase());
}

export function splitAsianTotalLine(line, direction) {
  const numericLine = Number(line);
  const normalizedDirection = String(direction || "").toLowerCase();
  if (!Number.isFinite(numericLine) || numericLine < 0 || !validDirection(normalizedDirection)) return null;
  const quarter = Math.round(numericLine * 4);
  if (Math.abs(numericLine * 4 - quarter) > 1e-8) return null;
  const normalizedLine = quarter / 4;
  const fraction = ((quarter % 4) + 4) % 4;
  if (fraction === 1) return [normalizedLine - 0.25, normalizedLine + 0.25].map((partLine) => ({ direction: normalizedDirection, line: partLine, stake_fraction: 0.5 }));
  if (fraction === 3) return [normalizedLine - 0.25, normalizedLine + 0.25].map((partLine) => ({ direction: normalizedDirection, line: partLine, stake_fraction: 0.5 }));
  return [{ direction: normalizedDirection, line: normalizedLine, stake_fraction: 1 }];
}

function settlePart(totalGoals, { direction, line }) {
  if (totalGoals === line) return "push";
  const wins = direction === "over" ? totalGoals > line : totalGoals < line;
  return wins ? "win" : "loss";
}

export function settleAsianTotalGoals({ totalGoals, line, direction } = {}) {
  const total = Number(totalGoals);
  const parts = splitAsianTotalLine(line, direction);
  if (!Number.isFinite(total) || !parts) return { status: "not_evaluable", parts: [] };
  const settledParts = parts.map((part) => ({ ...part, result: settlePart(total, part) }));
  const wins = settledParts.filter((part) => part.result === "win").reduce((sum, part) => sum + part.stake_fraction, 0);
  const losses = settledParts.filter((part) => part.result === "loss").reduce((sum, part) => sum + part.stake_fraction, 0);
  const status = wins === 1 ? "full_win"
    : losses === 1 ? "full_loss"
      : wins === 0.5 ? "half_win"
        : losses === 0.5 ? "half_loss"
          : "push";
  return { status, parts: settledParts };
}

export function asianSettlementDescription({ line, direction } = {}) {
  const parts = splitAsianTotalLine(line, direction);
  if (!parts) return null;
  const side = String(direction).toLowerCase() === "under" ? "Menos de" : "Más de";
  if (parts.length === 1) return `La apuesta se liquida completa en ${side} ${parts[0].line}.`;
  return `Esta apuesta divide el dinero: 50% a ${side} ${parts[0].line} y 50% a ${side} ${parts[1].line}.`;
}

export function asianSettlementExplanation({ line, direction } = {}) {
  const parts = splitAsianTotalLine(line, direction);
  if (!parts) return null;
  const normalizedDirection = String(direction).toLowerCase();
  const side = normalizedDirection === "under" ? "Menos de" : "Más de";
  if (parts.length === 1) {
    return `${asianSettlementDescription({ line, direction })} Si el total coincide con una línea entera, la apuesta se devuelve.`;
  }
  const lower = parts[0].line;
  const upper = parts[1].line;
  const fraction = ((Math.round(Number(line) * 4) % 4) + 4) % 4;
  if (normalizedDirection === "over" && fraction === 1) return `Tu apuesta se divide en dos partes: 50% a Más de ${lower} y 50% a Más de ${upper}. Con exactamente ${lower} goles recuperas una mitad y pierdes la otra. Con ${Math.ceil(upper)} o más ganas completa.`;
  if (normalizedDirection === "over") return `Tu apuesta se divide en dos partes: 50% a Más de ${lower} y 50% a Más de ${upper}. Con exactamente ${upper} goles ganas una mitad y la otra se devuelve. Con ${Math.ceil(upper) + 1} o más ganas completa.`;
  if (fraction === 1) return `Tu apuesta se divide en dos partes: 50% a Menos de ${lower} y 50% a Menos de ${upper}. Con exactamente ${lower} goles ganas una mitad y la otra se devuelve. Con ${Math.max(0, Math.floor(lower) - 1)} o menos ganas completa.`;
  return `Tu apuesta se divide en dos partes: 50% a Menos de ${lower} y 50% a Menos de ${upper}. Con exactamente ${upper} goles recuperas una mitad y pierdes la otra. Con ${Math.floor(lower)} o menos ganas completa.`;
}

export function buildAsianSettlementProfile({ canonicalObservations, line, direction } = {}) {
  const observations = canonicalObservations?.observations || [];
  const base = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0]));
  if (!observations.length || !splitAsianTotalLine(line, direction)) return null;
  for (const observation of observations) {
    const result = settleAsianTotalGoals({ totalGoals: observation.value, line, direction });
    if (!OUTCOMES.includes(result.status)) continue;
    base[result.status] += Number(observation.effective_weight || 0);
  }
  const totalWeight = Object.values(base).reduce((sum, value) => sum + value, 0);
  if (!(totalWeight > 0)) return null;
  const probabilities = Object.fromEntries(Object.entries(base).map(([key, value]) => [key, round(value / totalWeight)]));
  const weightedWin = probabilities.full_win + 0.5 * probabilities.half_win;
  const weightedLoss = probabilities.full_loss + 0.5 * probabilities.half_loss;
  return {
    contract: "AsianSettlementProfile",
    version: 1,
    market_family: ASIAN_TOTAL_GOALS_FAMILY,
    direction: String(direction).toLowerCase(),
    line: Number(line),
    parts: splitAsianTotalLine(line, direction),
    probabilities,
    weighted_win_probability: round(weightedWin),
    weighted_loss_probability: round(weightedLoss),
    push_probability: probabilities.push,
    fixture_ids: canonicalObservations.fixture_ids || observations.map((item) => item.fixture_id),
    effective_sample_size: round(canonicalObservations.effective_sample_size || observations.length),
  };
}

export function asianExpectedValue(profile, decimalOdds) {
  const odds = Number(decimalOdds);
  const p = profile?.probabilities;
  if (!p || !Number.isFinite(odds) || odds <= 1) return null;
  return round(p.full_win * (odds - 1) + p.half_win * (odds - 1) / 2 - p.half_loss * 0.5 - p.full_loss);
}

export function asianFairOdds(profile) {
  const weightedWin = Number(profile?.weighted_win_probability);
  const weightedLoss = Number(profile?.weighted_loss_probability);
  return weightedWin > 0 && Number.isFinite(weightedLoss) ? round(1 + weightedLoss / weightedWin) : null;
}

export function asianPayoutForStake({ outcome, stake, decimalOdds } = {}) {
  const amount = Number(stake);
  const odds = Number(decimalOdds);
  if (!OUTCOMES.includes(outcome) || !Number.isFinite(amount) || !Number.isFinite(odds)) return null;
  const profit = outcome === "full_win" ? amount * (odds - 1)
    : outcome === "half_win" ? amount * (odds - 1) / 2
      : outcome === "half_loss" ? -amount / 2
        : outcome === "full_loss" ? -amount : 0;
  return { payout: round(amount + profit, 2), profit_loss: round(profit, 2) };
}
