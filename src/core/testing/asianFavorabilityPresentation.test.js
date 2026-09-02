import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Este archivo sigue el mismo patrón de verificación que ya usa
// valueRadarAsianTotals.test.js para src/app/atlas-functional-client.js:
// aserciones sobre el código fuente, porque esta página no tiene un arnés de
// renderizado de componentes (jsdom/testing-library) en el repositorio.

let clientSource;
let rankerSource;

test.before(async () => {
  clientSource = await readFile(path.resolve("src/app/atlas-functional-client.js"), "utf8");
  rankerSource = await readFile(path.resolve("src/core/intelligence/marketCandidateRanker.js"), "utf8");
});

// -----------------------------------------------------------------------
// Helper semántico (sección 1)
// -----------------------------------------------------------------------

test("existe un helper semántico único que distingue Favorabilidad de Probabilidad", () => {
  assert.match(clientSource, /function isSettlementFavorabilitySource\(source\)/);
  assert.match(clientSource, /function candidateProbabilityDisplay\(source\)/);
  assert.match(clientSource, /source\.probability_semantics === "settlement_favorability"/);
  assert.match(clientSource, /source\.market_family === "asian_total_goals"/);
});

// -----------------------------------------------------------------------
// A. Mercado clásico — mantiene "Probabilidad Atlas" / "%"
// -----------------------------------------------------------------------

test("A. candidato clásico: el helper devuelve label 'Probabilidad Atlas' y formato con %", () => {
  assert.match(clientSource, /label: "Probabilidad Atlas"/);
  assert.match(clientSource, /formatted: percentValue === null \? "No disponible" : `\$\{percentValue\}%`/);
});

test("F. EconomicsPanel clásico sigue usando percentage()/pointsDifference() sobre la probabilidad cruda, sin cambios de fórmula", () => {
  assert.match(clientSource, /const rawEstimatedProbability = Number\.isFinite\(candidate\?\.estimated_probability\)/);
  assert.match(clientSource, /\["Probabilidad estimada Atlas", Number\.isFinite\(rawEstimatedProbability\) \? percentage\(rawEstimatedProbability\) : "No disponible"\]/);
  assert.match(clientSource, /pointsDifference\(rawEstimatedProbability, impliedProbability\)/);
});

// -----------------------------------------------------------------------
// B. asian_total_goals — Favorabilidad Atlas, formato /100
// -----------------------------------------------------------------------

test("B. candidato asian_total_goals: el helper devuelve label 'Favorabilidad Atlas' y formato /100, nunca %", () => {
  assert.match(clientSource, /label: "Favorabilidad Atlas"/);
  assert.match(clientSource, /formatted: value === null \? "No disponible" : `\$\{value\}\/100`/);
  // El branch de Favorabilidad no debe usar el sufijo "%" para su propio valor.
  const favorabilityBranch = clientSource.slice(
    clientSource.indexOf('label: "Favorabilidad Atlas",\n      isLiteralProbability: false,'),
    clientSource.indexOf('label: "Probabilidad Atlas",\n    isLiteralProbability: true,'),
  );
  assert.ok(favorabilityBranch.length > 0, "no se encontró el bloque de retorno de Favorabilidad");
  assert.doesNotMatch(favorabilityBranch, /`\$\{value\}%`/);
});

// ACTUALIZADO: la corrección económica de asian_total_goals autorizó mostrar
// una brecha PP válida (Probabilidad equivalente Atlas por precio vs.
// implícita) — el supuesto anterior "sin brecha PP" quedó obsoleto por
// diseño. Esta prueba ahora protege la regla nueva: la brecha SÍ puede
// mostrarse, pero únicamente si se deriva de price_equivalent_probability
// (raw_edge_pp/conservative_edge_pp), nunca de Favorabilidad ni de Solidez.
test("EconomicsPanel para asian_total_goals muestra Probabilidad equivalente Atlas por precio, Probabilidad implícita, Brecha de precio y Brecha conservadora — nunca calculadas desde Favorabilidad ni Solidez", () => {
  assert.match(clientSource, /const isAsianFavorability = isSettlementFavorabilitySource\(candidate\)/);
  assert.match(clientSource, /\["Cuota justa Atlas", Number\.isFinite\(fairOdds\)/);
  assert.match(clientSource, /\["EV técnico", Number\.isFinite\(expectedValue\)/);
  // Las props key (añadidas para corregir react/jsx-key) son parte del
  // contrato protegido: se exige la key EXACTA, no cualquier key.
  assert.match(clientSource, /<MetricLabel key="asian-favorability-label" label="Favorabilidad Atlas" \/>, probabilityDisplay\.formatted/);
  assert.match(clientSource, /<MetricLabel key="asian-price-equivalent-label" label="Probabilidad equivalente Atlas por precio" \/>, Number\.isFinite\(priceEquivalentProbability\)/);
  assert.match(clientSource, /\["Probabilidad implícita del mercado", hasExactQuote \? percentage\(impliedProbability\)/);
  assert.match(clientSource, /\["Brecha de precio", hasExactQuote && Number\.isFinite\(rawEdgePp\)/);
  assert.match(clientSource, /\["Brecha conservadora", hasExactQuote && Number\.isFinite\(conservativeEdgePp\)/);

  const asianEconomicsBlock = clientSource.slice(
    clientSource.indexOf("if (isAsianFavorability) {"),
    clientSource.indexOf("return (\n    <section className=\"p2-economics-panel\" aria-label=\"Información económica\">\n      <p className=\"eyebrow\">ECONOMÍA</p>\n      <DefinitionGrid entries={[\n        [\"Cuota\","),
  );
  // La brecha se lee directamente de priceAssessment.raw_edge_pp/
  // conservative_edge_pp (ya calculados correctamente en el core) — nunca se
  // deriva de probabilityDisplay (Favorabilidad) ni de sports_score (Solidez)
  // dentro de este componente.
  assert.match(asianEconomicsBlock, /const rawEdgePp = priceAssessment\?\.raw_edge_pp/);
  assert.match(asianEconomicsBlock, /const conservativeEdgePp = priceAssessment\?\.conservative_edge_pp/);
  assert.doesNotMatch(asianEconomicsBlock, /rawEdgePp = probabilityDisplay/);
  assert.doesNotMatch(asianEconomicsBlock, /pointsDifference\(probabilityDisplay/);
  assert.doesNotMatch(asianEconomicsBlock, /(rawEdgePp|conservativeEdgePp)\s*=[^;]*sports_score/);
  // "Probabilidad equivalente Atlas por precio" se explica como métrica de
  // precio, nunca como probabilidad literal de ganar.
  assert.match(
    clientSource,
    /"Probabilidad equivalente Atlas por precio": "Es la probabilidad equivalente del precio justo de Atlas[^"]*No es la probabilidad literal de ganar\."/,
  );
});

test("DirectorResult e InitialAnalysisResult usan el helper para el titular de probabilidad/favorabilidad", () => {
  assert.match(clientSource, /const primaryProbabilityDisplay = candidateProbabilityDisplay\(analysis\.marketSelection\?\.primary\)/);
  assert.match(clientSource, /<MetricLabel label=\{primaryProbabilityDisplay\.label\} \/>/);
  assert.match(clientSource, /<MetricLabel label=\{candidateProbabilityDisplay\(primary\)\.label\} \/>/);
});

// -----------------------------------------------------------------------
// C. Perfil FW/HW/Push/HL/FL
// -----------------------------------------------------------------------

test("C. AsianSettlementBreakdown muestra el perfil completo con las 5 etiquetas legibles, subordinado y sin inventar campos faltantes", () => {
  assert.match(clientSource, /function AsianSettlementBreakdown\(\{ profile \}\)/);
  assert.match(clientSource, /\["full_win", "Gana completa"\]/);
  assert.match(clientSource, /\["half_win", "Gana media"\]/);
  assert.match(clientSource, /\["push", "Devolución"\]/);
  assert.match(clientSource, /\["half_loss", "Pierde media"\]/);
  assert.match(clientSource, /\["full_loss", "Pierde completa"\]/);
  assert.match(clientSource, /\.filter\(\(\[key\]\) => Number\.isFinite\(probabilities\[key\]\)\)/);
  assert.match(clientSource, /<summary>Ver perfil de liquidación<\/summary>/);
});

// -----------------------------------------------------------------------
// D. Solidez sigue separada
// -----------------------------------------------------------------------

test("D. Solidez Atlas sigue calculándose desde sports_score, no desde sports_favorability", () => {
  assert.match(clientSource, /MetricLabel label="SOLIDEZ ATLAS" \/><\/small> <strong>\{Number\.isFinite\(analysis\.marketSelection\?\.primary\?\.sports_score\)/);
  assert.doesNotMatch(clientSource, /SOLIDEZ ATLAS[^`]*sports_favorability/);
});

// -----------------------------------------------------------------------
// E. Radar asiático — sin brecha PP entre Favorabilidad e implied probability
// -----------------------------------------------------------------------

test("E. ValueOpportunityCard usa el helper para su etiqueta y conserva las fórmulas económicas existentes sin agregar una brecha PP nueva", () => {
  assert.match(clientSource, /\[candidateProbabilityDisplay\(opportunity\)\.label, candidateProbabilityDisplay\(opportunity\)\.formatted\]/);
  // Las fórmulas de raw_edge_pp / conservative_edge_pp / fair_odds_atlas / expected_roi
  // siguen presentándose exactamente igual (no se tocó valueRadar.js).
  assert.match(clientSource, /\["Raw edge", Number\.isFinite\(opportunity\.raw_edge_pp\)/);
  assert.match(clientSource, /\["Edge conservador", Number\.isFinite\(opportunity\.conservative_edge_pp\)/);
  assert.match(clientSource, /\["Cuota justa Atlas", Number\.isFinite\(opportunity\.fair_odds_atlas\)/);
  assert.match(clientSource, /\["EV \/ ROI esperado", Number\.isFinite\(opportunity\.expected_roi\)/);
  // No se agrega ningún nuevo pointsDifference/brecha usando sports_favorability
  // o opportunity.estimated_probability directamente contra implied_probability
  // dentro de ValueOpportunityCard.
  const cardStart = clientSource.indexOf("function ValueOpportunityCard(");
  const cardEnd = clientSource.indexOf("\nfunction ", cardStart + 10);
  const cardSource = clientSource.slice(cardStart, cardEnd === -1 ? undefined : cardEnd);
  assert.doesNotMatch(cardSource, /pointsDifference\(opportunity\.estimated_probability/);
});

// ACTUALIZADO: la corrección económica de asian_total_goals reemplazó
// deliberadamente weighted_win_probability por price_equivalent_probability
// en raw_edge_pp — el supuesto anterior ("valueRadar.js no fue modificado")
// quedó obsoleto por diseño. Esta prueba ahora protege la regla nueva:
// raw_edge_pp asiático se deriva de price_equivalent_probability, nunca de
// weighted_win_probability ni de Favorabilidad; la rama clásica conserva
// probability - implied sin cambios.
test("valueRadar.js: raw_edge_pp asiático usa price_equivalent_probability, no weighted_win_probability ni Favorabilidad; la rama clásica no cambió", async () => {
  const valueRadarSource = await readFile(path.resolve("src/core/intelligence/valueRadar.js"), "utf8");
  // settlementAware generaliza el antiguo booleano `asian` a toda familia de
  // settlement de 5 estados (hoy: asian_total_goals, team_asian_handicap) —
  // mismo comportamiento para asian_total_goals, sin cambio de fórmula.
  assert.match(valueRadarSource, /const priceEquivalentProbability = settlementAware \? asianSettlementProfile\?\.price_equivalent_probability : null;/);
  assert.match(
    valueRadarSource,
    /const rawEdge = settlementAware\s*\n\s*\? \(Number\.isFinite\(priceEquivalentProbability\) \? \(priceEquivalentProbability - implied\) \* 100 : null\)\s*\n\s*: \(probability - implied\) \* 100;/,
  );
  assert.doesNotMatch(valueRadarSource, /asianSettlementProfile\.weighted_win_probability - implied/);
  assert.doesNotMatch(valueRadarSource, /sports_favorability - implied/);
});

// -----------------------------------------------------------------------
// Rank reason (sección 5) — solo texto, sin tocar cálculo/ranking
// -----------------------------------------------------------------------

test("rankReason distingue Favorabilidad de Probabilidad sin tocar calculateSportsScore ni el comparator", () => {
  assert.match(rankerSource, /const isSettlementFavorability = candidate\.probability_semantics === "settlement_favorability" \|\| candidate\.market_family === "asian_total_goals"/);
  assert.match(rankerSource, /Favorabilidad Atlas \$\{Math\.round\(candidate\.preliminary_probability \* 100\)\}\/100/);
  assert.match(rankerSource, /no es una probabilidad literal de ganar/);
  // calculateSportsScore conserva exactamente su fórmula original (ancla 0.68 sin tocar).
  assert.match(rankerSource, /const probabilityBalance = clamp\(100 - Math\.abs\(probability - 0\.68\) \* 180\)/);
});

// -----------------------------------------------------------------------
// Fallback para registros anteriores (sección 10)
// -----------------------------------------------------------------------

test("el fallback usa market_family cuando falta probability_semantics, sin reinterpretar otras familias", () => {
  assert.match(clientSource, /if \(source\.probability_semantics === "settlement_favorability"\) return true;\s*\n\s*return source\.market_family === "asian_total_goals";/);
});

// -----------------------------------------------------------------------
// No integración a Jornada (sección 12)
// -----------------------------------------------------------------------

test("SPORTS_MARKETS y el checkbox de Jornada no fueron tocados en esta fase", async () => {
  const marketEngineSource = await readFile(path.resolve("src/core/intelligence/marketEngine.js"), "utf8");
  const start = marketEngineSource.indexOf("export const SPORTS_MARKETS = Object.freeze([");
  assert.ok(start !== -1, "no se encontró la definición de SPORTS_MARKETS");
  const end = marketEngineSource.indexOf("]);", start);
  const sportsMarketsBlock = marketEngineSource.slice(start, end);
  assert.doesNotMatch(sportsMarketsBlock, /asian_total_goals/);
});
