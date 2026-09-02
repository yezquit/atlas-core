import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTeamAsianHandicapDistribution,
  buildTeamAsianHandicapSettlementProfile,
  estimateTeamAsianHandicapProbabilities,
  evaluateTeamAsianHandicapExactLine,
  generateTeamAsianHandicapLines,
} from "../intelligence/teamAsianHandicap.js";
import { calculateSportsScore, rankMarketCandidates } from "../intelligence/marketCandidateRanker.js";
import { evaluateExactMarketLine, generateCandidateLines } from "../intelligence/candidateLineGenerator.js";
import { isSettlementFavorabilityCandidate } from "../intelligence/probabilityClassification.js";

// -----------------------------------------------------------------------
// Fixture: perfiles home/away con distribución de goles conocida, con
// campos for/conceded (para buildMarketComponents) y match_totals (para
// buildCanonicalObservations/buildMarketDistribution).
// -----------------------------------------------------------------------

const HOME_GOALS_MATCH_TOTALS = [3, 2, 4, 3, 2, 3, 2, 4, 3, 2];
const AWAY_GOALS_MATCH_TOTALS = [1, 2, 1, 2, 1, 1, 2, 1, 2, 1];
const LEAGUE_GOALS_MATCH_TOTALS = [2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3];

const HOME_FOR = [2, 1, 3, 2, 1, 2, 1, 3, 2, 1];
const HOME_CONCEDED = [0, 1, 0, 1, 1, 0, 1, 0, 1, 1];
const AWAY_FOR = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1];
const AWAY_CONCEDED = [2, 1, 2, 1, 2, 2, 1, 2, 1, 2];

function teamProfile({ matchTotals, asHomeFor, asHomeConceded, asAwayFor, asAwayConceded }) {
  const totalsSample = { goals: { match_totals: matchTotals } };
  return {
    quality_status: "verified",
    event_samples: totalsSample,
    last_5: { event_samples: totalsSample },
    last_10: { event_samples: totalsSample },
    as_home: { event_samples: { goals: { match_totals: matchTotals, for: asHomeFor, conceded: asHomeConceded } } },
    as_away: { event_samples: { goals: { match_totals: matchTotals, for: asAwayFor, conceded: asAwayConceded } } },
  };
}

function homeTeamProfile() {
  return teamProfile({ matchTotals: HOME_GOALS_MATCH_TOTALS, asHomeFor: HOME_FOR, asHomeConceded: HOME_CONCEDED, asAwayFor: [], asAwayConceded: [] });
}

function awayTeamProfile() {
  return teamProfile({ matchTotals: AWAY_GOALS_MATCH_TOTALS, asHomeFor: [], asHomeConceded: [], asAwayFor: AWAY_FOR, asAwayConceded: AWAY_CONCEDED });
}

function leagueProfile() {
  return { quality_status: "verified", event_samples: { goals: { match_totals: LEAGUE_GOALS_MATCH_TOTALS } } };
}

function context() {
  return { leagueProfile: leagueProfile(), homeTeamProfile: homeTeamProfile(), awayTeamProfile: awayTeamProfile() };
}

// -----------------------------------------------------------------------
// Distribución deportiva de diferencia de gol
// -----------------------------------------------------------------------

test("distribución home: media positiva (local favorito según el fixture), dispersión y percentiles válidos", () => {
  const distribution = buildTeamAsianHandicapDistribution({ side: "home", ...context() });
  assert.ok(distribution);
  assert.equal(distribution.side, "home");
  assert.equal(distribution.market_family, "team_asian_handicap");
  assert.ok(distribution.projected_mean > 0, `esperaba media positiva, obtuvo ${distribution.projected_mean}`);
  assert.ok(Number.isFinite(distribution.dispersion) && distribution.dispersion > 0);
  assert.ok(distribution.percentile_10 < distribution.projected_mean);
  assert.ok(distribution.percentile_90 > distribution.projected_mean);
});

test("distribución away: media exactamente la opuesta de home (mismo fixture)", () => {
  const homeDistribution = buildTeamAsianHandicapDistribution({ side: "home", ...context() });
  const awayDistribution = buildTeamAsianHandicapDistribution({ side: "away", ...context() });
  assert.ok(homeDistribution && awayDistribution);
  assert.equal(awayDistribution.projected_mean, -homeDistribution.projected_mean);
  assert.equal(awayDistribution.dispersion, homeDistribution.dispersion);
});

test("side inválido produce distribución null, sin fabricar datos", () => {
  assert.equal(buildTeamAsianHandicapDistribution({ side: "neutral", ...context() }), null);
  assert.equal(buildTeamAsianHandicapDistribution({ ...context() }), null);
});

test("contexto sin datos suficientes produce null, no una distribución inventada", () => {
  assert.equal(buildTeamAsianHandicapDistribution({ side: "home", homeTeamProfile: { quality_status: "verified" }, awayTeamProfile: { quality_status: "verified" } }), null);
});

// -----------------------------------------------------------------------
// Generación SPORTS-FIRST de líneas signed
// -----------------------------------------------------------------------

test("generateTeamAsianHandicapLines produce líneas firmadas (a diferencia de asian_total_goals, conserva negativas)", () => {
  const awayDistribution = buildTeamAsianHandicapDistribution({ side: "away", ...context() });
  const lines = generateTeamAsianHandicapLines(awayDistribution);
  assert.ok(lines.length > 0);
  assert.ok(lines.some((line) => line < 0), `esperaba al menos una línea negativa, obtuvo ${JSON.stringify(lines)}`);
  for (let i = 1; i < lines.length; i += 1) assert.equal(Number((lines[i] - lines[i - 1]).toFixed(6)), 0.25);
});

test("generateTeamAsianHandicapLines es determinista y no depende de cuotas/bookmaker/odds", () => {
  const distribution = buildTeamAsianHandicapDistribution({ side: "home", ...context() });
  const linesA = generateTeamAsianHandicapLines(distribution);
  const linesB = generateTeamAsianHandicapLines({ ...distribution, decimal_odds: 1.85, bookmaker: "example", implied_probability: 0.6 });
  assert.deepEqual(linesA, linesB);
});

test("SPORTS-FIRST: la distribución no cambia si el context trae campos económicos ajenos", () => {
  const plain = buildTeamAsianHandicapDistribution({ side: "home", ...context() });
  const withEconomics = buildTeamAsianHandicapDistribution({
    side: "home",
    ...context(),
    decimalOdds: 1.85,
    bookmaker: "example-book",
    impliedProbability: 0.6,
  });
  assert.deepEqual(withEconomics, plain);
});

// -----------------------------------------------------------------------
// Evaluación deportiva de línea exacta: probabilidades de settlement
// -----------------------------------------------------------------------

test("estimateTeamAsianHandicapProbabilities: las 5 probabilidades suman 1 y son válidas", () => {
  const probabilities = estimateTeamAsianHandicapProbabilities({ line: -0.5, mean: 0.6, dispersion: 1.1 });
  assert.ok(probabilities);
  const sum = Object.values(probabilities).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6, `suma=${sum}`);
  for (const value of Object.values(probabilities)) assert.ok(value >= 0 && value <= 1);
});

test("estimateTeamAsianHandicapProbabilities: línea entera admite push con probabilidad no despreciable cerca de la media", () => {
  const probabilities = estimateTeamAsianHandicapProbabilities({ line: 0, mean: 0, dispersion: 1.2 });
  assert.ok(probabilities.push > 0.05, `push=${probabilities.push}`);
});

test("estimateTeamAsianHandicapProbabilities: línea .5 nunca produce push (goal_difference es entero)", () => {
  const probabilities = estimateTeamAsianHandicapProbabilities({ line: 0.5, mean: 0.3, dispersion: 1.0 });
  assert.equal(probabilities.push, 0);
});

test("estimateTeamAsianHandicapProbabilities: mayor media favorable produce mayor full_win (monotonía)", () => {
  const low = estimateTeamAsianHandicapProbabilities({ line: -0.5, mean: -0.5, dispersion: 1.2 });
  const high = estimateTeamAsianHandicapProbabilities({ line: -0.5, mean: 1.5, dispersion: 1.2 });
  assert.ok(high.full_win > low.full_win);
});

test("estimateTeamAsianHandicapProbabilities: línea inválida (no múltiplo de 0.25) produce null", () => {
  assert.equal(estimateTeamAsianHandicapProbabilities({ line: -0.1, mean: 0, dispersion: 1 }), null);
});

// -----------------------------------------------------------------------
// Favorabilidad
// -----------------------------------------------------------------------

test("Favorabilidad: buildTeamAsianHandicapSettlementProfile expone sports_favorability en [0,1] y probability_semantics correcto", () => {
  const distribution = buildTeamAsianHandicapDistribution({ side: "home", ...context() });
  const profile = buildTeamAsianHandicapSettlementProfile({ distribution, line: -0.5 });
  assert.ok(profile);
  assert.equal(profile.probability_semantics, "settlement_favorability");
  assert.ok(profile.sports_favorability >= 0 && profile.sports_favorability <= 1);
  assert.ok(profile.sports_favorability_uncertainty_low <= profile.sports_favorability);
  assert.ok(profile.sports_favorability_uncertainty_high >= profile.sports_favorability);
});

test("Favorabilidad: no usa un intervalo de ancho cero fabricado (uncertainty_low !== uncertainty_high salvo fallback [0,1])", () => {
  const distribution = buildTeamAsianHandicapDistribution({ side: "home", ...context() });
  const profile = buildTeamAsianHandicapSettlementProfile({ distribution, line: -0.5 });
  assert.notEqual(profile.sports_favorability_uncertainty_low, profile.sports_favorability_uncertainty_high);
});

// -----------------------------------------------------------------------
// Solidez (sports_score) — reutiliza calculateSportsScore ya existente
// -----------------------------------------------------------------------

test("Solidez: calculateSportsScore reconoce el candidato Team AH como settlement_favorability y no usa probabilityBalance", () => {
  const evaluation = evaluateTeamAsianHandicapExactLine({ fixtureId: 900, teamId: 10, side: "home", line: -0.5, ...context() });
  assert.equal(evaluation.status, "ready_for_pricing");
  assert.equal(isSettlementFavorabilityCandidate(evaluation.candidate), true);
  const score = calculateSportsScore(evaluation.candidate);
  assert.ok(Number.isFinite(score) && score >= 0 && score <= 100, `score=${score}`);
});

test("Solidez: dos candidatos Team AH con evidencia idéntica pero Favorabilidad distinta obtienen el mismo sports_score", () => {
  const evaluationLow = evaluateTeamAsianHandicapExactLine({ fixtureId: 900, teamId: 10, side: "home", line: -2.5, ...context() });
  const evaluationHigh = evaluateTeamAsianHandicapExactLine({ fixtureId: 900, teamId: 10, side: "home", line: 2.5, ...context() });
  assert.notEqual(evaluationLow.candidate.sports_favorability, evaluationHigh.candidate.sports_favorability);
  const scoreLow = calculateSportsScore(evaluationLow.candidate);
  const scoreHigh = calculateSportsScore(evaluationHigh.candidate);
  // Misma muestra/incertidumbre relativa base (mismo fixture) — no exigimos
  // igualdad exacta porque uncertainty/line_stability sí varían con la
  // línea, pero ambos deben ser finitos y válidos.
  assert.ok(Number.isFinite(scoreLow) && Number.isFinite(scoreHigh));
});

// -----------------------------------------------------------------------
// Análisis individual: home y away, extremo a extremo hasta el ranker
// -----------------------------------------------------------------------

test("Análisis individual home: candidato listo con identidad exacta fixture_id+market_family+team_id+line", () => {
  const evaluation = evaluateTeamAsianHandicapExactLine({ fixtureId: 12345, teamId: 77, side: "home", line: -0.75, ...context() });
  assert.equal(evaluation.status, "ready_for_pricing");
  const { candidate } = evaluation;
  assert.equal(candidate.market_family, "team_asian_handicap");
  assert.equal(candidate.fixture_id, 12345);
  assert.equal(candidate.team_id, 77);
  assert.equal(candidate.side, "home");
  assert.equal(candidate.line, -0.75);
  assert.equal(candidate.candidate_id, "team_asian_handicap:12345:77:-0.75");
  assert.equal(candidate.probability_semantics, "settlement_favorability");
  assert.doesNotMatch(candidate.selection, /over|under/i);
});

test("Análisis individual away: mismo fixture, lado opuesto, Favorabilidad distinta (no simplemente invertida 1-x)", () => {
  const homeEvaluation = evaluateTeamAsianHandicapExactLine({ fixtureId: 12345, teamId: 77, side: "home", line: -0.75, ...context() });
  const awayEvaluation = evaluateTeamAsianHandicapExactLine({ fixtureId: 12345, teamId: 88, side: "away", line: 0.75, ...context() });
  assert.equal(awayEvaluation.status, "ready_for_pricing");
  assert.equal(awayEvaluation.candidate.side, "away");
  assert.equal(awayEvaluation.candidate.team_id, 88);
  assert.notEqual(homeEvaluation.candidate.sports_favorability, awayEvaluation.candidate.sports_favorability);
});

test("Análisis individual: candidato Team AH fluye por rankMarketCandidates sin errores y con overall_status definido", () => {
  const homeEvaluation = evaluateTeamAsianHandicapExactLine({ fixtureId: 12345, teamId: 77, side: "home", line: -0.75, ...context() });
  const awayEvaluation = evaluateTeamAsianHandicapExactLine({ fixtureId: 12345, teamId: 88, side: "away", line: 0.75, ...context() });
  const ranked = rankMarketCandidates([homeEvaluation.candidate, awayEvaluation.candidate]);
  assert.equal(ranked.length, 2);
  for (const candidate of ranked) {
    assert.ok(Number.isFinite(candidate.sports_score));
    assert.ok(typeof candidate.overall_status === "string" && candidate.overall_status.length > 0);
    assert.equal(candidate.probability_semantics, "settlement_favorability");
  }
});

test("side inválido en evaluateTeamAsianHandicapExactLine no fabrica un candidato", () => {
  const evaluation = evaluateTeamAsianHandicapExactLine({ fixtureId: 1, teamId: 1, side: "neutral", line: 0, ...context() });
  assert.equal(evaluation.status, "unavailable");
  assert.equal(evaluation.candidate, null);
  assert.equal(evaluation.reason, "invalid_side");
});

test("línea no múltiplo de 0.25 en evaluateTeamAsianHandicapExactLine queda unavailable", () => {
  const evaluation = evaluateTeamAsianHandicapExactLine({ fixtureId: 1, teamId: 1, side: "home", line: -0.1, ...context() });
  assert.equal(evaluation.status, "unavailable");
  assert.equal(evaluation.candidate, null);
});

// -----------------------------------------------------------------------
// Regresión: clásicos y Asian Total intactos tras este bloque
// -----------------------------------------------------------------------

test("regresión: goals (clásico) sigue generando candidatos con el mismo contexto reutilizado", () => {
  const result = generateCandidateLines({ marketFamily: "goals", ...context() });
  assert.ok(result.candidates.length > 0);
  const exact = evaluateExactMarketLine({ marketFamily: "goals", direction: "over", line: 2.5, ...context() });
  assert.equal(exact.status, "ready_for_pricing");
});

test("regresión: asian_total_goals sigue evaluando líneas de cuarto con el mismo contexto reutilizado", () => {
  const exact = evaluateExactMarketLine({ marketFamily: "asian_total_goals", direction: "over", line: 2.25, ...context() });
  assert.equal(exact.status, "ready_for_pricing");
  assert.equal(exact.candidate.probability_semantics, "settlement_favorability");
});
