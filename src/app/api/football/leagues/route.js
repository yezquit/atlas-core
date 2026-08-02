import { listApiFootballLeagues } from "@/core/data/apiFootballLeagues";

export const dynamic = "force-static";

export async function GET() {
  const leagues = listApiFootballLeagues();

  return Response.json(
    {
      contract: "LeagueCatalogResult",
      version: 1,
      status: leagues.length > 0 ? "success" : "empty",
      count: leagues.length,
      leagues,
      message:
        leagues.length > 0
          ? "Catálogo autorizado de ligas disponible."
          : "No hay ligas configuradas.",
    },
    {
      headers: {
        "Cache-Control":
          "public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600",
      },
    }
  );
}
