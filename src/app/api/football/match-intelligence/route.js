import { DATA_LOAD_STATUS } from "@/core/contracts/atlasContracts";
import { requirePersonalSession } from "@/core/auth/personalAccessPolicy";
import { analyzeSportsFixtureOnServer } from "@/core/services/sportsIntelligenceServer";

function statusCode(result) {
  if ([DATA_LOAD_STATUS.SUCCESS, DATA_LOAD_STATUS.EMPTY].includes(result.status)) return 200;
  if (result.errorCode?.startsWith("invalid_")) return 400;
  if (result.status === DATA_LOAD_STATUS.AMBIGUOUS) return 409;
  if (result.status === DATA_LOAD_STATUS.BLOCKED) return 429;
  if (result.status === DATA_LOAD_STATUS.PROVIDER_ERROR) return 502;
  return 503;
}

export async function POST(request) {
  const access = requirePersonalSession(request);
  if (!access.ok) return access.response;
  let input;
  try {
    input = await request.json();
  } catch {
    return Response.json(
      {
        status: DATA_LOAD_STATUS.UNAVAILABLE,
        errorCode: "invalid_json",
        message: "La solicitud no contiene JSON válido.",
      },
      { status: 400 }
    );
  }
  const result = await analyzeSportsFixtureOnServer({
    date: input?.date,
    competitionKey: input?.competitionKey,
    season: input?.season,
    fixtureId: input?.fixtureId,
    marketId: input?.marketId || "open",
    line: input?.line || null,
    odds: input?.odds || null,
  });
  return Response.json(result, { status: statusCode(result) });
}
