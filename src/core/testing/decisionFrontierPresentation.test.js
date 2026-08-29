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
    { fixtureId: 1, decisionFrontier: { recommended: true, status: "eligible", reason: "Línea útil." }, selectionQuality: 71, technicalSupport: 70, uncertaintyLow: 0.5, uncertaintyHigh: 0.7 },
    { fixtureId: 2, decisionFrontier: { recommended: false, status: "eligible" }, selectionQuality: 99, technicalSupport: 90, uncertaintyLow: 0.5, uncertaintyHigh: 0.6 },
    { fixtureId: 3, decisionFrontier: { recommended: true, status: "eligible", reason: "Línea útil." }, selectionQuality: 82, technicalSupport: 75, uncertaintyLow: 0.5, uncertaintyHigh: 0.7 },
    { fixtureId: 4, decisionFrontier: { recommended: true, status: "eligible" }, selectionQuality: 99, technicalSupport: 40, uncertaintyLow: 0.5, uncertaintyHigh: 0.6 },
  ];
  const shortlist = buildJourneyRecommendationShortlist(catalogue);
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
