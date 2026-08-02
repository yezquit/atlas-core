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

function fixtureMatchesDate(fixture, date) {
  if (!date) return true;
  const fixtureDate = fixture?.date?.utc || fixture?.date || "";
  return String(fixtureDate).slice(0, 10) === String(date).slice(0, 10);
}

function fixtureMatchesSeason(fixture, season) {
  if (!season) return true;
  return String(fixture?.competition?.season || "") === String(season);
}

export function matchFixturesByTeams(
  fixtures = [],
  { home, away, team, date, season } = {}
) {
  const homeQuery = normalizeText(home);
  const awayQuery = normalizeText(away);
  const teamQuery = normalizeText(team);

  return fixtures.filter((fixture) => {
    if (!fixtureMatchesDate(fixture, date)) return false;
    if (!fixtureMatchesSeason(fixture, season)) return false;

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
