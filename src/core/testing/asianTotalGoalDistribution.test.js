import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  buildAsianTotalGoalDistribution,
  buildMarketDistribution,
  evaluateExactMarketLine,
  generateCandidateLines,
} from "../intelligence/candidateLineGenerator.js";
import { buildCanonicalObservations } from "../intelligence/canonicalObservations.js";

const samples = {
  goals: [1, 2, 3, 2, 1, 2, 3, 2, 1, 2],
  corners: [8, 10, 11, 9, 10, 12, 9, 11, 10, 8],
  cards: [3, 4, 5, 4, 3, 5, 4, 3, 4, 5],
  total_shots: [22, 25, 27, 24, 26, 23, 28, 25, 24, 26],
  shots_on_goal: [7, 9, 10, 8, 9, 11, 8, 10, 9, 7],
};

function profile() {
  const eventSamples = Object.fromEntries(Object.entries(samples).map(([family, values]) => [family, { match_totals: values }]));
  return { quality_status: "verified", event_samples: eventSamples, last_5: { event_samples: eventSamples }, last_10: { event_samples: eventSamples }, as_home: { event_samples: eventSamples }, as_away: { event_samples: eventSamples } };
}

function context() {
  return { leagueProfile: { quality_status: "verified", event_samples: profile().event_samples }, homeTeamProfile: profile(), awayTeamProfile: profile() };
}

// -----------------------------------------------------------------------
// A. Equivalencia con la infraestructura ya existente
// -----------------------------------------------------------------------

test("buildAsianTotalGoalDistribution equivale a construir canonicalObservations de goals + buildMarketDistribution", () => {
  const input = context();
  const result = buildAsianTotalGoalDistribution(input);
  const canonicalObservations = buildCanonicalObservations({ ...input, marketFamily: "goals" });
  const expected = buildMarketDistribution({ ...input, marketFamily: "goals", canonicalObservations });
  assert.deepEqual(result, expected);
  assert.ok(Number.isFinite(result.projected_mean));
  assert.ok(Number.isFinite(result.percentile_10));
  assert.ok(Number.isFinite(result.percentile_90));
  assert.ok(Number.isFinite(result.dispersion));
});

test("es también equivalente a buildMarketDistribution dejando que construya su propia canonicalObservations", () => {
  const input = context();
  const result = buildAsianTotalGoalDistribution(input);
  const expected = buildMarketDistribution({ ...input, marketFamily: "goals" });
  assert.deepEqual(result, expected);
});

// -----------------------------------------------------------------------
// B. Fuente correcta: siempre "goals", nunca otra familia ni la propia
//    "asian_total_goals"
// -----------------------------------------------------------------------

test("usa observaciones de la familia goals, no de otra familia con datos distintos", () => {
  const distribution = buildAsianTotalGoalDistribution(context());
  assert.equal(distribution.market_family, "goals");
  // Media de [1,2,3,2,1,2,3,2,1,2] = 1.9 — muy distinta de corners (~9.8) o
  // total_shots (~25). Confirma que no se coló la muestra de otra familia.
  assert.ok(distribution.projected_mean > 1 && distribution.projected_mean < 3, `projected_mean fuera de rango: ${distribution.projected_mean}`);
});

test("fuerza marketFamily a goals aunque el context declare otra cosa", () => {
  const withWrongFamily = { ...context(), marketFamily: "asian_total_goals" };
  const distribution = buildAsianTotalGoalDistribution(withWrongFamily);
  assert.equal(distribution.market_family, "goals");
});

test("coincide con la distribución que evaluateExactMarketLine ya deriva internamente para asian_total_goals", () => {
  const input = context();
  const distribution = buildAsianTotalGoalDistribution(input);
  const evaluation = evaluateExactMarketLine({ marketFamily: "asian_total_goals", direction: "over", line: 1.75, ...input });
  assert.equal(evaluation.status, "ready_for_pricing");
  assert.equal(evaluation.candidate.projected_mean, distribution.projected_mean);
});

// -----------------------------------------------------------------------
// C. Contexto vacío/insuficiente: degrada igual que la infraestructura ya
//    existente, sin inventar líneas ni estadísticas.
// -----------------------------------------------------------------------

test("contexto vacío degrada a null, igual que buildMarketDistribution", () => {
  assert.equal(buildAsianTotalGoalDistribution({}), null);
});

test("perfiles presentes pero sin muestras de goles degradan a null", () => {
  const empty = { leagueProfile: { quality_status: "verified", event_samples: {} }, homeTeamProfile: { quality_status: "verified" }, awayTeamProfile: { quality_status: "verified" } };
  assert.equal(buildAsianTotalGoalDistribution(empty), null);
});

// -----------------------------------------------------------------------
// D. Independencia económica: dependencia REAL, no forma superficial del
//    objeto de contexto.
// -----------------------------------------------------------------------

test("agregar campos económicos al context no cambia el resultado en absoluto", () => {
  const plain = buildAsianTotalGoalDistribution(context());
  const withEconomics = buildAsianTotalGoalDistribution({
    ...context(),
    decimalOdds: 1.85,
    decimal_odds: 2.1,
    bookmaker: "example-book",
    impliedProbability: 0.62,
    implied_probability: 0.62,
    oddsMarketLines: [1.5, 2.5, 3.5],
  });
  assert.deepEqual(withEconomics, plain);
});

test("el cuerpo de la función no referencia identificadores económicos en su propio código fuente", () => {
  const sourcePath = fileURLToPath(new URL("../intelligence/candidateLineGenerator.js", import.meta.url));
  const source = readFileSync(sourcePath, "utf8");
  const start = source.indexOf("export function buildAsianTotalGoalDistribution");
  assert.ok(start >= 0, "no se encontró buildAsianTotalGoalDistribution en el archivo");
  const end = source.indexOf("\n}", start) + 2;
  const body = source.slice(start, end);
  for (const forbidden of ["decimal_odds", "decimalOdds", "implied_probability", "impliedProbability", "bookmaker", "odds"]) {
    assert.equal(body.includes(forbidden), false, `buildAsianTotalGoalDistribution no debe referenciar "${forbidden}"`);
  }
});

// -----------------------------------------------------------------------
// E. Regresión: goals clásico no cambia.
// -----------------------------------------------------------------------

test("generateCandidateLines/evaluateExactMarketLine para goals no cambia tras añadir la función nueva", () => {
  const result = generateCandidateLines({ marketFamily: "goals", ...context() });
  assert.ok(result.candidates.length > 0);
  const exact = evaluateExactMarketLine({ marketFamily: "goals", direction: "over", line: 6.5, ...context() });
  assert.equal(exact.status, "ready_for_pricing");
  assert.equal(exact.candidate.line, 6.5);
  assert.equal(exact.candidate.market_family, "goals");
});
