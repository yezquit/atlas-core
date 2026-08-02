function getScoreNumber(value) {
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const parsed = Number(value.replace("%", "").trim());
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function getQualityLabel(score) {
  if (score >= 80) return "Alta";
  if (score >= 60) return "Media-alta";
  if (score >= 40) return "Media";
  if (score >= 25) return "Baja controlada";
  return "Baja";
}

export function applyRealFixtureToSourceConfidence({
  sourceConfidence,
  realFixtureLookup,
  marketEvaluation,
}) {
  const fixture = realFixtureLookup?.selectedFixture || null;
  const marketFamily = marketEvaluation?.marketFamily || "general";

  if (!fixture) {
    return {
      ...sourceConfidence,
      realFixtureImpact: {
        applied: false,
        summary: "No se aplicó impacto de fuente real porque no hubo fixture confirmado.",
        resolvedCriticalData: [],
        confirmedData: [],
        scoreAdded: 0,
      },
    };
  }

  const confirmedData = [];
  const resolvedCriticalData = [];

  let scoreAdded = 0;
  let criticalResolvedCount = 0;

  if (fixture?.fixtureId) {
    confirmedData.push("Fixture ID confirmado");
    scoreAdded += 10;
  }

  if (fixture?.teams?.home?.name && fixture?.teams?.away?.name) {
    confirmedData.push("Equipos confirmados");
    scoreAdded += 10;
  }

  if (fixture?.date?.utc) {
    confirmedData.push("Fecha del partido confirmada");
    scoreAdded += 8;
  }

  if (fixture?.status?.short) {
    confirmedData.push("Estado del partido confirmado");
    scoreAdded += 8;
  }

  if (fixture?.venue?.name) {
    confirmedData.push("Estadio confirmado");
    scoreAdded += 6;
  }

  if (fixture?.score?.goals?.home !== null && fixture?.score?.goals?.away !== null) {
    confirmedData.push("Marcador confirmado");
    scoreAdded += 8;
  }

  if (fixture?.referee?.confirmed) {
    confirmedData.push("Árbitro confirmado");
    scoreAdded += 20;

    if (marketFamily === "disciplinario") {
      resolvedCriticalData.push("Árbitro confirmado para mercado disciplinario");
      criticalResolvedCount += 1;
    }
  }

  const originalScore = getScoreNumber(
    sourceConfidence?.informationScore ??
      sourceConfidence?.score ??
      sourceConfidence?.qualityScore
  );

  // La fuente del fixture confirma identidad, pero no valida por sí sola el mercado.
  // Por prudencia, el impacto queda limitado hasta completar la evidencia estadística.
  const fixtureOnlyCap = marketFamily === "disciplinario" ? 55 : 50;
  const newScore = Math.min(fixtureOnlyCap, originalScore + scoreAdded);

  const originalCriticalPending =
    sourceConfidence?.criticalPendingCount ??
    sourceConfidence?.criticalPending ??
    0;

  const newCriticalPending = Math.max(
    0,
    originalCriticalPending - criticalResolvedCount
  );

  return {
    ...sourceConfidence,
    informationScore: newScore,
    score: newScore,
    qualityScore: newScore,
    qualityLabel: getQualityLabel(newScore),
    criticalPendingCount: newCriticalPending,
    criticalPending: newCriticalPending,
    realFixtureImpact: {
      applied: true,
      provider: fixture?.source?.provider || "API-FOOTBALL",
      verified: fixture?.source?.verified === true,
      summary:
        criticalResolvedCount > 0
          ? "La fuente real confirmó fixture y resolvió al menos un dato crítico. La confianza queda limitada hasta completar la evidencia estadística."
          : "La fuente real confirmó datos del partido, pero no resolvió datos críticos. La confianza queda limitada hasta completar la evidencia estadística.",
      confirmedData,
      resolvedCriticalData,
      scoreAdded,
      originalScore,
      newScore,
      originalCriticalPending,
      newCriticalPending,
    },
  };
}
