export async function GET() {
  const configured = Boolean(
    process.env.API_FOOTBALL_KEY && process.env.API_FOOTBALL_BASE_URL
  );

  return Response.json({
    contract: "ProviderStatusResult",
    version: 1,
    status: configured ? "available" : "unavailable",
    message: configured
      ? "La integración deportiva está configurada en el servidor."
      : "La integración deportiva no está disponible en este entorno.",
  });
}
