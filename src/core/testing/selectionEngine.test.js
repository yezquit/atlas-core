import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { generateCandidateLines, isValidCandidateLine } from "../intelligence/candidateLineGenerator.js";
import { mapGeminiImpacts, contextShiftForMarket } from "../intelligence/geminiImpactMapper.js";
import { buildRankedMarketSelection, rankMarketCandidates } from "../intelligence/marketCandidateRanker.js";
import { buildConservativeParlays } from "../intelligence/parlayPolicy.js";
import { buildAnalysisVersion } from "../intelligence/analysisVersions.js";
import { buildOperationalDirectorVerdict } from "../modules/directorAtlas.js";
import { selectDiverseJourneyCandidates } from "../services/sportsIntelligenceService.js";

const clientPath = new URL("../../app/atlas-functional-client.js", import.meta.url);
const servicePath = new URL("../services/operationalAnalysisService.js", import.meta.url);
const packagePath = new URL("../../../package.json", import.meta.url);

const VALUES = Object.freeze({
  goals: [3, 4, 1, 3, 2, 4, 3, 1, 5, 3],
  corners: [11, 12, 8, 10, 13, 9, 11, 7, 14, 10],
  cards: [6, 7, 4, 6, 8, 5, 7, 3, 6, 9],
  total_shots: [25, 28, 18, 24, 26, 29, 20, 27, 31, 23],
  shots_on_goal: [10, 11, 7, 9, 12, 8, 10, 6, 13, 9],
});

const FAMILIES = Object.keys(VALUES);

function eventSamples(limit = 10, overrides = {}) {
  return Object.fromEntries(FAMILIES.map((family) => [family, {
    match_totals: (overrides[family] || VALUES[family]).slice(0, limit),
  }]));
}

function profiles(overrides = {}) {
  const values = { ...VALUES, ...overrides };
  const samples = (limit) => eventSamples(limit, values);
  const team = {
    quality_status: "verified",
    last_5: { event_samples: samples(5) },
    last_10: { event_samples: samples(10) },
    as_home: { event_samples: samples(5) },
    as_away: { event_samples: samples(5) },
  };
  return {
    leagueProfile: { quality_status: "verified", event_samples: samples(10) },
    homeTeamProfile: structuredClone(team),
    awayTeamProfile: structuredClone(team),
    refereeProfile: { status: "confirmed", quality_status: "verified", event_samples: { cards: { match_totals: values.cards } } },
  };
}

function assessments() {
  return FAMILIES.map((family) => ({
    market_family: family,
    market_label: family,
    technical_support_score: 80,
    sample_size: 10,
    candidate: true,
    data_requirements: ["league", "home", "away"],
    available_evidence: [{ requirement: "league" }, { requirement: "home" }, { requirement: "away" }],
    missing_evidence: [],
    risk_flags: [],
  }));
}

function selectionInput(overrides = {}) {
  return { marketAssessments: assessments(), ...profiles(), ...overrides };
}

function candidate(family, overrides = {}) {
  return {
    candidate_id: `${family}:over:${overrides.line ?? 2.5}`,
    market_family: family,
    direction: overrides.direction || "over",
    selection: `${overrides.direction === "under" ? "Under" : "Over"} ${overrides.line ?? 2.5}`,
    line: overrides.line ?? 2.5,
    projected_mean: overrides.projected_mean ?? 3,
    median: overrides.median ?? 3,
    dispersion: overrides.dispersion ?? 1.5,
    preliminary_probability: overrides.probability ?? 0.68,
    probability_status: "preliminary",
    uncertainty_low: overrides.low ?? 0.62,
    uncertainty_high: overrides.high ?? 0.74,
    sample_size_effective: overrides.sample ?? 20,
    input_sources: [],
    limitations: overrides.limitations || [],
    methodology_version: "test-v1",
    contextual_only: overrides.contextual_only || false,
    context_adjustment: { changed_distribution: false },
    ...overrides,
  };
}

function quote(overrides = {}) {
  return {
    market_family: overrides.market_family || "goals",
    selection: overrides.selection || "Over 2.5",
    line: String(overrides.line ?? 2.5),
    decimal_odds: overrides.decimal_odds || 1.9,
    implied_probability: 1 / (overrides.decimal_odds || 1.9),
    verification_status: overrides.verification_status || "verified_provider",
    freshness: overrides.freshness || "fresh",
    bookmaker_name: "Casa de prueba",
    ...overrides,
  };
}

function directorFor({ marketCandidate = candidate("goals", { sports_score: 80 }), oddsQuote = null, phase = "early_review", status = "review_only", contextReanalysisMessage = null } = {}) {
  return buildOperationalDirectorVerdict({
    fixture: { fixtureId: 7, date: { utc: "2026-09-01T20:00:00Z" }, teams: { home: { name: "A" }, away: { name: "B" } }, competition: { season: 2026 } },
    competition: { localName: "Liga" },
    analyzedAt: "2026-08-28T12:00:00Z",
    phase,
    marketAssessment: marketCandidate ? { market_family: marketCandidate.market_family, market_label: marketCandidate.market_family } : null,
    marketCandidate,
    marketSelection: marketCandidate ? { analysis_mode: "general", explanation: "Ranking deportivo de prueba", alternatives: [], line_profiles: {} } : null,
    oddsQuote,
    confidence: { analysis_confidence_score: 78, confidence_label: "alta" },
    suitability: { status, conditions: [] },
    preliminaryProbability: marketCandidate ? { probability_status: "preliminary", point_estimate: marketCandidate.preliminary_probability, uncertainty_low: marketCandidate.uncertainty_low, uncertainty_high: marketCandidate.uncertainty_high } : null,
    contextReanalysisMessage,
  });
}

function rankedWinner(targetFamily) {
  const candidates = FAMILIES.map((family) => candidate(family, family === targetFamily
    ? { line: 7.5, probability: 0.68, low: 0.63, high: 0.73, sample: 24 }
    : { line: 7.5, probability: 0.46, low: 0.2, high: 0.75, sample: 5, contextual_only: true, limitations: ["limited"] }));
  return rankMarketCandidates(candidates, { marketAssessments: assessments() })[0];
}

test("1. modo mejor opción general", () => {
  const result = buildRankedMarketSelection(selectionInput({ analysisMode: "general" }));
  assert.equal(result.analysis_mode, "general");
  assert.deepEqual(new Set(result.generated.map((item) => item.market_family)), new Set(FAMILIES));
});

test("2. modo mercado específico", () => {
  const result = buildRankedMarketSelection(selectionInput({ analysisMode: "specific", requestedMarketId: "goals" }));
  assert.equal(result.analysis_mode, "specific");
  assert.ok(result.ranked_candidates.every((item) => item.market_family === "goals"));
});

for (const [number, family] of [[3, "goals"], [4, "cards"], [5, "total_shots"], [6, "shots_on_goal"], [7, "corners"]]) {
  test(`${number}. ${family} respeta selección`, () => {
    const result = buildRankedMarketSelection(selectionInput({ analysisMode: "specific", requestedMarketId: family }));
    assert.equal(result.primary.market_family, family);
    assert.ok(result.alternatives.length >= 2);
  });
}

for (const [number, family] of [[8, "goals"], [9, "corners"], [10, "cards"], [11, "total_shots"], [12, "shots_on_goal"]]) {
  test(`${number}. generador de líneas de ${family}`, () => {
    const result = generateCandidateLines({ marketFamily: family, ...profiles() });
    assert.ok(result.candidates.length >= 6);
    assert.ok(result.candidates.every((item) => item.market_family === family && item.line % 1 === 0.5));
  });
}

test("13. Over y Under", () => {
  const result = generateCandidateLines({ marketFamily: "goals", ...profiles() });
  assert.deepEqual(new Set(result.candidates.map((item) => item.direction)), new Set(["over", "under"]));
});

test("14. líneas alrededor de distribución", () => {
  const result = generateCandidateLines({ marketFamily: "total_shots", ...profiles() });
  assert.ok(result.candidates.some((item) => Math.abs(item.line - result.distribution.projected_mean) <= 1));
});

test("15. descartar líneas absurdas", () => {
  const distribution = generateCandidateLines({ marketFamily: "total_shots", ...profiles() }).distribution;
  assert.equal(isValidCandidateLine("goals", 99.5, distribution), false);
  assert.equal(isValidCandidateLine("total_shots", 99.5, distribution), false);
});

test("16. ranking sin cuota", () => {
  const ranked = rankMarketCandidates([candidate("goals")], { marketAssessments: assessments() });
  assert.equal(ranked[0].price_status, "unavailable");
  assert.ok(ranked[0].sports_score > 0);
});

test("17. ranking con cuota", () => {
  const ranked = rankMarketCandidates([candidate("goals")], { marketAssessments: assessments(), quotes: [quote({ selection: "Draw/Over 2.5", decimal_odds: 20 }), quote()] });
  assert.equal(ranked[0].price_status, "verified_current");
  assert.equal(ranked[0].price_quote.selection, "Over 2.5");
});

test("18. cuota vencida no elimina pronóstico", () => {
  const ranked = rankMarketCandidates([candidate("goals")], { marketAssessments: assessments(), quotes: [quote({ freshness: "stale", verification_status: "stale" })] });
  assert.equal(ranked[0].price_status, "stale");
  assert.ok(ranked[0].sports_score > 0);
});

test("19. cuota ausente no elimina pronóstico", () => {
  const verdict = directorFor();
  assert.equal(verdict.sports_verdict.status, "sports_candidate");
  assert.equal(verdict.price_assessment.status, "unavailable");
});

test("20. cuota manual de línea distinta recalcula", () => {
  const generated = generateCandidateLines({ marketFamily: "corners", exactLine: 8.5, ...profiles() });
  assert.ok(generated.candidates.some((item) => item.line === 8.5));
});

test("21. probabilidad de 7.5 no se reutiliza para 8.5", () => {
  const generated = generateCandidateLines({ marketFamily: "corners", exactLine: 8.5, ...profiles() }).candidates;
  const at75 = generated.find((item) => item.direction === "over" && item.line === 7.5);
  const at85 = generated.find((item) => item.direction === "over" && item.line === 8.5);
  assert.notEqual(at75.preliminary_probability, at85.preliminary_probability);
});

for (const [number, family] of [[22, "goals"], [23, "corners"], [24, "cards"], [25, "total_shots"], [26, "shots_on_goal"]]) {
  test(`${number}. ${family} gana ranking cuando corresponde`, () => assert.equal(rankedWinner(family).market_family, family));
}

test("27. córners no gana por orden inicial", () => {
  const entries = [candidate("corners", { probability: 0.45, low: 0.2, high: 0.8, sample: 4 }), candidate("goals")];
  assert.equal(rankMarketCandidates(entries, { marketAssessments: assessments() })[0].market_family, "goals");
});

test("28. empate de ranking determinista", () => {
  const first = rankMarketCandidates([candidate("goals"), candidate("corners")], { marketAssessments: assessments() }).map((item) => item.candidate_id);
  const second = rankMarketCandidates([candidate("corners"), candidate("goals")], { marketAssessments: assessments() }).map((item) => item.candidate_id);
  assert.deepEqual(first, second);
});

test("29. dictamen temprano", () => assert.equal(directorFor({ phase: "early_review" }).temporal_status, "early_forecast"));

test("30. alineación ausente reduce confianza sin bloqueo general", () => {
  const verdict = directorFor();
  assert.notEqual(verdict.market_suitability, "blocked");
  assert.match(verdict.temporal_message, /alineaciones/);
});

test("31. árbitro ausente limita tarjetas", () => {
  const missingReferee = profiles().refereeProfile;
  missingReferee.status = "missing";
  missingReferee.quality_status = "unavailable";
  missingReferee.event_samples.cards.match_totals = [];
  const result = generateCandidateLines({ marketFamily: "cards", ...profiles(), refereeProfile: missingReferee });
  assert.ok(result.candidates.length > 0);
  assert.equal(result.candidates[0].input_sources.some((item) => item.source === "referee"), false);
  assert.match(result.candidates[0].limitations.join(" "), /provisional limitado/);
});

test("32. Gemini confirma", () => {
  const impacts = mapGeminiImpacts([{ id: "g1", text: "Delantero confirmado y disponible", verification_status: "user_reported" }]);
  assert.equal(impacts[0].direction, "increase");
  assert.match(directorFor({ contextReanalysisMessage: "Contexto incorporado. El candidato principal se mantiene." }).context_reanalysis_message, /se mantiene/);
});

test("33. Gemini cambia línea", () => {
  const impacts = mapGeminiImpacts([{ id: "g1", text: "Múltiples delanteros titulares ausentes por lesión", verification_status: "verified_provider" }]);
  const volatileProfiles = profiles({ goals: [3, 8, 0, 3, 0, 8, 3, 0, 8, 3] });
  const before = generateCandidateLines({ marketFamily: "goals", ...volatileProfiles });
  const after = generateCandidateLines({ marketFamily: "goals", contextImpacts: impacts, ...volatileProfiles });
  assert.notEqual(before.distribution.projected_mean, after.distribution.projected_mean);
  assert.notEqual(before.candidates.find((item) => item.candidate_id === "goals:over:2.5")?.preliminary_probability, after.candidates.find((item) => item.candidate_id === "goals:over:2.5")?.preliminary_probability);
});

test("34. Gemini no cambia y lo explica", () => {
  const impacts = mapGeminiImpacts([{ id: "g1", text: "Información general sin variable deportiva", verification_status: "user_reported" }]);
  assert.equal(impacts.length, 0);
  assert.match(directorFor({ contextReanalysisMessage: "El contexto fue procesado, pero no contiene evidencia suficiente para modificar la distribución." }).context_reanalysis_message, /no contiene evidencia suficiente/);
});

test("35. impacto user_reported limitado", () => {
  const impacts = mapGeminiImpacts(Array.from({ length: 10 }, (_, index) => ({ id: `g${index}`, text: "Delantero titular ausente por lesión muy grave", verification_status: "user_reported" })));
  assert.equal(contextShiftForMarket(impacts, "goals").standardized_shift, -0.15);
});

test("36. cuadro verde", () => assert.equal(directorFor({ marketCandidate: candidate("goals", { sports_score: 82, price_status: "verified_current" }), oddsQuote: quote(), status: "suitable_under_conditions" }).market_suitability, "suitable_under_conditions"));
test("37. cuadro amarillo", () => assert.equal(directorFor().market_suitability, "review_only"));
test("38. cuadro naranja", () => assert.equal(directorFor({ marketCandidate: candidate("goals", { sports_score: 82, price_status: "user_reported_current" }), oddsQuote: quote({ verification_status: "user_reported" }) }).market_suitability, "viable_with_caution"));
test("39. cuadro rojo", () => assert.equal(directorFor({ marketCandidate: candidate("goals", { sports_score: 40 }) }).market_suitability, "not_viable"));
test("40. cuadro gris", () => assert.equal(directorFor({ marketCandidate: null, status: "insufficient_data" }).market_suitability, "insufficient_data"));

test("41. botón nueva búsqueda", async () => assert.match(await readFile(clientPath, "utf8"), />Nueva búsqueda</));

test("42. nueva búsqueda conserva historial", async () => {
  const source = await readFile(clientPath, "utf8");
  const block = source.slice(source.indexOf("function startNewSearch"), source.indexOf("function changeDate"));
  assert.doesNotMatch(block, /operational-history|deleteSelectedVersion|setHistory/);
});

test("43. repetir análisis crea nueva versión", async () => {
  const first = buildAnalysisVersion({ fixture: { fixtureId: 1, date: { utc: "2026-09-01T00:00:00Z" } } }, { idFactory: () => "v1", now: () => "2026-08-01T00:00:00Z" });
  const second = buildAnalysisVersion({ fixture: { fixtureId: 1, date: { utc: "2026-09-01T00:00:00Z" } } }, { idFactory: () => "v2", now: () => "2026-08-01T01:00:00Z" });
  assert.notEqual(first.analysis_id, second.analysis_id);
  assert.match(await readFile(clientPath, "utf8"), />Repetir análisis</);
});

test("44. explorar jornada devuelve familias variadas según datos", () => {
  const analysis = (fixtureId) => ({ fixture: { fixtureId } });
  const entries = [
    { analysis: analysis(1), candidate: candidate("corners", { sports_score: 80 }) },
    { analysis: analysis(2), candidate: candidate("corners", { sports_score: 79 }) },
    { analysis: analysis(3), candidate: candidate("goals", { sports_score: 78 }) },
  ];
  const selected = selectDiverseJourneyCandidates(entries, 2);
  assert.deepEqual(new Set(selected.map((item) => item.candidate.market_family)), new Set(["corners", "goals"]));
});

test("45. parlay consume candidatos del ranking", () => {
  const candidates = Array.from({ length: 6 }, (_, index) => ({
    fixture_id: index + 1, candidate_id: `ranked-${index}`, ranking_version: "market-candidate-ranker-v1",
    market_family: index % 2 ? "corners" : "cards", line: `${index + 1}.5`, selection: `Over ${index + 1}.5`,
    decimal_odds: 1.7, odds_source_status: "verified_provider", freshness: "fresh",
    market_suitability: "suitable_under_conditions", preliminary_probability: { probability_status: "preliminary" },
    uncertainty_width: 0.2, analysis_confidence_score: 75,
  }));
  const result = buildConservativeParlays(candidates);
  assert.equal(result.parlays.length, 3);
  assert.ok(result.parlays.flatMap((item) => item.selections).every((item) => item.candidate_id.startsWith("ranked-")));
});

test("46. parlay no usa cuota vencida", () => {
  const item = { fixture_id: 1, candidate_id: "ranked-1", ranking_version: "v1", market_family: "goals", line: 2.5, selection: "Over 2.5", decimal_odds: 1.8, odds_source_status: "verified_provider", freshness: "stale", market_suitability: "suitable_under_conditions", preliminary_probability: { probability_status: "preliminary" }, uncertainty_width: 0.2, analysis_confidence_score: 80 };
  assert.equal(buildConservativeParlays(Array(6).fill(item)).parlays.length, 0);
});

test("47. DirectorAtlas única voz", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /Dictamen del Director Atlas/);
  assert.doesNotMatch(source, /atlasExecutiveAnswer/);
});

test("48. códigos internos fuera del modo sencillo", async () => {
  const source = await readFile(clientPath, "utf8");
  const block = source.slice(source.indexOf("function DirectorResult"), source.indexOf("function MarketAssessment"));
  assert.doesNotMatch(block, /JSON\.stringify|candidate_id|ranker_version|methodology_version/);
});

test("49. fixture ID inmutable", async () => {
  const source = await readFile(clientPath, "utf8");
  const service = await readFile(servicePath, "utf8");
  assert.match(source, /selectedFixtureId\) !== requestedFixtureId/);
  assert.match(service, /selectedFixtureId/);
});

test("50. lint, test, build y audit", async () => {
  const pkg = JSON.parse(await readFile(packagePath, "utf8"));
  assert.ok(pkg.scripts.lint && pkg.scripts.test && pkg.scripts.build);
});
