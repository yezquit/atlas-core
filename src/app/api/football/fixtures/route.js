import { DATA_LOAD_STATUS } from "@/core/contracts/atlasContracts";
import { loadFixturesByDateFromServer } from "@/core/services/apiFootballServer";

function httpStatusFor(result) {
  if (result.status === DATA_LOAD_STATUS.SUCCESS) return 200;
  if (result.status === DATA_LOAD_STATUS.EMPTY) return 200;
  if (result.errorCode?.startsWith("invalid_")) return 400;
  if (result.errorCode === "season_date_mismatch") return 400;
  if (result.errorCode === "provider_timeout") return 504;
  if (result.status === DATA_LOAD_STATUS.PROVIDER_ERROR) return 502;
  return 503;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const result = await loadFixturesByDateFromServer({
    date: searchParams.get("date") || "",
    leagueKey: searchParams.get("leagueKey") || "",
    season: searchParams.get("season") || "",
    timezone: searchParams.get("timezone") || process.env.ATLAS_DEFAULT_TIMEZONE,
  });

  return Response.json(result, {
    status: httpStatusFor(result),
    headers: {
      "Cache-Control":
        "public, max-age=0, s-maxage=300, stale-while-revalidate=60",
    },
  });
}
