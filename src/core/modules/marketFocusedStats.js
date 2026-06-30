function normalizeText(value = "") {
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const STAT_LABELS = {
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

const MARKET_FOCUSED_STATS = [
  {
    id: "cards",
    label: "Tarjetas",
    keywords: ["tarjeta", "tarjetas", "amarilla", "roja", "cards"],
    primaryStats: ["yellow_cards", "red_cards", "fouls"],
    supportStats: ["ball_possession", "corner_kicks", "total_shots"],
  },
  {
    id: "passes",
    label: "Pases",
    keywords: ["pases", "total de pases", "passes", "pases totales"],
    primaryStats: ["total_passes", "passes_accurate", "passes_%"],
    supportStats: ["ball_possession"],
  },
  {
    id: "shots_on_goal",
    label: "Remates a arco",
    keywords: ["remates a arco", "disparos al arco", "tiros a puerta", "shots on goal", "a puerta"],
    primaryStats: ["shots_on_goal", "total_shots", "shots_off_goal", "blocked_shots"],
    supportStats: ["ball_possession", "corner_kicks"],
  },
  {
    id: "total_shots",
    label: "Remates totales",
    keywords: ["remates", "disparos", "tiros", "remates totales", "total shots"],
    primaryStats: ["total_shots", "shots_on_goal", "shots_off_goal", "blocked_shots", "shots_insidebox", "shots_outsidebox"],
    supportStats: ["ball_possession", "corner_kicks"],
  },
  {
    id: "corners",
    label: "Córners",
    keywords: ["corner", "corners", "córner", "córners", "tiros de esquina"],
    primaryStats: ["corner_kicks"],
    supportStats: ["total_shots", "shots_on_goal", "ball_possession"],
  },
  {
    id: "fouls",
    label: "Faltas",
    keywords: ["falta", "faltas", "fouls"],
    primaryStats: ["fouls"],
    supportStats: ["yellow_cards", "red_cards", "ball_possession"],
  },
  {
    id: "throw_ins",
    label: "Saques de banda",
    keywords: ["saque de banda", "saques de banda", "throw in", "throw-ins", "laterales"],
    primaryStats: ["throw_ins"],
    supportStats: [],
  },
];

function detectRule(marketText = "") {
  const market = normalizeText(marketText);

  return (
    MARKET_FOCUSED_STATS.find((rule) =>
      rule.keywords.some((keyword) => market.includes(normalizeText(keyword)))
    ) || {
      id: "general",
      label: marketText || "Mercado general",
      primaryStats: [],
      supportStats: [],
    }
  );
}

function formatValue(key, value) {
  if (value === null || value === undefined) return "N/D";

  if (key === "ball_possession" || key === "passes_%") {
    return `${value}%`;
  }

  return value;
}

function buildTeamStats(team, statKeys) {
  return statKeys.map((key) => ({
    key,
    label: STAT_LABELS[key] || key,
    value: formatValue(key, team?.statistics?.[key]?.value),
    available: team?.statistics?.[key]?.value !== null && team?.statistics?.[key]?.value !== undefined,
  }));
}

export function buildMarketFocusedStats({ marketText, fixtureStatistics }) {
  const rule = detectRule(marketText);
  const stats = fixtureStatistics?.statistics;
  const teams = stats?.teams || [];
  const availableStats = stats?.availableStats || [];

  const primaryAvailable = rule.primaryStats.filter((stat) =>
    availableStats.includes(stat)
  );

  const primaryMissing = rule.primaryStats.filter(
    (stat) => !availableStats.includes(stat)
  );

  const supportAvailable = rule.supportStats.filter((stat) =>
    availableStats.includes(stat)
  );

  const teamRows = teams.map((team) => ({
    team: team.team,
    primaryStats: buildTeamStats(team, rule.primaryStats),
    supportStats: buildTeamStats(team, rule.supportStats),
  }));

  let status = "Sin regla específica";
  let summary = "Atlas todavía no tiene una vista enfocada para este mercado.";

  if (rule.primaryStats.length > 0 && primaryMissing.length === 0) {
    status = "Datos principales disponibles";
    summary = "Atlas encontró los datos principales para este mercado y los muestra de forma priorizada.";
  } else if (primaryAvailable.length > 0) {
    status = "Datos parcialmente disponibles";
    summary = "Atlas encontró parte de los datos principales, pero el mercado sigue incompleto.";
  } else if (rule.primaryStats.length > 0) {
    status = "Datos principales no disponibles";
    summary = "Atlas no encontró en esta fuente los datos principales para este mercado.";
  }

  return {
    marketId: rule.id,
    marketLabel: rule.label,
    status,
    summary,
    primaryStatKeys: rule.primaryStats,
    supportStatKeys: rule.supportStats,
    primaryAvailable,
    primaryMissing,
    supportAvailable,
    teamRows,
  };
}
