import { getOperationalHistoryRepository } from "@/core/services/operationalAnalysisServer";
import { isLocalRequest, localAccessDeniedResponse } from "@/core/services/localAccessPolicy";

function filters(url) {
  return Object.fromEntries([...url.searchParams.entries()].filter(([, value]) => value));
}

export async function GET(request) {
  if (!isLocalRequest(request)) return localAccessDeniedResponse();
  const url = new URL(request.url);
  const repository = await getOperationalHistoryRepository();
  if (url.searchParams.get("format") === "json") {
    const json = await repository.exportJson(filters(url));
    return new Response(json, { headers: { "content-type": "application/json", "content-disposition": "attachment; filename=atlas-history.json" } });
  }
  const analyses = await repository.list(filters(url));
  return Response.json({ status: "success", count: analyses.length, analyses });
}

export async function DELETE(request) {
  if (!isLocalRequest(request)) return localAccessDeniedResponse();
  let input;
  try {
    input = await request.json();
  } catch {
    return Response.json({ status: "unavailable", errorCode: "invalid_json" }, { status: 400 });
  }
  if (!input?.analysisId || input.confirmation !== "DELETE") {
    return Response.json({ status: "blocked", errorCode: "explicit_deletion_confirmation_required", message: "La eliminación requiere confirmación explícita." }, { status: 400 });
  }
  const repository = await getOperationalHistoryRepository();
  await repository.appendDeletion(input.analysisId, input.confirmation);
  return Response.json({ status: "success", deletedAnalysisId: input.analysisId, recoverableFromAppendOnlyLog: true });
}
