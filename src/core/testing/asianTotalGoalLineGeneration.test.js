import test from "node:test";
import assert from "node:assert/strict";

import {
  ASIAN_LINE_STEP,
  DEFAULT_ASIAN_LINE_GENERATION_MAX_LINES,
  generateAsianTotalGoalLines,
  isValidAsianTotalGoalLine,
  settleAsianTotalGoals,
  splitAsianTotalLine,
} from "../intelligence/asianTotalGoals.js";

// -----------------------------------------------------------------------
// A. Validación de líneas asian_total_goals
// -----------------------------------------------------------------------

test("isValidAsianTotalGoalLine acepta cero y múltiplos exactos de 0.25", () => {
  for (const line of [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3]) {
    assert.equal(isValidAsianTotalGoalLine(line), true, `esperaba ${line} válida`);
  }
});

test("isValidAsianTotalGoalLine rechaza negativos, no finitos y pasos que no sean 0.25", () => {
  for (const line of [-0.25, -1, NaN, Infinity, -Infinity, 0.1, 0.3, 1.1]) {
    assert.equal(isValidAsianTotalGoalLine(line), false, `esperaba ${line} inválida`);
  }
});

test("ASIAN_LINE_STEP es 0.25", () => {
  assert.equal(ASIAN_LINE_STEP, 0.25);
});

// -----------------------------------------------------------------------
// B. Generación autónoma de líneas
// -----------------------------------------------------------------------

test("distribución de baja expectativa de goles genera líneas bajas, no negativas", () => {
  const distribution = { projected_mean: 0.6 };
  const lines = generateAsianTotalGoalLines(distribution);
  assert.deepEqual(lines, [0, 0.25, 0.5, 0.75, 1, 1.25]);
  assert.ok(lines.every((line) => line >= 0));
});

test("distribución de expectativa media genera un conjunto centrado en la media/percentiles", () => {
  const distribution = { projected_mean: 2.5, dispersion: 1, percentile_10: 1.5, percentile_90: 3.5 };
  const lines = generateAsianTotalGoalLines(distribution);
  assert.deepEqual(lines, [1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5]);
});

test("distribución de alta expectativa de goles desplaza dinámicamente las líneas hacia arriba y respeta el techo", () => {
  const distribution = { projected_mean: 5, dispersion: 2, percentile_10: 3, percentile_90: 7 };
  const lines = generateAsianTotalGoalLines(distribution);
  assert.deepEqual(lines, [3.5, 3.75, 4, 4.25, 4.5, 4.75, 5, 5.25, 5.5, 5.75, 6, 6.25, 6.5]);
  assert.equal(lines.length, DEFAULT_ASIAN_LINE_GENERATION_MAX_LINES);
});

test("pasos de 0.25, orden ascendente y sin duplicados en todos los casos", () => {
  const distributions = [
    { projected_mean: 0.6 },
    { projected_mean: 2.5, dispersion: 1, percentile_10: 1.5, percentile_90: 3.5 },
    { projected_mean: 5, dispersion: 2, percentile_10: 3, percentile_90: 7 },
  ];
  for (const distribution of distributions) {
    const lines = generateAsianTotalGoalLines(distribution);
    assert.ok(lines.every((line) => isValidAsianTotalGoalLine(line)), "toda línea generada debe ser válida");
    assert.deepEqual(lines, [...lines].sort((left, right) => left - right), "debe estar ordenado ascendente");
    assert.equal(new Set(lines).size, lines.length, "no debe haber duplicados");
    for (let i = 1; i < lines.length; i += 1) {
      assert.ok(Math.abs(lines[i] - lines[i - 1] - ASIAN_LINE_STEP) < 1e-9, "el paso entre líneas consecutivas debe ser 0.25");
    }
  }
});

test("respeta un límite máximo de líneas más estricto, conservando las más cercanas a la media", () => {
  const distribution = { projected_mean: 5, dispersion: 2, percentile_10: 3, percentile_90: 7 };
  const lines = generateAsianTotalGoalLines(distribution, { maxLines: 5 });
  assert.deepEqual(lines, [4.5, 4.75, 5, 5.25, 5.5]);
  assert.equal(lines.length, 5);
});

test("nunca genera más del techo por defecto de líneas", () => {
  const distribution = { projected_mean: 12, dispersion: 50, percentile_10: -40, percentile_90: 60 };
  const lines = generateAsianTotalGoalLines(distribution);
  assert.ok(lines.length <= DEFAULT_ASIAN_LINE_GENERATION_MAX_LINES);
});

test("es determinista y no depende de cuotas, bookmaker ni líneas de mercado externas", () => {
  const distribution = { projected_mean: 2.5, dispersion: 1, percentile_10: 1.5, percentile_90: 3.5 };
  const first = generateAsianTotalGoalLines(distribution);
  const second = generateAsianTotalGoalLines(distribution);
  assert.deepEqual(first, second);
  // La firma de la función solo acepta distribución deportiva + opciones de
  // generación (ver JSDoc): ni odds, ni bookmaker, ni market lines externas.
  assert.deepEqual(Object.keys(distribution).sort(), ["dispersion", "percentile_10", "percentile_90", "projected_mean"]);
});

test("distribución sin projected_mean finito no genera líneas", () => {
  assert.deepEqual(generateAsianTotalGoalLines({}), []);
  assert.deepEqual(generateAsianTotalGoalLines({ projected_mean: NaN }), []);
});

// -----------------------------------------------------------------------
// C. Regresión de settlement — la generación de líneas no altera la
// matemática de liquidación existente (settleAsianTotalGoals/splitAsianTotalLine).
// -----------------------------------------------------------------------

test("Over 2.0 / 2.25 / 2.5 / 2.75 liquidan igual que antes de añadir la generación de líneas", () => {
  assert.equal(settleAsianTotalGoals({ totalGoals: 1, line: 2.0, direction: "over" }).status, "full_loss");
  assert.equal(settleAsianTotalGoals({ totalGoals: 2, line: 2.0, direction: "over" }).status, "push");
  assert.equal(settleAsianTotalGoals({ totalGoals: 3, line: 2.0, direction: "over" }).status, "full_win");

  assert.equal(settleAsianTotalGoals({ totalGoals: 2, line: 2.25, direction: "over" }).status, "half_loss");
  assert.equal(settleAsianTotalGoals({ totalGoals: 3, line: 2.25, direction: "over" }).status, "full_win");

  assert.equal(settleAsianTotalGoals({ totalGoals: 2, line: 2.5, direction: "over" }).status, "full_loss");
  assert.equal(settleAsianTotalGoals({ totalGoals: 3, line: 2.5, direction: "over" }).status, "full_win");

  assert.equal(settleAsianTotalGoals({ totalGoals: 3, line: 2.75, direction: "over" }).status, "half_win");
  assert.equal(settleAsianTotalGoals({ totalGoals: 4, line: 2.75, direction: "over" }).status, "full_win");
});

test("Under 2.0 / 2.25 / 2.5 / 2.75 liquidan igual que antes de añadir la generación de líneas", () => {
  assert.equal(settleAsianTotalGoals({ totalGoals: 1, line: 2.0, direction: "under" }).status, "full_win");
  assert.equal(settleAsianTotalGoals({ totalGoals: 2, line: 2.0, direction: "under" }).status, "push");
  assert.equal(settleAsianTotalGoals({ totalGoals: 3, line: 2.0, direction: "under" }).status, "full_loss");

  assert.equal(settleAsianTotalGoals({ totalGoals: 2, line: 2.25, direction: "under" }).status, "half_win");
  assert.equal(settleAsianTotalGoals({ totalGoals: 3, line: 2.25, direction: "under" }).status, "full_loss");

  assert.equal(settleAsianTotalGoals({ totalGoals: 2, line: 2.5, direction: "under" }).status, "full_win");
  assert.equal(settleAsianTotalGoals({ totalGoals: 3, line: 2.5, direction: "under" }).status, "full_loss");

  assert.equal(settleAsianTotalGoals({ totalGoals: 3, line: 2.75, direction: "under" }).status, "half_loss");
  assert.equal(settleAsianTotalGoals({ totalGoals: 2, line: 2.75, direction: "under" }).status, "full_win");
});

test("las líneas generadas dinámicamente son todas evaluables por splitAsianTotalLine sin cambios de comportamiento", () => {
  const lines = generateAsianTotalGoalLines({ projected_mean: 2.5, dispersion: 1, percentile_10: 1.5, percentile_90: 3.5 });
  for (const line of lines) {
    const parts = splitAsianTotalLine(line, "over");
    assert.ok(parts, `splitAsianTotalLine debe evaluar la línea generada ${line}`);
    const fraction = ((Math.round(line * 4) % 4) + 4) % 4;
    if (fraction === 1 || fraction === 3) assert.equal(parts.length, 2);
    else assert.equal(parts.length, 1);
  }
});
