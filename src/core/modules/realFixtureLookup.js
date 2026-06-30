function normalizeText(value = "") {
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function parseMatchTeams(matchText = "") {
  const text = matchText.trim();

  const separators = [
    " vs ",
    " VS ",
    " Vs ",
    " v ",
    " V ",
    " contra ",
    " Contra ",
    " - ",
  ];

  for (const separator of separators) {
    if (text.includes(separator)) {
      const [home, away] = text.split(separator).map((part) => part.trim());

      if (home && away) {
        return {
          home,
          away,
          mode: "home-away",
        };
      }
    }
  }

  if (text) {
    return {
      team: text,
      mode: "single-team",
    };
  }

  return {
    mode: "empty",
  };
}

export function inferApiLeagueKey({ resolvedCompetition, competitionText }) {
  const combined = normalizeText(
    [
      resolvedCompetition?.name,
      resolvedCompetition?.division,
      resolvedCompetition?.country,
      competitionText,
    ]
      .filter(Boolean)
      .join(" ")
  );

  if (
    combined.includes("primera b") ||
    combined.includes("torneo betplay") ||
    combined.includes("b dimayor")
  ) {
    return "primeraB";
  }

  if (
    combined.includes("copa colombia") ||
    combined.includes("copa")
  ) {
    return "copaColombia";
  }

  if (
    combined.includes("superliga")
  ) {
    return "superliga";
  }

  if (
    combined.includes("femenina")
  ) {
    return "ligaFemenina";
  }

  return "primeraA";
}

export function selectBestFixture(matches = []) {
  if (!matches.length) return null;

  const finishedWithReferee = matches.find(
    (match) => match?.status?.isFinished && match?.referee?.confirmed
  );

  if (finishedWithReferee) return finishedWithReferee;

  const withReferee = matches.find((match) => match?.referee?.confirmed);
  if (withReferee) return withReferee;

  return matches[0];
}

export async function lookupRealFixture({
  matchText,
  resolvedCompetition,
  competitionText,
  season,
}) {
  const parsed = parseMatchTeams(matchText);
  const leagueKey = inferApiLeagueKey({
    resolvedCompetition,
    competitionText,
  });

  if (parsed.mode === "empty") {
    return {
      attempted: false,
      connected: false,
      status: "Sin partido para consultar",
      reason: "No hay texto de partido.",
      parsed,
      leagueKey,
      matches: [],
      selectedFixture: null,
    };
  }

  const params = new URLSearchParams({
    countryKey: "colombia",
    leagueKey,
  });

  if (season) {
    params.set("season", season);
  }

  if (parsed.mode === "home-away") {
    params.set("home", parsed.home);
    params.set("away", parsed.away);
  }

  if (parsed.mode === "single-team") {
    params.set("team", parsed.team);
  }

  try {
    const response = await fetch(`/api/football/find-fixture?${params.toString()}`, {
      cache: "no-store",
    });

    const data = await response.json();
    const matches = data?.matches || [];
    const selectedFixture = selectBestFixture(matches);

    return {
      attempted: true,
      connected: response.ok && data?.ok,
      status: selectedFixture
        ? "Fixture real encontrado"
        : "Sin fixture coincidente",
      reason: selectedFixture
        ? "Atlas encontró coincidencia en API-FOOTBALL."
        : "La API respondió, pero no encontró partido con esos equipos.",
      parsed,
      leagueKey,
      apiQuery: data?.query || null,
      count: data?.count || 0,
      matches,
      selectedFixture,
      rawErrors: data?.rawErrors || null,
    };
  } catch (error) {
    return {
      attempted: true,
      connected: false,
      status: "Error consultando fuente real",
      reason: error.message,
      parsed,
      leagueKey,
      matches: [],
      selectedFixture: null,
    };
  }
}
