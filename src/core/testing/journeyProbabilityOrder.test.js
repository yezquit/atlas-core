import test from "node:test";
import assert from "node:assert/strict";

import { rankJourneyCandidatesByDecision } from "../services/sportsIntelligenceService.js";

// Contrato: en el universo de Jornada (y en el que alimenta Parlay/Soñadora),
// no existe una prioridad fija por market_family. El orden visible depende
// exclusivamente de estimated_probability descendente.

function entry(candidateId, family, fixtureId, estimatedProbability, overrides = {}) {
  return {
    analysis: { fixture: { fixtureId } },
    candidate: {
      candidate_id: candidateId,
      market_family: family,
      direction: "over",
      line: 1.5,
      fixture_id: fixtureId,
      estimated_probability: estimatedProbability,
      sports_score: 50,
      ranking_eligible: true,
      ...overrides,
    },
  };
}

test("1. Sin prioridad fija por familia: el orden final es estimated_probability descendente entre todas las familias seleccionadas", () => {
  const goals = entry("goals-1", "goals", 1, 0.62);
  const totalShots = entry("total_shots-1", "total_shots", 2, 0.76);
  const corners = entry("corners-1", "corners", 3, 0.69);

  const ranked = rankJourneyCandidatesByDecision([goals, totalShots, corners]);

  assert.deepEqual(
    ranked.map((item) => item.candidate.market_family),
    ["total_shots", "corners", "goals"]
  );
});

test("2. goals primero en el array de entrada no lo adelanta si tiene menor estimated_probability", () => {
  const goalsFirstInArray = entry("goals-2", "goals", 10, 0.55);
  const cardsLaterInArray = entry("cards-2", "cards", 11, 0.81);

  const ranked = rankJourneyCandidatesByDecision([goalsFirstInArray, cardsLaterInArray]);

  assert.equal(ranked[0].candidate.market_family, "cards");
  assert.notEqual(ranked[0].candidate.market_family, "goals");
});

test("3. Empate de estimated_probability conserva el orden estable de entrada", () => {
  const first = entry("shots_on_goal-3", "shots_on_goal", 20, 0.70);
  const second = entry("corners-3", "corners", 21, 0.70);

  const ranked = rankJourneyCandidatesByDecision([first, second]);

  assert.deepEqual(
    ranked.map((item) => item.candidate.candidate_id),
    ["shots_on_goal-3", "corners-3"]
  );
});

test("4. El sort no cambia candidate_id/family/direction/line/estimated_probability/sports_score ni elimina candidatos; Parlay/Soñadora no reintroducen prioridad fija por familia", () => {
  const source = [
    entry("goals-4", "goals", 30, 0.60),
    entry("total_shots-4", "total_shots", 31, 0.90),
    entry("shots_on_goal-4", "shots_on_goal", 32, 0.75),
    entry("cards-4", "cards", 33, 0.40),
    entry("corners-4", "corners", 34, 0.85),
  ];
  const byId = new Map(source.map((item) => [item.candidate.candidate_id, item.candidate]));

  const ranked = rankJourneyCandidatesByDecision(source);

  assert.equal(ranked.length, source.length);
  for (const item of ranked) {
    const original = byId.get(item.candidate.candidate_id);
    assert.ok(original, `candidato ${item.candidate.candidate_id} no debe desaparecer`);
    assert.equal(item.candidate.market_family, original.market_family);
    assert.equal(item.candidate.direction, original.direction);
    assert.equal(item.candidate.line, original.line);
    assert.equal(item.candidate.estimated_probability, original.estimated_probability);
    assert.equal(item.candidate.sports_score, original.sports_score);
  }

  // Mismo universo, product "parlay" (el que usa selectCombinationJourneyCandidates
  // para Parlay/Soñadora): tampoco reaparece una prioridad fija por familia.
  const rankedForParlay = rankJourneyCandidatesByDecision(source, { product: "parlay" });
  assert.deepEqual(
    rankedForParlay.map((item) => item.candidate.market_family),
    ["total_shots", "corners", "shots_on_goal", "goals", "cards"]
  );
});
