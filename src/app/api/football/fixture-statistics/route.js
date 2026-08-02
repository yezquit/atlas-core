import { DATA_LOAD_STATUS } from "@/core/contracts/atlasContracts";
import { loadFixtureStatisticsFromServer } from "@/core/services/apiFootballServer";

function httpStatusFor(result) {
  if ([DATA_LOAD_STATUS.SUCCESS, DATA_LOAD_STATUS.EMPTY].includes(result.status)) {
    return 200;
  }
  if (result.errorCode === "invalid_fixture_id") return 400;
  if (result.errorCode === "provider_timeout") return 504;
  if (result.status === DATA_LOAD_STATUS.PROVIDER_ERROR) return 502;
  return 503;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const result = await loadFixtureStatisticsFromServer(
    searchParams.get("fixtureId") || ""
  );

  return Response.json(result, {
    status: httpStatusFor(result),
    headers: {
      "Cache-Control":
        "public, max-age=0, s-maxage=120, stale-while-revalidate=60",
    },
  });
}
