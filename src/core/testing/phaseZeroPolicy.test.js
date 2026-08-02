import test from "node:test";
import assert from "node:assert/strict";

import { calibrateConfidence } from "../modules/confidenceCalibration.js";
import { applyFiscalImpact } from "../modules/fiscalImpact.js";
import { runFiscalReview } from "../modules/fiscalEngine.js";
import { coordinateGates } from "../modules/gateCoordinator.js";
import { PARLAY_STATUS, POLICY_STATUS } from "../contracts/atlasContracts.js";

test("un bloqueo de cualquier gate prevalece sobre el otro gate", () => {
  const validationBlocked = coordinateGates({
    validationGate: { gateStatus: "blocked", reason: "Falta crítica" },
    marketGate: { gateStatus: "ready", canRecommend: true },
  });
  const marketBlocked = coordinateGates({
    validationGate: { gateStatus: "ready", canRecommend: true },
    marketGate: { gateStatus: "blocked", reason: "Sin cobertura" },
  });

  for (const decision of [validationBlocked, marketBlocked]) {
    assert.equal(decision.status, POLICY_STATUS.BLOCKED);
    assert.equal(decision.canAnalyze, false);
    assert.equal(decision.canRecommend, false);
    assert.equal(decision.parlayStatus, PARLAY_STATUS.UNSUPPORTED);
  }
});

test("la calibración no genera una probabilidad heurística", () => {
  const calibration = calibrateConfidence({
    technicalConfidence: { technicalScore: 92 },
    sourceConfidence: { informationScore: 88 },
    marketGate: { gateStatus: "ready" },
    marketDataCoverage: { coverageLevel: "covered" },
    realFixtureLookup: { selectedFixture: { fixtureId: 10 } },
    realFixtureStatistics: {
      statistics: { qualityFlags: { hasStatistics: true } },
    },
    marketFocusedStats: { primaryMissing: [] },
    gateCoordinator: { canRecommend: true },
  });

  assert.equal(calibration.rawEstimatedProbability, null);
  assert.equal(calibration.estimatedProbability, null);
  assert.equal(calibration.probabilityStatus, "unavailable");
  assert.equal(calibration.maxEstimatedProbability, null);
  assert.equal(calibration.canRecommend, false);
});

test("seleccionar parlay no crea una objeción fiscal circular", () => {
  const common = {
    scenario: { resolvedCompetition: { resolved: true } },
    specialistReports: { reports: [] },
  };
  const singleReview = runFiscalReview({
    ...common,
    analysisInput: { uso: "apuesta_simple", mercado: "goles" },
  });
  const parlayReview = runFiscalReview({
    ...common,
    analysisInput: { uso: "parlay", mercado: "goles" },
  });

  assert.equal(parlayReview.severityScore, singleReview.severityScore);
  assert.deepEqual(parlayReview.objections, singleReview.objections);
  assert.equal(parlayReview.parlayStatus, PARLAY_STATUS.UNSUPPORTED);
});

test("FiscalImpact no mezcla riesgo operativo con probabilidad deportiva", () => {
  const impact = applyFiscalImpact({
    fiscalReview: { fiscalStatus: "Sin objeción crítica", objections: [] },
    confidenceCalibration: {
      technicalSupport: 80,
      estimatedProbability: 73,
    },
    gateCoordinator: { canRecommend: true },
  });

  assert.equal(impact.adjustedTechnicalSupport, 80);
  assert.equal(impact.originalEstimatedProbability, null);
  assert.equal(impact.adjustedEstimatedProbability, null);
  assert.equal(impact.parlayStatus, PARLAY_STATUS.UNSUPPORTED);
});
