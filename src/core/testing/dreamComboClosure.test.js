import assert from "node:assert/strict";
import test from "node:test";

import { buildAtlasCombination } from "../intelligence/atlasCombinationEngine.js";

// Cierre del contrato de Soñadora (product:"dream"): los escenarios de
// tamaño (4/5/10/>15) ya están cubiertos por combinationsV3.test.js
// (tests 5-8) y el registro/liquidación en el ledger por
// combinationBetTracker.test.js (test 3, "Soñadora con las cinco familias
// reales"). Este archivo solo cierra dos verificaciones que existían para
// Parlay (product:"parlay") pero no estaban probadas explícitamente para
// Soñadora: dedupe fixture_id+market_family y ausencia de prioridad fija
// por familia. Misma función compartida (buildAtlasCombination), sin
// tocar fórmulas deportivas ni Parlay manual.
function candidate(index, overrides = {}) {
  const fixtureId = overrides.fixtureId ?? 8_000 + index;
  const marketId = overrides.marketId ?? "goals";
  const direction = overrides.direction ?? "over";
  const line = overrides.line ?? 1.5;
  return {
    fixtureId,
    fixture: `Local ${index} vs Visitante ${index}`,
    marketId,
    market: marketId,
    direction,
    line,
    selection: `${direction === "under" ? "Under" : "Over"} ${line}`,
    sportsScore: overrides.sportsScore ?? 75,
    ranking_eligible: overrides.ranking_eligible ?? true,
    estimated_probability: overrides.estimated_probability ?? 0.6,
    uncertaintyLow: overrides.uncertaintyLow ?? 0.5,
    uncertaintyHigh: overrides.uncertaintyHigh ?? 0.7,
    sampleSize: overrides.sampleSize ?? 20,
    technicalSupport: overrides.technicalSupport ?? 60,
    status: overrides.status ?? "sports_candidate_pending_price",
    active_quote: null,
    ...overrides,
  };
}

test("dedupe fixture_id + market_family también rige para Soñadora (product:dream)", () => {
  const candidates = [
    candidate(1, { fixtureId: 900, marketId: "goals", line: 1.5 }),
    candidate(2, { fixtureId: 900, marketId: "goals", line: 2.5 }),
    ...Array.from({ length: 6 }, (_, index) => candidate(index + 3, { fixtureId: 901 + index, marketId: "corners" })),
  ];
  const result = buildAtlasCombination({ candidates, product: "dream", mode: "automatic", selections: 5 });
  assert.equal(result.status, "ready");
  assert.equal(result.selections.filter((item) => item.fixture_id === 900).length, 1, "máximo una selección por fixture_id 900");
  const keys = result.selections.map((item) => `${item.fixture_id}:${item.market_family}`);
  assert.equal(new Set(keys).size, keys.length, "sin duplicados fixture_id+market_family en Soñadora");
});

test("Soñadora no tiene prioridad fija por market_family: el orden de entrada no determina qué familia queda primero", () => {
  const families = ["goals", "corners", "cards", "total_shots", "shots_on_goal"];
  const candidatesGoalsFirst = families.map((marketId, index) => candidate(index + 1, { fixtureId: 950 + index, marketId, estimated_probability: 0.5 + index * 0.05 }));
  const candidatesGoalsLast = [...candidatesGoalsFirst].reverse();

  const resultA = buildAtlasCombination({ candidates: candidatesGoalsFirst, product: "dream", mode: "automatic", selections: 5 });
  const resultB = buildAtlasCombination({ candidates: candidatesGoalsLast, product: "dream", mode: "automatic", selections: 5 });

  assert.equal(resultA.status, "ready");
  assert.equal(resultB.status, "ready");
  const familiesA = new Set(resultA.selections.map((item) => item.market_family));
  const familiesB = new Set(resultB.selections.map((item) => item.market_family));
  assert.deepEqual([...familiesA].sort(), [...familiesB].sort(), "el conjunto de familias elegidas no depende del orden de entrada");
});
