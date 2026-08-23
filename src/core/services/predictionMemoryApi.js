function jsonError(errorCode, message, status = 400, details = null) {
  return Response.json({ status: "unavailable", errorCode, message, ...(details ? { details } : {}) }, { status });
}

export async function predictionApiGet(request, service) {
  const url = new URL(request.url);
  const filters = Object.fromEntries(["status", "market", "competition", "mode"].map((key) => [key, url.searchParams.get(key)]).filter(([, value]) => value));
  return Response.json({ status: "success", ...(await service.overview(filters)) });
}

export async function predictionApiPost(request, service) {
  let input;
  try {
    input = await request.json();
  } catch {
    return jsonError("invalid_json", "La solicitud no contiene JSON válido.");
  }
  if (input?.mode === "live" && !input?.liveAnalysisId) return jsonError("live_analysis_id_required", "Indica el snapshot LIVE que emitió el pronóstico.");
  if (input?.mode !== "live" && !input?.analysisId) return jsonError("analysis_id_required", "Indica la versión de análisis que emitió el pronóstico.");
  try {
    const result = input.mode === "live" ? await service.registerLive({ liveAnalysisId: input.liveAnalysisId }) : await service.register({ analysisId: input.analysisId });
    return Response.json({ status: "success", message: result.deduplicated ? "El mismo snapshot ya estaba guardado." : "Pronóstico oficial guardado.", ...result }, { status: result.deduplicated ? 200 : 201 });
  } catch (error) {
    const conflict = error?.message === "analysis_is_not_an_official_prediction";
    return jsonError(error?.message || "prediction_registration_failed", conflict ? "DirectorAtlas no emitió un pronóstico oficial elegible." : "No fue posible guardar el pronóstico.", conflict ? 409 : 404, error?.reasons || null);
  }
}

export async function predictionApiPatch(request, service) {
  let input;
  try {
    input = await request.json();
  } catch {
    return jsonError("invalid_json", "La solicitud no contiene JSON válido.");
  }
  try {
    if (input?.scope === "pending") {
      const update = await service.resolvePending();
      return Response.json({ status: "success", message: "Pronósticos pendientes verificados.", update, ...(await service.overview()) });
    }
    if (!input?.predictionId) return jsonError("prediction_id_required", "Indica el pronóstico que deseas verificar.");
    if (!['api_football', 'manual_user_input'].includes(input.source)) return jsonError("invalid_result_source", "El origen del resultado no es válido.");
    const update = await service.resolveOne({ predictionId: input.predictionId, source: input.source, actualTotal: input.actualTotal });
    return Response.json({ status: "success", update, ...(await service.overview()) });
  } catch (error) {
    const invalid = ["invalid_actual_total", "invalid_result_source"].includes(error?.message);
    return jsonError(error?.message || "result_update_failed", invalid ? "El total real debe ser un entero no negativo y el origen válido." : "No fue posible actualizar el resultado.", invalid ? 400 : 409);
  }
}
