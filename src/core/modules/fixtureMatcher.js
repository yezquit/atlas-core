function normalizeText(value = "") {
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function includesTeamName(sourceName, queryName) {
  const source = normalizeText(sourceName);
  const query = normalizeText(queryName);

  if (!source || !query) return false;

  return source.includes(query) || query.includes(source);
}

export function matchFixturesByTeams(fixtures = [], { home, away, team }) {
  const homeQuery = normalizeText(home);
  const awayQuery = normalizeText(away);
  const teamQuery = normalizeText(team);

  return fixtures.filter((fixture) => {
    const homeName = fixture?.teams?.home?.name || "";
    const awayName = fixture?.teams?.away?.name || "";

    if (homeQuery && awayQuery) {
      return (
        includesTeamName(homeName, homeQuery) &&
        includesTeamName(awayName, awayQuery)
      );
    }

    if (teamQuery) {
      return (
        includesTeamName(homeName, teamQuery) ||
        includesTeamName(awayName, teamQuery)
      );
    }

    return false;
  });
}
