import { DATA_LOAD_STATUS } from "@/core/contracts/atlasContracts";
import { analyzeOperationalFixtureOnServer } from "@/core/services/operationalAnalysisServer";
import { isLocalRequest, localAccessDeniedResponse } from "@/core/services/localAccessPolicy";

function statusCode(result) {
  if (result.status === DATA_LOAD_STATUS.SUCCESS) return 200;
  if (result.errorCode?.startsWith("invalid_")) return 400;
  if (result.status === DATA_LOAD_STATUS.BLOCKED) return 429;
  if (result.status === DATA_LOAD_STATUS.PROVIDER_ERROR) return 502;
  return 503;
}

export async function POST(request) {
  if (!isLocalRequest(request)) return localAccessDeniedResponse();
  let input;
  try {
    input = await request.json();
  } catch {
    return Response.json({ status: DATA_LOAD_STATUS.UNAVAILABLE, errorCode: "invalid_json", message: "La solicitud no contiene JSON válido." }, { status: 400 });
  }
  const result = await analyzeOperationalFixtureOnServer(input || {}, { reanalysis: Boolean(input?.reanalysis) });
  return Response.json(result, { status: statusCode(result) });
}
