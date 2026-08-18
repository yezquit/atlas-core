import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDreamParlays
} from "../intelligence/dreamParlayEngine.js";


test(
  "crea una soñadora cercana a cuota 20 con siete selecciones",
  () => {
    const candidates = [
      { id: "A", decimalOdds: 1.5 },
      { id: "B", decimalOdds: 1.6 },
      { id: "C", decimalOdds: 1.4 },
      { id: "D", decimalOdds: 1.8 },
      { id: "E", decimalOdds: 1.3 },
      { id: "F", decimalOdds: 1.7 },
      { id: "G", decimalOdds: 1.5 },
    ];

    const result = buildDreamParlays(
      candidates,
      {
        targetOdds: 20,
        selections: 7,
      }
    );

    assert.ok(result.length > 0);
    assert.equal(
      result[0].riskLevel,
      "high"
    );

    assert.equal(
      result[0].type,
      "dream_parlay"
    );
  }
);


test(
  "no inventa cuotas imposibles sin candidatos",
  () => {
    const result =
      buildDreamParlays([]);

    assert.deepEqual(
      result,
      []
    );
  }
);
