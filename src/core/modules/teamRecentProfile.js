function normalizeText(value = "") {
  return value
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function detectTeamMarketNeed(marketText = "") {
  const market = normalizeText(marketText);

  if (
    market.includes("remate") ||
    market.includes("tiro") ||
    market.includes("shots") ||
    market.includes("arco") ||
    market.includes("puerta")
  ) {
    return {
      level: "high",
      label: "Alta",
      family: "volumen ofensivo",
      requiredSignals: [
        "Remates recientes",
        "Remates a arco recientes",
        "Producción ofensiva local/visitante",
        "Rivalidad defensiva del oponente",
      ],
      reason:
        "Los mercados de remates dependen fuertemente de la tendencia reciente de ataque y defensa de ambos equipos.",
    };
  }

  if (
    market.includes("corner") ||
    market.includes("corners") ||
    market.includes("corner")
  ) {
    return {
      level: "high",
      label: "Alta",
      family: "córners",
      requiredSignals: [
        "Córners recientes a favor",
        "Córners recientes concedidos",
        "Presión ofensiva",
        "Estilo local/visitante",
      ],
      reason:
        "Los córners dependen de volumen ofensivo, presión territorial y estilo reciente de ambos equipos.",
    };
  }

  if (
    market.includes("tarjeta") ||
    market.includes("amarilla") ||
    market.includes("roja") ||
    market.includes("falta") ||
    market.includes("foul")
  ) {
    return {
      level: "medium_high",
      label: "Media-alta",
      family: "disciplina",
      requiredSignals: [
        "Tarjetas recientes por equipo",
        "Faltas recientes",
        "Contexto competitivo",
        "Árbitro",
      ],
      reason:
        "Los mercados disciplinarios dependen de árbitro, contexto y comportamiento reciente de los equipos.",
    };
  }

  if (
    market.includes("pase") ||
    market.includes("posesion") ||
    market.includes("posesión")
  ) {
    return {
      level: "medium_high",
      label: "Media-alta",
      family: "control de juego",
      requiredSignals: [
        "Pases recientes",
        "Posesión reciente",
        "Precisión de pase",
        "Ritmo del rival",
      ],
      reason:
        "Los mercados de posesión y pases dependen del patrón reciente de control de juego.",
    };
  }

  return {
    level: "unknown",
    label: "No determinada",
    family: "general",
    requiredSignals: [
      "Últimos partidos",
      "Rendimiento local/visitante",
      "Tendencia del mercado seleccionado",
    ],
    reason:
      "Atlas no pudo clasificar con precisión qué señales recientes necesita este mercado.",
  };
}

function extractTeamStats(marketFocusedStats) {
  const rows = marketFocusedStats?.teamRows || [];

  return rows.map((row) => ({
    teamName:
      row.team?.name || row.teamName || row.name || "Equipo no identificado",
    primaryStats: row.primaryStats || [],
    supportStats: row.supportStats || [],
  }));
}

export function buildTeamRecentProfile({
  realFixtureLookup,
  realFixtureStatistics,
  marketFocusedStats,
  marketText,
}) {
  const fixture =
    realFixtureLookup?.fixture || realFixtureLookup?.selectedFixture || null;

  const homeTeam =
    fixture?.teams?.home?.name ||
    fixture?.homeTeam?.name ||
    fixture?.home ||
    null;

  const awayTeam =
    fixture?.teams?.away?.name ||
    fixture?.awayTeam?.name ||
    fixture?.away ||
    null;

  const hasFixture = Boolean(fixture?.fixtureId || fixture?.id);
  const hasTeams = Boolean(homeTeam && awayTeam);
  const hasCurrentMatchStats = Boolean(
    realFixtureStatistics?.statistics?.availableStats?.length
  );

  const marketNeed = detectTeamMarketNeed(marketText);
  const currentTeamStats = extractTeamStats(marketFocusedStats);

  const missingData = [];

  if (!hasFixture) missingData.push("Fixture real confirmado");
  if (!hasTeams) missingData.push("Equipos local y visitante confirmados");

  missingData.push("Últimos 5 partidos del equipo local");
  missingData.push("Últimos 5 partidos del equipo visitante");
  missingData.push("Separación rendimiento local/visitante");
  missingData.push("Promedio reciente del mercado seleccionado");
  missingData.push("Comparación contra promedio de liga");
  missingData.push("Tendencia ofensiva/defensiva reciente");

  let profileStatus = "unavailable";
  let profileLabel = "🔴 Perfil reciente no disponible";
  let confidence = 0;
  let operationalUse = "No usar como base de decisión.";

  if (hasFixture && hasTeams) {
    profileStatus = "teams_identified";
    profileLabel = "🟡 Equipos identificados, histórico reciente pendiente";
    confidence = 25;
    operationalUse =
      "Puede usarse solo como contexto. Falta conectar últimos partidos para decisión fuerte.";
  }

  if (hasFixture && hasTeams && hasCurrentMatchStats) {
    profileStatus = "current_stats_available";
    profileLabel = "🟡 Estadísticas del partido disponibles, histórico pendiente";
    confidence = 35;
    operationalUse =
      "Sirve para leer el partido analizado o histórico puntual, pero aún falta tendencia reciente.";
  }

  const shouldLimitConfidence =
    marketNeed.level === "high" || marketNeed.level === "medium_high";

  const sourceImpact = shouldLimitConfidence
    ? {
        shouldLimitConfidence: true,
        reason:
          "El mercado depende de tendencia reciente de equipos, pero Atlas aún no tiene últimos partidos conectados.",
        maxTechnicalSupport: marketNeed.level === "high" ? 58 : 64,
        maxEstimatedProbability: marketNeed.level === "high" ? 55 : 57,
      }
    : {
        shouldLimitConfidence: false,
        reason:
          "La forma reciente de equipos no exige limitación fuerte adicional para este mercado en v0.1.",
        maxTechnicalSupport: null,
        maxEstimatedProbability: null,
      };

  return {
    available: hasTeams,
    profileStatus,
    profileLabel,
    homeTeam,
    awayTeam,
    hasFixture,
    hasTeams,
    hasCurrentMatchStats,
    marketNeed,
    confidence,
    operationalUse,
    currentTeamStats,
    missingData,
    sourceImpact,
    summary: hasTeams
      ? `Equipos detectados: ${homeTeam} vs ${awayTeam}. El histórico reciente todavía no está conectado.`
      : "Atlas no tiene equipos confirmados para construir perfil reciente.",
  };
}
