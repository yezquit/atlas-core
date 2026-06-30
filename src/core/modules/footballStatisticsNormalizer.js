function parseStatValue(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") return value;

  if (typeof value === "string") {
    if (value.includes("%")) {
      const parsed = Number(value.replace("%", "").trim());
      return Number.isNaN(parsed) ? value : parsed;
    }

    const parsed = Number(value.trim());
    return Number.isNaN(parsed) ? value : parsed;
  }

  return value;
}

function normalizeStatName(type = "") {
  return type
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
}

export function normalizeFixtureStatistics(items = []) {
  const teams = items.map((teamStats) => {
    const statsObject = {};

    for (const stat of teamStats?.statistics || []) {
      const key = normalizeStatName(stat?.type);
      statsObject[key] = {
        label: stat?.type || key,
        value: parseStatValue(stat?.value),
        rawValue: stat?.value ?? null,
      };
    }

    return {
      team: {
        id: teamStats?.team?.id || null,
        name: teamStats?.team?.name || null,
        logo: teamStats?.team?.logo || null,
      },
      statistics: statsObject,
    };
  });

  const availableStats = Array.from(
    new Set(
      teams.flatMap((item) => Object.keys(item.statistics || {}))
    )
  );

  return {
    source: {
      provider: "API-FOOTBALL",
      verified: true,
      endpoint: "fixtures/statistics",
    },
    countTeams: teams.length,
    availableStats,
    teams,
    qualityFlags: {
      hasStatistics: teams.length > 0,
      hasTwoTeams: teams.length === 2,
      hasCards:
        availableStats.includes("yellow_cards") ||
        availableStats.includes("red_cards"),
      hasShots:
        availableStats.includes("total_shots") ||
        availableStats.includes("shots_on_goal"),
      hasCorners: availableStats.includes("corner_kicks"),
      hasPossession: availableStats.includes("ball_possession"),
      hasFouls: availableStats.includes("fouls"),
    },
  };
}
