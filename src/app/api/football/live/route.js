import { API_FOOTBALL_COMPETITIONS } from "@/core/data/apiFootballLeagues";
import { analyzeLiveFixtureOnServer, listLiveFixturesOnServer } from "@/core/services/liveAnalysisServer";
import { isLocalRequest, localAccessDeniedResponse } from "@/core/services/localAccessPolicy";

function statusCode(result) {
  if (["success", "empty"].includes(result.status)) return 200;
  if (result.errorCode?.startsWith("invalid_")) return 400;
  if (["fixture_not_started", "fixture_finished", "fixture_not_live"].includes(result.errorCode) || result.fixture_state) return 409;
  if (result.status === "blocked") return 429;
  return 502;
}

export async function GET(request) {
  if (!isLocalRequest(request)) return localAccessDeniedResponse();
  const url = new URL(request.url);
  const result = await listLiveFixturesOnServer({ competitions: API_FOOTBALL_COMPETITIONS, timezone: url.searchParams.get("timezone") || process.env.ATLAS_DEFAULT_TIMEZONE || "America/Bogota" });
  return Response.json(result, { status: statusCode(result) });
}

export async function POST(request) {
  if (!isLocalRequest(request)) return localAccessDeniedResponse();
  let input;
  try { input = await request.json(); } catch { return Response.json({ status: "unavailable", errorCode: "invalid_json", message: "La solicitud no contiene JSON válido." }, { status: 400 }); }
  const result = await analyzeLiveFixtureOnServer({ ...input, timezone: input?.timezone || process.env.ATLAS_DEFAULT_TIMEZONE || "America/Bogota" });
  return Response.json(result, { status: statusCode(result) });
}
