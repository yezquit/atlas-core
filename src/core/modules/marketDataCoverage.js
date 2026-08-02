function normalizeText(value = "") {
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const MARKET_COVERAGE_RULES = [
  {
    id: "cards",
    keywords: ["tarjeta", "tarjetas", "amarilla", "roja", "cards", "yellow", "red"],
    label: "Tarjetas",
    requiredStats: ["yellow_cards", "red_cards", "fouls"],
    usefulStats: ["ball_possession", "total_shots", "corner_kicks"],
    missingExternalData: [
      "Línea de mercado",
      "Cuota",
      "Promedio histórico del árbitro",
      "Promedio disciplinario reciente de equipos",
    ],
  },
  {
    id: "fouls",
    keywords: ["falta", "faltas", "fouls"],
    label: "Faltas",
    requiredStats: ["fouls"],
    usefulStats: ["yellow_cards", "red_cards", "ball_possession"],
    missingExternalData: [
      "Línea de mercado",
      "Cuota",
      "Criterio histórico del árbitro",
    ],
  },
  {
    id: "shots_on_goal",
    keywords: ["remates a arco", "disparos al arco", "tiros a puerta", "shots on goal", "a puerta"],
    label: "Remates a arco",
    requiredStats: ["shots_on_goal"],
    usefulStats: ["total_shots", "shots_off_goal", "blocked_shots", "ball_possession"],
    missingExternalData: [
      "Línea de mercado",
      "Cuota",
      "Promedio reciente de remates a arco",
    ],
  },
  {
    id: "total_shots",
    keywords: ["remates", "disparos", "tiros", "total shots", "remates totales"],
    label: "Remates totales",
    requiredStats: ["total_shots"],
    usefulStats: ["shots_on_goal", "shots_off_goal", "blocked_shots", "shots_insidebox", "shots_outsidebox"],
    missingExternalData: [
      "Línea de mercado",
      "Cuota",
      "Promedio reciente de remates totales",
    ],
  },
  {
    id: "passes",
    keywords: ["pases", "total de pases", "passes", "pases totales"],
    label: "Pases",
    requiredStats: ["total_passes", "passes_accurate", "passes_%"],
    usefulStats: ["ball_possession"],
    missingExternalData: [
      "Línea de mercado",
      "Cuota",
      "Rol del jugador si el mercado es individual",
    ],
  },
  {
    id: "corners",
    keywords: ["corner", "corners", "córner", "córners", "tiros de esquina"],
    label: "Córners",
    requiredStats: ["corner_kicks"],
    usefulStats: ["total_shots", "shots_on_goal", "ball_possession"],
    missingExternalData: [
      "Línea de mercado",
      "Cuota",
      "Promedio reciente de córners",
    ],
  },
  {
    id: "throw_ins",
    keywords: ["saque de banda", "saques de banda", "throw in", "throw-ins", "laterales"],
    label: "Saques de banda",
    requiredStats: ["throw_ins"],
    usefulStats: [],
    missingExternalData: [
      "Fuente complementaria para saques de banda",
      "Línea de mercado",
      "Cuota",
    ],
  },
];

function detectMarketRule(marketText = "") {
  const normalized = normalizeText(marketText);

  return (
    MARKET_COVERAGE_RULES.find((rule) =>
      rule.keywords.some((keyword) => normalized.includes(normalizeText(keyword)))
    ) || {
      id: "general",
      label: marketText || "Mercado general",
      requiredStats: [],
      usefulStats: [],
      missingExternalData: ["Mercado no clasificado todavía"],
    }
  );
}

function statLabel(key) {
  const labels = {
    yellow_cards: "Tarjetas amarillas",
    red_cards: "Tarjetas rojas",
    fouls: "Faltas",
    ball_possession: "Posesión",
    total_shots: "Remates totales",
    shots_on_goal: "Remates a arco",
    shots_off_goal: "Remates fuera",
    blocked_shots: "Remates bloqueados",
    shots_insidebox: "Remates dentro del área",
    shots_outsidebox: "Remates fuera del área",
    corner_kicks: "Córners",
    offsides: "Fueras de juego",
    goalkeeper_saves: "Atajadas del arquero",
    total_passes: "Pases totales",
    passes_accurate: "Pases acertados",
    "passes_%": "Precisión de pase",
    expected_goals: "Goles esperados",
    throw_ins: "Saques de banda",
  };

  return labels[key] || key;
}

function hasReportedValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function isLineRequirement(item) {
  return normalizeText(item).includes("linea");
}

function isOddsRequirement(item) {
  return normalizeText(item).includes("cuota");
}

export function evaluateMarketDataCoverage({
  marketText,
  fixtureStatistics,
  lineText,
  oddsText,
}) {
  const rule = detectMarketRule(marketText);
  const availableStats = fixtureStatistics?.statistics?.availableStats || [];
  const hasLine = hasReportedValue(lineText);
  const hasOdds = hasReportedValue(oddsText);
  const missingExternalData = rule.missingExternalData.filter((item) => {
    if (hasLine && isLineRequirement(item)) return false;
    if (hasOdds && isOddsRequirement(item)) return false;
    return true;
  });

  const coveredRequiredStats = rule.requiredStats.filter((stat) =>
    availableStats.includes(stat)
  );

  const missingRequiredStats = rule.requiredStats.filter(
    (stat) => !availableStats.includes(stat)
  );

  const coveredUsefulStats = rule.usefulStats.filter((stat) =>
    availableStats.includes(stat)
  );

  let coverageStatus = "No evaluado";
  let coverageLevel = "unknown";

  if (rule.requiredStats.length === 0) {
    coverageStatus = "Mercado no clasificado";
    coverageLevel = "unknown";
  } else if (coveredRequiredStats.length === rule.requiredStats.length) {
    coverageStatus = "Cubierto por API-FOOTBALL";
    coverageLevel = "covered";
  } else if (coveredRequiredStats.length > 0) {
    coverageStatus = "Cubierto parcialmente";
    coverageLevel = "partial";
  } else {
    coverageStatus = "No cubierto por API-FOOTBALL";
    coverageLevel = "missing";
  }

  return {
    marketId: rule.id,
    marketLabel: rule.label,
    coverageStatus,
    coverageLevel,
    requiredStats: rule.requiredStats.map((stat) => ({
      key: stat,
      label: statLabel(stat),
      available: availableStats.includes(stat),
    })),
    usefulStats: rule.usefulStats.map((stat) => ({
      key: stat,
      label: statLabel(stat),
      available: availableStats.includes(stat),
    })),
    coveredRequiredStats,
    missingRequiredStats,
    coveredUsefulStats,
    missingExternalData,
    hasLine,
    hasOdds,
    reportedLine: hasLine ? String(lineText).trim() : null,
    reportedOdds: hasOdds ? String(oddsText).trim() : null,
    availableStats: availableStats.map((stat) => ({
      key: stat,
      label: statLabel(stat),
    })),
    summary:
      coverageLevel === "covered"
        ? hasLine && hasOdds
          ? "La fuente estadística cubre los datos base y la línea/cuota fueron reportadas; aún deben validarse."
          : "La fuente estadística cubre los datos base; aún falta reportar línea y/o cuota."
        : coverageLevel === "partial"
          ? "API-FOOTBALL entrega parte de los datos necesarios, pero el mercado sigue incompleto."
          : coverageLevel === "missing"
            ? "API-FOOTBALL no entrega los datos estadísticos base para este mercado en este fixture."
            : "Atlas todavía no tiene una regla de cobertura para este mercado.",
  };
}
