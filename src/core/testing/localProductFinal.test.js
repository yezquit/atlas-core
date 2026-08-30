import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { buildAnalysisVersion, compareAnalysisVersions } from "../intelligence/analysisVersions.js";
import { calculateSportsAnalysisConfidence } from "../services/operationalAnalysisService.js";
import { buildGeminiResearchPrompt, parseGeminiResponse, selectGeminiItems } from "../intelligence/geminiManualContext.js";
import { mapGeminiImpacts } from "../intelligence/geminiImpactMapper.js";
import { buildAtlasPreflight } from "../intelligence/redTeamAtlas.js";
import { buildScoutAtlas } from "../intelligence/scoutAtlas.js";
import { createMemoryOperationalHistory } from "../infrastructure/operationalHistory.js";
import { buildSimpleDirectorPresentation } from "../modules/directorAtlas.js";

const clientPath = new URL("../../app/atlas-functional-client.js", import.meta.url);
const cssPath = new URL("../../app/globals.css", import.meta.url);
const servicePath = new URL("../services/operationalAnalysisService.js", import.meta.url);
const mapperPath = new URL("../intelligence/geminiImpactMapper.js", import.meta.url);

const fixture = {
  fixtureId: 1606076,
  teams: { home: { name: "Santos" }, away: { name: "Macará" } },
  competition: { name: "Copa Sudamericana", season: 2026, round: "Octavos - Vuelta" },
  date: { utc: "2026-08-14T01:00:00.000Z" },
};

function candidate(id, selection, rank) {
  return {
    candidate_id: id,
    market_family: id.startsWith("corners") ? "corners" : "goals",
    direction: selection.startsWith("Under") ? "under" : "over",
    line: Number(selection.match(/[\d.]+/)[0]),
    selection,
    probability_status: "preliminary",
    preliminary_probability: 0.68 - rank * 0.01,
    uncertainty_low: 0.55,
    uncertainty_high: 0.77,
    sample_size_effective: 12,
    sports_score: 82 - rank,
    rank,
    simple_sports_reasons: ["La distribución reciente es compatible con la línea."],
    limitations: [],
  };
}

function director(overrides = {}) {
  return {
    decision_code: "not_yet",
    market_suitability: "review_only",
    market_evaluated: { family: "corners", label: "Córners" },
    selection: "Under 10.5",
    sports_verdict: { status: "sports_candidate", selection: "Under 10.5" },
    price_assessment: { status: "unavailable", freshness: "unavailable", source_status: "unavailable" },
    simple_reasons: ["El perfil reciente encaja con la línea."],
    reasons: [],
    conditions: ["Introducir una cuota actual."],
    analysis_confidence_score: 82,
    ...overrides,
  };
}

function currentPrice(status) {
  return {
    status,
    freshness: "fresh",
    source_status: "user_reported_current",
    bookmaker: "Betano",
    decimal_odds: status === "unfavorable" ? 1.28 : 1.67,
    message: "Evaluación económica existente aplicada.",
  };
}

function version(id, geminiContext = null, at = "2026-08-13T21:00:00.000Z") {
  return buildAnalysisVersion({
    fixture,
    inputs: { reanalysis: Boolean(geminiContext) },
    evidence: [],
    odds: [],
    geminiContext,
    director: director(),
    engineVersion: "test",
  }, { idFactory: () => id, now: () => at });
}

test("1. Scout sigue sin usar cuota", () => {
  const scout = buildScoutAtlas({ marketSelection: { ranked_candidates: [candidate("corners:under:10.5", "Under 10.5", 1)] } });
  assert.equal(scout.price_inputs_used, false);
});

test("2. Scout sigue produciendo varias opciones", () => {
  const scout = buildScoutAtlas({ marketSelection: { ranked_candidates: [candidate("corners:under:10.5", "Under 10.5", 1), candidate("goals:over:1.5", "Over 1.5", 2), candidate("corners:under:9.5", "Under 9.5", 3)] } });
  assert.equal(scout.candidates.length, 3);
});

test("3. la tarjeta sencilla declara preselección y no recomendación", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /Opciones encontradas por Atlas/);
  assert.match(source, /Mejor opción inicial/);
});

test("4. seleccionar candidato abre el análisis deportivo inicial", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, />Analizar esta opción</);
  assert.match(source, /Analizar deportivamente/);
});

test("5. antes de Gemini la vista sencilla usa análisis inicial", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /analysisCompleted \? \(/);
  assert.match(source, /<InitialAnalysisResult analysis=\{analysis\}/);
});

test("6. la respuesta Gemini pasa por el filtro existente", () => {
  const context = parseGeminiResponse("RUMORES\n- Posible rotación https://example.com 2026-08-13", { fixture });
  assert.equal(context.items[0].selected, false);
});

test("7. un elemento rechazado no puede influir aunque se solicite", () => {
  const context = parseGeminiResponse("RUMORES\n- Posible rotación https://example.com 2026-08-13", { fixture });
  assert.equal(selectGeminiItems(context, ["gemini-1"]).selected_items.length, 0);
});

test("8. la evidencia aceptada llega al reanálisis", () => {
  const context = parseGeminiResponse("HECHOS CONFIRMADOS\n- Delantero titular ausente por lesión https://dimayor.com.co/noticia 2026-08-13", { fixture });
  const selected = selectGeminiItems(context, ["gemini-1"]);
  assert.equal(selected.selected_items.length, 1);
  assert.ok(mapGeminiImpacts(selected.selected_items).length > 0);
});

test("9. Director recibe contexto Gemini en la ruta normal y el snapshot económico lo conserva", async () => {
  const source = await readFile(servicePath, "utf8");
  assert.match(source, /const selectedGemini = geminiContext\?\.valid_for_reanalysis/);
  assert.match(source, /manualContext: geminiContext/);
  assert.match(source, /const redTeam = buildRedTeamAtlas\(/);
  assert.match(source, /geminiContext: previousVersion\.gemini_context/);
});

test("10. Gemini puede modificar los argumentos sencillos", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /contextSummary\.favorable/);
  assert.match(source, /decisionReasons/);
});

test("11. Gemini puede modificar los riesgos sencillos", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /contextSummary\.unfavorable/);
  assert.match(source, /simpleRisks/);
});

test("12. una contradicción material incorporada puede producir NO", () => {
  const result = buildSimpleDirectorPresentation(director(), { geminiItems: [{ kind: "contradiction", summary: "La fuente oficial contradice la disponibilidad del titular." }] });
  assert.equal(result.analysis_decision.label, "NO ME GUSTA ESTA OPCIÓN");
});

test("13. ESPERAR exige un bloqueante concreto", () => {
  const item = { kind: "probable", impact: "limiting", affected_markets: ["corners"], summary: "Las alineaciones aún no han sido publicadas y se publicarán antes del inicio." };
  const result = buildSimpleDirectorPresentation(director(), { geminiItems: [item] });
  assert.equal(result.analysis_decision.label, "ESPERAR");
  assert.match(result.analysis_decision.explanation, /Actualiza el análisis/);
});

test("14. la capa sencilla no modifica la probabilidad", () => {
  const input = director({ estimated_probability: 0.697 });
  buildSimpleDirectorPresentation(input);
  assert.equal(input.estimated_probability, 0.697);
});

test("15. la cuota se difiere durante Scout y Gemini", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /evaluatePrice: Boolean\(reanalysis && manualQuoteReady\)/);
  assert.match(source, /manualOdds: reanalysis && manualQuoteReady/);
});

test("16. una cuota por sí sola no cambia Confianza Atlas", () => {
  const base = calculateSportsAnalysisConfidence({ source_quality: 0.9, sample_size: 0.8, variable_coverage: 0.8 });
  const priced = calculateSportsAnalysisConfidence({ source_quality: 0.9, sample_size: 0.8, variable_coverage: 0.8, verifiedOdds: true, verified_market_data: 1 });
  assert.equal(base.analysis_confidence_score, priced.analysis_confidence_score);
});

test("17. una tesis positiva usa la voz SÍ ME GUSTA", () => assert.equal(buildSimpleDirectorPresentation(director()).analysis_decision.label, "SÍ, ME GUSTA ESTA OPCIÓN"));

test("18. una tesis negativa usa la voz NO ME GUSTA", () => assert.equal(buildSimpleDirectorPresentation(director({ sports_verdict: { status: "review_only" } })).analysis_decision.label, "NO ME GUSTA ESTA OPCIÓN"));

test("19. la vista principal no usa Sí, pero con cautela", async () => {
  const source = await readFile(clientPath, "utf8");
  const simple = source.slice(source.indexOf("function DirectorResult"), source.indexOf("function MarketAssessment"));
  assert.doesNotMatch(simple, /Sí, pero con cautela|Marginal|Viable con cautela/);
});

test("20. marginal positivo se presenta como APOSTAR", () => {
  const result = buildSimpleDirectorPresentation(director({ decision_code: "caution", price_assessment: currentPrice("marginal") }));
  assert.equal(result.price_decision.label, "APOSTAR");
});

test("21. unfavorable continúa como NO APOSTAR", () => {
  const result = buildSimpleDirectorPresentation(director({ decision_code: "no", price_assessment: currentPrice("unfavorable") }));
  assert.equal(result.analysis_decision.label, "SÍ, ME GUSTA ESTA OPCIÓN");
  assert.equal(result.price_decision.label, "NO APOSTAR");
});

test("22. una cuota vencida exige actualizar", () => {
  const result = buildSimpleDirectorPresentation(director(), { historicalQuote: { bookmaker_name: "Betano", decimal_odds: 1.67 } });
  assert.equal(result.price_decision.label, "ESPERAR");
  assert.match(result.price_decision.explanation, /Cuota vencida/);
});

test("23. nunca cotizada se distingue de vencida", () => {
  const result = buildSimpleDirectorPresentation(director());
  assert.equal(result.price_decision, null);
  assert.equal(result.stale_quote, null);
});

test("24. modo experto conserva la información técnica", async () => {
  const source = await readFile(clientPath, "utf8");
  for (const id of ["expert-scout", "expert-gemini", "expert-probability", "expert-director", "expert-version-diff"]) assert.match(source, new RegExp(id));
});

test("25. simple y experto parten del mismo Director", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /buildSimpleDirectorPresentation\(director/);
  assert.match(source, /const director = analysis\.director/);
});

test("26. opción manual usa el mismo orden sin precio inicial", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /OPCIÓN QUE QUIERES ANALIZAR/);
  assert.match(source, /odds: reanalysis \? odds\.trim\(\) \|\| null : null/);
});

test("27. historial conserva Gemini y la conclusión", async () => {
  const context = { valid_for_reanalysis: true, original_text: "Contexto", selected_items: [{ id: "g1" }] };
  const repository = createMemoryOperationalHistory();
  await repository.appendAnalysis(version("complete", context));
  const stored = (await repository.list())[0];
  assert.equal(stored.gemini_context.original_text, "Contexto");
  assert.equal(stored.director.selection, "Under 10.5");
});

test("28. comparación de versiones sigue funcionando", () => {
  const previous = version("initial");
  const current = version("complete", { valid_for_reanalysis: true, selected_items: [{ id: "g1" }] }, "2026-08-13T21:01:00.000Z");
  assert.equal(compareAnalysisVersions(previous, current).changes.gemini_change, true);
});

test("29. nueva investigación limpia temporales pero no historial", async () => {
  const source = await readFile(clientPath, "utf8");
  const block = source.slice(source.indexOf("function startNewGeminiResearch"), source.indexOf("function updateCandidateQuote"));
  assert.match(block, /setGeminiText\(""\)/);
  assert.match(block, /setGeminiContext\(null\)/);
  assert.doesNotMatch(block, /operational-history/);
});

test("30. el diseño de escritorio conserva dos columnas solo donde ayudan", async () => assert.match(await readFile(cssPath, "utf8"), /p2-simple-evidence-grid[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/));

test("31. el diseño móvil colapsa la evidencia a una columna", async () => {
  const css = await readFile(cssPath, "utf8");
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.p2-simple-evidence-grid[\s\S]*grid-template-columns: 1fr/);
});

test("32. el cliente no deja logs de consola", async () => assert.doesNotMatch(await readFile(clientPath, "utf8"), /console\.(?:log|error|warn)/));

test("33. no existe llamada a Gemini API", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.doesNotMatch(source, /GEMINI_API_KEY|generativelanguage\.googleapis/);
  assert.match(source, /Copiar prompt para Gemini Pro \+ Deep Research/);
});

test("34. el cierre no introduce Supabase ni Vercel", async () => {
  const [client, service, mapper] = await Promise.all([readFile(clientPath, "utf8"), readFile(servicePath, "utf8"), readFile(mapperPath, "utf8")]);
  assert.doesNotMatch(`${client}\n${service}\n${mapper}`, /supabase|vercel/i);
  assert.match(mapper, /STANDARD_DEVIATION_EFFECT/);
});

test("35. preflight registra que la investigación manual fue revisada", () => {
  const preflight = buildAtlasPreflight({ fixture, candidate: candidate("corners:under:10.5", "Under 10.5", 1), competitiveContext: {}, preMatchContext: { lineups: { status: "confirmed" } }, manualContext: { valid_for_reanalysis: true } });
  assert.equal(preflight.entries.find((item) => item.key === "manual_context").state, "confirmed");
});

test("36. el prompt está centrado en partido, selección y contexto", () => {
  const prompt = buildGeminiResearchPrompt({ fixture, selection: candidate("corners:under:10.5", "Under 10.5", 1), competitiveContext: { leg: "second_leg", aggregate: { home: 1, away: 0 } } });
  assert.match(prompt, /Santos vs Macará/);
  assert.match(prompt, /Under 10\.5/);
  assert.match(prompt, /fortalecer, debilitar o invalidar/);
  assert.match(prompt, /sin inventar porcentajes, coeficientes/);
});
