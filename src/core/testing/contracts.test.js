import test from "node:test";
import assert from "node:assert/strict";

import {
  EVIDENCE_STATUS,
  FIXTURE_STATUS,
  MARKET_STATUS,
  PARLAY_STATUS,
  POLICY_STATUS,
  PROBABILITY_STATUS,
  createAnalysisRequest,
  createDirectorVerdict,
  createEvidenceItem,
  createFixtureResult,
  createMarketAssessment,
  createPolicyDecision,
} from "../contracts/atlasContracts.js";

test("AnalysisRequest normaliza entradas opcionales", () => {
  const request = createAnalysisRequest({
    partido: "  Equipo A vs Equipo B ",
    fecha: "2026-08-01",
    temporada: 2026,
  });

  assert.equal(request.contract, "AnalysisRequest");
  assert.equal(request.partido, "Equipo A vs Equipo B");
  assert.equal(request.fecha, "2026-08-01");
  assert.equal(request.temporada, "2026");
  assert.equal(request.lineaMercado, null);
});

test("FixtureResult ambiguo nunca expone fixture confirmado", () => {
  const result = createFixtureResult({
    status: FIXTURE_STATUS.AMBIGUOUS,
    matches: [{ fixtureId: 1 }, { fixtureId: 2 }],
    selectedFixture: { fixtureId: 1 },
  });

  assert.equal(result.ambiguous, true);
  assert.equal(result.selectedFixture, null);
});

test("EvidenceItem usa estados de datos estables", () => {
  const evidence = createEvidenceItem({
    id: "fixture-1",
    type: "fixture",
    status: EVIDENCE_STATUS.VERIFIED,
  });

  assert.equal(evidence.status, "verified");
});

test("MarketAssessment no inventa probabilidad", () => {
  const assessment = createMarketAssessment({
    status: MARKET_STATUS.PRELIMINARY,
    market: "tarjetas",
    estimatedProbability: 50,
    probabilityStatus: PROBABILITY_STATUS.UNAVAILABLE,
  });

  assert.equal(assessment.estimatedProbability, null);
  assert.equal(assessment.probabilityStatus, "unavailable");
});

test("PolicyDecision bloqueado no puede autorizar", () => {
  const decision = createPolicyDecision({
    status: POLICY_STATUS.BLOCKED,
    canAnalyze: true,
    canRecommend: true,
  });

  assert.equal(decision.canAnalyze, false);
  assert.equal(decision.canRecommend, false);
  assert.equal(decision.parlayStatus, PARLAY_STATUS.UNSUPPORTED);
});

test("DirectorVerdict conserva probabilidad unavailable y parlay unsupported", () => {
  const verdict = createDirectorVerdict({
    verdict: "No apostar todavía.",
    market: "tarjetas",
    estimatedProbability: 60,
    probabilityStatus: PROBABILITY_STATUS.UNAVAILABLE,
    policyStatus: POLICY_STATUS.LIMITED,
  });

  assert.equal(verdict.estimatedProbability, null);
  assert.equal(verdict.probabilityStatus, "unavailable");
  assert.equal(verdict.parlayStatus, "unsupported");
});
