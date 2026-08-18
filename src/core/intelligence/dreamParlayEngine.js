const MAX_TOTAL_ODDS = 30;
const MIN_TOTAL_ODDS = 10;

function calculateDistance(value, target) {
  return Math.abs(value - target);
}

function normalizeCandidate(candidate) {
  if (!candidate?.decimalOdds) return null;

  const odds = Number(candidate.decimalOdds);

  if (!Number.isFinite(odds) || odds <= 1) {
    return null;
  }

  return {
    ...candidate,
    decimalOdds: odds,
  };
}

export function buildDreamParlays(
  candidates = [],
  {
    targetOdds = 20,
    selections = 7,
  } = {}
) {
  const valid = candidates
    .map(normalizeCandidate)
    .filter(Boolean);

  if (!valid.length) {
    return [];
  }

  const results = [];

  function search(
    start,
    combo,
    totalOdds
  ) {
    if (combo.length === selections) {
      if (
        totalOdds >= MIN_TOTAL_ODDS &&
        totalOdds <= MAX_TOTAL_ODDS
      ) {
        results.push({
          type: "dream_parlay",
          riskLevel: "high",
          totalOdds: Number(totalOdds.toFixed(2)),
          selections: combo,
          distance: calculateDistance(
            totalOdds,
            targetOdds
          ),
          description:
            "Combinación exploratoria de alto riesgo construida con selecciones individuales razonables.",
        });
      }

      return;
    }

    for (let i = start; i < valid.length; i++) {
      const nextOdds =
        totalOdds * valid[i].decimalOdds;

      if (nextOdds > MAX_TOTAL_ODDS) {
        continue;
      }

      search(
        i + 1,
        [...combo, valid[i]],
        nextOdds
      );
    }
  }

  search(0, [], 1);

  return results
    .sort(
      (a, b) =>
        a.distance - b.distance
    )
    .slice(0, 5);
}
