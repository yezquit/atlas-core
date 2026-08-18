import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDirectorParlayAssessment,
} from "../intelligence/directorParlayIntegration.js";


test("Director recibe evaluación de parlay con riesgo alto", () => {

  const result = buildDirectorParlayAssessment({
    selections: [
      {
        supported: true,
      },
      {
        supported: true,
      },
      {
        supported: true,
      },
      {
        supported: false,
      },
      {
        supported: false,
      },
    ],
  });


  assert.equal(
    result.type,
    "parlay_assessment"
  );

  assert.ok(
    result.riskLevel
  );

  assert.ok(
    result.director_message.includes("Riesgo")
  );
});


test("Director mantiene soporte aunque el riesgo sea alto", () => {

  const result = buildDirectorParlayAssessment({
    legs: [
      {
        supported: true,
      },
      {
        supported: true,
      },
      {
        supported: true,
      },
      {
        supported: true,
      },
      {
        supported: true,
      },
      {
        supported: true,
      },
      {
        supported: true,
      },
    ],
  });


  assert.equal(
    result.supportedSelections,
    7
  );

});
