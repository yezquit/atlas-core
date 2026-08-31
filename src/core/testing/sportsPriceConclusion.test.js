import test from "node:test";
import assert from "node:assert/strict";

import { analyzeOperationalFixture } from "../services/operationalAnalysisService.js";

// buildSportsPriceConclusion (directorAtlas.js) distingue (A) edge negativo,
// (B) edge positivo con evidencia insuficiente ("marginal_positive": nunca se
// reporta como "sin valor") y (C) favorable. No se tocó evaluateMarketPrice,
// sus umbrales, estimated_probability, sports_score ni Journey/Parlay/
// Soñadora. Usamos analyzeOperationalFixture con un previousVersion sintético
// (mismo mecanismo que priceOnlySnapshotResult) para fijar con precisión el
// confidenceScore/uncertaintyWidth de cada escenario.
const NOW = "2026-08-01T12:00:00.000Z";
const FIXTURE_ID = 90_002;

function buildPreviousVersion({ underProbability, overProbability, uncertaintyLow, uncertaintyHigh, confidenceScore, sampleSize = 20 }) {
  return {
    analysis_id: `prev-${underProbability}-${overProbability}`,
    fixture_id: FIXTURE_ID,
    phase: "day_before",
    line_origin: "user_selected",
    gemini_context: null,
    analysis_confidence: { analysis_confidence_score: confidenceScore, confidence_label: confidenceScore >= 75 ? "alta" : "media" },
    evidence: [],
    odds: [],
    active_quote: null,
    preliminary_probability: {
      point_estimate: underProbability,
      probability_status: "preliminary",
      uncertainty_low: uncertaintyLow,
      uncertainty_high: uncertaintyHigh,
      sample_size_effective: sampleSize,
      limitations: [],
    },
    director: {
      market_evaluated: { family: "total_shots", label: "Remates totales" },
      selection: "Menos de 25.5",
      line: 25.5,
      fixture: {
        fixture_id: FIXTURE_ID,
        home_team: "Argentinos JRS",
        away_team: "Aldosivi",
        kickoff_utc: "2026-08-10T20:00:00.000Z",
        kickoff_local: null,
        timezone: "America/Bogota",
        local_calendar_date: "2026-08-10",
        competition: "Primera A",
        season: 2026,
      },
      sports_verdict: { direction: "under", selection: "Menos de 25.5", sports_score: 58, technical_support_score: 60 },
      side_comparison: {
        contract: "ThresholdSideComparison", version: 1, market_family: "total_shots", line: 25.5, canonical: true,
        over_probability: overProbability, under_probability: underProbability,
        complementary_sum: Number((overProbability + underProbability).toFixed(4)),
        preferred_direction: overProbability > underProbability ? "over" : "under",
        sports_preferred_side: overProbability > underProbability ? "over" : "under",
        message: `Lado deportivo preferido: ${overProbability > underProbability ? "Over" : "Under"} 25.5.`,
        enforce_preference: true,
      },
      reasons: [], risks: [], missing_data: [],
    },
  };
}

function unusedGateway() {
  return new Proxy({}, { get() { throw new Error("El atajo de solo-precio no debe consultar el gateway."); } });
}

async function analyze({ previousVersion, selectedOdds, oppositeOdds }) {
  return analyzeOperationalFixture(
    {
      date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026,
      fixtureId: FIXTURE_ID, marketId: "total_shots", analysisMode: "specific", line: "25.5", selection: "under",
      reanalysis: true, manualCandidateOdds: [], evaluatePrice: true,
      sourceAnalysisId: previousVersion.analysis_id,
      manualOdds: { bookmaker: "Betano", marketFamily: "total_shots", direction: "under", selection: "Menos de 25.5", line: "25.5", decimalOdds: String(selectedOdds), consultedAt: NOW, timezone: "America/Bogota" },
      manualOppositeOdds: { bookmaker: "Betano", decimalOdds: String(oppositeOdds), consultedAt: NOW, timezone: "America/Bogota" },
    },
    unusedGateway(),
    { now: () => NOW, idFactory: () => "conclusion-test", previousVersion }
  );
}

test("1. selected unfavorable + opposite marginal con edge positivo: describe la brecha de cada lado sin usar voces oficiales del Director", async () => {
  // Caso real: Under 35.8% @1.82 (edge -19.1pp, unfavorable); Over 64.2% @1.93
  // (edge +12.4pp) pero confidenceScore 60 < 75 -> marginal, no favorable.
  const previousVersion = buildPreviousVersion({
    underProbability: 0.358, overProbability: 0.642,
    uncertaintyLow: 0.30, uncertaintyHigh: 0.50, confidenceScore: 60,
  });
  const result = await analyze({ previousVersion, selectedOdds: "1.82", oppositeOdds: "1.93" });
  assert.equal(result.director.price_assessment.status, "unfavorable");
  assert.equal(result.director.opposite_market.price_assessment.status, "marginal");
  assert.ok(result.director.opposite_market.price_assessment.price_gap > 0);
  const conclusion = result.director.sports_price_conclusion;
  assert.match(conclusion, /Menos de 25\.5.*diferencia negativa/);
  assert.match(conclusion, /Más de 25\.5.*diferencia positiva/);
  assert.match(conclusion, /hay valor matemático aparente/);
  // Solo DirectorAtlas puede emitir SÍ/ESPERAR/NO: esta explicación económica
  // intermedia nunca debe usar esas voces ni verbos de recomendación.
  assert.doesNotMatch(conclusion, /ESPERAR/);
  assert.doesNotMatch(conclusion, /recomiendo/i);
  assert.doesNotMatch(conclusion, /\bprefiere\b/i);
  assert.doesNotMatch(conclusion, /ninguna de las dos cuotas ofrece valor suficiente/i);
});

test("2. ambos lados desfavorables: sí puede decir que ninguna cuota ofrece valor suficiente", async () => {
  const previousVersion = buildPreviousVersion({
    underProbability: 0.45, overProbability: 0.55,
    uncertaintyLow: 0.35, uncertaintyHigh: 0.55, confidenceScore: 80,
  });
  // Under 45% @1.90 -> implícita 52.6%, edge negativo. Over 55% @1.70 ->
  // implícita 58.8%, edge negativo (vig del libro > brecha del modelo).
  const result = await analyze({ previousVersion, selectedOdds: "1.90", oppositeOdds: "1.70" });
  assert.equal(result.director.price_assessment.status, "unfavorable");
  assert.equal(result.director.opposite_market.price_assessment.status, "unfavorable");
  assert.equal(result.director.sports_price_conclusion, "Ninguna de las dos cuotas ofrece valor suficiente.");
});

test("3. lado contrario favorable: la explicación lo señala sin usar voces oficiales del Director", async () => {
  const previousVersion = buildPreviousVersion({
    underProbability: 0.30, overProbability: 0.70,
    uncertaintyLow: 0.45, uncertaintyHigh: 0.60, confidenceScore: 85, sampleSize: 20,
  });
  // Over 70% @2.20 -> implícita 45.45%, edge +24.5pp, ancho 0.15<=0.25,
  // confianza 85>=75, muestra 20>=5 -> favorable_preliminary.
  const result = await analyze({ previousVersion, selectedOdds: "1.50", oppositeOdds: "2.20" });
  assert.equal(result.director.opposite_market.price_assessment.status, "favorable_preliminary");
  const conclusion = result.director.sports_price_conclusion;
  assert.match(conclusion, /Más de 25\.5.*relación probabilidad\/precio favorable/);
  assert.doesNotMatch(conclusion, /ESPERAR/);
  assert.doesNotMatch(conclusion, /recomiendo/i);
  assert.doesNotMatch(conclusion, /\bprefiere\b/i);
});

test("4. lado seleccionado favorable: la explicación lo señala sin usar voces oficiales del Director", async () => {
  const previousVersion = buildPreviousVersion({
    underProbability: 0.70, overProbability: 0.30,
    uncertaintyLow: 0.55, uncertaintyHigh: 0.70, confidenceScore: 85, sampleSize: 20,
  });
  // Under 70% @1.60 -> implícita 62.5%, edge +7.5pp, ancho 0.15<=0.25,
  // confianza 85>=75, muestra 20>=5 -> favorable_preliminary.
  const result = await analyze({ previousVersion, selectedOdds: "1.60", oppositeOdds: "2.50" });
  assert.equal(result.director.price_assessment.status, "favorable_preliminary");
  const conclusion = result.director.sports_price_conclusion;
  assert.match(conclusion, /Menos de 25\.5.*relación probabilidad\/precio favorable/);
  assert.doesNotMatch(conclusion, /ESPERAR/);
  assert.doesNotMatch(conclusion, /recomiendo/i);
  assert.doesNotMatch(conclusion, /\bprefiere\b/i);
});
