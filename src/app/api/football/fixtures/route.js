import { getApiFootballLeagueByKey } from "@/core/data/apiFootballLeagues";
import { normalizeFootballFixtures } from "@/core/modules/footballFixtureNormalizer";

export async function GET(request) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  const baseUrl = process.env.API_FOOTBALL_BASE_URL;

  const { searchParams } = new URL(request.url);

  const countryKey = searchParams.get("countryKey") || "colombia";
  const leagueKey = searchParams.get("leagueKey") || "primeraA";
  const seasonParam = searchParams.get("season");

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

  const season = seasonParam || league.currentSeason;

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

    return Response.json({
      ok: response.ok,
      status: response.status,
      query: {
        countryKey,
        leagueKey,
        leagueId: league.id,
        leagueName: league.localName,
        season,
        currentSeason: league.currentSeason,
        developmentSeason: league.developmentSeason || null,
        mode:
          String(season) === String(league.currentSeason)
            ? "current"
            : "explicit-season",
      },
      count: fixtures.length,
      fixtures,
      rawErrors: data?.errors || [],
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: "No se pudieron consultar fixtures en API-FOOTBALL.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
