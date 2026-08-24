import { DATA_LOAD_STATUS } from "@/core/contracts/atlasContracts";
import { requirePersonalSession } from "@/core/auth/personalAccessPolicy";
import { mergeJourneyExplorations } from "@/core/intelligence/atlasCombinationEngine";
import { scanSportsJourneyOnServer } from "@/core/services/sportsIntelligenceServer";

function statusCode(result) {
  if ([DATA_LOAD_STATUS.SUCCESS, DATA_LOAD_STATUS.EMPTY].includes(result.status)) return 200;
  if (result.errorCode?.startsWith("invalid_")) return 400;
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
  const requestedDates = [...new Set(
    (Array.isArray(input?.dates) ? input.dates : [input?.date]).filter(Boolean)
  )];
  if (requestedDates.length === 0 || requestedDates.length > 14) {
    return Response.json({
      status: DATA_LOAD_STATUS.UNAVAILABLE,
      errorCode: "invalid_dates",
      message: "Selecciona entre una y catorce fechas válidas.",
      candidates: [],
    }, { status: 400 });
  }
  const sharedInput = {
    competitionKeys: input?.competitionKeys,
    marketIds: input?.marketIds,
    maximumFixtures: input?.maximumFixtures,
    maximumCandidates: input?.maximumCandidates,
    analysisMode: input?.analysisMode,
    competitionProfiles: Array.isArray(input?.competitionProfiles) ? input.competitionProfiles : [],
    timezone: input?.timezone || process.env.ATLAS_DEFAULT_TIMEZONE,
  };
  const results = [];
  for (const date of requestedDates) {
    results.push(await scanSportsJourneyOnServer({
      ...sharedInput,
      date,
      now: new Date().toISOString(),
    }));
  }
  const result = requestedDates.length === 1
    ? results[0]
    : mergeJourneyExplorations(results, requestedDates);
  return Response.json(result, { status: statusCode(result) });
}
