import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { buildJourneyRecommendationShortlist, toJourneyCandidate } from "../services/sportsIntelligenceService.js";

const clientPath = new URL("../../app/atlas-functional-client.js", import.meta.url);

test("la cuota exacta queda disponible después de Director y no requiere hora manual", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /const quoteTargetReady = Boolean\(quoteTarget\?\.market_family/);
  assert.match(source, /EVALUAR CUOTA ACTUAL/);
  assert.match(source, /Cuota decimal actual/);
  assert.match(source, /Hora de consulta \(opcional\)/);
  assert.match(source, /manualOdds: reanalysis && manualQuoteReady/);
  assert.match(source, /direction: reportedDirection/);
  assert.match(source, /line: requestedLine/);
});

test("Jornada mantiene catálogo completo y separa recomendaciones de Decision Frontier", async () => {
  const catalogue = [
    { fixtureId: 1, estimatedProbability: 0.71, decisionFrontier: { recommended: true, status: "eligible", reason: "Línea útil." }, selectionQuality: 71, technicalSupport: 70, uncertaintyLow: 0.5, uncertaintyHigh: 0.7 },
    { fixtureId: 2, estimatedProbability: 0.99, decisionFrontier: { recommended: false, status: "eligible" }, selectionQuality: 99, technicalSupport: 90, uncertaintyLow: 0.5, uncertaintyHigh: 0.6 },
    { fixtureId: 3, estimatedProbability: 0.82, decisionFrontier: { recommended: true, status: "eligible", reason: "Línea útil." }, selectionQuality: 82, technicalSupport: 75, uncertaintyLow: 0.5, uncertaintyHigh: 0.7 },
    { fixtureId: 4, estimatedProbability: 0.99, decisionFrontier: { recommended: true, status: "eligible" }, selectionQuality: 99, technicalSupport: 40, uncertaintyLow: 0.5, uncertaintyHigh: 0.6 },
  ];
  const shortlist = buildJourneyRecommendationShortlist(catalogue);
  // decision_frontier.recommended=false ya NO excluye (fixture 2 califica:
  // frontier.status eligible, selectionQuality 99, support 90); fixture 4
  // sigue fuera por technicalSupport<58 (umbral real, no tocado). Orden por
  // estimated_probability descendente entre los que SÍ califican: 2 (0.99),
  // 3 (0.82), 1 (0.71).
  assert.deepEqual(shortlist.map((candidate) => candidate.fixtureId), [2, 3, 1]);
  assert.equal(catalogue.length, 4);
  assert.equal(buildJourneyRecommendationShortlist([{ fixtureId: 9, decisionFrontier: { recommended: true, status: "eligible" }, selectionQuality: 40, technicalSupport: 40, uncertaintyLow: 0.2, uncertaintyHigh: 0.7 }]).length, 0);
  assert.equal(buildJourneyRecommendationShortlist([{ fixtureId: 10, probabilityClassification: "RIESGOSA", priceStatus: "unavailable", decisionFrontier: { recommended: true, status: "eligible" }, selectionQuality: 80, technicalSupport: 80, uncertaintyLow: 0.4, uncertaintyHigh: 0.6 }]).length, 0);
  assert.equal(buildJourneyRecommendationShortlist([{ fixtureId: 11, probabilityClassification: "RIESGOSA", priceStatus: "verified_current", decisionEconomics: { status: "available", edge: 0.03, expected_value: 0.05 }, decisionFrontier: { recommended: true, status: "eligible" }, selectionQuality: 80, technicalSupport: 80, uncertaintyLow: 0.4, uncertaintyHigh: 0.6 }]).length, 1);

  const source = await readFile(clientPath, "utf8");
  assert.match(source, /RECOMENDADAS POR ATLAS/);
  assert.match(source, /OTRAS OPCIONES ANALIZADAS/);
  assert.match(source, /journey\.recommendedCandidates/);
  assert.match(source, /ATLAS no encontró selecciones con suficiente respaldo/);
});

test("A. una línea con mayor probabilidad entra al shortlist aunque otra línea hermana sea la marcada decision_frontier.recommended", () => {
  const recommendedButLowerProbability = {
    fixtureId: 100, candidate_id: "goals:over:2.5", market_family: "goals", direction: "over", line: 2.5,
    estimatedProbability: 0.55, sportsScore: 60,
    decisionFrontier: { recommended: true, status: "eligible" },
    // selectionQuality por debajo de 60: sigue siendo un umbral real, no el
    // veto que se elimina aquí (recommended/width).
    selectionQuality: 45, technicalSupport: 40, uncertaintyLow: 0.4, uncertaintyHigh: 0.55,
  };
  const higherProbabilityNotRecommended = {
    fixtureId: 100, candidate_id: "goals:over:1.5", market_family: "goals", direction: "over", line: 1.5,
    estimatedProbability: 0.85, sportsScore: 88,
    decisionFrontier: { recommended: false, status: "eligible" },
    selectionQuality: 90, technicalSupport: 92, uncertaintyLow: 0.05, uncertaintyHigh: 0.15,
  };
  const shortlist = buildJourneyRecommendationShortlist([recommendedButLowerProbability, higherProbabilityNotRecommended]);
  assert.ok(
    shortlist.some((candidate) => candidate.candidate_id === "goals:over:1.5"),
    "la línea de mayor probabilidad debe entrar aunque no sea la 'recommended' de su grupo"
  );
  assert.equal(shortlist[0].candidate_id, "goals:over:1.5");
});

function safeMultiFamilyCandidate(candidateId, marketFamily, fixtureId, estimatedProbability) {
  return {
    fixtureId,
    candidate_id: candidateId,
    market_family: marketFamily,
    direction: "over",
    line: 1.5,
    estimatedProbability,
    sportsScore: 80,
    selectionQuality: 75,
    technicalSupport: 70,
    // Ancho > 0.35 a propósito en todos: demuestra que el tope absoluto de
    // incertidumbre ya no decide qué entra al shortlist.
    uncertaintyLow: 0.3,
    uncertaintyHigh: 0.75,
    decisionFrontier: { recommended: false, status: "eligible" },
  };
}

test("B. escenario 76/71.5/70/69/68/60: orden exacto por estimated_probability, sin prioridad de familia", () => {
  const catalogue = [
    safeMultiFamilyCandidate("goals-A", "goals", 201, 0.76),
    safeMultiFamilyCandidate("cards-A", "cards", 202, 0.715),
    safeMultiFamilyCandidate("corners-A", "corners", 203, 0.70),
    safeMultiFamilyCandidate("total_shots-A", "total_shots", 204, 0.69),
    safeMultiFamilyCandidate("goals-B", "goals", 205, 0.68),
    safeMultiFamilyCandidate("goals-C", "goals", 206, 0.60),
  ];
  const byId = new Map(catalogue.map((candidate) => [candidate.candidate_id, candidate]));

  const shortlist = buildJourneyRecommendationShortlist(catalogue);

  assert.deepEqual(
    shortlist.map((candidate) => candidate.candidate_id),
    ["goals-A", "cards-A", "corners-A", "total_shots-A", "goals-B", "goals-C"]
  );
  assert.equal(catalogue.length, 6, "el shortlist no debe alterar el catálogo de entrada");

  // El shortlist no cambia identidad ni métricas deportivas de ningún
  // candidato: solo decide quién entra y en qué orden.
  for (const candidate of shortlist) {
    const original = byId.get(candidate.candidate_id);
    assert.equal(candidate.market_family, original.market_family);
    assert.equal(candidate.direction, original.direction);
    assert.equal(candidate.line, original.line);
    assert.equal(candidate.estimatedProbability, original.estimatedProbability);
    assert.equal(candidate.sportsScore, original.sportsScore);
  }
});

test("C. una familia no desaparece del shortlist porque su única línea recommended tenga width>0.35 si otra línea hermana elegible tiene mejor probabilidad", () => {
  const recommendedNarrowButWide = {
    fixtureId: 300, candidate_id: "cards:over:3.5", market_family: "cards", direction: "over", line: 3.5,
    estimatedProbability: 0.55, sportsScore: 75,
    decisionFrontier: { recommended: true, status: "eligible" },
    selectionQuality: 78, technicalSupport: 65, uncertaintyLow: 0.2, uncertaintyHigh: 0.7, // width 0.5
  };
  const siblingHigherProbability = {
    fixtureId: 300, candidate_id: "cards:over:2.5", market_family: "cards", direction: "over", line: 2.5,
    estimatedProbability: 0.80, sportsScore: 82,
    decisionFrontier: { recommended: false, status: "eligible" },
    selectionQuality: 70, technicalSupport: 68, uncertaintyLow: 0.1, uncertaintyHigh: 0.5, // width 0.4
  };
  const shortlist = buildJourneyRecommendationShortlist([recommendedNarrowButWide, siblingHigherProbability]);
  assert.ok(
    shortlist.some((candidate) => candidate.market_family === "cards"),
    "cards no debe desaparecer del shortlist solo porque su línea 'recommended' tenga width>0.35"
  );
  assert.equal(shortlist[0].candidate_id, "cards:over:2.5");
});

test("la evidencia de Jornada permanece aislada por fixture_id", () => {
  const makeCandidate = (id, reason) => toJourneyCandidate({
    analysis: { fixture: { fixtureId: id, competition: { season: 2026 }, teams: { home: { name: `A${id}` }, away: { name: `B${id}` } }, date: {} }, competition: { localName: "Liga" }, marketAssessments: [] },
    candidate: { market_family: "goals", direction: "over", selection: "Over 1.5", line: 1.5, simple_sports_reasons: [reason], limitations: [], rank_reason: [] },
    comparison: { families_compared: [], best_by_family: [], why_market_won: reason },
  });
  const a = makeCandidate(101, "EVIDENCIA_A");
  const b = makeCandidate(202, "EVIDENCIA_B");
  assert.equal(a.fixtureEvidence.fixture_id, 101);
  assert.equal(b.fixtureEvidence.fixture_id, 202);
  assert.deepEqual(a.reasons, ["EVIDENCIA_A"]);
  assert.deepEqual(b.reasons, ["EVIDENCIA_B"]);
  assert.doesNotMatch(a.fixtureEvidence.explanation, /EVIDENCIA_B/);
  assert.doesNotMatch(b.fixtureEvidence.explanation, /EVIDENCIA_A/);
});
