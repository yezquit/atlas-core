export async function GET() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  const baseUrl = process.env.API_FOOTBALL_BASE_URL;

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
    const response = await fetch(`${baseUrl}/status`, {
      headers: {
        "x-apisports-key": apiKey,
      },
      cache: "no-store",
    });

    const data = await response.json();

    return Response.json({
      ok: response.ok,
      status: response.status,
      data,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: "No se pudo conectar con API-FOOTBALL.",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
