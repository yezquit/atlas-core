import test from "node:test";
import assert from "node:assert/strict";

import { calibrateConfidence } from "../modules/confidenceCalibration.js";
import { applyFiscalImpact } from "../modules/fiscalImpact.js";
import { runFiscalReview } from "../modules/fiscalEngine.js";
import { coordinateGates } from "../modules/gateCoordinator.js";
import { runDecisionEngine } from "../modules/decisionEngine.js";
import { buildDirectorAtlasVerdict } from "../modules/directorAtlas.js";
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

test("el uso parlay no degrada la evaluación individual", () => {
  const common = {
    scenario: { resolvedCompetition: { resolved: true } },
    specialistReports: { reports: [] },
    fiscalReview: {
      fiscalStatus: "Sin objeción crítica",
      missingData: [],
      objections: [],
    },
  };
  const simple = runDecisionEngine({
    ...common,
    analysisInput: { mercado: "goles", uso: "simple" },
  });
  const parlay = runDecisionEngine({
    ...common,
    analysisInput: { mercado: "goles", uso: "parlay" },
  });

  assert.equal(parlay.confidence, simple.confidence);
  assert.equal(parlay.fragility, simple.fragility);
  assert.equal(parlay.temporalStatus, simple.temporalStatus);
  assert.equal(parlay.parlayStatus, PARLAY_STATUS.UNSUPPORTED);
});

test("DirectorAtlas es prudente, conserva línea/cuota y no inventa probabilidad", () => {
  const verdict = buildDirectorAtlasVerdict({
    gateCoordinator: {
      status: POLICY_STATUS.PRELIMINARY,
      finalStatus: POLICY_STATUS.PRELIMINARY,
      canRecommend: false,
      primaryReason: "Evidencia preliminar",
      requiredAction: "Validar evidencia restante.",
    },
    marketGate: {
      gateStatus: "preliminary",
      canRecommend: false,
      requiredAction: "Validar datos reportados.",
      summary: "Mercado preliminar.",
    },
    marketDataCoverage: {
      coverageLevel: "covered",
      coverageStatus: "Cubierto",
      marketLabel: "Tarjetas",
      missingExternalData: ["Promedio arbitral"],
    },
    realFixtureLookup: {
      status: "confirmed",
      selectedFixture: { fixtureId: 1 },
    },
    realFixtureStatistics: {
      statistics: { qualityFlags: { hasStatistics: true } },
    },
    sourceConfidence: { informationScore: "60%", informationQuality: "Media" },
    confidenceCalibration: {
      technicalSupport: 65,
      estimatedProbability: null,
      probabilityStatus: "unavailable",
      canRecommend: false,
    },
    fiscalImpact: {
      adjustedTechnicalSupport: 60,
      blocksRecommendation: false,
      blocksParlay: true,
      fiscalLevel: "clear",
    },
    refereeProfile: { sourceImpact: { shouldLimitConfidence: false } },
    teamRecentProfile: { sourceImpact: { shouldLimitConfidence: false } },
    marketLineContext: {
      status: "available",
      lineText: "Más de 4.5",
      oddsText: "1.85",
      blocksDecision: false,
    },
    complementarySourceCoverage: { blocksDecision: false },
    analysisInput: { mercado: "tarjetas", uso: "parlay" },
  });

  assert.equal(verdict.contract, "DirectorVerdict");
  assert.equal(verdict.estimatedProbability, null);
  assert.equal(verdict.probabilityStatus, "unavailable");
  assert.equal(verdict.parlayStatus, PARLAY_STATUS.UNSUPPORTED);
  assert.equal(verdict.canRecommend, false);
  assert.match(verdict.minimumAcceptableOdds, /Más de 4\.5/);
  assert.match(verdict.minimumAcceptableOdds, /1\.85/);
  assert.equal(
    verdict.requiredConditions.some((item) =>
      /agregar.*línea|agregar.*cuota/i.test(item)
    ),
    false
  );
});

test("DirectorAtlas no confirma ni autoriza un fixture ambiguo", () => {
  const verdict = buildDirectorAtlasVerdict({
    gateCoordinator: {
      status: POLICY_STATUS.READY,
      finalStatus: POLICY_STATUS.READY,
      canRecommend: true,
    },
    marketGate: { gateStatus: "ready", canRecommend: true },
    marketDataCoverage: { coverageLevel: "covered", missingExternalData: [] },
    realFixtureLookup: {
      status: "ambiguous",
      matches: [{ fixtureId: 1 }, { fixtureId: 2 }],
      selectedFixture: null,
    },
    confidenceCalibration: {
      technicalSupport: 80,
      canRecommend: false,
    },
    fiscalImpact: { blocksRecommendation: false, fiscalLevel: "clear" },
    marketLineContext: {
      status: "available",
      lineText: "2.5",
      oddsText: "1.90",
      blocksDecision: false,
    },
    complementarySourceCoverage: { blocksDecision: false },
    analysisInput: { mercado: "goles", uso: "analisis" },
  });

  assert.match(verdict.verdict, /ambiguo/i);
  assert.equal(verdict.canRecommend, false);
  assert.equal(
    verdict.mainReasons.some((reason) => /no se presenta como confirmada/i.test(reason)),
    true
  );
});
