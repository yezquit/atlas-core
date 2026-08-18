import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDreamParlays
} from "../intelligence/dreamParlayEngine.js";


test(
  "crea soñadora con cantidad elegida por usuario",
  () => {
    const candidates = Array.from(
      { length: 10 },
      (_, i) => ({
        id: String(i),
        decimalOdds: 1.5
      })
    );

    const result = buildDreamParlays(
      candidates,
      {
        selections: 8
      }
    );

    assert.ok(result.length > 0);
    assert.equal(
      result[0].selections.length,
      8
    );
  }
);


test(
  "permite soñadora mínima de 5",
  () => {
    const candidates = Array.from(
      { length: 5 },
      () => ({
        decimalOdds: 2
      })
    );

    const result =
      buildDreamParlays(
        candidates,
        {
          selections: 5
        }
      );

    assert.ok(result.length > 0);
  }
);


test(
  "rechaza menos de cinco selecciones",
  () => {
    const result =
      buildDreamParlays(
        [],
        {
          selections: 4
        }
      );

    assert.deepEqual(
      result,
      []
    );
  }
);


test(
  "rechaza más de quince selecciones",
  () => {
    const result =
      buildDreamParlays(
        [],
        {
          selections: 16
        }
      );

    assert.deepEqual(
      result,
      []
    );
  }
);
