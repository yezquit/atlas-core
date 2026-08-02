import { DATA_LOAD_STATUS } from "@/core/contracts/atlasContracts";
import { runAtlasFixtureAnalysisOnServer } from "@/core/services/atlasAnalysisServer";

function httpStatusFor(result) {
  if (result.status === DATA_LOAD_STATUS.SUCCESS) return 200;
  if (result.errorCode?.startsWith("invalid_")) return 400;
  if (result.errorCode === "season_date_mismatch") return 400;
  if (result.errorCode === "fixture_selection_mismatch") return 409;
  if (result.status === DATA_LOAD_STATUS.AMBIGUOUS) return 409;
  if (result.errorCode === "provider_timeout") return 504;
  if (result.status === DATA_LOAD_STATUS.PROVIDER_ERROR) return 502;
  return 503;
}

export async function POST(request) {
  let input;
  try {
    input = await request.json();
  } catch {
    return Response.json(
      {
        status: DATA_LOAD_STATUS.UNAVAILABLE,
        errorCode: "invalid_json",
        message: "La solicitud de análisis no contiene JSON válido.",
      },
      { status: 400 }
    );
  }

  const result = await runAtlasFixtureAnalysisOnServer({
    date: input?.date,
    leagueKey: input?.leagueKey,
    season: input?.season,
    fixtureId: input?.fixtureId,
    marketId: input?.marketId,
  });

  return Response.json(result, { status: httpStatusFor(result) });
}
