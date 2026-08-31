import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { analyzeOperationalFixture } from "../services/operationalAnalysisService.js";
import { buildSimpleDirectorPresentation } from "../modules/directorAtlas.js";

// Cierre del análisis individual: (1) las explicaciones económicas
// intermedias (sports_price_conclusion) nunca usan las voces oficiales de
// DirectorAtlas (SÍ/ESPERAR/NO), (2) el edge nunca se calcula con Solidez
// Atlas (sports_score es una métrica independiente), y (3) el layout de
// "PROBABILIDAD ESTIMADA ATLAS" ya no rompe palabras letra por letra.
const NOW = "2026-08-01T12:00:00.000Z";
const FIXTURE_ID = 90_003;
const clientPath = new URL("../../app/atlas-functional-client.js", import.meta.url);
const cssPath = new URL("../../app/globals.css", import.meta.url);

function buildPreviousVersion({ marketFamily, line, direction, selectedProbability, oppositeProbability, uncertaintyLow, uncertaintyHigh, confidenceScore, sportsScore, sampleSize = 20 }) {
  const oppositeDirection = direction === "over" ? "under" : "over";
  return {
    analysis_id: `prev-${marketFamily}-${line}-${direction}`,
    fixture_id: FIXTURE_ID,
    phase: "day_before",
    line_origin: "user_selected",
    gemini_context: null,
    analysis_confidence: { analysis_confidence_score: confidenceScore, confidence_label: confidenceScore >= 75 ? "alta" : "media" },
    evidence: [],
    odds: [],
    active_quote: null,
    preliminary_probability: {
      point_estimate: selectedProbability,
      probability_status: "preliminary",
      uncertainty_low: uncertaintyLow,
      uncertainty_high: uncertaintyHigh,
      sample_size_effective: sampleSize,
      limitations: [],
    },
    director: {
      market_evaluated: { family: marketFamily, label: marketFamily === "cards" ? "Tarjetas" : "Remates totales" },
      selection: `${direction === "over" ? "Más de" : "Menos de"} ${line}`,
      line,
      fixture: {
        fixture_id: FIXTURE_ID,
        home_team: "Independiente", away_team: "Gimnasia M.",
        kickoff_utc: "2026-08-10T20:00:00.000Z", kickoff_local: null, timezone: "America/Bogota",
        local_calendar_date: "2026-08-10", competition: "Primera A", season: 2026,
      },
      sports_verdict: { direction, selection: `${direction === "over" ? "Más de" : "Menos de"} ${line}`, sports_score: sportsScore, technical_support_score: 90 },
      side_comparison: {
        contract: "ThresholdSideComparison", version: 1, market_family: marketFamily, line, canonical: true,
        over_probability: direction === "over" ? selectedProbability : oppositeProbability,
        under_probability: direction === "under" ? selectedProbability : oppositeProbability,
        complementary_sum: 1,
        preferred_direction: selectedProbability >= oppositeProbability ? direction : oppositeDirection,
        sports_preferred_side: selectedProbability >= oppositeProbability ? direction : oppositeDirection,
        message: "Lado deportivo preferido calculado.",
        enforce_preference: true,
      },
      reasons: [], risks: [], missing_data: [],
    },
  };
}

function unusedGateway() {
  return new Proxy({}, { get() { throw new Error("El atajo de solo-precio no debe consultar el gateway."); } });
}

async function analyze({ previousVersion, marketFamily, line, direction, selectedOdds, oppositeOdds }) {
  return analyzeOperationalFixture(
    {
      date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026,
      fixtureId: FIXTURE_ID, marketId: marketFamily, analysisMode: "specific", line: String(line), selection: direction,
      reanalysis: true, manualCandidateOdds: [], evaluatePrice: true,
      sourceAnalysisId: previousVersion.analysis_id,
      manualOdds: { bookmaker: "Betano", marketFamily, direction, selection: `${direction === "over" ? "Más de" : "Menos de"} ${line}`, line: String(line), decimalOdds: String(selectedOdds), consultedAt: NOW, timezone: "America/Bogota" },
      manualOppositeOdds: oppositeOdds ? { bookmaker: "Betano", decimalOdds: String(oppositeOdds), consultedAt: NOW, timezone: "America/Bogota" } : null,
    },
    unusedGateway(),
    { now: () => NOW, idFactory: () => "closure-test", previousVersion }
  );
}

test("1. 77.6% / @1.80 / implícita 55.6% / edge +22.1pp: la Solidez 83.9 NO participa en el cálculo del edge", async () => {
  // Caso real: Independiente vs Gimnasia M., Tarjetas Menos de 5.5.
  const previousVersion = buildPreviousVersion({
    marketFamily: "cards", line: 5.5, direction: "under",
    selectedProbability: 0.7761, oppositeProbability: 0.2239,
    uncertaintyLow: 0.65, uncertaintyHigh: 0.85, confidenceScore: 90, sportsScore: 83.9,
  });
  const result = await analyze({ previousVersion, marketFamily: "cards", line: 5.5, direction: "under", selectedOdds: "1.80", oppositeOdds: "1.95" });

  assert.equal(result.marketSelection.primary.probability_percent, 77.6);
  assert.equal(result.marketSelection.primary.sports_score, 83.9);
  assert.equal(result.director.price_assessment.implied_probability, 0.555556);
  assert.equal(result.director.price_assessment.price_gap_percentage_points, 22.1);
  // Lado contrario, tal como en el caso real: 22.4% / @1.95 / implícita 51.3% / -28.9pp.
  assert.equal(result.director.opposite_market.probability_percent, 22.4);
  assert.equal(result.director.opposite_market.price_assessment.implied_probability, 0.512821);
  assert.equal(result.director.opposite_market.price_assessment.price_gap_percentage_points, -28.9);

  // El edge NUNCA se deriva de Solidez: comprobamos que no coincide con la
  // fórmula incorrecta (Solidez - implícita) y sí con la correcta
  // (estimated_probability - implícita).
  const impliedPercent = Number((result.director.price_assessment.implied_probability * 100).toFixed(1));
  const wrongEdgeUsingSolidez = Number((result.marketSelection.primary.sports_score - impliedPercent).toFixed(1));
  assert.notEqual(result.director.price_assessment.price_gap_percentage_points, wrongEdgeUsingSolidez);
});

test("2. 76.1% / @1.30 / implícita 76.9% / edge -0.8pp: brecha pequeña", async () => {
  const previousVersion = buildPreviousVersion({
    marketFamily: "total_shots", line: 25.5, direction: "over",
    selectedProbability: 0.761, oppositeProbability: 0.239,
    uncertaintyLow: 0.60, uncertaintyHigh: 0.90, confidenceScore: 70, sportsScore: 70,
  });
  const result = await analyze({ previousVersion, marketFamily: "total_shots", line: 25.5, direction: "over", selectedOdds: "1.30" });
  assert.equal(result.director.price_assessment.implied_probability, 0.769231);
  assert.equal(result.director.price_assessment.price_gap_percentage_points, -0.8);
  assert.equal(result.director.price_assessment.status, "unfavorable");
});

test("3. 40.3% / @1.82 / implícita 54.9% / edge -14.6pp: brecha grande", async () => {
  const previousVersion = buildPreviousVersion({
    marketFamily: "total_shots", line: 25.5, direction: "under",
    selectedProbability: 0.403, oppositeProbability: 0.597,
    uncertaintyLow: 0.30, uncertaintyHigh: 0.50, confidenceScore: 60, sportsScore: 58,
  });
  const result = await analyze({ previousVersion, marketFamily: "total_shots", line: 25.5, direction: "under", selectedOdds: "1.82" });
  assert.equal(result.director.price_assessment.implied_probability, 0.549451);
  assert.equal(result.director.price_assessment.price_gap_percentage_points, -14.6);
  assert.equal(result.director.price_assessment.status, "unfavorable");
});

test("4. Director SÍ/APOSTAR: ninguna explicación intermedia contiene 'ESPERAR'", async () => {
  const previousVersion = buildPreviousVersion({
    marketFamily: "cards", line: 5.5, direction: "under",
    selectedProbability: 0.7761, oppositeProbability: 0.2239,
    uncertaintyLow: 0.65, uncertaintyHigh: 0.85, confidenceScore: 90, sportsScore: 83.9,
  });
  const result = await analyze({ previousVersion, marketFamily: "cards", line: 5.5, direction: "under", selectedOdds: "1.80", oppositeOdds: "1.95" });
  assert.equal(result.director.price_assessment.status, "favorable_preliminary");

  const presentation = buildSimpleDirectorPresentation(result.director, { geminiItems: [] });
  assert.equal(presentation.analysis_decision.status, "yes");
  assert.equal(presentation.price_decision?.label, "APOSTAR");

  assert.doesNotMatch(result.director.sports_price_conclusion, /ESPERAR/);
  assert.doesNotMatch(JSON.stringify(result.director.opposite_market), /ESPERAR/);
});

test("5. Director ESPERAR: 'ESPERAR' aparece únicamente como decisión oficial, nunca en la explicación intermedia", async () => {
  // Mismo caso favorable del test 1 y 4, pero con un bloqueador Gemini
  // concreto (dato pendiente de publicar): la voz oficial cambia a ESPERAR,
  // la explicación económica intermedia sigue describiendo los mismos
  // números sin usar esa palabra.
  const previousVersion = buildPreviousVersion({
    marketFamily: "cards", line: 5.5, direction: "under",
    selectedProbability: 0.7761, oppositeProbability: 0.2239,
    uncertaintyLow: 0.65, uncertaintyHigh: 0.85, confidenceScore: 90, sportsScore: 83.9,
  });
  const result = await analyze({ previousVersion, marketFamily: "cards", line: 5.5, direction: "under", selectedOdds: "1.80", oppositeOdds: "1.95" });

  const geminiItems = [{ impact: "limiting", kind: "other", summary: "La alineación titular todavía no ha sido publicada; dato pendiente de confirmar." }];
  const presentation = buildSimpleDirectorPresentation(result.director, { geminiItems });
  assert.equal(presentation.analysis_decision.status, "wait");
  assert.equal(presentation.analysis_decision.label, "ESPERAR");

  // La explicación económica intermedia no cambia por el bloqueo de Gemini
  // (Gemini es posterior) y sigue sin usar la voz oficial.
  assert.doesNotMatch(result.director.sports_price_conclusion, /ESPERAR/);
});

test("6. layout: la tarjeta 'PROBABILIDAD ESTIMADA ATLAS' ya no fuerza columnas fijas ni rompe palabras letra por letra", async () => {
  const css = await readFile(cssPath, "utf8");
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /className="p2-director-metrics"/);
  assert.match(css, /\.p2-director-metrics\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(150px,\s*1fr\)\)/);
  const metricsBlock = css.match(/\.p2-director-metrics small,\s*\n\.p2-director-metrics strong\s*\{[\s\S]*?\}/);
  assert.ok(metricsBlock, "debe existir la regla de small/strong dentro de .p2-director-metrics");
  assert.doesNotMatch(metricsBlock[0], /overflow-wrap:\s*anywhere/);
  assert.match(metricsBlock[0], /overflow-wrap:\s*break-word/);
});
