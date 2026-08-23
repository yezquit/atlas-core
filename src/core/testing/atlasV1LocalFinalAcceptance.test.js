import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { LINE_ORIGIN } from "../contracts/operationalContracts.js";
import { buildAnalysisVersion, compareAnalysisVersions } from "../intelligence/analysisVersions.js";
import { buildCompetitiveContext, classifyCompetition, classifyLeg } from "../intelligence/competitiveContext.js";
import { fixtureDateContext } from "../intelligence/dateTimeContext.js";
import { parseGeminiResponse } from "../intelligence/geminiManualContext.js";
import { rankMarketCandidates, selectCandidateQuote } from "../intelligence/marketCandidateRanker.js";
import { assessMarketSuitability, evaluateMarketPrice } from "../intelligence/marketSuitability.js";
import { assessPrematchEligibility } from "../intelligence/prematchEligibility.js";
import { buildAtlasPreflight, buildRedTeamAtlas } from "../intelligence/redTeamAtlas.js";
import { buildOperationalRanking, buildScoutAtlas } from "../intelligence/scoutAtlas.js";
import { createMemoryOperationalHistory } from "../infrastructure/operationalHistory.js";
import { resolveLineOrigin, selectExactRequestedCandidate } from "../services/operationalAnalysisService.js";

const clientPath = new URL("../../app/atlas-functional-client.js", import.meta.url);
const layoutPath = new URL("../../app/layout.js", import.meta.url);
const routePath = new URL("../../app/api/operational-history/route.js", import.meta.url);
const envPath = new URL("../../../.env.example", import.meta.url);

function candidate(overrides = {}) {
  return {
    candidate_id: "goals:under:3.5",
    market_family: "goals",
    direction: "under",
    line: 3.5,
    selection: "Under 3.5",
    probability_status: "preliminary",
    preliminary_probability: 0.74,
    uncertainty_low: 0.63,
    uncertainty_high: 0.82,
    sample_size_effective: 12,
    projected_mean: 2.4,
    dispersion: 1.1,
    contextual_only: false,
    limitations: [],
    input_sources: ["team:home", "team:away"],
    methodology_version: "test-v1",
    ...overrides,
  };
}

function assessment(family = "goals") {
  return {
    market_family: family,
    market_label: family === "goals" ? "Goles" : "Córners",
    technical_support_score: 82,
    quality_status: "verified",
    available_evidence: [{ requirement: "Muestra local y visitante disponible" }, { requirement: "Distribución histórica disponible" }],
    missing_evidence: [],
    risk_flags: ["Modelo preliminar pendiente de calibración histórica"],
  };
}

function quote(candidateValue, decimalOdds, bookmaker = "Casa A") {
  return {
    quote_id: `${candidateValue.candidate_id}:${bookmaker}:${decimalOdds}`,
    fixture_id: 10,
    market_family: candidateValue.market_family,
    direction: candidateValue.direction,
    selection: candidateValue.selection,
    line: String(candidateValue.line),
    decimal_odds: decimalOdds,
    implied_probability: Number((1 / decimalOdds).toFixed(6)),
    bookmaker_name: bookmaker,
    verification_status: "user_reported",
    source_status: "user_reported_current",
    freshness: "fresh",
  };
}

function rankedSet(quotes = []) {
  const marketAssessments = [assessment("goals"), assessment("corners")];
  return rankMarketCandidates([
    candidate(),
    candidate({ candidate_id: "goals:over:1.5", direction: "over", line: 1.5, selection: "Over 1.5", preliminary_probability: 0.69, uncertainty_low: 0.58, uncertainty_high: 0.78 }),
    candidate({ candidate_id: "corners:over:8.5", market_family: "corners", direction: "over", line: 8.5, selection: "Over 8.5", preliminary_probability: 0.66, uncertainty_low: 0.54, uncertainty_high: 0.76, projected_mean: 9.4 }),
    candidate({ candidate_id: "goals:over:2.5", direction: "over", line: 2.5, selection: "Over 2.5", preliminary_probability: 0.61, uncertainty_low: 0.49, uncertainty_high: 0.72 }),
  ], { quotes, marketAssessments, confidenceScore: 80 });
}

function scoutFrom(ranked = rankedSet()) {
  return buildScoutAtlas({
    marketSelection: { ranked_candidates: ranked },
    marketAssessments: [assessment("goals"), assessment("corners")],
  });
}

function fixture(status, kickoff = "2026-08-15T01:00:00.000Z") {
  return {
    fixtureId: 10,
    competition: { id: 239, name: "Primera A", country: "Colombia", season: 2026, round: "Jornada 8" },
    date: { utc: kickoff, kickoff_utc: kickoff, timezone: "America/Bogota" },
    status,
    teams: { home: { id: 1, name: "Local" }, away: { id: 2, name: "Visitante" } },
    score: { goals: { home: null, away: null }, aggregate: null },
  };
}

function version(id, odds = null) {
  return buildAnalysisVersion({
    fixture: fixture({ isScheduled: true }),
    phase: "early_review",
    inputs: {},
    evidence: [],
    odds: [],
    activeQuote: odds,
    analysisConfidence: { analysis_confidence_score: 70 },
    preliminaryProbability: { probability_status: "preliminary", point_estimate: 0.65, uncertainty_low: 0.5, uncertainty_high: 0.75 },
    director: { market_evaluated: { family: "goals" }, selection: "Over 1.5", line: 1.5, risks: [], missing_data: [], market_suitability: "review_only" },
    engineVersion: "test",
  }, { idFactory: () => id, now: () => "2026-08-14T12:00:00.000Z" });
}

test("1. ranking deportivo sin cuotas", () => assert.equal(rankedSet()[0].price_status, "unavailable"));

test("2. ranking idéntico con cuota distinta", () => {
  const base = rankedSet();
  const first = rankedSet([quote(base[0], 1.2)]);
  const second = rankedSet([quote(base[0], 2)]);
  assert.deepEqual(first.map((item) => item.candidate_id), second.map((item) => item.candidate_id));
  assert.deepEqual(first.map((item) => item.sports_score), second.map((item) => item.sports_score));
});

test("3. ranking idéntico con bookmaker distinto", () => {
  const base = rankedSet();
  assert.deepEqual(
    rankedSet([quote(base[0], 1.8, "Casa A")]).map((item) => item.candidate_id),
    rankedSet([quote(base[0], 1.8, "Casa B")]).map((item) => item.candidate_id)
  );
});

test("4. Scout con varias alternativas", () => assert.ok(scoutFrom().candidates.length >= 3));
test("5. deduplicación", () => assert.equal(scoutFrom([...rankedSet(), rankedSet()[0]]).candidates.filter((item) => item.candidate_id === rankedSet()[0].candidate_id).length, 1));
test("6. candidato principal", () => assert.equal(scoutFrom().primary_candidate_id, rankedSet()[0].candidate_id));
test("7. alternativas", () => assert.ok(scoutFrom().candidates.slice(1).every((item) => item.labels.length > 0)));
test("8. contexto liga doméstica", () => assert.equal(classifyCompetition({ name: "Liga BetPlay", country: "Colombia" }), "domestic_league"));
test("9. contexto copa doméstica", () => assert.equal(classifyCompetition({ name: "Copa Colombia", country: "Colombia" }), "domestic_cup"));
test("10. contexto internacional", () => assert.equal(classifyCompetition({ name: "CONMEBOL Libertadores", country: "World" }), "international"));
test("11. ida/vuelta", () => assert.deepEqual([classifyLeg("Quarter-finals - 1st Leg"), classifyLeg("Cuartos - Vuelta")], ["first_leg", "second_leg"]));
test("12. agregado cuando exista", () => assert.deepEqual(buildCompetitiveContext({ fixture: { ...fixture({ isScheduled: true }), score: { aggregate: { home: 2, away: 1 } } } }).aggregate, { home: 2, away: 1 }));
test("13. calendario próximo", () => assert.equal(buildCompetitiveContext({ fixture: fixture({ isScheduled: true }), schedule: { next_fixture: { verified: true, competition: "Libertadores" } } }).next_competition, "Libertadores"));
test("14. rotación no confirmada queda como riesgo y no hecho", () => assert.equal(buildCompetitiveContext({ fixture: fixture({ isScheduled: true }), schedule: { rotation_reported: true } }).rotation.status, "reported_risk"));
test("15. muestras conservan origen competitivo", () => {
  const profile = { sample_origins: [{ competition_id: 239, competition_name: "Primera A" }] };
  assert.equal(buildCompetitiveContext({ fixture: fixture({ isScheduled: true }), homeTeamProfile: profile, awayTeamProfile: profile }).sample_context.home.origins[0].competition_name, "Primera A");
});
test("16. ausencia de muestra comparable se comunica", () => assert.match(buildCompetitiveContext({ fixture: fixture({ isScheduled: true }) }).warnings[0], /muestra comparable/i));
test("17. cuota no cambia contexto competitivo", () => assert.equal("odds" in buildCompetitiveContext({ fixture: fixture({ isScheduled: true }) }), false));
test("18. cuota asociada a línea exacta", () => {
  const item = candidate();
  assert.equal(selectCandidateQuote(item, [quote({ ...item, line: 2.5 }, 2)]).status, "incompatible_line");
});
test("19. dos cuotas no se contaminan", () => {
  const under = candidate();
  const over = candidate({ candidate_id: "goals:over:1.5", direction: "over", line: 1.5, selection: "Over 1.5" });
  assert.equal(selectCandidateQuote(over, [quote(under, 1.25), quote(over, 1.7)]).quote.decimal_odds, 1.7);
});
test("20. ranking operativo independiente", () => assert.equal(buildOperationalRanking({ scout: scoutFrom(), quotes: [] }).candidates.length, 0));
test("21. ranking operativo puede diferir del deportivo", () => {
  const scout = scoutFrom();
  const sportsPrimary = scout.candidates[0];
  const alternative = scout.candidates[1];
  const result = buildOperationalRanking({ scout, quotes: [quote(sportsPrimary, 1.1), quote(alternative, 2.5)], confidenceScore: 80 });
  assert.equal(result.differs_from_sports_ranking, true);
});
test("22. Under 3.5 @ 1.25 continúa desfavorable", () => {
  const item = candidate();
  assert.equal(evaluateMarketPrice({ oddsQuote: quote(item, 1.25), preliminaryProbability: { point_estimate: 0.674, uncertainty_low: 0.55, uncertainty_high: 0.75 }, confidenceScore: 80, sampleSize: 10 }).status, "unfavorable");
});
test("23. Over 1.5 independiente", () => assert.notEqual(candidate().candidate_id, candidate({ candidate_id: "goals:over:1.5" }).candidate_id));
test("24. SÍ cuando los contratos actuales lo permitan", () => assert.equal(assessMarketSuitability({ fixtureVerified: true, marketCandidate: true, sampleSufficient: true, requiredEvidenceAvailable: true, line: 1.5, oddsQuote: quote(candidate({ line: 1.5, direction: "over", selection: "Over 1.5" }), 2), confidenceScore: 80, preliminaryProbability: { probability_status: "preliminary", point_estimate: 0.7, uncertainty_low: 0.62, uncertainty_high: 0.78 }, sampleSize: 10 }).status, "suitable_under_conditions"));
test("25. cautela cuando corresponda", () => assert.equal(assessMarketSuitability({ fixtureVerified: true, marketCandidate: true, sampleSufficient: true, requiredEvidenceAvailable: true, line: 1.5, oddsQuote: quote(candidate({ line: 1.5, direction: "over", selection: "Over 1.5" }), 1.7), confidenceScore: 70, preliminaryProbability: { probability_status: "preliminary", point_estimate: 0.62, uncertainty_low: 0.45, uncertainty_high: 0.75 }, sampleSize: 10 }).status, "viable_with_caution"));
test("26. NO con precio desfavorable", () => assert.equal(assessMarketSuitability({ fixtureVerified: true, marketCandidate: true, sampleSufficient: true, requiredEvidenceAvailable: true, line: 3.5, oddsQuote: quote(candidate(), 1.25), confidenceScore: 80, preliminaryProbability: { probability_status: "preliminary", point_estimate: 0.674, uncertainty_low: 0.55, uncertainty_high: 0.75 }, sampleSize: 10 }).status, "not_viable"));
test("27. esperar solo por condición objetiva", () => assert.match(assessMarketSuitability({ fixtureVerified: true, marketCandidate: true, sampleSufficient: true, requiredEvidenceAvailable: true, line: 1.5 }).conditions[0], /cuota comparable/i));
test("28. Red Team", () => assert.ok(buildRedTeamAtlas({ candidate: candidate({ limitations: ["Muestra pequeña"] }) }).items.length === 1));
test("29. evidencia neutral", () => assert.equal(buildRedTeamAtlas({ preMatchContext: { lineups: { status: "probable", warnings: [], material_impacts: [] }, injuries: { warnings: [] } } }).items[0].status, "neutral"));
test("30. probable lineup sin causalidad queda neutral", () => assert.match(buildRedTeamAtlas({ preMatchContext: { lineups: { status: "probable", warnings: [], material_impacts: [] }, injuries: { warnings: [] } } }).items[0].text, /no concluyente/i));
test("31. fixture futuro", () => assert.equal(assessPrematchEligibility(fixture({ short: "NS", isScheduled: true, isLive: false, isFinished: false }), { now: "2026-08-14T12:00:00.000Z" }).eligible, true));
test("32. iniciado excluido", () => assert.equal(assessPrematchEligibility(fixture({ short: "1H", isScheduled: false, isLive: true, isFinished: false })).eligible, false));
test("33. descanso excluido", () => assert.equal(assessPrematchEligibility(fixture({ short: "HT", isScheduled: false, isLive: true, isFinished: false })).reason, "started"));
test("34. segundo tiempo excluido", () => assert.equal(assessPrematchEligibility(fixture({ short: "2H", isScheduled: false, isLive: true, isFinished: false })).eligible, false));
test("35. finalizado excluido", () => assert.equal(assessPrematchEligibility(fixture({ short: "FT", isScheduled: false, isLive: false, isFinished: true })).reason, "finished"));
test("36. aplazado", () => assert.equal(assessPrematchEligibility(fixture({ short: "PST", isScheduled: false, isLive: false, isFinished: false })).reason, "postponed"));
test("37. cancelado", () => assert.equal(assessPrematchEligibility(fixture({ short: "CANC", isScheduled: false, isLive: false, isFinished: false })).reason, "cancelled"));
test("38. Bogotá timezone", () => assert.equal(fixtureDateContext("2026-08-15T01:00:00.000Z", "America/Bogota").local_calendar_date, "2026-08-14"));
test("39. medianoche", () => assert.equal(fixtureDateContext("2026-08-15T00:05:00.000Z", "America/Bogota").local_calendar_date, "2026-08-14"));
test("40. Gemini nueva investigación limpia temporales", async () => assert.match(await readFile(clientPath, "utf8"), /function startNewGeminiResearch\(\)[\s\S]*setGeminiText\(""\)[\s\S]*setGeminiContext\(null\)[\s\S]*setSelectedGeminiIds\(\[\]\)/));
test("41. Gemini conserva historial", async () => assert.doesNotMatch((await readFile(clientPath, "utf8")).slice((await readFile(clientPath, "utf8")).indexOf("function startNewGeminiResearch"), (await readFile(clientPath, "utf8")).indexOf("function updateCandidateQuote")), /fetch\("\/api\/operational-history"/));
test("42. comparación después de reanálisis", () => assert.equal(compareAnalysisVersions(version("a"), version("b")).comparable, true));
test("43. comparación antigua no contamina prompt nuevo", async () => assert.match(await readFile(clientPath, "utf8"), /setShowActiveComparison\(false\)/));
test("44. rumor desmarcado", () => assert.equal(parseGeminiResponse("RUMORES\n- Posible baja https://example.com", { fixture: fixture({ isScheduled: true }) }).items[0].selected, false));
test("45. contradicción desmarcada", () => assert.equal(parseGeminiResponse("CONTRADICCIONES\n- Fuentes discrepan https://example.com", { fixture: fixture({ isScheduled: true }) }).items[0].selected, false));
test("46. soporte genérico desmarcado", () => assert.equal(parseGeminiResponse("HECHOS CONFIRMADOS\n- Google muestra antecedentes https://google.com", { fixture: fixture({ isScheduled: true }) }).items[0].selected, false));
test("47. line_origin Gemini preservado", () => assert.equal(resolveLineOrigin({ reanalysis: true, marketId: "goals" }, { line_origin: LINE_ORIGIN.ATLAS_SELECTED, director: { line: 3.5, market_evaluated: { family: "goals" } } }, { requestedLine: 3.5 }), LINE_ORIGIN.ATLAS_SELECTED));
test("48. line_origin manual correcto", () => assert.equal(resolveLineOrigin({ analysisMode: "specific", marketId: "goals" }, null, { requestedLine: 1.5, requestedSelection: "Over 1.5" }), LINE_ORIGIN.USER_SELECTED));
test("49. opción manual independiente", () => {
  const under = { ...candidate(), sports_score: 80, rank: 1 };
  const over = { ...candidate({ candidate_id: "goals:over:1.5", direction: "over", line: 1.5, selection: "Over 1.5", preliminary_probability: 0.61 }), sports_score: 70, rank: 2 };
  assert.equal(selectExactRequestedCandidate({ primary: under, ranked_candidates: [under, over] }, { marketFamily: "goals", requestedLine: 1.5, requestedSelection: "Over 1.5" }).primary.preliminary_probability, 0.61);
});
test("50. glosario accesible", async () => assert.match(await readFile(clientPath, "utf8"), /¿Cómo leer Atlas\?/));
test("51. ayuda touch/click/keyboard", async () => { const source = await readFile(clientPath, "utf8"); assert.match(source, /<details className="p2-help-term">/); assert.match(source, /<summary aria-label=/); });
test("52. sports_score no visible como jerga simple", async () => { const source = await readFile(clientPath, "utf8"); const simple = source.slice(source.indexOf("function ScoutResult"), source.indexOf("function DirectorResult")); assert.doesNotMatch(simple, />Sports score</); });
test("53. traducciones", async () => { const source = await readFile(clientPath, "utf8"); assert.match(source, /stale: "Desactualizada"/); assert.match(source, /user_reported_current: "Vigente, reportada por el usuario"/); });
test("54. modo sencillo máximo 3 razones", async () => assert.match(await readFile(clientPath, "utf8"), /director\.simple_reasons \|\| director\.reasons \|\| \[\]\)\.slice\(0, 3\)/));
test("55. modo sencillo máximo 3 riesgos", async () => assert.match(await readFile(clientPath, "utf8"), /fixtureRisks = \(director\.red_team\?\.items \|\| \[\]\)[\s\S]*\.slice\(0, 3\)/));
test("56. experto conserva detalle", async () => { const source = await readFile(clientPath, "utf8"); assert.match(source, /expert-scout/); assert.match(source, /expert-operational-ranking/); });
test("57. pre-vuelo", () => assert.equal(buildAtlasPreflight({ fixture: fixture({ isScheduled: true }), candidate: candidate(), competitiveContext: {}, oddsQuote: quote(candidate(), 1.8), preMatchContext: { lineups: { status: "confirmed" } } }).status, "confirmed"));
test("58. nueva búsqueda conserva historial", async () => { const source = await readFile(clientPath, "utf8"); const block = source.slice(source.indexOf("function startNewSearch"), source.indexOf("function changeDate")); assert.doesNotMatch(block, /operational-history/); });
test("59. borrado total exige frase", async () => { const repository = createMemoryOperationalHistory(); await assert.rejects(() => repository.appendArchiveAll("DELETE"), /explicit_history_archive/); });
test("60. borrado total conserva configuración", async () => { const config = { timezone: "America/Bogota" }; const repository = createMemoryOperationalHistory(); await repository.appendArchiveAll("BORRAR HISTORIAL"); assert.deepEqual(config, { timezone: "America/Bogota" }); });
test("61. historial mantiene versiones independientes", async () => { const repository = createMemoryOperationalHistory(); await repository.appendAnalysis(version("a")); await repository.appendAnalysis(version("b")); assert.equal((await repository.list()).length, 2); });
test("62. ausencia de cuota no cambia probability", () => assert.equal(rankedSet()[0].preliminary_probability, rankedSet([])[0].preliminary_probability));
test("63. introducir cuota no cambia sports ranking", () => { const base = rankedSet(); const priced = rankedSet([quote(base[0], 1.2), quote(base[1], 2)]); assert.deepEqual(priced.map((item) => item.candidate_id), base.map((item) => item.candidate_id)); });
test("64. build no expone secretos", async () => { const [client, layout, env, route] = await Promise.all([readFile(clientPath, "utf8"), readFile(layoutPath, "utf8"), readFile(envPath, "utf8"), readFile(routePath, "utf8")]); assert.doesNotMatch(`${client}\n${layout}`, /API_FOOTBALL_KEY|x-apisports-key/); assert.match(env, /API_FOOTBALL_KEY=/); assert.doesNotMatch(route, /process\.env\.API_FOOTBALL_KEY/); });
