import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Mismo patrón que asianFavorabilityPresentation.test.js: aserciones sobre el
// código fuente, porque atlas-functional-client.js no tiene un arnés de
// renderizado de componentes en este repositorio.

let clientSource;
let directorSource;

test.before(async () => {
  clientSource = await readFile(path.resolve("src/app/atlas-functional-client.js"), "utf8");
  directorSource = await readFile(path.resolve("src/core/modules/directorAtlas.js"), "utf8");
});

// -----------------------------------------------------------------------
// 8. Presentación económica
// -----------------------------------------------------------------------

test("EconomicsPanel asiático muestra Favorabilidad, Solidez, Cuota justa, Probabilidad equivalente, implícita, brechas y EV técnico", () => {
  // Las props key (añadidas para corregir react/jsx-key) son parte del
  // contrato protegido: se exige la key EXACTA, no cualquier key.
  assert.match(clientSource, /<MetricLabel key="asian-favorability-label" label="Favorabilidad Atlas" \/>, probabilityDisplay\.formatted/);
  assert.match(clientSource, /\["Cuota justa Atlas", Number\.isFinite\(fairOdds\)/);
  assert.match(clientSource, /<MetricLabel key="asian-price-equivalent-label" label="Probabilidad equivalente Atlas por precio" \/>/);
  assert.match(clientSource, /\["Probabilidad implícita del mercado", hasExactQuote \? percentage\(impliedProbability\)/);
  assert.match(clientSource, /\["Brecha de precio",/);
  assert.match(clientSource, /\["Brecha conservadora",/);
  assert.match(clientSource, /\["EV técnico", Number\.isFinite\(expectedValue\)/);
});

test("METRIC_HINTS incluye la explicación exacta pedida para Probabilidad equivalente Atlas por precio", () => {
  assert.match(
    clientSource,
    /"Probabilidad equivalente Atlas por precio": "Es la probabilidad equivalente del precio justo de Atlas teniendo en cuenta ganancias medias, devoluciones y pérdidas medias\. No es la probabilidad literal de ganar\."/,
  );
});

test("EconomicsPanel NUNCA calcula la brecha de precio a partir de Favorabilidad ni de Solidez", () => {
  const start = clientSource.indexOf("if (isAsianFavorability) {");
  const end = clientSource.indexOf("\n  const rawEstimatedProbability = Number.isFinite(candidate?.estimated_probability)");
  const asianBlock = clientSource.slice(start, end === -1 ? undefined : end);
  assert.doesNotMatch(asianBlock, /pointsDifference\(probabilityDisplay/);
  assert.doesNotMatch(asianBlock, /sports_score.*implied|implied.*sports_score/);
  // La brecha debe derivarse de priceAssessment.raw_edge_pp / conservative_edge_pp,
  // nunca de probabilityDisplay (que representa Favorabilidad).
  assert.match(asianBlock, /rawEdgePp = priceAssessment\?\.raw_edge_pp/);
  assert.match(asianBlock, /conservativeEdgePp = priceAssessment\?\.conservative_edge_pp/);
});

test("ValueOpportunityCard expone Probabilidad equivalente Atlas por precio en el detalle técnico asiático", () => {
  // key EXACTA exigida (añadida para corregir react/jsx-key), distinta de la
  // del EconomicsPanel para mantener unicidad dentro de cada árbol JSX.
  assert.match(clientSource, /asian \? \[\[<MetricLabel key="value-opportunity-price-equivalent-label" label="Probabilidad equivalente Atlas por precio" \/>, Number\.isFinite\(opportunity\.price_equivalent_probability\)/);
});

test("VersionComparison distingue Favorabilidad Atlas (/100) de Probabilidad preliminar (%) sin depender de un campo nuevo en el diff", () => {
  assert.match(clientSource, /const isFavorabilityComparison = isSettlementFavorabilitySource\(analysis\?\.marketSelection\?\.primary\)/);
  assert.match(clientSource, /const favorabilityCell = \(value\) => Number\.isFinite\(value\) \? `\$\{Math\.round\(value \* 100\)\}\/100`/);
  assert.match(clientSource, /isFavorabilityComparison\s*\n\s*\? \["Favorabilidad Atlas", favorabilityCell/);
});

test("NumbersExplanation tiene un guard explícito: para asian_total_goals usa price_equivalent_probability, nunca Favorabilidad vs implied", () => {
  assert.match(clientSource, /const isAsianPrice = priceAssessment\?\.market_family === "asian_total_goals"/);
  assert.match(clientSource, /estimatedProbability: isAsianPrice \? priceAssessment\?\.price_equivalent_probability : priceAssessment\?\.preliminary_probability/);
  assert.match(clientSource, /gapPoints: isAsianPrice \? priceAssessment\?\.raw_edge_pp : priceAssessment\?\.price_gap_percentage_points/);
  assert.match(clientSource, /isPriceEquivalent: isAsianPrice/);
  assert.match(clientSource, /La probabilidad equivalente Atlas por precio para/);
});

test("presentación clásica de EconomicsPanel/NumbersExplanation permanece sin cambios de fórmula", () => {
  assert.match(clientSource, /\["Diferencia vs cuota", hasExactQuote \? \(pointsDifference\(rawEstimatedProbability, impliedProbability\)/);
  assert.match(clientSource, /: `Atlas calcula aproximadamente un \$\{estimatedPercent\}% de probabilidad para/);
});

// -----------------------------------------------------------------------
// 9. DirectorAtlas — parlay_eligibility_reason
// -----------------------------------------------------------------------

test("parlay_eligibility_reason usa price_equivalent_probability para settlement_favorability, sin cambiar priceStatus/parlayEligibility", () => {
  assert.match(directorSource, /marketCandidate\?\.probability_semantics === "settlement_favorability" \|\| marketCandidate\?\.market_family === "asian_total_goals"/);
  assert.match(directorSource, /superior a la probabilidad equivalente Atlas por precio del/);
  assert.match(directorSource, /no es la probabilidad literal de ganar/);
  // La rama clásica conserva exactamente el texto anterior.
  assert.match(directorSource, /superior a la estimación preliminar de Atlas del \$\{Number\(\(Number\(probability\) \* 100\)\.toFixed\(1\)\)\}%\.`/);
});

test("directorAtlas.js no cambió priceStatus/parlayEligibility (solo la redacción del texto)", () => {
  assert.match(directorSource, /const priceStatus = priceEvaluation\.status;/);
  assert.match(directorSource, /parlay_eligibility: parlayEligibility,/);
});
