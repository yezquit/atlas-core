import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

let clientSource;
let journeyCardBlock;
let journeyResultBlock;

test.before(async () => {
  clientSource = await readFile(path.resolve("src/app/atlas-functional-client.js"), "utf8");
  journeyCardBlock = clientSource.slice(
    clientSource.indexOf("function JourneyCandidateCard("),
    clientSource.indexOf("const VALUE_STATUS_LABELS"),
  );
  journeyResultBlock = clientSource.slice(
    clientSource.indexOf('{journey && journeyProductMode === "classic" ? ('),
    clientSource.indexOf(') : journey && journeyProductMode === "value" ? ('),
  );
});

test("A. Jornada clásica conserva recommendedCandidates y su presentación histórica", () => {
  assert.match(journeyResultBlock, /journey\.recommendedCandidates/);
  assert.match(journeyCardBlock, /candidate\.probabilityPercent/);
  assert.match(journeyCardBlock, /candidate\.probabilityClassification/);
  assert.match(journeyCardBlock, /MetricLabel label="PROBABILIDAD ESTIMADA"/);
});

test("B-G. Jornada consume la shortlist Asian en sección propia y respeta el orden backend", () => {
  // La shortlist ahora mezcla asian_total_goals y team_asian_handicap: el
  // título se generalizó a "OPCIONES ASIÁTICAS" (cada tarjeta ya distingue
  // cuál de las dos familias es vía displayMarket(candidate.marketId)).
  assert.match(journeyResultBlock, /OPCIONES ASIÁTICAS/);
  assert.match(journeyResultBlock, /\(journey\.asianRecommendedCandidates \|\| \[\]\)\.map/);
  assert.match(journeyResultBlock, /<JourneyCandidateCard[^>]+candidate=\{candidate\}/);
});

test("C-F. una tarjeta Asian muestra Favorabilidad /100 y Solidez, nunca la etiqueta de probabilidad literal", () => {
  assert.match(journeyCardBlock, /candidateProbabilityDisplay\(\{/);
  assert.match(journeyCardBlock, /probability_semantics: candidate\.probabilitySemantics/);
  assert.match(journeyCardBlock, /sports_favorability: candidate\.sportsFavorability/);
  assert.match(journeyCardBlock, /probabilityDisplay\.label/);
  assert.match(journeyCardBlock, /probabilityDisplay\.formatted/);
  assert.match(journeyCardBlock, /candidate\.sportsScore/);
  assert.match(clientSource, /formatted: value === null \? "No disponible" : `\$\{value\}\/100`/);
  assert.match(journeyCardBlock, /isLiteralProbability/);
});

test("H. shortlist Asian ausente o vacía no inventa candidatos ni 0%", () => {
  assert.match(journeyResultBlock, /\(journey\.asianRecommendedCandidates \|\| \[\]\)\.length/);
  const asianSection = journeyResultBlock.slice(journeyResultBlock.indexOf("OPCIONES ASIÁTICAS"));
  assert.doesNotMatch(asianSection, /0%/);
});

test("I. la semántica clásica continúa separada de settlement_favorability", () => {
  assert.match(journeyCardBlock, /probabilityDisplay\.isLiteralProbability/);
  assert.match(clientSource, /source\.probability_semantics === "settlement_favorability"/);
});
