import test from "node:test";
import assert from "node:assert/strict";

import { analyzeOperationalFixture } from "../services/operationalAnalysisService.js";

// Regresión del bug real de producción: al actualizar la cuota de una línea
// ya analizada (mismo fixture+family+direction+line), el servicio toma el
// atajo "solo precio" (priceOnlySnapshotResult -> snapshotCandidate) que
// reutiliza el snapshot deportivo YA calculado en vez de recalcularlo. Ese
// snapshot no completaba probability_percent/probability_classification, así
// que la UI (que lee marketSelection.primary.probability_percent) mostraba
// "No disponible" pese a que estimated_probability seguía existiendo y la
// economía (implied_probability/edge) se calculaba correctamente a partir de
// preliminary_probability. Este test fija el caso real reportado:
// Argentinos JRS vs Aldosivi, total_shots Under 25.5 @ 40.3%, cuota Betano
// @1.82, lado contrario Over 25.5 @ 59.7% con cuota @1.93.
const NOW = "2026-08-01T12:00:00.000Z";
const FIXTURE_ID = 90_001;

function buildPreviousVersion() {
  return {
    analysis_id: "prev-argentinos-aldosivi",
    fixture_id: FIXTURE_ID,
    phase: "day_before",
    line_origin: "user_selected",
    gemini_context: null,
    analysis_confidence: { analysis_confidence_score: 80, confidence_label: "alta" },
    evidence: [],
    odds: [],
    active_quote: null,
    preliminary_probability: {
      point_estimate: 0.403,
      probability_status: "preliminary",
      uncertainty_low: 0.30,
      uncertainty_high: 0.50,
      sample_size_effective: 20,
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
      sports_verdict: {
        direction: "under",
        selection: "Menos de 25.5",
        sports_score: 82.4,
        technical_support_score: 90,
      },
      side_comparison: {
        contract: "ThresholdSideComparison",
        version: 1,
        market_family: "total_shots",
        line: 25.5,
        canonical: true,
        over_probability: 0.597,
        under_probability: 0.403,
        complementary_sum: 1,
        preferred_direction: "over",
        sports_preferred_side: "over",
        message: "Lado deportivo preferido: Over 25.5.",
        enforce_preference: true,
      },
      reasons: [],
      risks: [],
      missing_data: [],
    },
  };
}

function unusedGateway() {
  return new Proxy({}, {
    get() {
      throw new Error("El atajo de solo-precio no debe consultar el gateway: reutiliza el snapshot deportivo existente.");
    },
  });
}

test("price update conserva estimated_probability, probability_percent y sports_score exactos del snapshot deportivo (bug real de producción)", async () => {
  const previousVersion = buildPreviousVersion();
  const result = await analyzeOperationalFixture(
    {
      date: "2026-08-01", timezone: "America/Bogota", competitionKey: "colombiaPrimeraA", season: 2026,
      fixtureId: FIXTURE_ID, marketId: "total_shots", analysisMode: "specific", line: "25.5", selection: "under",
      reanalysis: true, manualCandidateOdds: [], evaluatePrice: true,
      sourceAnalysisId: previousVersion.analysis_id,
      manualOdds: { bookmaker: "Betano", marketFamily: "total_shots", direction: "under", selection: "Menos de 25.5", line: "25.5", decimalOdds: "1.82", consultedAt: NOW, timezone: "America/Bogota" },
      manualOppositeOdds: { bookmaker: "Betano", decimalOdds: "1.93", consultedAt: NOW, timezone: "America/Bogota" },
    },
    unusedGateway(),
    { now: () => NOW, idFactory: () => "price-update-regression", previousVersion }
  );

  assert.equal(result.status, "success");
  assert.equal(result.analysisVersion?.inputs?.price_only_snapshot, true, "debe tomar el atajo de solo-precio, el mismo que produjo el bug real");

  // Selección exacta conservada: nunca sustituida por otra familia/línea.
  assert.equal(result.marketSelection.primary.market_family, "total_shots");
  assert.equal(result.marketSelection.primary.direction, "under");
  assert.equal(result.marketSelection.primary.line, 25.5);

  // La UI lee estos dos campos (marketSelection.primary.probability_percent
  // en InitialAnalysisResult y DirectorResult): antes del fix, probability_percent
  // quedaba undefined pese a que estimated_probability sí existía.
  assert.equal(result.marketSelection.primary.estimated_probability, 0.403);
  assert.equal(result.marketSelection.primary.probability_percent, 40.3);
  assert.ok(Number.isFinite(result.marketSelection.primary.sports_score));
  assert.equal(result.marketSelection.primary.sports_score, 82.4);

  // Economía del lado seleccionado (Under 25.5 @1.82): nunca se usó para
  // recalcular la probabilidad deportiva, solo para compararla con la cuota.
  assert.equal(result.director.price_assessment.implied_probability, 0.549451);
  assert.equal(result.director.price_assessment.price_gap_percentage_points, -14.6);
  assert.equal(result.director.price_assessment.status, "unfavorable");

  // Lado contrario (Over 25.5 @1.93): complemento exacto, nunca inventado.
  const opposite = result.director.opposite_market;
  assert.equal(opposite.direction, "over");
  assert.equal(opposite.line, 25.5);
  assert.equal(opposite.estimated_probability, 0.597);
  assert.equal(opposite.probability_percent, 59.7);
  assert.equal(opposite.price_assessment.implied_probability, 0.518135);
  assert.equal(opposite.price_assessment.price_gap_percentage_points, 7.9);

  // Ninguna probabilidad deportiva se recalculó a partir de las cuotas.
  assert.equal(result.marketSelection.primary.estimated_probability, previousVersion.preliminary_probability.point_estimate);
  assert.equal(opposite.estimated_probability, previousVersion.director.side_comparison.over_probability);
});
