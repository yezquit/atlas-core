import { API_FOOTBALL_COMPETITIONS } from "@/core/data/apiFootballLeagues";
import { analyzeLiveFixtureOnServer, listLiveFixturesOnServer } from "@/core/services/liveAnalysisServer";
import { requirePersonalSession } from "@/core/auth/personalAccessPolicy";

function statusCode(result) {
  if (["success", "empty"].includes(result.status)) return 200;
  if (result.errorCode?.startsWith("invalid_")) return 400;
  if (["fixture_not_started", "fixture_finished", "fixture_not_live"].includes(result.errorCode) || result.fixture_state) return 409;
  if (result.status === "blocked") return 429;
  return 502;
}

export async function GET(request) {
  const access = requirePersonalSession(request);
  if (!access.ok) return access.response;
  const url = new URL(request.url);
  const requestedKeys = (url.searchParams.get("competitionKeys") || "").split(",").map((key) => key.trim()).filter(Boolean);
  const competitions = requestedKeys.length
    ? API_FOOTBALL_COMPETITIONS.filter((item) => requestedKeys.includes(item.key))
    : API_FOOTBALL_COMPETITIONS;
  const result = await listLiveFixturesOnServer({ competitions, timezone: url.searchParams.get("timezone") || process.env.ATLAS_DEFAULT_TIMEZONE || "America/Bogota" });
  return Response.json(result, { status: statusCode(result) });
}

export async function POST(request) {
  const access = requirePersonalSession(request);
  if (!access.ok) return access.response;
  let input;
  try { input = await request.json(); } catch { return Response.json({ status: "unavailable", errorCode: "invalid_json", message: "La solicitud no contiene JSON válido." }, { status: 400 }); }
  const result = await analyzeLiveFixtureOnServer({ ...input, timezone: input?.timezone || process.env.ATLAS_DEFAULT_TIMEZONE || "America/Bogota" });
  return Response.json(result, { status: statusCode(result) });
}
