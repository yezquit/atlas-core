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
  // decision_frontier.recommended sigue siendo obligatorio: fixture 2 queda
  // fuera pese a su alta probabilidad porque no es la línea representativa
  // de su grupo (recommended=false). Fixture 4 sigue fuera por
  // technicalSupport<58 (umbral real, no tocado). Entre los que SÍ
  // califican, orden por estimated_probability descendente: 3 (0.82) antes
  // que 1 (0.71).
  assert.deepEqual(shortlist.map((candidate) => candidate.fixtureId), [3, 1]);
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

// Contrato de dos niveles: (1) decision_frontier.recommended elige, DENTRO
// de cada grupo fixture_id+market_family+direction, la línea técnicamente
// representativa (evita que una línea extrema gane solo por probabilidad
// altísima); (2) entre esas líneas recommended de todas las familias, el
// orden visible es estimated_probability descendente, sin prioridad fija.
function recommendedCandidate(candidateId, marketFamily, fixtureId, estimatedProbability, overrides = {}) {
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
    // Ancho > 0.35 a propósito: demuestra que el tope absoluto de
    // incertidumbre sigue sin decidir qué entra al shortlist.
    uncertaintyLow: 0.3,
    uncertaintyHigh: 0.75,
    decisionFrontier: { recommended: true, status: "eligible" },
    ...overrides,
  };
}

test("1. dentro de un mismo grupo fixture+family+direction compite la línea decision_frontier.recommended, no la más extrema por probabilidad", () => {
  const extremeButNotRecommended = {
    fixtureId: 400, candidate_id: "goals:over:1.5", market_family: "goals", direction: "over", line: 1.5,
    estimatedProbability: 0.90, sportsScore: 60,
    decisionFrontier: { recommended: false, status: "eligible" },
    selectionQuality: 70, technicalSupport: 65, uncertaintyLow: 0.05, uncertaintyHigh: 0.15,
  };
  const representativeRecommended = recommendedCandidate("goals:over:2.5", "goals", 400, 0.72, {
    uncertaintyLow: 0.3, uncertaintyHigh: 0.6,
  });
  const shortlist = buildJourneyRecommendationShortlist([extremeButNotRecommended, representativeRecommended]);
  assert.deepEqual(shortlist.map((candidate) => candidate.candidate_id), ["goals:over:2.5"]);
});

test("2. entre las líneas recommended de varias familias, el orden es estimated_probability DESC, sin prioridad fija por familia", () => {
  const catalogue = [
    recommendedCandidate("goals-rec", "goals", 401, 0.69),
    recommendedCandidate("cards-rec", "cards", 402, 0.72),
    recommendedCandidate("corners-rec", "corners", 403, 0.66),
    recommendedCandidate("total_shots-rec", "total_shots", 404, 0.75),
  ];
  const shortlist = buildJourneyRecommendationShortlist(catalogue);
  assert.deepEqual(
    shortlist.map((candidate) => candidate.candidate_id),
    ["total_shots-rec", "cards-rec", "goals-rec", "corners-rec"]
  );
});

test("3. una familia con decision_frontier.recommended=true y width>0.35 no desaparece del shortlist solo por el ancho", () => {
  const wideButRecommended = recommendedCandidate("cards-wide", "cards", 500, 0.70, {
    uncertaintyLow: 0.1, uncertaintyHigh: 0.8, // width 0.7
  });
  const shortlist = buildJourneyRecommendationShortlist([wideButRecommended]);
  assert.equal(shortlist.length, 1);
  assert.equal(shortlist[0].candidate_id, "cards-wide");
});

test("4. ninguna familia tiene prioridad fija: el orden no depende del orden de entrada, solo de estimated_probability", () => {
  const catalogueA = [
    recommendedCandidate("goals-x", "goals", 601, 0.55),
    recommendedCandidate("corners-x", "corners", 602, 0.80),
  ];
  const catalogueB = [
    recommendedCandidate("corners-x", "corners", 602, 0.80),
    recommendedCandidate("goals-x", "goals", 601, 0.55),
  ];
  const shortlistA = buildJourneyRecommendationShortlist(catalogueA);
  const shortlistB = buildJourneyRecommendationShortlist(catalogueB);
  assert.deepEqual(shortlistA.map((candidate) => candidate.candidate_id), ["corners-x", "goals-x"]);
  assert.deepEqual(shortlistB.map((candidate) => candidate.candidate_id), ["corners-x", "goals-x"]);
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
