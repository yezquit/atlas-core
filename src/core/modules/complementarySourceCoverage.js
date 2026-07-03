function normalizeText(value = "") {
  return value
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function detectRequiredSourceProfile(marketText = "") {
  const market = normalizeText(marketText);

  if (
    market.includes("saque de banda") ||
    market.includes("saques de banda") ||
    market.includes("throw")
  ) {
    return {
      family: "saques de banda",
      requiredData: ["throw_ins"],
      primarySourceNeed: "Fuente complementaria especializada",
      apiFootballExpectedCoverage: "No cubierto en estadísticas estándar",
      priority: "critical",
      reason:
        "API-FOOTBALL normalmente no entrega saques de banda en estadísticas estándar del fixture.",
    };
  }

  if (
    market.includes("tarjeta") ||
    market.includes("amarilla") ||
    market.includes("roja") ||
    market.includes("cards")
  ) {
    return {
      family: "disciplina",
      requiredData: ["yellow_cards", "red_cards", "fouls", "referee_history"],
      primarySourceNeed: "API-FOOTBALL + histórico arbitral complementario",
      apiFootballExpectedCoverage: "Parcial",
      priority: "high",
      reason:
        "API-FOOTBALL puede cubrir tarjetas del fixture, pero para decidir se requiere histórico de árbitro y equipos.",
    };
  }

  if (
    market.includes("falta") ||
    market.includes("foul")
  ) {
    return {
      family: "faltas",
      requiredData: ["fouls", "referee_history", "team_recent_fouls"],
      primarySourceNeed: "API-FOOTBALL + histórico reciente",
      apiFootballExpectedCoverage: "Parcial",
      priority: "high",
      reason:
        "Las faltas pueden aparecer en estadísticas del fixture, pero la decisión requiere tendencia reciente y árbitro.",
    };
  }

  if (
    market.includes("remate") ||
    market.includes("tiro") ||
    market.includes("arco") ||
    market.includes("puerta") ||
    market.includes("shots")
  ) {
    return {
      family: "remates",
      requiredData: ["total_shots", "shots_on_goal", "team_recent_shots"],
      primarySourceNeed: "API-FOOTBALL + últimos partidos",
      apiFootballExpectedCoverage: "Parcial a buena",
      priority: "high",
      reason:
        "API-FOOTBALL puede entregar remates del fixture, pero falta tendencia reciente para una lectura fuerte.",
    };
  }

  if (
    market.includes("corner") ||
    market.includes("corners") ||
    market.includes("corner")
  ) {
    return {
      family: "córners",
      requiredData: ["corner_kicks", "team_recent_corners"],
      primarySourceNeed: "API-FOOTBALL + últimos partidos",
      apiFootballExpectedCoverage: "Parcial a buena",
      priority: "high",
      reason:
        "API-FOOTBALL puede cubrir córners del fixture, pero se necesita histórico reciente a favor/en contra.",
    };
  }

  if (
    market.includes("pase") ||
    market.includes("posesion") ||
    market.includes("posesión")
  ) {
    return {
      family: "control de juego",
      requiredData: ["total_passes", "passes_accurate", "ball_possession"],
      primarySourceNeed: "API-FOOTBALL + contexto táctico reciente",
      apiFootballExpectedCoverage: "Parcial a buena",
      priority: "medium_high",
      reason:
        "API-FOOTBALL puede entregar pases y posesión en algunos fixtures, pero falta contexto reciente.",
    };
  }

  return {
    family: "general",
    requiredData: [],
    primarySourceNeed: "Fuente base + validación manual",
    apiFootballExpectedCoverage: "No determinada",
    priority: "unknown",
    reason:
      "Atlas no pudo determinar con precisión qué fuente complementaria exige este mercado.",
  };
}

function getAvailableStats(realFixtureStatistics) {
  return realFixtureStatistics?.availableStats || [];
}

export function buildComplementarySourceCoverage({
  marketText,
  realFixtureStatistics,
  marketDataCoverage,
  refereeProfile,
  teamRecentProfile,
  marketLineContext,
}) {
  const profile = detectRequiredSourceProfile(marketText);
  const availableStats = getAvailableStats(realFixtureStatistics);

  const coveredRequired = profile.requiredData.filter((item) =>
    availableStats.includes(item)
  );

  const missingRequired = profile.requiredData.filter(
    (item) => !availableStats.includes(item)
  );

  const missingComplementary = [];

  if (refereeProfile?.sourceImpact?.shouldLimitConfidence) {
    missingComplementary.push("Histórico arbitral verificable");
  }

  if (teamRecentProfile?.sourceImpact?.shouldLimitConfidence) {
    missingComplementary.push("Últimos partidos y tendencias recientes de equipos");
  }

  if (marketLineContext?.status !== "available") {
    missingComplementary.push("Línea y cuota verificadas de casa de apuestas");
  }

  if (marketDataCoverage?.missingExternalData?.length) {
    missingComplementary.push(...marketDataCoverage.missingExternalData);
  }

  let coverageStatus = "unknown";
  let coverageLabel = "⚪ Cobertura complementaria no determinada";
  let action = "Revisar manualmente antes de decidir.";
  let blocksDecision = true;

  if (profile.priority === "critical") {
    coverageStatus = "requires_complementary_source";
    coverageLabel = "🔴 Requiere fuente complementaria";
    action =
      "No decidir este mercado hasta conectar una fuente que entregue el dato específico.";
    blocksDecision = true;
  } else if (missingRequired.length === 0 && missingComplementary.length === 0) {
    coverageStatus = "sufficient";
    coverageLabel = "🟢 Cobertura suficiente para análisis inicial";
    action =
      "La cobertura permite análisis técnico inicial. La decisión final aún depende del DirectorAtlas.";
    blocksDecision = false;
  } else if (coveredRequired.length > 0) {
    coverageStatus = "partial";
    coverageLabel = "🟡 Cobertura parcial";
    action =
      "Permitir análisis, pero limitar confianza hasta completar fuentes complementarias.";
    blocksDecision = false;
  } else {
    coverageStatus = "insufficient";
    coverageLabel = "🟠 Cobertura insuficiente";
    action =
      "No convertir en apuesta real. Faltan datos base o complementarios importantes.";
    blocksDecision = true;
  }

  const uniqueMissingComplementary = [...new Set(missingComplementary)];

  return {
    marketFamily: profile.family,
    coverageStatus,
    coverageLabel,
    apiFootballExpectedCoverage: profile.apiFootballExpectedCoverage,
    primarySourceNeed: profile.primarySourceNeed,
    priority: profile.priority,
    reason: profile.reason,
    requiredData: profile.requiredData,
    availableStats,
    coveredRequired,
    missingRequired,
    missingComplementary: uniqueMissingComplementary,
    action,
    blocksDecision,
    summary:
      coverageStatus === "requires_complementary_source"
        ? `El mercado ${profile.family} requiere una fuente complementaria antes de decidir.`
        : `Cobertura evaluada para mercado de ${profile.family}.`,
  };
}
