import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  createBetRecord,
  createCombinationBetRecord,
  createMemoryBetLedger,
  settleBetRecord,
} from "../infrastructure/betLedger.js";
import { buildAtlasCombination } from "../intelligence/atlasCombinationEngine.js";

const clientPath = new URL("../../app/atlas-functional-client.js", import.meta.url);

function engineCandidate(index, overrides = {}) {
  const fixtureId = overrides.fixtureId ?? 9_000 + index;
  const marketId = overrides.marketId ?? "goals";
  const lineValue = overrides.line ?? 1.5;
  return {
    fixtureId,
    fixture: `Local ${index} vs Visitante ${index}`,
    marketId,
    market: marketId,
    direction: "over",
    line: lineValue,
    selection: `Over ${lineValue}`,
    sportsScore: 85 - index,
    probability: 0.62,
    uncertaintyLow: 0.5,
    uncertaintyHigh: 0.72,
    sampleSize: 20,
    status: "sports_candidate_pending_price",
    ranking_eligible: true,
    estimated_probability: 0.62,
    active_quote: null,
    ...overrides,
  };
}

// Pierna individual tal como la construye buildManualParlayLeg (cliente):
// conserva analysis_id, probabilidad, Solidez, cuota, bookmaker y la
// decisión de DirectorAtlas de ESE análisis individual — sin recalcular
// ninguno de esos valores.
function manualLeg(index, overrides = {}) {
  return {
    analysis_id: `analysis-${index}`,
    fixture_id: 8_000 + index,
    competition: "Liga de prueba",
    home_team: `Local ${index}`,
    away_team: `Visitante ${index}`,
    kickoff_utc: `2026-08-${20 + index}T20:00:00.000Z`,
    market_family: "goals",
    selection: "Menos de 2.5",
    direction: "under",
    line: 2.5,
    sports_score: 83.9 - index,
    preliminary_probability: 0.776 - index * 0.01,
    decimal_odds: 1.8,
    bookmaker: "Betano",
    economic_status: "favorable_preliminary",
    atlas_sports_verdict: "SÍ, ME GUSTA ESTA OPCIÓN",
    atlas_price_decision: "APOSTAR",
    ...overrides,
  };
}

test("1. Parlay automático genera entre 2 y 4 selecciones cuando existen candidatos válidos", () => {
  const candidates = [engineCandidate(1, { fixtureId: 101 }), engineCandidate(2, { fixtureId: 102 }), engineCandidate(3, { fixtureId: 103 })];
  const combination = buildAtlasCombination({ candidates, product: "parlay", mode: "automatic", selections: 3 });
  assert.equal(combination.status, "ready");
  assert.ok(combination.selections.length >= 2 && combination.selections.length <= 4);
});

test("2. Parlay automático llega a 4 selecciones cuando hay 4 candidatos válidos", () => {
  const candidates = [1, 2, 3, 4].map((index) => engineCandidate(index, { fixtureId: 200 + index, marketId: index % 2 === 0 ? "corners" : "goals" }));
  const combination = buildAtlasCombination({ candidates, product: "parlay", mode: "automatic", selections: 4 });
  assert.equal(combination.status, "ready");
  assert.equal(combination.selections.length, 4);
});

test("3. Parlay automático nunca inventa selecciones cuando solo hay 2 o 3 candidatos válidos", () => {
  const twoCandidates = [engineCandidate(1, { fixtureId: 301 }), engineCandidate(2, { fixtureId: 302 })];
  const combinationOfTwo = buildAtlasCombination({ candidates: twoCandidates, product: "parlay", mode: "automatic", selections: 4 });
  assert.ok(combinationOfTwo.selections.length <= 2, "no debe fabricar selecciones que no existen");

  const threeCandidates = [engineCandidate(1, { fixtureId: 401 }), engineCandidate(2, { fixtureId: 402 }), engineCandidate(3, { fixtureId: 403 })];
  const combinationOfThree = buildAtlasCombination({ candidates: threeCandidates, product: "parlay", mode: "automatic", selections: 4 });
  assert.ok(combinationOfThree.selections.length <= 3, "no debe fabricar selecciones que no existen");
});

test("4. máximo una selección por fixture_id + market_family (dedupe)", () => {
  const candidates = [
    engineCandidate(1, { fixtureId: 500, marketId: "goals" }),
    engineCandidate(2, { fixtureId: 500, marketId: "corners" }),
  ];
  const combination = buildAtlasCombination({ candidates, product: "parlay", mode: "automatic", selections: 2 });
  const keys = combination.selections.map((item) => `${item.fixture_id}:${item.market_family}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(combination.selections.length, 2, "distintas familias del mismo fixture sí pueden coexistir");

  // A nivel de ledger, dos piernas del mismo fixture_id+market_family en un
  // Parlay manual son un error de construcción del cliente (no del ledger),
  // pero el ledger igual debe aceptar exactamente las piernas que se le den
  // sin deduplicar por sí mismo ni inventar: confirmamos que dos piernas
  // DISTINTAS (distinta familia) sí se conservan íntegras.
  const bet = createCombinationBetRecord({
    betId: "manual-dedupe-1", combinationId: "manual-1", product: "parlay", mode: "manual",
    legs: [manualLeg(1, { fixture_id: 500, market_family: "goals" }), manualLeg(2, { fixture_id: 500, market_family: "corners" })],
    bookmaker: "Betano", decimalOdds: 3.2, oddsSource: "manual_user_input", stakeAmount: 10000,
  });
  assert.equal(bet.legs.length, 2);
});

test("5. una selección individual puede registrarse sola (BetRecord v1, sin Parlay)", () => {
  const bet = createBetRecord({
    betId: "individual-1", analysisId: "analysis-solo", fixtureId: 700,
    bookmaker: "Betano", decimalOdds: 1.8, stakeAmount: 10000,
  });
  assert.equal(bet.version, 1);
  assert.equal(bet.bet_type, undefined);
  assert.equal(bet.analysis_id, "analysis-solo");
});

test("6. una selección individual puede agregarse a un Parlay manual (UI de cliente ya conectada)", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /function buildManualParlayLeg/);
  assert.match(source, /function addToManualParlay/);
  assert.match(source, /function ManualParlayAddButton/);
  assert.match(source, /function ManualParlayPanel/);
  assert.match(source, /Agregar a Parlay manual/);
  // Máximo 4 piernas, sin duplicar fixture_id+market_family, guarda con 2-4.
  assert.match(source, /manualParlayLegs\.length >= 4/);
  assert.match(source, /item\.fixture_id === leg\.fixture_id && item\.market_family === leg\.market_family/);
  assert.match(source, /manualParlayLegs\.length < 2 \|\| manualParlayLegs\.length > 4/);
  // mode: "manual" viaja al endpoint existente, reutilizando createCombinationBetRecord.
  assert.match(source, /mode:\s*"manual"/);
  assert.match(source, /betType:\s*"combination"/);
});

test("7. el Parlay conserva analysis_id, probabilidad, Solidez, cuota y decisión de DirectorAtlas por pierna", () => {
  const bet = createCombinationBetRecord({
    betId: "manual-full-1", combinationId: "manual-2", product: "parlay", mode: "manual",
    legs: [manualLeg(1), manualLeg(2, { fixture_id: 8_002, market_family: "corners", selection: "Más de 8.5", direction: "over", line: 8.5, atlas_sports_verdict: "SÍ, ME GUSTA ESTA OPCIÓN", atlas_price_decision: "APOSTAR" })],
    bookmaker: "Betano", decimalOdds: 3.1, oddsSource: "manual_user_input", stakeAmount: 10000,
  });
  assert.equal(bet.mode, "manual");
  assert.equal(bet.legs.length, 2);
  for (const [index, leg] of bet.legs.entries()) {
    assert.equal(leg.analysis_id, `analysis-${index + 1}`);
    assert.ok(Number.isFinite(leg.preliminary_probability));
    assert.ok(Number.isFinite(leg.sports_score));
    assert.ok(Number.isFinite(leg.decimal_odds));
    assert.equal(leg.bookmaker, "Betano");
    assert.equal(leg.atlas_sports_verdict, "SÍ, ME GUSTA ESTA OPCIÓN");
    assert.equal(leg.atlas_price_decision, "APOSTAR");
  }
});

test("8. el resultado del Parlay no modifica el resultado individual de cada pronóstico", async () => {
  const ledger = createMemoryBetLedger();
  const individualBet = createBetRecord({
    betId: "individual-solo-1", analysisId: "analysis-1", fixtureId: 8_001,
    bookmaker: "Betano", decimalOdds: 1.8, stakeAmount: 10000,
  });
  const combinationBet = createCombinationBetRecord({
    betId: "manual-outcome-1", combinationId: "manual-3", product: "parlay", mode: "manual",
    legs: [manualLeg(1), manualLeg(2, { fixture_id: 8_002, market_family: "corners" })],
    bookmaker: "Betano", decimalOdds: 3.1, oddsSource: "manual_user_input", stakeAmount: 10000,
  });
  await ledger.appendBet(individualBet);
  await ledger.appendBet(combinationBet);

  // El Parlay pierde (por ejemplo, por la pierna 2), pero eso no debe
  // sobrescribir ni tocar el registro de la apuesta individual del mismo
  // análisis: cada uno conserva su propio ciclo de liquidación.
  const settledCombination = settleBetRecord(combinationBet, { outcome: "lost" });
  await ledger.appendSettlement(settledCombination);

  const stillPendingIndividual = await ledger.getById(individualBet.bet_id);
  assert.equal(stillPendingIndividual.status, "pending");
  assert.equal(stillPendingIndividual.analysis_id, "analysis-1");

  // Liquidar la individual de forma independiente (4/4 -> "won" en este caso)
  // tampoco toca el Parlay ya liquidado.
  const settledIndividual = settleBetRecord(stillPendingIndividual, { outcome: "won" });
  await ledger.appendSettlement(settledIndividual);
  const finalCombination = await ledger.getById(combinationBet.bet_id);
  assert.equal(finalCombination.status, "lost");
  assert.equal(finalCombination.legs[0].analysis_id, "analysis-1");

  // resultCalibration.js (calibración individual) no importa ni referencia
  // nada de combination/parlay/dream — la separación es estructural.
  const calibrationSource = await readFile(new URL("../intelligence/resultCalibration.js", import.meta.url), "utf8");
  assert.doesNotMatch(calibrationSource, /combination|parlay|dream/i);
});

// ACTUALIZADO: el bloqueo original solo cubría líneas de cuarto (.25/.75) de
// asian_total_goals, dejando pasar sus líneas enteras/medias y toda la
// familia team_asian_handicap — un hueco real (el motor combinado no
// soporta settlement parcial de 5 estados para NINGUNA línea de estas
// familias, no solo las de cuarto). Esta prueba protege el contrato
// correcto: ambas familias asiáticas quedan bloqueadas del Parlay manual en
// cualquier línea, con un mensaje explícito y comprensible.
test("9. ningún mercado asiático (asian_total_goals ni team_asian_handicap), en ninguna línea, entra al Parlay manual — bloqueo explícito, no aproximado en silencio", async () => {
  const source = await readFile(clientPath, "utf8");
  const block = source.match(/function addToManualParlay[\s\S]*?\n  \}\n/)?.[0];
  assert.ok(block, "debe existir addToManualParlay");
  assert.match(block, /asian_total_goals/);
  assert.match(block, /team_asian_handicap/);
  assert.doesNotMatch(block, /0\.25,\s*0\.75/, "el bloqueo ya no debe depender de si la línea es de cuarto");
  assert.match(block, /únicamente como apuestas individuales/);
});
