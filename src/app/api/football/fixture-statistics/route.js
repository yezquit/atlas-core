import { normalizeFixtureStatistics } from "@/core/modules/footballStatisticsNormalizer";

export async function GET(request) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  const baseUrl = process.env.API_FOOTBALL_BASE_URL;

  const { searchParams } = new URL(request.url);
  const fixtureId = searchParams.get("fixtureId");

  if (!apiKey || apiKey === "PEGA_AQUI_TU_API_KEY") {
    return Response.json(
      {
        ok: false,
        message: "API_FOOTBALL_KEY no está configurada en .env.local.",
      },
      { status: 500 }
    );
  }

  if (!fixtureId) {
    return Response.json(
      {
        ok: false,
        message: "Debes enviar fixtureId.",
        example: "/api/football/fixture-statistics?fixtureId=1153068",
      },
      { status: 400 }
    );
  }

  try {
    const url = `${baseUrl}/fixtures/statistics?fixture=${encodeURIComponent(
      fixtureId
    )}`;

    const response = await fetch(url, {
      headers: {
        "x-apisports-key": apiKey,
      },
      cache: "no-store",
    });

    const data = await response.json();
    const statistics = normalizeFixtureStatistics(data?.response || []);

    return Response.json({
      ok: response.ok,
      status: response.status,
      fixtureId,
      statistics,
      rawErrors: data?.errors || [],
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: "No se pudieron consultar estadísticas del fixture.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
