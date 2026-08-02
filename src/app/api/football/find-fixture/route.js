export async function GET() {
  return Response.json(
    {
      status: "unavailable",
      errorCode: "route_deprecated",
      message:
        "La búsqueda por nombres fue deshabilitada. Usa fecha, liga y selección explícita por fixture ID.",
    },
    { status: 410 }
  );
}
