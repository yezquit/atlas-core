import { competitions, normalizeText } from "../data/competitions.js";

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsAlias(text, alias) {
  const normalizedAlias = normalizeText(alias);

  if (!normalizedAlias) return false;

  const pattern = new RegExp(
    `(^|[^a-z0-9])${escapeRegex(normalizedAlias)}([^a-z0-9]|$)`,
    "i"
  );

  return pattern.test(text);
}

function normalizeTeamEntry(team) {
  if (typeof team === "string") {
    return {
      name: team,
      aliases: [team],
    };
  }

  return {
    name: team.name || "Equipo sin nombre",
    aliases: Array.isArray(team.aliases) ? team.aliases : [team.name].filter(Boolean),
  };
}

export function resolveCompetition({ partido, competicion }) {
  const normalizedPartido = normalizeText(partido);
  const normalizedCompeticion = normalizeText(competicion);

  const matches = competitions.map((competition) => {
    let score = 0;
    const reasons = [];
    const matchedTeams = [];

    const aliasMatch = competition.aliases.some((alias) =>
      containsAlias(normalizedCompeticion, alias)
    );

    if (aliasMatch) {
      score += 60;
      reasons.push("Coincidencia por nombre o alias de competición.");
    }

    for (const rawTeam of competition.teams) {
      const team = normalizeTeamEntry(rawTeam);

      const teamMatched = team.aliases.some((alias) =>
        containsAlias(normalizedPartido, alias)
      );

      if (teamMatched) {
        score += 35;
        matchedTeams.push(team.name);
      }
    }

    if (matchedTeams.length > 0) {
      reasons.push(`Equipos detectados: ${matchedTeams.join(", ")}.`);
    }

    return {
      competition,
      score,
      reasons,
      matchedTeams,
    };
  });

  const sorted = matches
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = sorted[0];

  if (!best) {
    return {
      resolved: false,
      competitionName: competicion || "Competición pendiente",
      competitionId: null,
      country: null,
      division: null,
      confidence: "Baja",
      reason: "Atlas no pudo inferir la competición con la información ingresada.",
      warnings: [
        "Es recomendable escribir competición o usar equipos reconocidos por la base inicial.",
      ],
    };
  }

  const second = sorted[1];
  const ambiguous = second && best.score - second.score < 35;

  return {
    resolved: !ambiguous,
    competitionName: best.competition.name,
    competitionId: best.competition.id,
    country: best.competition.country,
    division: best.competition.division,
    confidence: ambiguous ? "Media" : best.score >= 95 ? "Alta" : "Media",
    reason: best.reasons.join(" "),
    warnings: ambiguous
      ? [
          `Posible ambigüedad con ${second.competition.name} (${second.competition.division}).`,
          "Atlas debe pedir confirmación si la competición afecta el análisis.",
        ]
      : [],
  };
}
