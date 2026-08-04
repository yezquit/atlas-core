import { parseGeminiResponse, selectGeminiItems } from "@/core/intelligence/geminiManualContext";

export async function POST(request) {
  let input;
  try {
    input = await request.json();
  } catch {
    return Response.json({ status: "unavailable", errorCode: "invalid_json", message: "La solicitud no contiene JSON válido." }, { status: 400 });
  }
  if (!input?.fixture?.fixtureId || typeof input?.text !== "string") {
    return Response.json({ status: "unavailable", errorCode: "invalid_context_input", message: "Fixture y texto son obligatorios." }, { status: 400 });
  }
  let context = parseGeminiResponse(input.text, {
    fixture: input.fixture,
    expectedLine: input.expectedLine,
    expectedOdds: input.expectedOdds,
  });
  if (Array.isArray(input.selectedIds)) context = selectGeminiItems(context, input.selectedIds);
  return Response.json({ status: context.valid_for_reanalysis ? "success" : "blocked", message: context.valid_for_reanalysis ? "Contexto estructurado como información reportada por el usuario." : "El contexto no coincide de forma segura con el fixture.", context });
}
