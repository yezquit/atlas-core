import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { buildFixtureQuoteLedger, findFixtureQuoteEntry } from "../intelligence/fixtureQuoteLedger.js";
import { createManualOdds } from "../intelligence/oddsIntelligence.js";
import { evaluateMarketPrice } from "../intelligence/marketSuitability.js";
import { createMemoryOperationalHistory } from "../infrastructure/operationalHistory.js";

// ---------------------------------------------------------------------------
// Fase 4 — UX FINAL + TRANSPARENCIA ECONÓMICA: tests de presentación.
//
// atlas-functional-client.js es un client component con JSX; no hay
// jsdom/testing-library/react-dom en package.json y ningún test existente
// del repo lo renderiza (publicVoice.test.js, atlasVisualRedesign.test.js,
// matchEconomicsV3.test.js, localProductFinal.test.js: todos leen el
// código fuente y verifican por regex/substring). Este archivo sigue
// exactamente ese mismo patrón, sin exportar nada nuevo desde producción.
// ---------------------------------------------------------------------------

const clientPath = new URL("../../app/atlas-functional-client.js", import.meta.url);
const directorPath = new URL("../modules/directorAtlas.js", import.meta.url);
const cssPath = new URL("../../app/globals.css", import.meta.url);

function functionBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `no se encontró "${startMarker}" en el archivo`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `no se encontró "${endMarker}" después de "${startMarker}"`);
  return source.slice(start, end);
}

test("A. SOLIDEZ ATLAS y PROBABILIDAD ESTIMADA son etiquetas explícitas y distintas; sports_score nunca se llama probabilidad/Índice ATLAS/recomendabilidad", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /SOLIDEZ ATLAS/);
  assert.match(source, /PROBABILIDAD ESTIMADA/);
  const solidezLines = source.split("\n").filter((line) => line.includes("SOLIDEZ ATLAS"));
  assert.ok(solidezLines.length >= 2, "SOLIDEZ ATLAS debe aparecer tanto en Jornada como en DirectorResult");
  for (const line of solidezLines) {
    assert.doesNotMatch(line, /probabilidad/i);
    assert.doesNotMatch(line, /Índice ATLAS/i);
    assert.doesNotMatch(line, /recomendabilidad/i);
  }
});

test("B. Convergencia Radar (radar_score) nunca se presenta como probabilidad", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.ok(source.includes('["Convergencia Radar", Number.isFinite(radar.radar_score) ? `${radar.radar_score}/100` : "No disponible"],'));
  assert.ok(source.includes("Convergencia Radar resume la calidad y convergencia de las señales deportivas; no es una probabilidad."));
});

test("C. estados HIGH/LOW/NEUTRAL y OPORTUNIDAD ATLAS/EN OBSERVACIÓN están mapeados correctamente", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.ok(source.includes('const RADAR_DIRECTION_LABELS = { high: "ALTA", low: "BAJA", neutral: "NEUTRAL" };'));
  const block = functionBlock(source, "function radarOpportunityState(radar) {", "function adversarialStatusLabel");
  assert.match(block, /opportunity_detected === true/);
  assert.match(block, /label: "OPORTUNIDAD ATLAS"/);
  assert.match(block, /radar_direction === "neutral"/);
  assert.match(block, /label: "EN OBSERVACIÓN"/);
});

test("D. adversarial_passed === false con dirección no neutral tiene prioridad de presentación sobre opportunity_detected", async () => {
  const source = await readFile(clientPath, "utf8");
  const block = functionBlock(source, "function radarOpportunityState(radar) {", "function adversarialStatusLabel");
  const blockedConditionIndex = block.indexOf("radar.adversarial_passed === false");
  const opportunityConditionIndex = block.indexOf("radar.opportunity_detected === true");
  assert.notEqual(blockedConditionIndex, -1);
  assert.notEqual(opportunityConditionIndex, -1);
  assert.ok(
    blockedConditionIndex < opportunityConditionIndex,
    "la condición de BLOQUEADA POR CONTRAEVIDENCIA debe evaluarse antes que la de OPORTUNIDAD ATLAS, aunque opportunity_detected viniera true"
  );
  assert.match(block, /label: "BLOQUEADA POR CONTRAEVIDENCIA"/);
  assert.ok(source.includes('if (adversarialPassed === false) return "No superada";'));
});

test("E. model_coherence.coherent null/undefined nunca produce Coherencia correcta", async () => {
  const source = await readFile(clientPath, "utf8");
  const block = functionBlock(source, "function coherenceLabel(coherent) {", "function pointsDifference");
  assert.ok(block.includes('if (coherent === true) return "Coherencia correcta";'));
  assert.ok(block.includes('if (coherent === false) return "Coherencia problemática";'));
  // El fallback es incondicional (no comparado contra null): cualquier valor
  // que no sea exactamente true o false —incluido undefined, no solo
  // null— cae aquí, nunca en "Coherencia correcta".
  assert.match(block, /return "Coherencia desconocida";\s*\}\s*$/);
});

test("F. cuota exacta + implied_probability se presentan con el formatter existente (56.2%)", async () => {
  const source = await readFile(clientPath, "utf8");
  // Confirma primero, por source, que percentage() es la fórmula ya
  // existente sin cambios, y que EconomicsPanel la usa para la probabilidad
  // implícita.
  assert.ok(source.includes('return Number.isFinite(value) ? `${(value * 100).toFixed(1).replace(".0", "")}%` : "No disponible";'));
  assert.ok(source.includes('["Probabilidad implícita", hasExactQuote ? percentage(impliedProbability) : "No disponible"],'));

  // Comprobación del resultado esperado usando esa MISMA fórmula ya
  // confirmada arriba (no una reimplementación paralela de producción):
  // 1/1.78 ≈ 0.561797..., ×100 = 56.1797..., toFixed(1) = "56.2".
  const decimalOdds = 1.78;
  const impliedProbability = 1 / decimalOdds;
  const formatted = `${(impliedProbability * 100).toFixed(1).replace(".0", "")}%`;
  assert.equal(formatted, "56.2%");
});

test("G. la diferencia vs cuota se presenta en pp, nunca como EV/beneficio esperado/rentabilidad", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.ok(source.includes("function pointsDifference(estimated, implied) {"));
  assert.ok(source.includes("const rounded = Math.round((estimated - implied) * 1000) / 10;"));
  assert.ok(source.includes('return `${rounded >= 0 ? "+" : ""}${rounded.toFixed(1)} pp`;'));
  assert.ok(source.includes('["Diferencia vs cuota", hasExactQuote ? (pointsDifference(estimatedProbability, impliedProbability) ?? "No disponible") : "No disponible"],'));

  const economicsPanelBlock = functionBlock(source, "function EconomicsPanel(", "function RedTeamResult");
  assert.doesNotMatch(economicsPanelBlock, /\bEV\b/);
  assert.doesNotMatch(economicsPanelBlock, /beneficio esperado/i);
  assert.match(economicsPanelBlock, /No representa una garantía de rentabilidad\./);

  // Comprobación del resultado esperado usando la fórmula ya confirmada.
  const estimated = 0.68;
  const implied = 1 / 1.78;
  const rounded = Math.round((estimated - implied) * 1000) / 10;
  const formatted = `${rounded >= 0 ? "+" : ""}${rounded.toFixed(1)} pp`;
  assert.equal(formatted, "+11.8 pp");
});

test("H. sin cuota exacta: Cuota/Probabilidad implícita/Diferencia caen a No disponible, pero Probabilidad estimada Atlas no depende de la cuota", async () => {
  const source = await readFile(clientPath, "utf8");
  const economicsPanelBlock = functionBlock(source, "function EconomicsPanel(", "function RedTeamResult");
  assert.match(economicsPanelBlock, /\["Cuota", hasExactQuote/);
  assert.match(economicsPanelBlock, /\["Probabilidad implícita", hasExactQuote/);
  assert.match(economicsPanelBlock, /\["Diferencia vs cuota", hasExactQuote/);

  const probabilityRowMatch = economicsPanelBlock.match(/\["Probabilidad estimada Atlas",[^\]]*\]/);
  assert.ok(probabilityRowMatch, "debe existir la fila de Probabilidad estimada Atlas");
  const probabilityRow = probabilityRowMatch[0];
  assert.doesNotMatch(probabilityRow, /hasExactQuote/);
  assert.match(probabilityRow, /Number\.isFinite\(estimatedProbability\)/);
});

const FIXTURE_ID = 5_551_001;
const OTHER_FIXTURE_ID = 5_551_002;
const KICKOFF = "2026-09-01T20:00:00.000Z";

function manualQuote({ family, direction, line, odds, observedAt, analyzedAt }) {
  return createManualOdds({
    fixtureId: FIXTURE_ID,
    bookmaker: "Betano",
    marketFamily: family,
    marketName: family,
    selection: `${direction === "under" ? "Under" : "Over"} ${line}`,
    direction,
    line,
    decimalOdds: odds,
    receivedAt: observedAt,
    analyzedAt,
    kickoff: KICKOFF,
    timezone: "America/Bogota",
    analysisVersion: "initial",
  });
}

function analysisVersionFor({ id, family, probability, quote, createdAt }) {
  const preliminaryProbability = {
    probability_status: "preliminary",
    point_estimate: probability,
    uncertainty_low: probability - 0.1,
    uncertainty_high: probability + 0.1,
    sample_size_effective: 10,
  };
  const price = evaluateMarketPrice({
    oddsQuote: quote,
    preliminaryProbability,
    confidenceScore: 74,
    sampleSize: 10,
    phase: "one_hour_before",
  });
  return {
    analysis_id: id,
    fixture_id: FIXTURE_ID,
    created_at: createdAt,
    phase: "one_hour_before",
    odds: [quote],
    active_quote: quote,
    analysis_confidence: { analysis_confidence_score: 74 },
    preliminary_probability: preliminaryProbability,
    director: {
      fixture: { kickoff_utc: KICKOFF },
      market_evaluated: { family },
      sports_verdict: { direction: quote.direction, selection: quote.selection },
      selection: quote.selection,
      line: quote.line,
      price_assessment: price,
    },
  };
}

test("I. findFixtureQuoteEntry nunca presenta como exacta una cuota de otra línea, otra market_family u otro fixture_id", async () => {
  const repository = createMemoryOperationalHistory();
  const quote = manualQuote({ family: "goals", direction: "over", line: 1.5, odds: 1.78, observedAt: "2026-09-01T19:50:00.000Z", analyzedAt: "2026-09-01T19:50:30.000Z" });
  const version = analysisVersionFor({ id: "phase4-i", family: "goals", probability: 0.6, quote, createdAt: "2026-09-01T19:50:30.000Z" });
  await repository.appendAnalysis(version);
  const ledger = buildFixtureQuoteLedger(await repository.list({ fixtureId: FIXTURE_ID }), { fixtureId: FIXTURE_ID, now: "2026-09-01T19:50:31.000Z", kickoff: KICKOFF });

  // Control positivo: la identidad exacta sí existe y está "current".
  const exact = findFixtureQuoteEntry(ledger, { fixtureId: FIXTURE_ID, marketId: "goals", direction: "over", line: 1.5 });
  assert.equal(exact?.quote_state, "current");

  // A) otra línea (misma fixture + family)
  assert.equal(findFixtureQuoteEntry(ledger, { fixtureId: FIXTURE_ID, marketId: "goals", direction: "over", line: 2.5 }), null);
  // B) otra market_family (misma fixture + línea)
  assert.equal(findFixtureQuoteEntry(ledger, { fixtureId: FIXTURE_ID, marketId: "corners", direction: "over", line: 1.5 }), null);
  // C) otro fixture_id (misma family + línea)
  assert.equal(findFixtureQuoteEntry(ledger, { fixtureId: OTHER_FIXTURE_ID, marketId: "goals", direction: "over", line: 1.5 }), null);

  // Source-level: JourneyCandidateCard construye exactQuote EXCLUSIVAMENTE
  // desde operation?.quote_state === "current", y EconomicsPanel solo recibe
  // decimalOdds/impliedProbability desde exactQuote — sin otro origen ni
  // fallback a otra línea/familia/fixture.
  const source = await readFile(clientPath, "utf8");
  assert.ok(source.includes('const exactQuote = operation?.quote_state === "current" ? operation.active_quote : null;'));
  assert.ok(source.includes("<EconomicsPanel decimalOdds={exactQuote?.decimal_odds} bookmaker={exactQuote?.bookmaker_name} impliedProbability={exactQuote?.implied_probability} estimatedProbability={candidate.estimatedProbability} />"));
});

test("J. Jornada consume candidate.radarAnalysis y el análisis individual consume analysis.primaryMarketOpportunityRadar; ninguno infiere familia por texto", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.ok(source.includes("<RadarBadge radar={candidate.radarAnalysis} />"));
  assert.ok(source.includes("<RadarBadge radar={analysis.primaryMarketOpportunityRadar} />"));
  // La garantía dinámica de que cada market_family recibe SU PROPIO radar sin
  // contaminación cruzada ya está probada exhaustivamente en
  // journeyRadarIntegration.test.js (test 6); aquí solo se confirma que la
  // UI conecta el campo correcto, sin repetir el wiring productivo.
});

test("K. DirectorAtlas conserva sus tres frases oficiales; el icono es solo presentación y respeta prefers-reduced-motion", async () => {
  const directorSource = await readFile(directorPath, "utf8");
  assert.match(directorSource, /label: "SÍ, ME GUSTA ESTA OPCIÓN"/);
  assert.match(directorSource, /label: "ESPERAR"/);
  assert.match(directorSource, /label: "NO ME GUSTA ESTA OPCIÓN"/);

  const clientSource = await readFile(clientPath, "utf8");
  assert.ok(clientSource.includes("<h3>{analysisDecision.label}</h3>"));
  assert.ok(clientSource.includes("{priceDecision.label}</h3>"));
  assert.ok(clientSource.includes('<span className="p2-decision-status-icon" aria-hidden="true">{directorDecisionIcon(analysisDecision)}</span>'));
  assert.ok(clientSource.includes('<span className="p2-decision-status-icon" aria-hidden="true">{directorDecisionIcon(priceDecision)}</span>'));
  // La clase nueva nunca reutiliza el nombre de la regla antigua no
  // relacionada .p2-decision-icon (colisión detectada y corregida).
  assert.doesNotMatch(clientSource, /className="p2-decision-icon"/);

  const iconBlock = functionBlock(clientSource, "function directorDecisionIcon(decision) {", "function bestCandidatePerFamily");
  assert.doesNotMatch(iconBlock, /decision\?\.icon/);
  assert.ok(iconBlock.includes("return DIRECTOR_DECISION_ICONS[decision?.status] ?? null;"));

  const cssSource = await readFile(cssPath, "utf8");
  // La regla antigua .p2-decision-icon (CSS muerto no relacionado) sigue
  // intacta, sin tocar.
  assert.ok(cssSource.includes(".p2-decision-icon {"));
  assert.ok(cssSource.includes(".p2-decision-status-icon {"));
  assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.p2-decision-status-icon,[\s\S]*?animation: none;/);
});

test("L. la capa de presentación (JourneyCandidateCard, RadarBadge, EconomicsPanel) solo lee el candidato/radar, nunca los muta", async () => {
  const source = await readFile(clientPath, "utf8");
  const cardBlock = functionBlock(source, "function JourneyCandidateCard(", "function JourneyMatchesReviewed");
  const radarBlock = functionBlock(source, "function RadarBadge(", "function EconomicsPanel");
  const economicsBlock = functionBlock(source, "function EconomicsPanel(", "function RedTeamResult");
  for (const block of [cardBlock, radarBlock, economicsBlock]) {
    assert.doesNotMatch(block, /candidate\.(marketId|direction|line|estimatedProbability|sportsScore)\s*=[^=]/);
    assert.doesNotMatch(block, /radar\.(radar_direction|radar_score|opportunity_detected|adversarial_passed)\s*=[^=]/);
  }
  // La garantía dinámica de que asociar radarAnalysis no cambia
  // market_family/direction/line/estimated_probability/sports_score ni el
  // universo/orden final ya está probada exhaustivamente en
  // journeyRadarIntegration.test.js (test 6); aquí solo se confirma que la
  // capa de presentación no escribe sobre esos campos.
});
