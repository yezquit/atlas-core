import test from "node:test";
import assert from "node:assert/strict";
import { calculateAnalysisConfidence } from "../intelligence/analysisConfidence.js";
import { buildAnalysisVersion, compareAnalysisVersions } from "../intelligence/analysisVersions.js";
import { buildGeminiResearchPrompt, parseGeminiResponse, selectGeminiItems } from "../intelligence/geminiManualContext.js";
import { assessMarketSuitability } from "../intelligence/marketSuitability.js";
import { createManualOdds, impliedProbability, normalizeProviderOdds, selectBestComparableOdds } from "../intelligence/oddsIntelligence.js";
import { buildConservativeParlays, combinedDecimalOdds, detectSelectionCorrelation } from "../intelligence/parlayPolicy.js";
import { normalizeInjuries, normalizeLineups } from "../intelligence/preMatchContext.js";
import { createMemoryOperationalHistory } from "../infrastructure/operationalHistory.js";

const fixture = {
  fixtureId: 9001,
  date: { utc: "2026-08-20T20:00:00Z" },
  competition: { id: 239, name: "Primera A", season: 2026 },
  teams: { home: { id: 1, name: "Atlas Local" }, away: { id: 2, name: "Atlas Visitante" } },
};

function providerItem({ id = 9001, update = "2026-08-20T19:50:00Z", odd = "1.90", value = "Over 2.5", bookmakerId = 7 } = {}) {
  return { fixture: { id, date: fixture.date.utc }, update, bookmakers: [{ id: bookmakerId, name: `Book ${bookmakerId}`, bets: [{ id: 5, name: "Goals Over/Under", values: [{ value, odd }] }] }] };
}

test("1. odds exactas por fixture", () => {
  const result = normalizeProviderOdds({ response: [providerItem(), providerItem({ id: 9999 })], fixtureId: 9001, now: "2026-08-20T20:00:00Z" });
  assert.equal(result.quotes.length, 1);
  assert.equal(result.quotes[0].fixture_id, 9001);
  assert.deepEqual(result.warnings, ["provider_fixture_mismatch"]);
});

test("2. cuota stale", () => {
  const result = normalizeProviderOdds({ response: [providerItem({ update: "2026-08-20T18:00:00Z" })], fixtureId: 9001, now: "2026-08-20T20:00:00Z", staleAfterMinutes: 30 });
  assert.equal(result.quotes[0].verification_status, "stale");
});

test("3. entrada manual de cuota", () => {
  const quote = createManualOdds({ fixtureId: 9001, bookmaker: "Usuario", marketFamily: "goals", selection: "Over", line: "2.5", decimalOdds: "1.85" });
  assert.equal(quote.verification_status, "user_reported");
  assert.deepEqual(quote.warnings, ["manual_odds_unverified"]);
});

test("4. probabilidad implícita", () => {
  assert.equal(impliedProbability(2), 0.5);
  assert.equal(impliedProbability(1), null);
});

test("5. no confunde probabilidad implícita con estimada", () => {
  const quote = createManualOdds({ fixtureId: 9001, marketFamily: "goals", selection: "Over", line: "2.5", decimalOdds: 2 });
  assert.equal(quote.implied_probability, 0.5);
  assert.equal(quote.estimated_probability, undefined);
  assert.match(quote.implied_probability_label, /implícita/);
});

test("6. fórmula de confianza", () => {
  const result = calculateAnalysisConfidence({ source_quality: 1, freshness: 1, sample_size: 1, variable_coverage: 1, source_concordance: 1, contradiction_control: 1, contextual_coverage: 0, verified_market_data: 0, provider_stability: 1 });
  assert.equal(result.analysis_confidence_score, 84);
  assert.equal(result.represents_probability, false);
  assert.equal(result.components.reduce((sum, item) => sum + item.weight, 0), 100);
});

test("7. techo de confianza", () => {
  const all = Object.fromEntries(["source_quality", "freshness", "sample_size", "variable_coverage", "source_concordance", "contradiction_control", "contextual_coverage", "verified_market_data", "provider_stability"].map((key) => [key, 1]));
  assert.equal(calculateAnalysisConfidence(all).analysis_confidence_score, 92);
  assert.equal(calculateAnalysisConfidence({ ...all, extraordinaryEvidence: true, confirmedLineup: true, verifiedOdds: true }).analysis_confidence_score, 100);
});

test("8. alta confianza con mercado no viable", () => {
  const result = assessMarketSuitability({ fixtureVerified: true, marketCandidate: false, sampleSufficient: true, requiredEvidenceAvailable: false, confidenceScore: 90 });
  assert.equal(result.status, "not_viable");
});

test("9. prompt Gemini contiene fixture correcto", () => {
  const prompt = buildGeminiResearchPrompt({ fixture, competition: { localName: "Colombia Primera A" }, market: { market_label: "Goles" }, analyzedAt: "2026-08-19T10:00:00Z" });
  assert.match(prompt, /Fixture ID: 9001/);
  assert.match(prompt, /Atlas Local vs Atlas Visitante/);
  assert.match(prompt, /no generes probabilidades/i);
});

test("10. parser de respuesta Gemini", () => {
  const context = parseGeminiResponse("HECHOS CONFIRMADOS\n- Fixture 9001 Atlas Local vs Atlas Visitante https://dimayor.com.co/a 2026-08-20", { fixture });
  assert.equal(context.items.length, 1);
  assert.equal(context.valid_for_reanalysis, true);
});

test("11. hecho con fuente", () => {
  const context = parseGeminiResponse("HECHOS CONFIRMADOS\n- Comunicado https://dimayor.com.co/a", { fixture });
  assert.equal(context.items[0].verification_status, "user_reported");
  assert.equal(context.items[0].source_classifications[0], "official_competition");
});

test("12. rumor no se promueve", () => {
  const context = parseGeminiResponse("RUMORES\n- Posible rotación https://example.com/a", { fixture });
  assert.equal(context.items[0].kind, "rumor");
  assert.equal(context.items[0].selected, false);
});

test("13. contradicción", () => {
  const context = parseGeminiResponse("CONTRADICCIONES\n- Dos horarios distintos https://example.com/a", { fixture });
  assert.equal(context.items[0].kind, "contradiction");
});

test("14. fixture incorrecto en respuesta", () => {
  const context = parseGeminiResponse("HECHOS CONFIRMADOS\n- Fixture 9999 https://example.com/a", { fixture });
  assert.equal(context.valid_for_reanalysis, false);
  assert.ok(context.validation_errors.includes("fixture_mismatch"));
});

test("15. respuesta sin fuentes", () => {
  const context = parseGeminiResponse("HECHOS CONFIRMADOS\n- Dato sin enlace", { fixture });
  assert.equal(context.items[0].verification_status, "unverified");
  assert.ok(context.warnings.includes("response_without_sources"));
});

test("16. validación manual de elementos", () => {
  const context = parseGeminiResponse("HECHOS CONFIRMADOS\n- Uno https://example.com/1\n- Dos https://example.com/2", { fixture });
  const selected = selectGeminiItems(context, ["gemini-2"]);
  assert.deepEqual(selected.selected_items.map((item) => item.id), ["gemini-2"]);
});

test("17. contexto Gemini es user_reported", () => {
  const context = parseGeminiResponse("HECHOS CONFIRMADOS\n- Uno https://example.com/1", { fixture });
  assert.equal(context.verification_status, "user_reported");
});

test("18. alineación probable", () => {
  const result = normalizeLineups({ fixture, coverageAvailable: true, fetchedAt: "2026-08-20T19:00:00Z", response: [{ team: { id: 1 }, startXI: [{ player: { id: 1 } }] }] });
  assert.equal(result.status, "probable");
});

test("19. alineación confirmada", () => {
  const response = [1, 2].map((teamId) => ({ team: { id: teamId }, startXI: Array.from({ length: 11 }, (_, id) => ({ player: { id } })) }));
  const result = normalizeLineups({ fixture, coverageAvailable: true, fetchedAt: "2026-08-20T19:00:00Z", response });
  assert.equal(result.status, "confirmed");
});

test("20. injuries unavailable", () => {
  assert.equal(normalizeInjuries({ fixture, coverageAvailable: false }).status, "endpoint_unavailable");
  const empty = normalizeInjuries({ fixture, coverageAvailable: true, fetchedAt: "2026-08-20T19:00:00Z", response: [] });
  assert.equal(empty.status, "no_reports");
  assert.notEqual(empty.status, "verified_absence");
});

function version({ id, odds = 1.8, lineup = "probable", suitability = "review_only", verdict = "Revisar", evidence = [] }) {
  return buildAnalysisVersion({ fixture, inputs: { lineup_status: lineup }, evidence, odds: [], director: { odds, line: "2.5", market_suitability: suitability, verdict }, analysisConfidence: { analysis_confidence_score: 70 } }, { idFactory: () => id, now: () => "2026-08-20T18:00:00Z" });
}

test("21. análisis versionado", () => {
  const item = version({ id: "a1" });
  assert.equal(item.analysis_id, "a1");
  assert.equal(item.finalized, true);
  assert.equal(Object.isFrozen(item), true);
});

test("22. comparación temporal", () => {
  const diff = compareAnalysisVersions(version({ id: "a1" }), version({ id: "a2", evidence: [{ id: "new" }] }));
  assert.equal(diff.comparable, true);
  assert.deepEqual(diff.changes.new_evidence, ["new"]);
});

test("23. cambio de cuota", () => {
  assert.equal(compareAnalysisVersions(version({ id: "a1", odds: 1.8 }), version({ id: "a2", odds: 1.9 })).changes.odds_change, true);
});

test("24. cambio de alineación", () => {
  assert.equal(compareAnalysisVersions(version({ id: "a1", lineup: "probable" }), version({ id: "a2", lineup: "confirmed" })).changes.lineup_change, true);
});

test("25. cambio de veredicto explicado", () => {
  const diff = compareAnalysisVersions(version({ id: "a1" }), version({ id: "a2", verdict: "No viable", suitability: "not_viable" }));
  assert.equal(diff.changes.verdict_change, true);
  assert.match(diff.explanation, /actualizó el dictamen/);
});

test("26. historial append-only", async () => {
  const history = createMemoryOperationalHistory();
  await history.appendAnalysis(version({ id: "a1" }));
  await history.appendDeletion("a1", "DELETE");
  assert.equal(history.events.length, 2);
  assert.equal((await history.list()).length, 0);
});

test("27. exportación JSON", async () => {
  const history = createMemoryOperationalHistory();
  await history.appendAnalysis(version({ id: "a1" }));
  const payload = JSON.parse(await history.exportJson());
  assert.equal(payload.schema_version, 1);
  assert.equal(payload.analyses[0].analysis_id, "a1");
});

test("28. mercado apto para consideración", () => {
  const quote = normalizeProviderOdds({ response: [providerItem()], fixtureId: 9001, now: "2026-08-20T20:00:00Z" }).quotes[0];
  const result = assessMarketSuitability({ fixtureVerified: true, marketCandidate: true, sampleSufficient: true, requiredEvidenceAvailable: true, line: "2.5", oddsQuote: quote, confidenceScore: 80 });
  assert.equal(result.status, "suitable_under_conditions");
  assert.equal(result.apt_for_consideration, true);
});

test("29. mercado no viable", () => {
  assert.equal(assessMarketSuitability({ fixtureVerified: true, marketCandidate: false, sampleSufficient: true }).status, "not_viable");
});

test("30. cuota ausente", () => {
  assert.equal(assessMarketSuitability({ fixtureVerified: true, marketCandidate: true, sampleSufficient: true, requiredEvidenceAvailable: true, line: "2.5", confidenceScore: 90 }).status, "review_only");
});

test("31. cuota stale bloquea", () => {
  const quote = normalizeProviderOdds({ response: [providerItem({ update: "2026-08-20T18:00:00Z" })], fixtureId: 9001, now: "2026-08-20T20:00:00Z" }).quotes[0];
  assert.equal(assessMarketSuitability({ fixtureVerified: true, marketCandidate: true, sampleSufficient: true, requiredEvidenceAvailable: true, line: "2.5", oddsQuote: quote, confidenceScore: 90 }).status, "blocked");
});

test("32. parlay sin candidatos", () => {
  assert.equal(buildConservativeParlays([]).status, "insufficient_candidates");
});

test("33. correlación", () => {
  assert.equal(detectSelectionCorrelation({ fixture_id: 1 }, { fixture_id: 1 }).level, "high");
  assert.equal(detectSelectionCorrelation({ fixture_id: 1, market_family: "goals" }, { fixture_id: 2, market_family: "total_shots" }).level, "medium");
});

test("34. cuota combinada", () => {
  assert.equal(combinedDecimalOdds([{ decimal_odds: 2 }, { decimal_odds: 1.5 }]), 3);
});

test("35. no repetir línea crítica", () => {
  const candidates = Array.from({ length: 6 }, (_, index) => ({ fixture_id: index + 1, market_family: index % 2 ? "corners" : "cards", line: `${index + 1}.5`, selection: `S${index}`, decimal_odds: 1.5, odds_source_status: "verified_provider", freshness: "fresh", market_suitability: "suitable_under_conditions" }));
  const result = buildConservativeParlays(candidates);
  const keys = result.parlays.flatMap((parlay) => parlay.selections.map((item) => `${item.fixture_id}:${item.market_family}:${item.line}:${item.selection}`));
  assert.equal(new Set(keys).size, keys.length);
});

test("mejor cuota solo compara mercado, selección y línea vigentes", () => {
  const result = normalizeProviderOdds({ response: [providerItem({ bookmakerId: 1, odd: "1.8" }), providerItem({ bookmakerId: 2, odd: "2.0" }), providerItem({ bookmakerId: 3, odd: "2.5", value: "Under 2.5" })], fixtureId: 9001, now: "2026-08-20T20:00:00Z" });
  assert.equal(selectBestComparableOdds(result.quotes, { marketFamily: "goals", selection: "Over 2.5", line: "2.5" }).decimal_odds, 2);
});
