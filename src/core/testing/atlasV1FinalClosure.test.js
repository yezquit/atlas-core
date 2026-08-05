import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { LINE_ORIGIN } from "../contracts/operationalContracts.js";
import { buildAnalysisVersion, compareAnalysisVersions } from "../intelligence/analysisVersions.js";
import { parseGeminiResponse } from "../intelligence/geminiManualContext.js";
import { buildRankedMarketSelection, selectCandidateQuote } from "../intelligence/marketCandidateRanker.js";
import { createManualOdds } from "../intelligence/oddsIntelligence.js";
import { buildOperationalDirectorVerdict } from "../modules/directorAtlas.js";
import {
  attachLineOriginToDirector,
  buildGeminiEconomicReanalysisMessage,
  lineOriginMessage,
  resolveLineOrigin,
  selectExactRequestedCandidate,
} from "../services/operationalAnalysisService.js";

const clientPath = new URL("../../app/atlas-functional-client.js", import.meta.url);

const fixture = {
  fixtureId: 77,
  date: { utc: "2026-08-10T23:00:00.000Z", timezone: "America/Bogota" },
  teams: { home: { name: "Once Caldas" }, away: { name: "América de Cali" } },
  competition: { season: 2026 },
};

const values = [1, 2, 2, 3, 1, 4, 2, 3, 2, 1];
const eventSamples = (limit) => ({ goals: { match_totals: values.slice(0, limit) } });
const teamProfile = {
  quality_status: "verified",
  last_5: { event_samples: eventSamples(5) },
  last_10: { event_samples: eventSamples(10) },
  as_home: { event_samples: eventSamples(5) },
  as_away: { event_samples: eventSamples(5) },
};

function marketSelection() {
  return buildRankedMarketSelection({
    analysisMode: "specific",
    requestedMarketId: "goals",
    exactLine: 1.5,
    marketAssessments: [{
      market_family: "goals",
      market_label: "Goles",
      technical_support_score: 82,
      data_requirements: ["league", "home", "away"],
      available_evidence: [{ requirement: "league" }, { requirement: "home" }, { requirement: "away" }],
      missing_evidence: [],
      risk_flags: [],
    }],
    leagueProfile: { quality_status: "verified", event_samples: eventSamples(10) },
    homeTeamProfile: structuredClone(teamProfile),
    awayTeamProfile: structuredClone(teamProfile),
    refereeProfile: null,
  });
}

function betanoQuote(overrides = {}) {
  return createManualOdds({
    fixtureId: 77,
    bookmaker: "Betano",
    marketFamily: "goals",
    marketName: "Goles",
    direction: "under",
    selection: "Under 3.5",
    line: "3.5",
    decimalOdds: "1.25",
    receivedAt: "2026-08-05T17:52:00.000Z",
    analyzedAt: "2026-08-05T17:53:00.000Z",
    timezone: "America/Bogota",
    analysisVersion: "atlas-before",
    ...overrides,
  });
}

function analysisVersion({
  id,
  at,
  quote = betanoQuote(),
  probability = 0.674,
  geminiItems = [],
  reanalysis = false,
  lineOrigin = LINE_ORIGIN.ATLAS_SELECTED,
} = {}) {
  return buildAnalysisVersion({
    fixture,
    phase: "day_before",
    inputs: { reanalysis },
    evidence: [],
    activeQuote: quote,
    lineOrigin,
    geminiContext: { selected_items: geminiItems },
    analysisConfidence: { analysis_confidence_score: 87 },
    preliminaryProbability: {
      probability_status: "preliminary",
      point_estimate: probability,
      uncertainty_low: 0.514,
      uncertainty_high: 0.801,
    },
    director: {
      fixture: { home_team: "Once Caldas", away_team: "América de Cali" },
      market_evaluated: { family: "goals", label: "Goles" },
      sports_verdict: { direction: "under", selection: "Under 3.5" },
      selection: "Under 3.5",
      line: 3.5,
      odds: quote?.decimal_odds ?? null,
      bookmaker: quote?.bookmaker_name ?? null,
      implied_probability: quote?.implied_probability ?? null,
      price_assessment: { status: "unfavorable" },
      individual_eligibility: "not_viable_at_this_price",
      parlay_eligibility: "not_eligible",
      market_suitability: "not_viable",
      verdict: "No viable a esta cuota.",
      risks: [],
      missing_data: [],
    },
    engineVersion: "atlas-operational-v1",
  }, { idFactory: () => id, now: () => at });
}

test("1. reanálisis con Gemini muestra comparación visible", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /Qué cambió desde el análisis anterior/);
  assert.match(source, /<VersionComparison analysis=\{analysis\} \/>/);
});

test("2. comparación aparece aunque no cambien cifras", () => {
  const previous = analysisVersion({ id: "previous", at: "2026-08-05T17:53:00.000Z" });
  const current = analysisVersion({ id: "current", at: "2026-08-05T17:54:00.000Z", geminiItems: [{ id: "g1", summary: "Sin cambio material" }], reanalysis: true });
  const comparison = compareAnalysisVersions(previous, current);
  assert.equal(comparison.comparable, true);
  assert.match(comparison.explanation, /El contexto fue incorporado, pero no aportó evidencia suficiente para modificar la probabilidad, la evaluación económica ni el dictamen\./);
});

test("3. previous_analysis_id se vincula correctamente", () => {
  const comparison = compareAnalysisVersions(
    analysisVersion({ id: "previous", at: "2026-08-05T17:53:00.000Z" }),
    analysisVersion({ id: "current", at: "2026-08-05T17:54:00.000Z", reanalysis: true })
  );
  assert.equal(comparison.previous_analysis_id, "previous");
  assert.equal(comparison.current_analysis_id, "current");
  assert.equal(comparison.fixture_id, 77);
  assert.equal(comparison.engine_version, "atlas-operational-v1");
});

test("4. Betano 1.25 se conserva", () => {
  const quote = betanoQuote();
  const comparison = compareAnalysisVersions(
    analysisVersion({ id: "previous", at: "2026-08-05T17:53:00.000Z", quote }),
    analysisVersion({ id: "current", at: "2026-08-05T17:54:00.000Z", quote, reanalysis: true })
  );
  assert.equal(comparison.changes.active_quote.previous.bookmaker_name, "Betano");
  assert.equal(comparison.changes.active_quote.current.decimal_odds, 1.25);
  assert.equal(comparison.changes.active_quote_change, false);
});

test("5. 67.4% permanece 67.4% y se explica", () => {
  const message = buildGeminiEconomicReanalysisMessage({ selectedItems: [{ id: "g1" }], impacts: [], previousProbability: 0.674, currentProbability: 0.674 });
  assert.match(message, /probabilidad, la evaluación económica ni el dictamen/);
  const comparison = compareAnalysisVersions(
    analysisVersion({ id: "previous", at: "2026-08-05T17:53:00.000Z" }),
    analysisVersion({ id: "current", at: "2026-08-05T17:54:00.000Z", probability: 0.674, geminiItems: [{ id: "g1" }], reanalysis: true })
  );
  assert.deepEqual(comparison.changes.preliminary_probability, { previous: 0.674, current: 0.674 });
});

test("6. contexto sin fuente queda desmarcado", () => {
  const context = parseGeminiResponse("HECHOS CONFIRMADOS\n- Delantero titular ausente por lesión 2026-08-05", { fixture });
  assert.equal(context.items[0].selected, false);
  assert.equal(context.items[0].verification_status, "unverified");
});

test("7. rumor queda desmarcado", () => {
  const context = parseGeminiResponse("RUMORES\n- Posible rotación https://dimayor.com.co/noticia 2026-08-05", { fixture });
  assert.equal(context.items[0].selected, false);
});

test("8. contradicción queda desmarcada", () => {
  const context = parseGeminiResponse("CONTRADICCIONES\n- Dos alineaciones incompatibles https://dimayor.com.co/noticia 2026-08-05", { fixture });
  assert.equal(context.items[0].selected, false);
  assert.equal(context.items[0].selection_warning, "Revisa esta contradicción antes de utilizarla.");
});

test("9. dato no encontrado queda como limitación", () => {
  const context = parseGeminiResponse("DATOS NO ENCONTRADOS\n- No hay parte médico oficial actualizado", { fixture });
  assert.equal(context.items[0].selected, false);
  assert.equal(context.items[0].impact, "limiting");
});

test("10. fuente reconocida puede quedar seleccionada", () => {
  const context = parseGeminiResponse("HECHOS CONFIRMADOS\n- Delantero titular ausente por lesión https://dimayor.com.co/noticia 2026-08-05", { fixture });
  assert.equal(context.items[0].source_classification, "official_competition");
  assert.equal(context.items[0].validation_status, "usable_as_context");
  assert.equal(context.items[0].selected, true);
  assert.equal(context.valid_for_reanalysis, true);
});

test("11. soporte genérico de Google no se considera prueba del hecho", () => {
  const context = parseGeminiResponse("HECHOS CONFIRMADOS\n- Alineación confirmada https://support.google.com/websearch/answer/10106608 2026-08-05", { fixture });
  assert.equal(context.items[0].source_is_generic_support, true);
  assert.equal(context.items[0].selected, false);
});

test("12. alerta line not confirmed se traduce", async () => assert.match(await readFile(clientPath, "utf8"), /La línea no fue confirmada por una fuente externa\./));
test("13. alerta odds not confirmed se traduce", async () => assert.match(await readFile(clientPath, "utf8"), /La cuota no fue confirmada por una fuente externa\./));
test("14. alerta de rumores se traduce", async () => assert.match(await readFile(clientPath, "utf8"), /La respuesta contiene información clasificada como rumor\./));

test("15. resumen no copia párrafos completos", () => {
  const paragraph = `Delantero titular ausente por lesión ${"con información complementaria ".repeat(15)}https://dimayor.com.co/noticia 2026-08-05`;
  const item = parseGeminiResponse(`HECHOS CONFIRMADOS\n- ${paragraph}`, { fixture }).items[0];
  assert.ok(item.summary.length <= 180);
  assert.notEqual(item.summary, item.text);
  assert.equal(item.text.includes("https://dimayor.com.co"), true);
});

test("16. no hay viñetas duplicadas", () => {
  const item = parseGeminiResponse("HECHOS CONFIRMADOS\n- • Delantero ausente https://dimayor.com.co/a 2026-08-05", { fixture }).items[0];
  assert.doesNotMatch(item.summary, /^[•*-]/);
});

test("17. línea transferida mantiene procedencia Atlas", () => {
  assert.equal(resolveLineOrigin({ transferredCandidate: { line: 3.5 } }), LINE_ORIGIN.TRANSFERRED_CANDIDATE);
  assert.equal(lineOriginMessage(LINE_ORIGIN.TRANSFERRED_CANDIDATE), "Esta línea fue seleccionada por Atlas.");
});

test("18. introducir cuota no cambia line_origin", () => {
  const previous = { line_origin: LINE_ORIGIN.ATLAS_SELECTED, director: { line: 3.5, sports_verdict: { direction: "under" }, market_evaluated: { family: "goals" } } };
  const origin = resolveLineOrigin({ reanalysis: true, analysisMode: "specific", marketId: "goals", lineOrigin: LINE_ORIGIN.USER_SELECTED, manualOdds: { marketFamily: "goals" } }, previous, { requestedLine: 3.5, requestedSelection: "Under 3.5" });
  assert.equal(origin, LINE_ORIGIN.ATLAS_SELECTED);
});

test("19. opción manual queda user_selected", () => {
  assert.equal(resolveLineOrigin({ analysisMode: "specific", marketId: "goals" }, null, { requestedLine: 1.5, requestedSelection: "Over 1.5" }), LINE_ORIGIN.USER_SELECTED);
});

test("20. usuario puede analizar Over 1.5 aunque Atlas sugiriera Under 3.5", () => {
  const ranked = marketSelection();
  const under = ranked.ranked_candidates.find((candidate) => candidate.selection === "Under 3.5") || ranked.primary;
  const atlasSuggestion = { ...ranked, primary: under };
  const manual = selectExactRequestedCandidate(atlasSuggestion, { marketFamily: "goals", requestedLine: 1.5, requestedSelection: "Over 1.5", lineOrigin: LINE_ORIGIN.USER_SELECTED });
  assert.equal(manual.primary.selection, "Over 1.5");
  assert.notEqual(manual.primary.selection, atlasSuggestion.primary.selection);
});

test("21. probabilidad de Under 3.5 no se reutiliza para Over 1.5", () => {
  const candidates = marketSelection().ranked_candidates;
  const under = candidates.find((candidate) => candidate.selection === "Under 3.5");
  const over = candidates.find((candidate) => candidate.selection === "Over 1.5");
  assert.ok(under && over);
  assert.notEqual(under.preliminary_probability, over.preliminary_probability);
});

test("22. cuota de Under no se reutiliza para Over", () => {
  const over = marketSelection().ranked_candidates.find((candidate) => candidate.selection === "Over 1.5");
  const price = selectCandidateQuote(over, [betanoQuote()]);
  assert.equal(price.quote, null);
  assert.equal(price.status, "incompatible_selection");
});

test("23. Director muestra opción evaluada por solicitud del usuario", async () => {
  assert.equal(lineOriginMessage(LINE_ORIGIN.USER_SELECTED), "Esta línea fue elegida manualmente por el usuario.");
  assert.match(await readFile(clientPath, "utf8"), /Opción evaluada por solicitud del usuario\./);
});

test("24. resultado manual no es reemplazado por candidato general", () => {
  const result = selectExactRequestedCandidate(marketSelection(), { marketFamily: "goals", requestedLine: 1.5, requestedSelection: "Over 1.5", lineOrigin: LINE_ORIGIN.USER_SELECTED });
  assert.equal(result.primary.candidate_id, "goals:over:1.5");
  assert.match(result.explanation, /elegida manualmente por el usuario/);
});

test("25. Nueva búsqueda limpia la opción manual", async () => {
  const source = await readFile(clientPath, "utf8");
  const block = source.slice(source.indexOf("function startNewSearch"), source.indexOf("function changeDate"));
  for (const setter of ["setLine(\"\")", "setSelection(\"\")", "setOdds(\"\")", "setBookmaker(\"\")"]) assert.match(source, new RegExp(setter.replace(/[()]/g, "\\$&")));
  assert.match(block, /clearTemporaryQuote\(\)/);
});

test("26. historial conserva análisis Atlas y manual separados", () => {
  const atlas = analysisVersion({ id: "atlas", at: "2026-08-05T17:53:00.000Z", lineOrigin: LINE_ORIGIN.ATLAS_SELECTED });
  const manual = analysisVersion({ id: "manual", at: "2026-08-05T17:54:00.000Z", lineOrigin: LINE_ORIGIN.USER_SELECTED });
  assert.notEqual(atlas.analysis_id, manual.analysis_id);
  assert.equal(atlas.line_origin, LINE_ORIGIN.ATLAS_SELECTED);
  assert.equal(manual.line_origin, LINE_ORIGIN.USER_SELECTED);
});

test("27. Gemini no cambia la opción manual", () => {
  const previous = analysisVersion({ id: "manual", at: "2026-08-05T17:53:00.000Z", lineOrigin: LINE_ORIGIN.USER_SELECTED });
  const origin = resolveLineOrigin({ reanalysis: true, analysisMode: "specific", marketId: "goals" }, previous, { requestedLine: 3.5, requestedSelection: "Under 3.5" });
  assert.equal(origin, LINE_ORIGIN.USER_SELECTED);
});

test("28. flujo completo candidato Atlas → cuota → Gemini → comparación", () => {
  const quote = betanoQuote();
  const previous = analysisVersion({ id: "atlas-price", at: "2026-08-05T17:53:00.000Z", quote });
  const current = analysisVersion({ id: "atlas-gemini", at: "2026-08-05T17:54:00.000Z", quote, geminiItems: [{ id: "g1", summary: "Alineaciones probables, aún no confirmadas." }], reanalysis: true });
  const comparison = compareAnalysisVersions(previous, current);
  assert.equal(comparison.comparable, true);
  assert.equal(comparison.changes.active_quote_change, false);
  assert.equal(comparison.changes.gemini_items_incorporated.length, 1);
});

test("29. flujo completo opción manual → cuota → Director", () => {
  const ranked = selectExactRequestedCandidate(marketSelection(), { marketFamily: "goals", requestedLine: 1.5, requestedSelection: "Over 1.5", lineOrigin: LINE_ORIGIN.USER_SELECTED });
  const quote = betanoQuote({ direction: "over", selection: "Over 1.5", line: "1.5", decimalOdds: "1.55" });
  const candidate = { ...ranked.primary, sports_score: ranked.primary.sports_score || 80 };
  const director = buildOperationalDirectorVerdict({
    fixture,
    competition: { localName: "Colombia Primera A" },
    analyzedAt: "2026-08-05T17:53:00.000Z",
    phase: "day_before",
    marketAssessment: { market_family: "goals", market_label: "Goles" },
    marketCandidate: candidate,
    marketSelection: ranked,
    oddsQuote: quote,
    confidence: { analysis_confidence_score: 80, confidence_label: "alta" },
    suitability: { status: "viable_with_caution", conditions: [], price_evaluation: { status: "marginal", message: "Evaluación preliminar." } },
    preliminaryProbability: { probability_status: "preliminary", point_estimate: candidate.preliminary_probability, uncertainty_low: candidate.uncertainty_low, uncertainty_high: candidate.uncertainty_high, sample_size_effective: candidate.sample_size_effective },
  });
  attachLineOriginToDirector(director, LINE_ORIGIN.USER_SELECTED);
  assert.equal(director.selection, "Over 1.5");
  assert.equal(director.odds, 1.55);
  assert.equal(director.user_requested_option, true);
});

test("30. modo sencillo no muestra códigos internos", async () => {
  const source = await readFile(clientPath, "utf8");
  const simple = source.slice(source.indexOf("function DirectorResult"), source.indexOf("function MarketAssessment"));
  assert.doesNotMatch(simple, /JSON\.stringify/);
  assert.match(simple, /displayStatus\(director\.parlay_eligibility\)/);
  assert.match(source, /usable_as_context: "Utilizable como contexto"/);
});
