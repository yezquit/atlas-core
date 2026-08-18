const MIN_SELECTIONS = 5;
const MAX_SELECTIONS = 15;
const MAX_TOTAL_ODDS = 100;

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
    selections = 5,
  } = {}
) {
  if (
    selections < MIN_SELECTIONS ||
    selections > MAX_SELECTIONS
  ) {
    return [];
  }

  const valid = candidates
    .map(normalizeCandidate)
    .filter(Boolean);

  if (valid.length < selections) {
    return [];
  }

  const results = [];

  function search(start, combo, totalOdds) {
    if (combo.length === selections) {
      results.push({
        type: "dream_parlay",
        riskLevel: "high",
        selections: combo,
        totalOdds: Number(totalOdds.toFixed(2)),
        description:
          `Soñadora Atlas de ${selections} selecciones. Alto riesgo por acumulación de eventos.`,
      });

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

  return results.slice(0, 5);
}
