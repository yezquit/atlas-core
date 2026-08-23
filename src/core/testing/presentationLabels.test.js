import assert from "node:assert/strict";
import test from "node:test";

import {
  displayMarketLabel,
  displaySelectionLabel,
  displayStatusLabel,
} from "../../app/presentation-labels.js";

test("Over y Under se presentan en español", () => {
  assert.equal(displaySelectionLabel("Over 2.5"), "Más de 2.5");
  assert.equal(displaySelectionLabel("Under 8.5"), "Menos de 8.5");
});

test("los estados visibles principales se presentan en español", () => {
  assert.deepEqual(
    ["hit", "miss", "void", "pending", "not_evaluable", "live", "stale", "unavailable", "blocked", "high_risk"].map(displayStatusLabel),
    ["Acierto", "Fallo", "Nulo", "Pendiente", "No evaluable", "EN VIVO", "Desactualizada", "No disponible", "Bloqueada", "Riesgo alto"],
  );
});

test("los mercados se presentan en español", () => {
  assert.equal(displayMarketLabel("total_shots"), "Remates totales");
  assert.equal(displayMarketLabel("shots_on_goal"), "Remates a puerta");
});

test("la localización no modifica enums internos", () => {
  const contract = Object.freeze({ direction: "over", status: "pending", resolution: "hit", mode: "live" });
  displaySelectionLabel(`${contract.direction} 1.5`);
  displayStatusLabel(contract.status);
  displayStatusLabel(contract.resolution);
  displayStatusLabel(contract.mode);
  assert.deepEqual(contract, { direction: "over", status: "pending", resolution: "hit", mode: "live" });
});
