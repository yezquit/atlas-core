import { DATA_LOAD_STATUS } from "@/core/contracts/atlasContracts";
import { scanSportsJourneyOnServer } from "@/core/services/sportsIntelligenceServer";

function statusCode(result) {
  if ([DATA_LOAD_STATUS.SUCCESS, DATA_LOAD_STATUS.EMPTY].includes(result.status)) return 200;
  if (result.errorCode?.startsWith("invalid_")) return 400;
  if (result.status === DATA_LOAD_STATUS.BLOCKED) return 429;
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
        message: "La solicitud no contiene JSON válido.",
      },
      { status: 400 }
    );
  }
  const result = await scanSportsJourneyOnServer({
    date: input?.date,
    competitionKeys: input?.competitionKeys,
    marketIds: input?.marketIds,
    maximumFixtures: input?.maximumFixtures,
    timezone: input?.timezone || process.env.ATLAS_DEFAULT_TIMEZONE,
  });
  return Response.json(result, { status: statusCode(result) });
}
