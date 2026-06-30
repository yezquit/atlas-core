export async function GET(request) {
  const apiKey = process.env.API_FOOTBALL_KEY;
  const baseUrl = process.env.API_FOOTBALL_BASE_URL;

  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country") || "Colombia";

  if (!apiKey || apiKey === "PEGA_AQUI_TU_API_KEY") {
    return Response.json(
      {
        ok: false,
        message: "API_FOOTBALL_KEY no está configurada en .env.local.",
      },
      { status: 500 }
    );
  }

  try {
    const url = `${baseUrl}/leagues?country=${encodeURIComponent(country)}`;

    const response = await fetch(url, {
      headers: {
        "x-apisports-key": apiKey,
      },
      cache: "no-store",
    });

    const data = await response.json();

    return Response.json({
      ok: response.ok,
      status: response.status,
      country,
      count: data?.response?.length || 0,
      data,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: "No se pudo consultar ligas en API-FOOTBALL.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
