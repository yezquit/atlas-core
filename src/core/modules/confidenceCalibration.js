import {
  PARLAY_STATUS,
  PROBABILITY_STATUS,
} from "../contracts/atlasContracts.js";

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function getNumber(value) {
  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const parsed = Number(value.replace("%", "").trim());
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function getOperationalLevel({ technicalSupport, marketBlocked }) {
  if (marketBlocked) {
    return {
      id: "do_not_bet",
      label: "🔴 No apostar",
      description:
        "El mercado no tiene cobertura suficiente para una decisión responsable.",
    };
  }

  if (technicalSupport >= 60) {
    return {
      id: "analyzable_not_actionable",
      label: "🟡 Analizable, pero no accionable",
      description:
        "Existe respaldo técnico, pero no un modelo deportivo validado para estimar probabilidad.",
    };
  }

  return {
    id: "observation_only",
    label: "🟠 Solo observación",
    description:
      "La información permite revisar el contexto, pero no tomar acción.",
  };
}

function buildCaps({
  marketGate,
  marketDataCoverage,
  realFixtureLookup,
  realFixtureStatistics,
  marketFocusedStats,
  gateCoordinator,
}) {
  const caps = [];
  let maxTechnicalSupport = 95;

  if (!realFixtureLookup?.selectedFixture) {
    maxTechnicalSupport = Math.min(maxTechnicalSupport, 20);
    caps.push("Sin fixture real confirmado: respaldo técnico máximo 20%.");
  }

  if (!realFixtureStatistics?.statistics?.qualityFlags?.hasStatistics) {
    maxTechnicalSupport = Math.min(maxTechnicalSupport, 35);
    caps.push("Sin estadísticas reales del fixture: respaldo técnico máximo 35%.");
  }

  if (marketDataCoverage?.coverageLevel === "missing") {
    maxTechnicalSupport = Math.min(maxTechnicalSupport, 25);
    caps.push(
      "Mercado no cubierto por la fuente base: respaldo técnico máximo 25%."
    );
  }

  if (marketDataCoverage?.coverageLevel === "partial") {
    maxTechnicalSupport = Math.min(maxTechnicalSupport, 45);
    caps.push("Cobertura parcial del mercado: respaldo técnico máximo 45%.");
  }

  if (marketFocusedStats?.primaryMissing?.length > 0) {
    maxTechnicalSupport = Math.min(maxTechnicalSupport, 55);
    caps.push("Faltan datos principales del mercado: respaldo técnico máximo 55%.");
  }

  if (marketGate?.gateStatus === "blocked") {
    maxTechnicalSupport = Math.min(maxTechnicalSupport, 20);
    caps.push(
      "MarketGate bloqueó el mercado: no puede superar 20% de respaldo técnico."
    );
  }

  if (gateCoordinator?.canRecommend !== true) {
    maxTechnicalSupport = Math.min(maxTechnicalSupport, 68);
    caps.push(
      "GateCoordinator no permite recomendación: respaldo técnico máximo 68%."
    );
  }

  caps.push(
    "La probabilidad deportiva no está disponible hasta validar un modelo específico."
  );

  return {
    maxTechnicalSupport,
    caps,
  };
}

export function calibrateConfidence({
  technicalConfidence,
  sourceConfidence,
  marketGate,
  marketDataCoverage,
  realFixtureLookup,
  realFixtureStatistics,
  marketFocusedStats,
  gateCoordinator,
}) {
  const rawTechnicalSupport = getNumber(technicalConfidence?.technicalScore);
  const informationScore = getNumber(sourceConfidence?.informationScore);

  const caps = buildCaps({
    marketGate,
    marketDataCoverage,
    realFixtureLookup,
    realFixtureStatistics,
    marketFocusedStats,
    gateCoordinator,
  });

  const technicalSupport = clamp(
    rawTechnicalSupport,
    0,
    caps.maxTechnicalSupport
  );

  const estimatedProbability = null;
  const probabilityStatus = PROBABILITY_STATUS.UNAVAILABLE;
  const operationalLevel = getOperationalLevel({
    technicalSupport,
    marketBlocked: marketGate?.gateStatus === "blocked",
  });

  const explanations = [
    "Respaldo técnico mide qué tan completo y verificable está el análisis; no es probabilidad de acierto.",
    "La probabilidad deportiva permanece no disponible porque Atlas no tiene un modelo validado en esta fase.",
  ];

  if (caps.caps.length > 0) {
    explanations.push(
      "Se aplicaron techos de prudencia por datos faltantes o bloqueos operativos."
    );
  }

  return {
    informationScore,
    rawTechnicalSupport,
    technicalSupport,
    rawEstimatedProbability: null,
    estimatedProbability,
    probabilityStatus,
    operationalLevel,
    maxTechnicalSupport: caps.maxTechnicalSupport,
    maxEstimatedProbability: null,
    capsApplied: caps.caps,
    canRecommend: false,
    gateAllowsRecommendation: gateCoordinator?.canRecommend === true,
    canUseInParlay: false,
    parlayStatus: PARLAY_STATUS.UNSUPPORTED,
    summary:
      "Atlas separa respaldo técnico, probabilidad deportiva y permiso operativo para evitar falsa certeza.",
    explanations,
  };
}
