import test from "node:test";
import assert from "node:assert/strict";

import {
  TEAM_ASIAN_HANDICAP_FAMILY,
  buildTeamAsianHandicapSettlementProfile,
} from "../intelligence/teamAsianHandicap.js";
import { evaluateValueOpportunity, rankValueOpportunities } from "../intelligence/valueRadar.js";
import { settlementFairOdds } from "../intelligence/settlementMath.js";

// Mismo patrón que valueRadarAsianTotals.test.js: evaluateValueOpportunity
// probado directamente con candidato/cuota sintéticos, sin necesidad de
// reconstruir todo el pipeline de Jornada/Individual.

function profileFor(line, { mean = 1.2, dispersion = 1.1, effectiveSampleSize = 40 } = {}) {
  return buildTeamAsianHandicapSettlementProfile({
    distribution: { projected_mean: mean, dispersion, effective_sample_size: effectiveSampleSize, side: "home" },
    line,
  });
}

function teamAhCandidate({ line = -1.5, teamId = 10, profile = profileFor(line) } = {}) {
  return {
    fixture_id: 1,
    market_family: TEAM_ASIAN_HANDICAP_FAMILY,
    team_id: teamId,
    side: "home",
    direction: "home",
    line,
    estimated_probability: profile.sports_favorability,
    uncertainty_low: profile.sports_favorability_uncertainty_low,
    sports_score: 66,
    profile,
  };
}

function quoteFor({ line = -1.5, teamId = 10, odds = 1.9 } = {}) {
  return { fixture_id: 1, market_family: TEAM_ASIAN_HANDICAP_FAMILY, team_id: teamId, line, decimal_odds: odds, bookmaker_name: "Betano", quote_id: `q-team-ah-${teamId}-${line}` };
}

// -----------------------------------------------------------------------
// Identidad exacta por equipo + línea (nunca direction=over/under).
// -----------------------------------------------------------------------

test("identidad exacta usa team_id + line, no direction=over/under", () => {
  const candidate = teamAhCandidate({ line: -1.5, teamId: 10 });
  const sameTeam = evaluateValueOpportunity({ candidate, quote: quoteFor({ line: -1.5, teamId: 10 }), asianSettlementProfile: candidate.profile });
  assert.equal(sameTeam.quote_exact, true);

  const otherTeam = evaluateValueOpportunity({ candidate, quote: quoteFor({ line: -1.5, teamId: 20 }), asianSettlementProfile: candidate.profile });
  assert.equal(otherTeam.quote_exact, false);
  assert.equal(otherTeam.status, "not_evaluable");

  const otherLine = evaluateValueOpportunity({ candidate, quote: quoteFor({ line: -1.25, teamId: 10 }), asianSettlementProfile: candidate.profile });
  assert.equal(otherLine.quote_exact, false);
});

// -----------------------------------------------------------------------
// Fair odds / price_equivalent_probability / EV — reutilizan
// settlementFairOdds/settlementExpectedValue genéricos, no duplican
// matemática.
// -----------------------------------------------------------------------

test("fair odds y EV de Team AH usan las mismas fórmulas genéricas que asian_total_goals", () => {
  const candidate = teamAhCandidate({ line: -1.5, teamId: 10 });
  const result = evaluateValueOpportunity({ candidate, quote: quoteFor({ line: -1.5, teamId: 10, odds: 2.5 }), asianSettlementProfile: candidate.profile });
  assert.ok(Math.abs(result.fair_odds_atlas - settlementFairOdds(candidate.profile)) < 1e-6);
  assert.ok(Number.isFinite(result.price_equivalent_probability));
  assert.ok(Math.abs(result.price_equivalent_probability - 1 / result.fair_odds_atlas) < 1e-4);
  assert.ok(Number.isFinite(result.expected_roi));
});

// -----------------------------------------------------------------------
// Clasificación INTERESTING/WATCH/NO_VALUE — mismas reglas que Asian Total.
// -----------------------------------------------------------------------

test("EV<=0 clasifica NO_VALUE", () => {
  const candidate = teamAhCandidate({ line: -3.5, teamId: 10, profile: profileFor(-3.5) });
  const result = evaluateValueOpportunity({ candidate, quote: quoteFor({ line: -3.5, teamId: 10, odds: 1.2 }), asianSettlementProfile: candidate.profile });
  assert.equal(result.status, "no_value");
  assert.ok(result.expected_roi <= 0);
});

test("EV>0 y conservative_edge>0 clasifica INTERESTING; EV>0 con edge conservador<=0 clasifica WATCH", () => {
  // fairOdds ≈ 2.55 (1/price_equivalent_probability) y
  // 1/price_equivalent_probability_low ≈ 3.89 para este perfil — odds entre
  // ambos umbrales dan EV>0 con edge conservador negativo (WATCH); odds por
  // encima del segundo umbral dan también edge conservador positivo (INTERESTING).
  const candidate = teamAhCandidate({ line: -1.5, teamId: 10 });
  const interesting = evaluateValueOpportunity({ candidate, quote: quoteFor({ line: -1.5, teamId: 10, odds: 4.5 }), asianSettlementProfile: candidate.profile });
  assert.equal(interesting.status, "interesting");
  assert.ok(interesting.expected_roi > 0);
  assert.ok(interesting.conservative_edge_pp > 0);

  const watch = evaluateValueOpportunity({ candidate, quote: quoteFor({ line: -1.5, teamId: 10, odds: 3.0 }), asianSettlementProfile: candidate.profile });
  assert.ok(watch.expected_roi > 0);
  assert.ok(!(watch.conservative_edge_pp > 0));
  assert.equal(watch.status, "watch");
});

test("rankValueOpportunities ordena Team AH junto a otras familias por status/EV, sin reglas especiales", () => {
  const candidateInteresting = teamAhCandidate({ line: -1.5, teamId: 10 });
  const interesting = evaluateValueOpportunity({ candidate: candidateInteresting, quote: quoteFor({ line: -1.5, teamId: 10, odds: 3.5 }), asianSettlementProfile: candidateInteresting.profile });
  const candidateNoValue = teamAhCandidate({ line: -3.5, teamId: 10, profile: profileFor(-3.5) });
  const noValue = evaluateValueOpportunity({ candidate: candidateNoValue, quote: quoteFor({ line: -3.5, teamId: 10, odds: 1.2 }), asianSettlementProfile: candidateNoValue.profile });
  assert.deepEqual(rankValueOpportunities([noValue, interesting]), [interesting, noValue]);
});

// -----------------------------------------------------------------------
// Favorabilidad Atlas nunca se usa como probabilidad implícita/edge.
// -----------------------------------------------------------------------

test("Favorabilidad Atlas (sports_favorability) nunca participa en raw_edge_pp/conservative_edge_pp/fair_odds_atlas", () => {
  // Línea de cuarto (-1.25): produce masa de half_loss, donde
  // sports_favorability (media ponderada 5 estados) y
  // price_equivalent_probability (W/(W+L)) divergen realmente — el mejor
  // caso para detectar si raw_edge_pp usara Favorabilidad por error.
  const line = -1.25;
  const profile = profileFor(line);
  assert.notEqual(profile.sports_favorability, profile.price_equivalent_probability);
  const candidate = teamAhCandidate({ line, teamId: 10, profile });
  const result = evaluateValueOpportunity({ candidate, quote: quoteFor({ line, teamId: 10, odds: 2.5 }), asianSettlementProfile: candidate.profile });
  const impliedFromFavorability = (candidate.estimated_probability - result.implied_probability) * 100;
  assert.notEqual(Math.round(result.raw_edge_pp * 100), Math.round(impliedFromFavorability * 100));
  // Tolerancia laxa por redondeo: raw_edge_pp se redondea a 2 decimales en
  // valueRadar.js, price_equivalent_probability a 6 — no es imprecisión real.
  assert.ok(Math.abs(result.raw_edge_pp - (result.price_equivalent_probability - result.implied_probability) * 100) < 0.01);
});
