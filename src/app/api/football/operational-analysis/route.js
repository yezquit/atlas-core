import { DATA_LOAD_STATUS } from "@/core/contracts/atlasContracts";
import { analyzeOperationalFixtureOnServer } from "@/core/services/operationalAnalysisServer";
import { requirePersonalSession } from "@/core/auth/personalAccessPolicy";

function statusCode(result) {
  if (result.status === DATA_LOAD_STATUS.SUCCESS) return 200;
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
    return Response.json({ status: DATA_LOAD_STATUS.UNAVAILABLE, errorCode: "invalid_json", message: "La solicitud no contiene JSON válido." }, { status: 400 });
  }
  const result = await analyzeOperationalFixtureOnServer({
    ...(input || {}),
    timezone: input?.timezone || process.env.ATLAS_DEFAULT_TIMEZONE,
  }, { reanalysis: Boolean(input?.reanalysis) });
  return Response.json(result, { status: statusCode(result) });
}
