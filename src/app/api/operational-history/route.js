import { getOperationalHistoryRepository, recordOperationalResult } from "@/core/services/operationalAnalysisServer";
import { isLocalRequest, localAccessDeniedResponse } from "@/core/services/localAccessPolicy";
import { buildFixtureQuoteLedger } from "@/core/intelligence/fixtureQuoteLedger";

function filters(url) {
  return Object.fromEntries([...url.searchParams.entries()].filter(([, value]) => value));
}

export async function GET(request) {
  if (!isLocalRequest(request)) return localAccessDeniedResponse();
  const url = new URL(request.url);
  const repository = await getOperationalHistoryRepository();
  if (url.searchParams.get("view") === "fixture_quotes") {
    const fixtureId = Number(url.searchParams.get("fixtureId"));
    if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
      return Response.json({ status: "unavailable", errorCode: "invalid_fixture_id" }, { status: 400 });
    }
    const analyses = await repository.list({ fixtureId });
    return Response.json({
      status: "success",
      ledger: buildFixtureQuoteLedger(analyses, { fixtureId }),
    });
  }
  if (url.searchParams.get("format") === "json") {
    const json = await repository.exportJson(filters(url));
    return new Response(json, { headers: { "content-type": "application/json", "content-disposition": "attachment; filename=atlas-history.json" } });
  }
  const analyses = await repository.list(filters(url));
  return Response.json({ status: "success", count: analyses.length, analyses, calibration: await repository.calibration() });
}

export async function PATCH(request) {
  if (!isLocalRequest(request)) return localAccessDeniedResponse();
  let input;
  try {
    input = await request.json();
  } catch {
    return Response.json({ status: "unavailable", errorCode: "invalid_json" }, { status: 400 });
  }
  if (!input?.analysisId || !["manual_user_input", "api_football"].includes(input.source)) {
    return Response.json({ status: "unavailable", errorCode: "invalid_result_request", message: "Indica una versión y un origen de resultado válidos." }, { status: 400 });
  }
  if (input.source === "manual_user_input" && !Number.isFinite(Number(input.actualTotal))) {
    return Response.json({ status: "unavailable", errorCode: "invalid_actual_total", message: "El total real debe ser numérico." }, { status: 400 });
  }
  try {
    const recorded = await recordOperationalResult({ analysisId: input.analysisId, actualTotal: input.actualTotal, source: input.source });
    return Response.json({ status: "success", message: "Resultado registrado de forma auditable.", ...recorded });
  } catch (error) {
    return Response.json({ status: "unavailable", errorCode: error?.message || "result_update_failed", message: "El resultado todavía no está disponible." }, { status: 409 });
  }
}

export async function DELETE(request) {
  if (!isLocalRequest(request)) return localAccessDeniedResponse();
  let input;
  try {
    input = await request.json();
  } catch {
    return Response.json({ status: "unavailable", errorCode: "invalid_json" }, { status: 400 });
  }
  const repository = await getOperationalHistoryRepository();
  if (input?.scope === "all") {
    if (input.confirmation !== "BORRAR HISTORIAL") {
      return Response.json({ status: "blocked", errorCode: "explicit_history_archive_confirmation_required", message: "Escribe BORRAR HISTORIAL para confirmar." }, { status: 400 });
    }
    const result = await repository.appendArchiveAll(input.confirmation);
    return Response.json({ status: "success", ...result, configurationPreserved: true });
  }
  if (!input?.analysisId || input.confirmation !== "DELETE") {
    return Response.json({ status: "blocked", errorCode: "explicit_deletion_confirmation_required", message: "La eliminación requiere confirmación explícita." }, { status: 400 });
  }
  await repository.appendDeletion(input.analysisId, input.confirmation);
  return Response.json({ status: "success", deletedAnalysisId: input.analysisId, recoverableFromAppendOnlyLog: true });
}
