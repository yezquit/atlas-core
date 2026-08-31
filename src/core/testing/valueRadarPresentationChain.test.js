import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { buildJourneyValueRadar } from "../services/valueRadarService.js";
import { normalizeProviderOdds } from "../intelligence/oddsIntelligence.js";

// Diagnóstico "52 -> 0": se rastreó la cadena completa backend -> HTTP ->
// estado React -> render y NO se encontró ningún punto de filtrado. Estos
// tests fijan esa cadena (backend -> Response.json -> journey.valueRadar ->
// condición de render) para que una regresión futura no la rompa en
// silencio. No se tocan fórmulas de Value Radar ni el sports engine.
const clientPath = new URL("../../app/atlas-functional-client.js", import.meta.url);

function classicCandidate(index, { withQuote }) {
  const fixtureId = 10_000 + index;
  const families = ["goals", "corners", "cards", "total_shots", "shots_on_goal"];
  const marketId = families[index % families.length];
  const direction = index % 2 === 0 ? "over" : "under";
  const line = 1.5 + (index % 5);
  const estimatedProbability = 0.5 + (index % 10) / 100;
  const activeQuote = withQuote ? {
    quote_id: `q-${fixtureId}-${marketId}`,
    fixture_id: fixtureId,
    market_family: marketId,
    direction,
    line,
    decimal_odds: 1.8 + (index % 5) * 0.1,
    bookmaker_name: "Betano",
  } : null;
  return {
    fixtureId, fixture: `Local ${index} vs Visitante ${index}`, marketId, market: marketId,
    direction, line, selection: `${direction === "over" ? "Over" : "Under"} ${line}`,
    estimatedProbability, uncertaintyLow: estimatedProbability - 0.1, uncertaintyHigh: estimatedProbability + 0.1,
    sportsScore: 70 + (index % 20), technicalSupport: 65,
    activeQuote,
  };
}

test("1. el backend devuelve 52 oportunidades y el estado React/condición de render las conserva íntegras", async () => {
  const classicCandidates = Array.from({ length: 104 }, (_, index) => classicCandidate(index, { withQuote: index < 52 }));
  const valueRadar = await buildJourneyValueRadar({ classicCandidates, analyses: [], gateway: {}, now: new Date().toISOString() });

  // A. backend
  assert.equal(valueRadar.opportunities.length, 52);
  assert.equal(valueRadar.status, "available");

  // Shape exacto que scanSportsJourney() adjunta (valueRadar,) y que la ruta
  // /api/football/journey-scan devuelve sin transformar para una sola fecha.
  const journeyScanResult = { contract: "JourneyExplorationResult", version: 2, status: "success", valueRadar, candidates: [] };

  // B. tras Response.json() (serialización real, no una copia superficial).
  const responseBody = JSON.parse(JSON.stringify(journeyScanResult));
  assert.equal(responseBody.valueRadar.opportunities.length, 52);

  // C. setJourney(result) -> estado React.
  const journey = responseBody;
  assert.equal(journey.valueRadar.opportunities.length, 52);

  // D. condición de render EXACTA usada en atlas-functional-client.js.
  const willRenderGrid = Boolean(journey.valueRadar?.opportunities?.length);
  const cardsRendered = willRenderGrid ? journey.valueRadar.opportunities.length : 0;
  assert.equal(willRenderGrid, true);
  assert.equal(cardsRendered, 52);
});

test("2. ningún status válido (interesting/watch/no_value/not_evaluable) se filtra accidentalmente", async () => {
  const withMatchingQuote = classicCandidate(1, { withQuote: true }); // identidad exacta -> interesting/watch/no_value según cuota
  const withMismatchedQuote = classicCandidate(2, { withQuote: true });
  // La cuota existe pero es de otra línea: quote_exact=false -> not_evaluable
  // (nunca se pre-filtra: solo se excluye antes de evaluar si NO hay ninguna
  // cuota activa; con cuota presente pero no exacta, sí llega a evaluarse).
  withMismatchedQuote.activeQuote = { ...withMismatchedQuote.activeQuote, line: withMismatchedQuote.line + 10 };
  const classicCandidates = [withMatchingQuote, withMismatchedQuote];
  const valueRadar = await buildJourneyValueRadar({ classicCandidates, analyses: [], gateway: {}, now: new Date().toISOString() });
  assert.equal(valueRadar.opportunities.length, 2, "buildJourneyValueRadar/rankValueOpportunities no descarta ningún status");
  assert.ok(valueRadar.opportunities.some((item) => item.status === "not_evaluable"), "not_evaluable debe seguir presente, no descartado");
});

test("3. 52 oportunidades no pueden producir un estado vacío sin una razón real (fallback solo con longitud 0 genuina)", async () => {
  const source = await readFile(clientPath, "utf8");
  const line = source.match(/journey\.valueRadar\?\.opportunities\?\.length \? [\s\S]*?StatusNotice[\s\S]*?\}\}/)?.[0];
  assert.ok(line, "debe existir la condición de render del Radar de Valor");
  // La condición es EXACTAMENTE opportunities?.length: nada más participa
  // (ni status, ni market_family, ni un .filter() previo).
  assert.match(line, /journey\.valueRadar\?\.opportunities\?\.length \?/);
  assert.doesNotMatch(line, /\.filter\(/);
});

test("4. el mensaje vacío solo aparece cuando opportunities.length === 0 real, y distingue 'sin candidatos' de 'sin precios exactos'", async () => {
  const noCandidates = await buildJourneyValueRadar({ classicCandidates: [], analyses: [], gateway: {}, now: new Date().toISOString() });
  assert.equal(noCandidates.opportunities.length, 0);
  assert.equal(noCandidates.status, "not_evaluable");
  assert.match(noCandidates.message, /Atlas no encontró candidatos deportivos/);
  assert.deepEqual(noCandidates.limitations, [noCandidates.message]);

  const candidatesNoQuotes = await buildJourneyValueRadar({
    classicCandidates: [classicCandidate(1, { withQuote: false }), classicCandidate(2, { withQuote: false })],
    analyses: [], gateway: {}, now: new Date().toISOString(),
  });
  assert.equal(candidatesNoQuotes.opportunities.length, 0);
  assert.equal(candidatesNoQuotes.sports_candidates_count, 2);
  assert.equal(candidatesNoQuotes.exact_quote_candidates_count, 0);
  assert.match(candidatesNoQuotes.message, /encontró 2 candidatos deportivos, pero ninguno tiene una cuota exacta/);

  const nonEmptyRadar = await buildJourneyValueRadar({
    classicCandidates: [classicCandidate(1, { withQuote: true })],
    analyses: [], gateway: {}, now: new Date().toISOString(),
  });
  assert.ok(nonEmptyRadar.opportunities.length > 0);
  assert.deepEqual(nonEmptyRadar.limitations, [], "con oportunidades reales no debe aparecer el mensaje de vacío");
  assert.match(nonEmptyRadar.message, /1 de 1 candidatos tienen precio exacto disponible/);
});

test("5. asian_total_goals: el proveedor sí tiene mapping ('Asian Total Goals' -> asian_total_goals) y nunca reutiliza una cuota de goals", () => {
  const response = [{
    fixture: { id: 555 },
    update: new Date().toISOString(),
    bookmakers: [{
      id: 1, name: "Betano",
      bets: [
        { id: 82, name: "Asian Total Goals", values: [{ value: "Over 2.75", handicap: "2.75", odd: "1.90" }] },
        { id: 5, name: "Goals Over/Under", values: [{ value: "Over 2.5", odd: "1.85" }] },
      ],
    }],
  }];
  const { quotes } = normalizeProviderOdds({ response, fixtureId: 555, now: new Date().toISOString() });
  const asianQuotes = quotes.filter((quote) => quote.market_family === "asian_total_goals");
  const goalsQuotes = quotes.filter((quote) => quote.market_family === "goals");
  assert.equal(asianQuotes.length, 1, "el bet type real 'Asian Total Goals' debe mapearse a asian_total_goals");
  assert.equal(asianQuotes[0].line, "2.75");
  assert.equal(goalsQuotes.length, 1);
  assert.notEqual(asianQuotes[0].quote_id, goalsQuotes[0].quote_id, "la cuota asian nunca reutiliza la identidad de la cuota de goals");
});
