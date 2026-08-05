import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createMemoryCache } from "../infrastructure/cacheStore.js";
import { createProviderRuntime } from "../infrastructure/providerRuntime.js";
import { compareAnalysisVersions } from "../intelligence/analysisVersions.js";
import { fixtureDateContext, isFixtureOnLocalDate, localDateInterval } from "../intelligence/dateTimeContext.js";
import { parseGeminiResponse } from "../intelligence/geminiManualContext.js";
import { createManualOdds, impliedProbability, normalizeProviderOdds } from "../intelligence/oddsIntelligence.js";
import { buildConservativeParlays } from "../intelligence/parlayPolicy.js";
import { estimatePreliminaryMarketProbability } from "../intelligence/preliminaryMarketModel.js";
import { buildPredictionResult, calculateCalibration, resultForLine } from "../intelligence/resultCalibration.js";

const clientPath = new URL("../../app/atlas-functional-client.js", import.meta.url);
const servicePath = new URL("../services/operationalAnalysisService.js", import.meta.url);
const packagePath = new URL("../../../package.json", import.meta.url);

const familyValues = Object.freeze({
  goals: [3, 4, 1, 3, 2, 4, 3, 1, 5, 3],
  total_shots: [25, 28, 18, 24, 26, 29, 20, 27, 31, 23],
  shots_on_goal: [10, 11, 7, 9, 12, 8, 10, 6, 13, 9],
  cards: [6, 7, 4, 6, 8, 5, 7, 3, 6, 9],
  corners: [11, 12, 8, 10, 13, 9, 11, 7, 14, 10],
});

function eventSample(values) {
  return { match_totals: values, for: values.map((value) => Math.ceil(value / 2)), conceded: values.map((value) => Math.floor(value / 2)) };
}

function profile(family, values = familyValues[family]) {
  const last5 = values.slice(0, 5);
  return {
    quality_status: "verified",
    last_5: { event_samples: { [family]: eventSample(last5) } },
    last_10: { event_samples: { [family]: eventSample(values) } },
    as_home: { event_samples: { [family]: eventSample(values.slice(0, 5)) } },
    as_away: { event_samples: { [family]: eventSample(values.slice(0, 5)) } },
  };
}

function modelInput(family, line) {
  const values = familyValues[family];
  return {
    marketFamily: family,
    selection: `Over ${line}`,
    line: String(line),
    leagueProfile: { quality_status: "verified", event_samples: { [family]: eventSample(values) } },
    homeTeamProfile: profile(family),
    awayTeamProfile: profile(family, [...values].reverse()),
    refereeProfile: { status: "confirmed", quality_status: "verified", event_samples: { cards: eventSample(familyValues.cards) } },
  };
}

function analysisVersion(overrides = {}) {
  return {
    analysis_id: overrides.analysis_id || "analysis-1",
    fixture_id: 55,
    created_at: overrides.created_at || "2026-08-04T12:00:00.000Z",
    phase: overrides.phase || "early_review",
    inputs: {},
    evidence: overrides.evidence || [],
    odds: [],
    gemini_context: overrides.gemini_context || null,
    analysis_confidence: { analysis_confidence_score: overrides.confidence ?? 81 },
    preliminary_probability: { point_estimate: overrides.probability ?? 0.63, uncertainty_low: 0.54, uncertainty_high: 0.7 },
    director: {
      fixture: { competition: "Liga de prueba" },
      market_evaluated: { family: "corners" },
      selection: "Over 9.5",
      line: "9.5",
      odds: overrides.odds ?? 1.91,
      market_suitability: overrides.suitability || "review_only",
      verdict: overrides.verdict || "Todavía no.",
      risks: overrides.risks || [],
      missing_data: overrides.missing || [],
    },
  };
}

test("1. fecha local Bogotá vs UTC", () => {
  assert.deepEqual(localDateInterval("2026-08-04", "America/Bogota"), {
    timezone: "America/Bogota", local_calendar_date: "2026-08-04", local_start: "2026-08-04T00:00:00.000", local_end: "2026-08-04T23:59:59.999", utc_start: "2026-08-04T05:00:00.000Z", utc_end: "2026-08-05T04:59:59.999Z",
  });
});
test("2. fixture del día 4 no aparece el 5", () => assert.equal(isFixtureOnLocalDate("2026-08-05T01:20:00Z", "2026-08-05", "America/Bogota"), false));
test("3. fixture del día 4 aparece el 4", () => assert.equal(isFixtureOnLocalDate("2026-08-05T01:20:00Z", "2026-08-04", "America/Bogota"), true));
test("4. cambio de timezone", () => assert.notEqual(fixtureDateContext("2026-08-05T01:20:00Z", "America/Bogota").local_calendar_date, fixtureDateContext("2026-08-05T01:20:00Z", "Europe/Madrid").local_calendar_date));
test("5. caché separada por timezone", async () => {
  let calls = 0;
  const runtime = createProviderRuntime({ apiKey: "test", baseUrl: "https://v3.football.api-sports.io", maxRetries: 0, cache: createMemoryCache(), fetchImpl: async () => { calls += 1; return new Response(JSON.stringify({ response: [], errors: [] })); } });
  await runtime.request({ pathname: "/fixtures", query: { date: "2026-08-04", timezone: "America/Bogota" } });
  await runtime.request({ pathname: "/fixtures", query: { date: "2026-08-04", timezone: "Europe/Madrid" } });
  assert.equal(calls, 2);
});

for (const [number, family, line] of [[6, "goals", 2.5], [7, "total_shots", 22.5], [8, "shots_on_goal", 8.5], [9, "cards", 5.5], [10, "corners", 9.5]]) {
  test(`${number}. modelo de ${family}`, () => {
    const result = estimatePreliminaryMarketProbability(modelInput(family, line));
    assert.equal(result.probability_status, "preliminary");
    assert.ok(result.point_estimate > 0 && result.point_estimate <= 0.9);
  });
}
test("11. muestra insuficiente", () => {
  const input = modelInput("goals", 2.5);
  input.homeTeamProfile.last_5.event_samples.goals.match_totals = [3];
  assert.equal(estimatePreliminaryMarketProbability(input).probability_status, "unavailable");
});
test("12. cobertura incompatible", () => {
  const input = modelInput("corners", 9.5);
  input.awayTeamProfile.quality_status = "unavailable";
  assert.match(estimatePreliminaryMarketProbability(input).limitations[0], /coberturas/i);
});
test("13. shrinkage conservador", () => {
  const result = estimatePreliminaryMarketProbability(modelInput("goals", 2.5));
  const raw = result.inputs_used.reduce((sum, item) => sum + item.observed_rate * item.weight, 0);
  assert.ok(Math.abs(result.point_estimate - result.league_base_rate) <= Math.abs(raw - result.league_base_rate) + 0.0001);
});
test("14. intervalo de incertidumbre", () => {
  const result = estimatePreliminaryMarketProbability(modelInput("corners", 9.5));
  assert.ok(result.uncertainty_low < result.point_estimate && result.point_estimate < result.uncertainty_high);
});
test("15. porcentaje no igual a confianza", () => assert.notEqual(estimatePreliminaryMarketProbability(modelInput("goals", 2.5)).point_estimate, 0.81));
test("16. probabilidad no parte de 50%", () => assert.notEqual(estimatePreliminaryMarketProbability(modelInput("goals", 2.5)).point_estimate, 0.5));
test("17. probabilidad unavailable con datos críticos ausentes", () => {
  const input = modelInput("cards", 5.5); input.refereeProfile.status = "missing";
  assert.equal(estimatePreliminaryMarketProbability(input).probability_status, "unavailable");
});
test("18. cuota implícita separada", () => assert.equal(impliedProbability(1.91), 0.52356));
test("19. cuota vencida explicada", () => {
  const result = normalizeProviderOdds({ response: [{ fixture: { id: 1, date: "2026-08-04T20:00:00Z" }, update: "2026-08-04T10:00:00Z", bookmakers: [{ id: 1, name: "Casa", bets: [{ name: "Total Goals", values: [{ value: "Over 2.5", odd: "1.9" }] }] }] }], fixtureId: 1, now: "2026-08-04T19:00:00Z", kickoff: "2026-08-04T20:00:00Z" });
  assert.match(result.quotes[0].stale_reason, /supera el límite/);
});
test("20. cuota manual crea versión identificable", () => {
  const first = createManualOdds({ fixtureId: 1, selection: "Over 2.5", line: 2.5, decimalOdds: 1.8, receivedAt: "2026-08-04T10:00:00Z", analyzedAt: "2026-08-04T10:00:00Z" });
  const second = createManualOdds({ fixtureId: 1, selection: "Over 2.5", line: 2.5, decimalOdds: 1.9, receivedAt: "2026-08-04T11:00:00Z", analyzedAt: "2026-08-04T11:00:00Z" });
  assert.notEqual(first.quote_id, second.quote_id);
});
test("21. Gemini genera elementos", () => assert.ok(parseGeminiResponse("Párrafo sin secciones", { fixture: { fixtureId: 1, teams: { home: { name: "A" }, away: { name: "B" } } } }).items.length));
test("22. rumor desmarcado", () => {
  const context = parseGeminiResponse("RUMORES\n- Posible rotación", { fixture: { fixtureId: 1 } });
  assert.equal(context.items[0].selected, false);
});
test("23. dato no encontrado como limitación", () => {
  const context = parseGeminiResponse("DATOS NO ENCONTRADOS\n- No se halló el árbitro", { fixture: { fixtureId: 1 } });
  assert.equal(context.items[0].impact, "limiting");
});
test("24. contexto afecta reanálisis", () => {
  const previous = analysisVersion();
  const current = analysisVersion({ analysis_id: "analysis-2", gemini_context: { selected_items: [{ id: "g1" }] }, confidence: 78, risks: ["Rotación probable"] });
  const diff = compareAnalysisVersions(previous, current);
  assert.equal(diff.changes.gemini_change, true); assert.notEqual(diff.changes.analysis_confidence.previous, diff.changes.analysis_confidence.current);
});
test("25. contexto puede no cambiar resultado y lo explica", () => {
  const diff = compareAnalysisVersions(analysisVersion(), analysisVersion({ analysis_id: "analysis-2", gemini_context: { selected_items: [{ id: "g1" }] } }));
  assert.match(diff.explanation, /no aporta evidencia suficiente para modificar/);
});
test("26. cuadro principal SÍ", async () => assert.match(await readFile(clientPath, "utf8"), /SÍ — APTO PARA CONSIDERACIÓN/));
test("27. cuadro principal NO", async () => assert.match(await readFile(clientPath, "utf8"), /NO — NO VIABLE/));
test("28. cuadro principal TODAVÍA NO", async () => assert.match(await readFile(clientPath, "utf8"), /TODAVÍA NO — REVISAR LÍNEA Y CUOTA/));
test("29. scroll y foco", async () => { const source = await readFile(clientPath, "utf8"); assert.match(source, /scrollIntoView/); assert.match(source, /\.focus\(/); });
test("30. fases traducidas", async () => { const source = await readFile(clientPath, "utf8"); assert.match(source, /three_hours_before: "Tres horas antes"/); });
test("31. individual separado de parlay", async () => { const source = await readFile(clientPath, "utf8"); assert.match(source, /Aptitud individual/); assert.match(source, /Elegibilidad para parlay/); });
test("32. cuota vencida bloquea parlay", () => assert.equal(buildConservativeParlays([{ fixture_id: 1, market_suitability: "suitable_under_conditions", odds_source_status: "verified_provider", freshness: "stale", decimal_odds: 2, preliminary_probability: { probability_status: "preliminary" } }]).parlays.length, 0));
test("33. candidato apto se agrega", async () => { const source = await readFile(clientPath, "utf8"); const service = await readFile(servicePath, "utf8"); assert.match(source, /Agregar como candidato a parlay/); assert.match(service, /parlayCandidate/); });
test("34. no fabricar parlays", () => assert.deepEqual(buildConservativeParlays([]).parlays, []));
test("35. registro de resultado hit", () => assert.equal(resultForLine({ selection: "Over 9.5", line: 9.5, actualTotal: 11 }).status, "hit"));
test("36. registro miss", () => assert.equal(resultForLine({ selection: "Over 9.5", line: 9.5, actualTotal: 8 }).status, "miss"));
test("37. calibración no se activa con muestra pequeña", () => {
  const result = buildPredictionResult({ analysis: analysisVersion(), actualTotal: 11 });
  assert.equal(calculateCalibration([result]).calibration_status, "preliminary_insufficient_history");
});
test("38. Fixture ID inmutable", async () => assert.match(await readFile(clientPath, "utf8"), /selectedFixtureId\) !== requestedFixtureId/));
test("39. Gemini no cambia línea ni cuota", () => {
  const context = parseGeminiResponse("HECHOS CONFIRMADOS\n- Línea 8.5 y cuota 2.2", { fixture: { fixtureId: 1 }, expectedLine: "9.5", expectedOdds: "1.91" });
  assert.equal(context.line_locked, "9.5"); assert.equal(context.odds_locked, "1.91");
});
test("40. DirectorAtlas única voz", async () => { const source = await readFile(clientPath, "utf8"); assert.match(source, /Dictamen del Director Atlas/); assert.doesNotMatch(source, /atlasExecutiveAnswer/); });
test("41. códigos internos ausentes en la salida sencilla", async () => {
  const source = await readFile(clientPath, "utf8"); const block = source.slice(source.indexOf("function DirectorResult"), source.indexOf("function MarketAssessment"));
  assert.doesNotMatch(block, /JSON\.stringify/); assert.match(block, /displayStatus\(director\.parlay_eligibility\)/);
});
test("42. modo experto conserva trazabilidad", async () => { const source = await readFile(clientPath, "utf8"); assert.match(source, /expert-probability/); assert.match(source, /inputs_used/); });
test("43. confianza aclarada", async () => assert.match(await readFile(clientPath, "utf8"), /no es una probabilidad de acierto/));
test("44. probabilidad marcada preliminar", () => assert.equal(estimatePreliminaryMarketProbability(modelInput("corners", 9.5)).model_validation_status, "preliminary_unvalidated"));
test("45. scripts de validación final existen", async () => { const pkg = JSON.parse(await readFile(packagePath, "utf8")); assert.ok(pkg.scripts.lint && pkg.scripts.test && pkg.scripts.build); });
