import {
  FIXTURE_STATUS,
  createFixtureResult,
} from "../contracts/atlasContracts.js";

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
        return { home, away, mode: "home-away" };
      }
    }
  }

  if (text) return { team: text, mode: "single-team" };
  return { mode: "empty" };
}

export function inferApiLeagueKey({ resolvedCompetition, competitionText }) {
  const combined = normalizeText(
    [
      resolvedCompetition?.competitionName,
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
  if (combined.includes("copa colombia") || combined.includes("copa")) {
    return "copaColombia";
  }
  if (combined.includes("superliga")) return "superliga";
  if (combined.includes("femenina")) return "ligaFemenina";
  return "primeraA";
}

export function selectBestFixture(matches = []) {
  if (matches.length === 0) {
    return { status: FIXTURE_STATUS.NOT_FOUND, selectedFixture: null };
  }

  if (matches.length > 1) {
    return { status: FIXTURE_STATUS.AMBIGUOUS, selectedFixture: null };
  }

  return {
    status: FIXTURE_STATUS.CONFIRMED,
    selectedFixture: matches[0],
  };
}

export async function lookupRealFixture({
  matchText,
  resolvedCompetition,
  competitionText,
  date,
  season,
}) {
  const parsed = parseMatchTeams(matchText);
  const leagueKey = inferApiLeagueKey({
    resolvedCompetition,
    competitionText,
  });

  if (parsed.mode === "empty") {
    return createFixtureResult({
      status: FIXTURE_STATUS.NOT_REQUESTED,
      reason: "No hay texto de partido.",
      parsed,
      leagueKey,
      statusLabel: "Sin partido para consultar",
    });
  }

  const params = new URLSearchParams({
    countryKey: "colombia",
    leagueKey,
  });

  if (season) params.set("season", season);
  if (date) params.set("date", date);

  if (parsed.mode === "home-away") {
    params.set("home", parsed.home);
    params.set("away", parsed.away);
  } else {
    params.set("team", parsed.team);
  }

  try {
    const response = await fetch(
      `/api/football/find-fixture?${params.toString()}`,
      { cache: "no-store" }
    );
    const data = await response.json();
    const matches = data?.matches || [];

    if (!response.ok || !data?.ok) {
      return createFixtureResult({
        status: FIXTURE_STATUS.ERROR,
        attempted: true,
        connected: false,
        reason: data?.message || "La fuente de fixtures respondió con error.",
        parsed,
        leagueKey,
        apiQuery: data?.query || null,
        matches,
        rawErrors: data?.rawErrors || null,
        statusLabel: "Error consultando fuente de fixtures",
      });
    }

    const selection = selectBestFixture(matches);
    const isConfirmed = selection.status === FIXTURE_STATUS.CONFIRMED;
    const isAmbiguous = selection.status === FIXTURE_STATUS.AMBIGUOUS;

    return createFixtureResult({
      status: selection.status,
      attempted: true,
      connected: true,
      reason: isConfirmed
        ? "Atlas encontró una única coincidencia."
        : isAmbiguous
          ? "La consulta devolvió varias coincidencias; se requiere fecha o temporada para resolverlas."
          : "La fuente respondió, pero no encontró un partido coincidente.",
      parsed,
      leagueKey,
      apiQuery: data?.query || null,
      count: matches.length,
      matches,
      selectedFixture: selection.selectedFixture,
      rawErrors: data?.rawErrors || null,
      statusLabel: isConfirmed
        ? "Fixture real confirmado"
        : isAmbiguous
          ? "Fixture ambiguo"
          : "Sin fixture coincidente",
    });
  } catch (error) {
    return createFixtureResult({
      status: FIXTURE_STATUS.ERROR,
      attempted: true,
      connected: false,
      reason: error.message,
      parsed,
      leagueKey,
      statusLabel: "Error consultando fuente de fixtures",
    });
  }
}
