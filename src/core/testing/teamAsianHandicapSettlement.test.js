import test from "node:test";
import assert from "node:assert/strict";

import {
  TEAM_ASIAN_HANDICAP_FAMILY,
  buildTeamAsianHandicapCandidateId,
  isValidTeamAsianHandicapLine,
  isValidTeamAsianHandicapSide,
  selectedTeamGoalsFromSide,
  settleTeamAsianHandicap,
  splitTeamAsianHandicapLine,
} from "../intelligence/teamAsianHandicap.js";
import {
  ASIAN_TOTAL_GOALS_FAMILY,
  asianExpectedValue,
  asianFairOdds,
  asianPriceEquivalentProbability,
  asianSportsFavorability,
  settleAsianTotalGoals,
  splitAsianTotalLine,
} from "../intelligence/asianTotalGoals.js";
import {
  combineSettlementParts,
  settlementExpectedValue,
  settlementFairOdds,
  settlementFavorability,
  settlementPriceEquivalentProbability,
  splitQuarterStepLine,
} from "../intelligence/settlementMath.js";
import { isSettlementFavorabilityCandidate } from "../intelligence/probabilityClassification.js";

// -----------------------------------------------------------------------
// A-G, J-N. Matemática de settlement — casos de referencia del enunciado
// (equipo local seleccionado salvo que se indique lo contrario).
// -----------------------------------------------------------------------

test("A/G. Línea entera (0), marcador 0-0 -> push", () => {
  assert.equal(settleTeamAsianHandicap({ selectedTeamGoals: 0, opponentGoals: 0, line: 0 }).status, "push");
});

test("B/E/J. Línea .5 positiva, marcador 1-0, AH +0.5 -> full_win", () => {
  assert.equal(settleTeamAsianHandicap({ selectedTeamGoals: 1, opponentGoals: 0, line: 0.5 }).status, "full_win");
});

test("B/F/J. Línea .5 negativa, marcador 1-0, AH -0.5 -> full_win", () => {
  assert.equal(settleTeamAsianHandicap({ selectedTeamGoals: 1, opponentGoals: 0, line: -0.5 }).status, "full_win");
});

test("A/F/L. Línea entera negativa, marcador 1-0, AH -1.0 -> push", () => {
  assert.equal(settleTeamAsianHandicap({ selectedTeamGoals: 1, opponentGoals: 0, line: -1 }).status, "push");
});

test("C/F/M. Línea .25 negativa, marcador 1-0, AH -1.25 -> half_loss", () => {
  assert.equal(settleTeamAsianHandicap({ selectedTeamGoals: 1, opponentGoals: 0, line: -1.25 }).status, "half_loss");
});

test("D/F/K. Línea .75 negativa, marcador 1-0, AH -0.75 -> half_win", () => {
  assert.equal(settleTeamAsianHandicap({ selectedTeamGoals: 1, opponentGoals: 0, line: -0.75 }).status, "half_win");
});

test("C/F/M. Marcador 0-0, AH -0.25 -> half_loss", () => {
  assert.equal(settleTeamAsianHandicap({ selectedTeamGoals: 0, opponentGoals: 0, line: -0.25 }).status, "half_loss");
});

test("C/E/K. Marcador 0-0, AH +0.25 -> half_win", () => {
  assert.equal(settleTeamAsianHandicap({ selectedTeamGoals: 0, opponentGoals: 0, line: 0.25 }).status, "half_win");
});

test("B/E/J. Marcador 0-0, AH +0.5 -> full_win", () => {
  assert.equal(settleTeamAsianHandicap({ selectedTeamGoals: 0, opponentGoals: 0, line: 0.5 }).status, "full_win");
});

test("A/E/L. Marcador 0-1 (seleccionado va perdiendo), AH +1.0 -> push", () => {
  assert.equal(settleTeamAsianHandicap({ selectedTeamGoals: 0, opponentGoals: 1, line: 1 }).status, "push");
});

test("C/E/K. Marcador 0-1, AH +1.25 -> half_win", () => {
  assert.equal(settleTeamAsianHandicap({ selectedTeamGoals: 0, opponentGoals: 1, line: 1.25 }).status, "half_win");
});

test("D/E/M. Marcador 0-1, AH +0.75 -> half_loss", () => {
  assert.equal(settleTeamAsianHandicap({ selectedTeamGoals: 0, opponentGoals: 1, line: 0.75 }).status, "half_loss");
});

test("B/E/J. Marcador 0-1, AH +1.5 -> full_win", () => {
  assert.equal(settleTeamAsianHandicap({ selectedTeamGoals: 0, opponentGoals: 1, line: 1.5 }).status, "full_win");
});

test("N. full_loss limpio: marcador 0-1, AH +0.5 -> full_loss", () => {
  assert.equal(settleTeamAsianHandicap({ selectedTeamGoals: 0, opponentGoals: 1, line: 0.5 }).status, "full_loss");
});

// -----------------------------------------------------------------------
// H/I. Selección de equipo (home/away) vía selectedTeamGoalsFromSide
// -----------------------------------------------------------------------

test("H. Home seleccionado: score 2-0, AH -1.5 -> full_win", () => {
  const { selectedTeamGoals, opponentGoals } = selectedTeamGoalsFromSide({ side: "home", homeGoals: 2, awayGoals: 0 });
  assert.deepEqual({ selectedTeamGoals, opponentGoals }, { selectedTeamGoals: 2, opponentGoals: 0 });
  assert.equal(settleTeamAsianHandicap({ selectedTeamGoals, opponentGoals, line: -1.5 }).status, "full_win");
});

test("I. Away seleccionado: score 2-0, AH +1.5 -> full_loss (goal_difference se invierte correctamente)", () => {
  const { selectedTeamGoals, opponentGoals } = selectedTeamGoalsFromSide({ side: "away", homeGoals: 2, awayGoals: 0 });
  assert.deepEqual({ selectedTeamGoals, opponentGoals }, { selectedTeamGoals: 0, opponentGoals: 2 });
  assert.equal(settleTeamAsianHandicap({ selectedTeamGoals, opponentGoals, line: 1.5 }).status, "full_loss");
});

test("side inválido produce goles no finitos, nunca un settlement fabricado", () => {
  const { selectedTeamGoals, opponentGoals } = selectedTeamGoalsFromSide({ side: "neutral", homeGoals: 1, awayGoals: 0 });
  assert.equal(Number.isFinite(selectedTeamGoals), false);
  assert.equal(settleTeamAsianHandicap({ selectedTeamGoals, opponentGoals, line: 0 }).status, "not_evaluable");
});

// -----------------------------------------------------------------------
// O. Inputs inválidos: nunca fabricar hit/miss/settlement
// -----------------------------------------------------------------------

test("O1. selectedTeamGoals no finito -> not_evaluable", () => {
  const result = settleTeamAsianHandicap({ selectedTeamGoals: NaN, opponentGoals: 0, line: -0.5 });
  assert.equal(result.status, "not_evaluable");
  assert.equal(result.goal_difference, null);
  assert.equal(result.exact_line, null);
  assert.deepEqual(result.parts, []);
});

test("O2. opponentGoals ausente -> not_evaluable", () => {
  assert.equal(settleTeamAsianHandicap({ selectedTeamGoals: 1, line: -0.5 }).status, "not_evaluable");
});

test("O3. line ausente -> not_evaluable", () => {
  assert.equal(settleTeamAsianHandicap({ selectedTeamGoals: 1, opponentGoals: 0 }).status, "not_evaluable");
});

// -----------------------------------------------------------------------
// P. Línea no múltiplo de 0.25
// -----------------------------------------------------------------------

test("P1. Línea no múltiplo de 0.25 (-0.1) -> inválida y not_evaluable", () => {
  assert.equal(isValidTeamAsianHandicapLine(-0.1), false);
  assert.equal(splitTeamAsianHandicapLine(-0.1), null);
  assert.equal(settleTeamAsianHandicap({ selectedTeamGoals: 1, opponentGoals: 0, line: -0.1 }).status, "not_evaluable");
});

test("P2. isValidTeamAsianHandicapLine acepta signo negativo, a diferencia de isValidAsianTotalGoalLine", () => {
  for (const line of [-3, -2.75, -1.5, -0.25, 0, 0.25, 1.5, 2.75, 3]) {
    assert.equal(isValidTeamAsianHandicapLine(line), true, `esperaba ${line} válida`);
  }
  assert.equal(isValidTeamAsianHandicapLine(NaN), false);
  assert.equal(isValidTeamAsianHandicapLine(Infinity), false);
});

// -----------------------------------------------------------------------
// Q. Simetría: intercambiar equipos y cambiar signo de línea produce el
// settlement opuesto (full_win<->full_loss, half_win<->half_loss,
// push<->push).
// -----------------------------------------------------------------------

const OPPOSITE_STATUS = Object.freeze({
  full_win: "full_loss",
  half_win: "half_loss",
  push: "push",
  half_loss: "half_win",
  full_loss: "full_win",
});

test("Q. Simetría equipo/línea produce el settlement opuesto en todos los casos de referencia", () => {
  const cases = [
    { selectedTeamGoals: 1, opponentGoals: 0, line: -0.5 },
    { selectedTeamGoals: 1, opponentGoals: 0, line: -1 },
    { selectedTeamGoals: 1, opponentGoals: 0, line: -1.25 },
    { selectedTeamGoals: 1, opponentGoals: 0, line: -0.75 },
    { selectedTeamGoals: 0, opponentGoals: 0, line: 0 },
    { selectedTeamGoals: 0, opponentGoals: 0, line: -0.25 },
    { selectedTeamGoals: 0, opponentGoals: 1, line: 1.25 },
    { selectedTeamGoals: 2, opponentGoals: 0, line: -1.5 },
  ];
  for (const scenario of cases) {
    const original = settleTeamAsianHandicap(scenario);
    const mirrored = settleTeamAsianHandicap({
      selectedTeamGoals: scenario.opponentGoals,
      opponentGoals: scenario.selectedTeamGoals,
      line: -scenario.line,
    });
    assert.equal(mirrored.status, OPPOSITE_STATUS[original.status], `escenario ${JSON.stringify(scenario)}`);
  }
});

// -----------------------------------------------------------------------
// R. Regresión Asian Total: el helper genérico extraído (settlementMath.js)
// no cambió el comportamiento de asian_total_goals.
// -----------------------------------------------------------------------

test("R1. splitAsianTotalLine sigue produciendo exactamente el mismo empaquetado tras la extracción", () => {
  assert.deepEqual(splitAsianTotalLine(2.25, "over"), [
    { direction: "over", line: 2.0, stake_fraction: 0.5 },
    { direction: "over", line: 2.5, stake_fraction: 0.5 },
  ]);
  assert.deepEqual(splitAsianTotalLine(2.5, "over"), [{ direction: "over", line: 2.5, stake_fraction: 1 }]);
  assert.equal(splitAsianTotalLine(-1, "over"), null, "asian_total_goals sigue rechazando líneas negativas");
});

test("R2. settleAsianTotalGoals conserva los mismos resultados de referencia", () => {
  assert.equal(settleAsianTotalGoals({ totalGoals: 3, line: 2.25, direction: "over" }).status, "full_win");
  assert.equal(settleAsianTotalGoals({ totalGoals: 2, line: 2.25, direction: "over" }).status, "half_loss");
  assert.equal(settleAsianTotalGoals({ totalGoals: 2, line: 2.25, direction: "under" }).status, "half_win");
  assert.equal(settleAsianTotalGoals({ totalGoals: 3, line: 2.75, direction: "over" }).status, "half_win");
  assert.equal(settleAsianTotalGoals({ totalGoals: 3, line: 2.75, direction: "under" }).status, "half_loss");
  assert.equal(settleAsianTotalGoals({ totalGoals: 3, line: 3, direction: "over" }).status, "push");
});

test("R3. splitQuarterStepLine (genérico) coincide con la partición interna que asianTotalGoals ya usaba", () => {
  assert.deepEqual(splitQuarterStepLine(2.25), [2.0, 2.5]);
  assert.deepEqual(splitQuarterStepLine(2.75), [2.5, 3.0]);
  assert.deepEqual(splitQuarterStepLine(2.5), [2.5]);
  assert.deepEqual(splitQuarterStepLine(-1.25), [-1.5, -1.0]);
  assert.equal(splitQuarterStepLine(NaN), null);
});

test("R4. combineSettlementParts reproduce exactamente la tabla de combinación de asian_total_goals", () => {
  assert.equal(combineSettlementParts([{ result: "win", stake_fraction: 1 }]), "full_win");
  assert.equal(combineSettlementParts([{ result: "loss", stake_fraction: 1 }]), "full_loss");
  assert.equal(combineSettlementParts([{ result: "win", stake_fraction: 0.5 }, { result: "push", stake_fraction: 0.5 }]), "half_win");
  assert.equal(combineSettlementParts([{ result: "loss", stake_fraction: 0.5 }, { result: "push", stake_fraction: 0.5 }]), "half_loss");
  assert.equal(combineSettlementParts([{ result: "push", stake_fraction: 0.5 }, { result: "push", stake_fraction: 0.5 }]), "push");
});

test("R5. Los wrappers asian* delegan en settlementMath.js sin cambiar el valor devuelto", () => {
  const probabilities = { full_win: 0.4, half_win: 0.2, push: 0.1, half_loss: 0.1, full_loss: 0.2 };
  assert.equal(asianSportsFavorability(probabilities), settlementFavorability(probabilities));
  const profile = { probabilities, weighted_win_probability: 0.5, weighted_loss_probability: 0.25 };
  assert.equal(asianExpectedValue(profile, 2), settlementExpectedValue(profile, 2));
  assert.equal(asianFairOdds(profile), settlementFairOdds(profile));
  assert.equal(
    asianPriceEquivalentProbability({ weighted_win_probability: 0.5, weighted_loss_probability: 0.25 }),
    settlementPriceEquivalentProbability({ weighted_win_probability: 0.5, weighted_loss_probability: 0.25 }),
  );
});

// -----------------------------------------------------------------------
// Favorabilidad/economía genérica reutilizada directamente por Team AH
// (sección 7-8): mismo contrato matemático, sin wrapper propio todavía
// porque Team AH no tiene código externo previo que preservar.
// -----------------------------------------------------------------------

test("Favorabilidad genérica (settlementFavorability) es aplicable directamente a un perfil Team AH", () => {
  // Perfil de settlement Team AH sintético (no deriva de distribución real
  // — eso queda fuera de este bloque). Solo demuestra que el contrato
  // matemático es genérico y reutilizable sin cambios.
  const teamAhProbabilities = { full_win: 0.35, half_win: 0.15, push: 0.1, half_loss: 0.15, full_loss: 0.25 };
  const favorability = settlementFavorability(teamAhProbabilities);
  assert.equal(favorability, 0.35 + 0.75 * 0.15 + 0.5 * 0.1 + 0.25 * 0.15);
  assert.ok(favorability >= 0 && favorability <= 1);
});

test("Economía genérica (EV/FairOdds/PriceEquivalent) es aplicable a un perfil Team AH sin cambios", () => {
  const teamAhProbabilities = { full_win: 0.35, half_win: 0.15, push: 0.1, half_loss: 0.15, full_loss: 0.25 };
  const weightedWin = teamAhProbabilities.full_win + 0.5 * teamAhProbabilities.half_win;
  const weightedLoss = teamAhProbabilities.full_loss + 0.5 * teamAhProbabilities.half_loss;
  const profile = { probabilities: teamAhProbabilities, weighted_win_probability: weightedWin, weighted_loss_probability: weightedLoss };
  const fairOdds = settlementFairOdds(profile);
  assert.ok(Number.isFinite(fairOdds) && fairOdds > 1);
  // settlementFairOdds redondea a 6 decimales; settlementPriceEquivalentProbability
  // no redondea — la tolerancia refleja ese redondeo, no imprecisión real.
  const priceEquivalent = settlementPriceEquivalentProbability({ weighted_win_probability: weightedWin, weighted_loss_probability: weightedLoss });
  assert.ok(Math.abs(priceEquivalent - 1 / fairOdds) < 1e-5);
  const evAtFairOdds = settlementExpectedValue(profile, fairOdds);
  assert.ok(Math.abs(evAtFairOdds) < 1e-3);
});

// -----------------------------------------------------------------------
// S. isSettlementFavorabilityCandidate reconoce team_asian_handicap
// -----------------------------------------------------------------------

test("S1. isSettlementFavorabilityCandidate(market_family=team_asian_handicap) === true", () => {
  assert.equal(isSettlementFavorabilityCandidate({ market_family: TEAM_ASIAN_HANDICAP_FAMILY }), true);
});

test("S2. isSettlementFavorabilityCandidate(probability_semantics=settlement_favorability, team AH) === true", () => {
  assert.equal(isSettlementFavorabilityCandidate({ probability_semantics: "settlement_favorability", market_family: TEAM_ASIAN_HANDICAP_FAMILY }), true);
});

test("S3. isSettlementFavorabilityCandidate sigue sin reconocer familias clásicas ni cambia asian_total_goals", () => {
  assert.equal(isSettlementFavorabilityCandidate({ market_family: "goals" }), false);
  assert.equal(isSettlementFavorabilityCandidate({ market_family: "corners" }), false);
  assert.equal(isSettlementFavorabilityCandidate({ market_family: ASIAN_TOTAL_GOALS_FAMILY }), true);
  assert.equal(isSettlementFavorabilityCandidate({}), false);
});

// -----------------------------------------------------------------------
// Identidad de dominio (sección 2): fixture_id + market_family + team_id +
// line, nunca direction=over|under.
// -----------------------------------------------------------------------

test("Identidad: buildTeamAsianHandicapCandidateId usa fixture_id+market_family+team_id+line, sin direction", () => {
  const id = buildTeamAsianHandicapCandidateId({ fixtureId: 555, teamId: 42, line: -0.75 });
  assert.equal(id, "team_asian_handicap:555:42:-0.75");
  assert.doesNotMatch(id, /over|under/i);
});

test("TEAM_ASIAN_HANDICAP_FAMILY y sides usan vocabulario home/away ya existente en el repo", () => {
  assert.equal(TEAM_ASIAN_HANDICAP_FAMILY, "team_asian_handicap");
  assert.equal(isValidTeamAsianHandicapSide("home"), true);
  assert.equal(isValidTeamAsianHandicapSide("away"), true);
  assert.equal(isValidTeamAsianHandicapSide("over"), false);
  assert.equal(isValidTeamAsianHandicapSide("under"), false);
});
