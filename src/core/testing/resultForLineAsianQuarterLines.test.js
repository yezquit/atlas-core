import test from "node:test";
import assert from "node:assert/strict";

import { buildPredictionResult, resultForLine } from "../intelligence/resultCalibration.js";
import { ASIAN_TOTAL_GOALS_FAMILY } from "../intelligence/asianTotalGoals.js";

// -----------------------------------------------------------------------
// A-E. Quarter-lines asian_total_goals: settlement real de 5 estados,
// no un umbral binario simple.
// -----------------------------------------------------------------------

test("A. Over 2.25, actual 3 -> hit (full_win real)", () => {
  const result = resultForLine({ selection: "Over 2.25", line: 2.25, actualTotal: 3, market_family: ASIAN_TOTAL_GOALS_FAMILY });
  assert.equal(result.status, "hit");
});

test("B. Over 2.25, actual 2 -> miss (settlement real half_loss, no un umbral binario)", () => {
  const result = resultForLine({ selection: "Over 2.25", line: 2.25, actualTotal: 2, market_family: ASIAN_TOTAL_GOALS_FAMILY });
  assert.equal(result.status, "miss");
});

test("C. Under 2.25, actual 2 -> hit (settlement real half_win)", () => {
  const result = resultForLine({ selection: "Under 2.25", line: 2.25, actualTotal: 2, market_family: ASIAN_TOTAL_GOALS_FAMILY });
  assert.equal(result.status, "hit");
});

test("D. Over 2.75, actual 3 -> hit (half_win)", () => {
  const result = resultForLine({ selection: "Over 2.75", line: 2.75, actualTotal: 3, market_family: ASIAN_TOTAL_GOALS_FAMILY });
  assert.equal(result.status, "hit");
});

test("E. Under 2.75, actual 3 -> miss (half_loss)", () => {
  const result = resultForLine({ selection: "Under 2.75", line: 2.75, actualTotal: 3, market_family: ASIAN_TOTAL_GOALS_FAMILY });
  assert.equal(result.status, "miss");
});

// -----------------------------------------------------------------------
// F-G. Línea entera (push exacto) y línea .5 (sin push posible)
// -----------------------------------------------------------------------

test("F. Asian línea entera (.0), actual exacto -> void (push)", () => {
  const result = resultForLine({ selection: "Over 3", line: 3, actualTotal: 3, market_family: ASIAN_TOTAL_GOALS_FAMILY });
  assert.equal(result.status, "void");
});

test("G. Asian línea .5 (sin push posible): hit/miss normal", () => {
  const hit = resultForLine({ selection: "Over 2.5", line: 2.5, actualTotal: 3, market_family: ASIAN_TOTAL_GOALS_FAMILY });
  assert.equal(hit.status, "hit");
  const miss = resultForLine({ selection: "Over 2.5", line: 2.5, actualTotal: 2, market_family: ASIAN_TOTAL_GOALS_FAMILY });
  assert.equal(miss.status, "miss");
});

// -----------------------------------------------------------------------
// H. Regresión clásica: sin market_family asian, comportamiento histórico
// exacto (umbral binario simple, sin settlement de cuarto).
// -----------------------------------------------------------------------

test("H1. Clásico (goals) sin market_family: comportamiento histórico intacto", () => {
  assert.equal(resultForLine({ selection: "Over 9.5", line: 9.5, actualTotal: 11 }).status, "hit");
  assert.equal(resultForLine({ selection: "Over 9.5", line: 9.5, actualTotal: 8 }).status, "miss");
  assert.equal(resultForLine({ selection: "Over 9", line: 9, actualTotal: 9 }).status, "void");
});

test("H2. Clásico con market_family explícito distinto de asian: comportamiento histórico intacto (umbral binario simple, no settlement de cuarto)", () => {
  assert.equal(resultForLine({ selection: "Over 2.25", line: 2.25, actualTotal: 3, market_family: "goals" }).status, "hit");
});

// -----------------------------------------------------------------------
// I. buildPredictionResult end-to-end con asian_total_goals
// -----------------------------------------------------------------------

function asianAnalysis({ selection, line, probability = 0.6 } = {}) {
  return {
    analysis_id: "analysis-asian-1",
    fixture_id: 9001,
    created_at: "2026-08-14T16:00:00.000Z",
    phase: "day_before",
    preliminary_probability: { point_estimate: probability, uncertainty_low: probability - 0.1, uncertainty_high: probability + 0.1 },
    director: {
      fixture: { competition: "Brasil Serie B" },
      market_evaluated: { family: "asian_total_goals" },
      selection,
      line,
    },
  };
}

test("I. buildPredictionResult con asian_total_goals 2.25 hereda la clasificación correcta (half_loss real -> miss)", () => {
  const result = buildPredictionResult({ analysis: asianAnalysis({ selection: "Over 2.25", line: 2.25 }), actualTotal: 2 });
  assert.equal(result.outcome, "miss");
  assert.equal(result.market_family, "asian_total_goals");
});

test("I2. buildPredictionResult con asian_total_goals 2.75 hereda half_win -> hit", () => {
  const result = buildPredictionResult({ analysis: asianAnalysis({ selection: "Over 2.75", line: 2.75 }), actualTotal: 3 });
  assert.equal(result.outcome, "hit");
});

// -----------------------------------------------------------------------
// J. Input inválido: mantiene el contrato "unresolved", nunca hit/miss
// fabricado.
// -----------------------------------------------------------------------

test("J1. Sin dirección reconocible -> unresolved (no hit/miss fabricado)", () => {
  const result = resultForLine({ selection: "Total 2.25", line: 2.25, actualTotal: 3, market_family: ASIAN_TOTAL_GOALS_FAMILY });
  assert.equal(result.status, "unresolved");
});

test("J2. Línea faltante -> unresolved", () => {
  const result = resultForLine({ selection: "Over", actualTotal: 3, market_family: ASIAN_TOTAL_GOALS_FAMILY });
  assert.equal(result.status, "unresolved");
});

test("J3. actualTotal no finito -> unresolved (Number(null) sería 0 finito; se usa undefined para forzar NaN real)", () => {
  const result = resultForLine({ selection: "Over 2.25", line: 2.25, actualTotal: undefined, market_family: ASIAN_TOTAL_GOALS_FAMILY });
  assert.equal(result.status, "unresolved");
});
