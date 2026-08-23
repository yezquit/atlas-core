import { listApiFootballLeagues } from "@/core/data/apiFootballLeagues";
import { requirePersonalSession } from "@/core/auth/personalAccessPolicy";

export async function GET(request) {
  const access = requirePersonalSession(request);
  if (!access.ok) return access.response;
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
        "Cache-Control": "private, no-store",
      },
    }
  );
}
