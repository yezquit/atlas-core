import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPerformanceInsights
} from "../performance/performanceInsights.js";


test("genera insights con rendimiento positivo y tendencia creciente", () => {
  const result = buildPerformanceInsights({
    player: "Oscar",
    performance: {
      roi: 25
    },
    ranking: {
      position: 1
    },
    trend: {
      direction: "improving"
    }
  });

  assert.equal(result.player, "Oscar");

  assert.deepEqual(result.insights, [
    "Rendimiento económico positivo.",
    "El rendimiento reciente muestra mejora.",
    "Actualmente ocupa la posición 1 del ranking."
  ]);
});


test("detecta rendimiento negativo y tendencia descendente", () => {
  const result = buildPerformanceInsights({
    player: "Jugador 2",
    performance: {
      roi: -10
    },
    ranking: {
      position: 5
    },
    trend: {
      direction: "declining"
    }
  });

  assert.ok(
    result.insights.includes(
      "Rendimiento económico negativo."
    )
  );

  assert.ok(
    result.insights.includes(
      "El rendimiento reciente muestra caída."
    )
  );
});


test("maneja ausencia de datos", () => {
  const result = buildPerformanceInsights({
    player: "Sin datos"
  });

  assert.deepEqual(result.insights, [
    "Sin datos suficientes para generar análisis."
  ]);
});
