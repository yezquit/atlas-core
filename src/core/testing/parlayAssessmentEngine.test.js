import assert from "node:assert/strict";
import test from "node:test";

import {
  assessParlayRisk
} from "../intelligence/parlayAssessmentEngine.js";


test("evalúa soñadora como riesgo alto con soporte", () => {

  const result = assessParlayRisk({
    totalOdds: 18.7,

    selections: [
      {
        market: "goals",
        support: true
      },
      {
        market: "cards",
        support: true
      },
      {
        market: "shots",
        support: true
      },
      {
        market: "corners",
        support: true
      },
      {
        market: "goals",
        support: true
      },
      {
        market: "winner",
        support: true
      },
      {
        market: "shots",
        support: true
      }
    ]
  });


  assert.equal(
    result.type,
    "parlay_assessment"
  );

  assert.equal(
    result.riskLevel,
    "high"
  );

  assert.ok(
    result.strengths.length > 0
  );

  assert.ok(
    result.risks.length > 0
  );

});


test("rechaza entrada inválida", () => {

  const result =
    assessParlayRisk(null);

  assert.equal(
    result,
    null
  );

});
