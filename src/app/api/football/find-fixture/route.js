import { getApiFootballLeagueByKey } from "@/core/data/apiFootballLeagues";
import { normalizeFootballFixtures } from "@/core/modules/footballFixtureNormalizer";
import { matchFixturesByTeams } from "@/core/modules/fixtureMatcher";

export async function GET(request) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  const baseUrl = process.env.API_FOOTBALL_BASE_URL;

  const { searchParams } = new URL(request.url);

  const countryKey = searchParams.get("countryKey") || "colombia";
  const leagueKey = searchParams.get("leagueKey") || "primeraA";
  const seasonParam = searchParams.get("season");

  const home = searchParams.get("home") || "";
  const away = searchParams.get("away") || "";
  const team = searchParams.get("team") || "";

  const league = getApiFootballLeagueByKey(countryKey, leagueKey);

  if (!league) {
    return Response.json(
      {
        ok: false,
        message: "Liga no encontrada en catálogo interno de Atlas.",
        received: { countryKey, leagueKey },
      },
      { status: 400 }
    );
  }

  if (!apiKey || apiKey === "PEGA_AQUI_TU_API_KEY") {
    return Response.json(
      {
        ok: false,
        message: "API_FOOTBALL_KEY no está configurada en .env.local.",
      },
      { status: 500 }
    );
  }

  if (!home && !away && !team) {
    return Response.json(
      {
        ok: false,
        message: "Debes enviar home+away o team para buscar fixtures.",
        example:
          "/api/football/find-fixture?leagueKey=primeraA&home=Patriotas&away=Jaguares",
      },
      { status: 400 }
    );
  }

  const season = seasonParam || league.developmentSeason || league.currentSeason;

  try {
    const url = `${baseUrl}/fixtures?league=${league.id}&season=${season}`;

    const response = await fetch(url, {
      headers: {
        "x-apisports-key": apiKey,
      },
      cache: "no-store",
    });

    const data = await response.json();
    const fixtures = normalizeFootballFixtures(data?.response || []);

    const matches = matchFixturesByTeams(fixtures, {
      home,
      away,
      team,
    });

    return Response.json({
      ok: response.ok,
      status: response.status,
      query: {
        countryKey,
        leagueKey,
        leagueId: league.id,
        leagueName: league.localName,
        season,
        home,
        away,
        team,
      },
      count: matches.length,
      matches,
      rawErrors: data?.errors || [],
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: "No se pudo buscar fixture en API-FOOTBALL.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
