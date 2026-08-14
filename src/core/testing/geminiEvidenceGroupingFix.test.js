import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { mapGeminiImpacts } from "../intelligence/geminiImpactMapper.js";
import { parseGeminiResponse, selectGeminiItems } from "../intelligence/geminiManualContext.js";
import { buildScoutAtlas } from "../intelligence/scoutAtlas.js";

const clientPath = new URL("../../app/atlas-functional-client.js", import.meta.url);
const servicePath = new URL("../services/operationalAnalysisService.js", import.meta.url);

const fixture = {
  fixtureId: 1520819,
  date: { utc: "2026-08-14T22:00:00.000Z" },
  competition: { id: 72, name: "Serie B", season: 2026, round: "Jornada 22" },
  teams: { home: { id: 1, name: "Sport Recife" }, away: { id: 2, name: "Londrina" } },
};

const terraUrl = "https://www.terra.com.br/esportes/futebol/brasileiro-serie-b/sport-x-londrina-ao-vivo-com-a-voz-do-esporte-as-19h,66d1f8ccee15058901c933df3671e883c1u8qjee.html";
const bnewsUrl = "https://www.bnews.com.br/noticias/esporte/sport-x-londrina-onde-assistir-arbitragem-e-provaveis-escalacoes-do-confronto-da-22-rodada-da-serie-b.html";

const realResponse = `HECHOS CONFIRMADOS

HECHO: El partido corresponde a la jornada 22 de la Serie B. Sport Recife llega en la 10ª posición con 32 puntos buscando acercarse a la zona de ascenso, mientras que Londrina llega con 20 puntos, ocupando el primer puesto dentro de la zona de descenso.
IMPACTO: fortalece / debilita. La necesidad imperiosa de Londrina por sumar puntos puede volver el partido cerrado si buscan defender un empate (fortalece), o forzarlos a desprotegerse si reciben un gol temprano (debilita).
FUENTE: Terra
URL: ${terraUrl}
FECHA: 14 de agosto de 2026

HECHO: En el enfrentamiento directo previo más reciente entre ambos, Sport Recife venció a Londrina 2-1 como visitante.
IMPACTO: debilita. El antecedente superó la línea de 2.5 goles.
FUENTE: Bnews
URL: ${bnewsUrl}
FECHA: 14 de agosto de 2026

HECHO: El árbitro designado es Flávio Rodrigues de Souza.
IMPACTO: sin cambio.
FUENTE: Bnews
URL: ${bnewsUrl}
FECHA: 14 de agosto de 2026

INFORMACIÓN PROBABLE

HECHO: Se perfilan oncenas ofensivas. Sport formaría con Barletta, Perotti y Clayson; Londrina con Pablo Dyego, Paulinho Moccelin y Raí Nascimento.
IMPACTO: debilita. La disposición ofensiva podría elevar el riesgo para Under 2.5.
FUENTE: Bnews
URL: ${bnewsUrl}
FECHA: 14 de agosto de 2026

RUMORES
NINGUNO

CONTRADICCIONES
NINGUNO

DATOS NO ENCONTRADOS
- Reportes meteorológicos no encontrados.
- Comunicados médicos oficiales no encontrados.
- Estadísticas recientes no encontradas.
- Declaraciones recientes no encontradas.`;

function parse(text, options = {}) {
  return parseGeminiResponse(text, { fixture, receivedAt: "2026-08-14T16:00:00.000Z", ...options });
}

function block({ fact = "Alineación confirmada del delantero titular.", impact = "fortalece la selección.", source = "Dimayor", url = "https://dimayor.com.co/noticia", date = "14 de agosto de 2026" } = {}) {
  return `HECHO: ${fact}\nIMPACTO: ${impact}\nFUENTE: ${source}\nURL: ${url}\nFECHA: ${date}`;
}

test("1. HECHO, IMPACTO, FUENTE, URL y FECHA forman un solo elemento", () => {
  const context = parse(`HECHOS CONFIRMADOS\n${block()}`);
  assert.equal(context.items.length, 1);
  assert.equal(context.items[0].fact, "Alineación confirmada del delantero titular.");
});

test("2. un segundo HECHO abre un segundo elemento", () => {
  const context = parse(`HECHOS CONFIRMADOS\n${block()}\n\n${block({ fact: "Segundo hecho arbitral.", url: "https://dimayor.com.co/arbitro" })}`);
  assert.deepEqual(context.items.map((item) => item.fact), ["Alineación confirmada del delantero titular.", "Segundo hecho arbitral."]);
});

test("3. un cambio de sección cierra el elemento anterior", () => {
  const context = parse(`HECHOS CONFIRMADOS\n${block()}\nINFORMACIÓN PROBABLE\n${block({ fact: "Rotación probable.", impact: "debilita.", url: "https://dimayor.com.co/rotacion" })}`);
  assert.deepEqual(context.items.map((item) => item.kind), ["confirmed", "probable"]);
});

test("4. la URL queda asociada al HECHO correcto", () => {
  const item = parse(`HECHOS CONFIRMADOS\n${block()}`).items[0];
  assert.equal(item.source_url, "https://dimayor.com.co/noticia");
  assert.deepEqual(item.urls, ["https://dimayor.com.co/noticia"]);
});

test("5. la fuente queda asociada al HECHO y la UI usa su nombre", async () => {
  const item = parse(`HECHOS CONFIRMADOS\n${block()}`).items[0];
  assert.equal(item.source_name, "Dimayor");
  assert.match(await readFile(clientPath, "utf8"), /item\.source_name \|\| item\.source/);
});

test("6. la fecha escrita queda asociada al HECHO", () => {
  const item = parse(`HECHOS CONFIRMADOS\n${block()}`).items[0];
  assert.equal(item.publication_date, "14 de agosto de 2026");
  assert.deepEqual(item.publication_dates, ["14 de agosto de 2026"]);
});

test("7. el impacto y su continuación quedan asociados al HECHO", () => {
  const context = parse(`HECHOS CONFIRMADOS\nHECHO: Contexto competitivo.\nIMPACTO: fortalece / debilita.\nLa dirección depende del primer gol.\nFUENTE: Dimayor\nURL: https://dimayor.com.co/contexto\nFECHA: 14 de agosto de 2026`);
  assert.equal(context.items[0].impact_text, "fortalece / debilita. La dirección depende del primer gol.");
  assert.equal(context.items[0].impact, "neutral");
});

test("8. URL no crea un elemento independiente", () => {
  const context = parse(`HECHOS CONFIRMADOS\n${block()}`);
  assert.equal(context.items.length, 1);
  assert.doesNotMatch(context.items[0].summary, /^URL:/i);
});

test("9. FUENTE no crea un elemento independiente", () => {
  const context = parse(`HECHOS CONFIRMADOS\n${block()}`);
  assert.equal(context.items.filter((item) => /^FUENTE:/i.test(item.summary)).length, 0);
});

test("10. FECHA no crea un elemento independiente", () => {
  const context = parse(`HECHOS CONFIRMADOS\n${block()}`);
  assert.equal(context.items.filter((item) => /^FECHA:/i.test(item.summary)).length, 0);
});

test("11. IMPACTO no crea un elemento independiente", () => {
  const context = parse(`HECHOS CONFIRMADOS\n${block()}`);
  assert.equal(context.items.filter((item) => /^IMPACTO:/i.test(item.summary)).length, 0);
});

test("12. RUMORES con NINGUNO produce cero rumores", () => {
  const context = parse("RUMORES\nNINGUNO");
  assert.equal(context.items.length, 0);
  assert.equal(context.counters.rumors, 0);
});

test("13. CONTRADICCIONES con NINGUNO produce cero contradicciones", () => {
  const context = parse("CONTRADICCIONES\nNINGUNO");
  assert.equal(context.items.length, 0);
  assert.equal(context.counters.limitations, 0);
});

test("14. los bullets no encontrados permanecen como limitaciones", () => {
  const context = parse("DATOS NO ENCONTRADOS\n- Parte médico oficial.\n- Reporte meteorológico.");
  assert.equal(context.items.length, 2);
  assert.ok(context.items.every((item) => item.kind === "not_found" && item.impact === "limiting"));
});

test("15. la información probable permanece probable", () => {
  assert.equal(parse(`INFORMACIÓN PROBABLE\n${block()}`).items[0].kind, "probable");
});

test("16. el hecho confirmado permanece confirmado", () => {
  assert.equal(parse(`HECHOS CONFIRMADOS\n${block()}`).items[0].kind, "confirmed");
});

test("17. un rumor real continúa siendo rumor", () => {
  const item = parse(`RUMORES\n${block({ fact: "Se rumora una rotación.", impact: "sin cambio." })}`).items[0];
  assert.equal(item.kind, "rumor");
  assert.equal(item.eligible_for_selection, false);
});

test("18. una contradicción real continúa siendo contradicción", () => {
  const item = parse(`CONTRADICCIONES\n${block({ fact: "Dos fuentes discrepan sobre la alineación." })}`).items[0];
  assert.equal(item.kind, "contradiction");
  assert.equal(item.selected, false);
});

test("19. una respuesta sin URL continúa rechazada", () => {
  const item = parse("HECHOS CONFIRMADOS\nHECHO: Delantero ausente.\nIMPACTO: debilita.\nFUENTE: Medio\nFECHA: 14 de agosto de 2026").items[0];
  assert.equal(item.selected, false);
  assert.equal(item.eligible_for_selection, false);
  assert.equal(item.verification_status, "unverified");
});

test("20. una URL no basta si fallan relevancia y vigencia", () => {
  const item = parse("HECHOS CONFIRMADOS\nHECHO: El estadio tiene puertas azules.\nIMPACTO: sin cambio.\nFUENTE: Sitio\nURL: https://example.com/estadio").items[0];
  assert.equal(item.selected, false);
  assert.equal(item.validation_status, "user_reported");
});

test("21. hechos con la misma URL no se mezclan", () => {
  const context = parse(`HECHOS CONFIRMADOS\n${block({ fact: "Primer hecho." })}\n${block({ fact: "Segundo hecho." })}`);
  assert.equal(context.items.length, 2);
  assert.deepEqual(context.items.map((item) => item.fact), ["Primer hecho.", "Segundo hecho."]);
  assert.ok(context.items.every((item) => item.source_url === "https://dimayor.com.co/noticia"));
});

test("22. Terra y Bnews quedan vinculados a sus hechos respectivos", () => {
  const context = parse(realResponse);
  assert.equal(context.items[0].domain, "terra.com.br");
  assert.equal(context.items[0].source_name, "Terra");
  assert.equal(context.items[1].domain, "bnews.com.br");
  assert.equal(context.urls.length, 2);
});

test("23. el parser tolera líneas en blanco dentro del bloque", () => {
  const context = parse("HECHOS CONFIRMADOS\nHECHO: Alineación confirmada.\n\nIMPACTO: fortalece.\n\nFUENTE: Dimayor\n\nURL: https://dimayor.com.co/a\n\nFECHA: 14 de agosto de 2026");
  assert.equal(context.items.length, 1);
  assert.equal(context.items[0].source_name, "Dimayor");
});

test("24. el parser conserva una URL larga", () => {
  const longUrl = "https://example.com/ruta/muy-larga/con-parametros?fixture=1520819&selection=under-2.5&source=manual";
  const item = parse(`HECHOS CONFIRMADOS\n${block({ url: longUrl })}`).items[0];
  assert.equal(item.source_url, longUrl);
});

test("25. el caso Sport Recife vs Londrina deja de fragmentarse", () => {
  const context = parse(realResponse);
  assert.equal(context.items.length, 8);
  assert.deepEqual(context.counters, { detected: 8, selected: 0, rejected: 8, rumors: 0, limitations: 4 });
  assert.deepEqual(context.items.reduce((counts, item) => ({ ...counts, [item.kind]: (counts[item.kind] || 0) + 1 }), {}), { confirmed: 3, probable: 1, not_found: 4 });
  const manuallySelected = selectGeminiItems(context, [context.items[3].id]);
  assert.equal(manuallySelected.selected_items.length, 1);
  assert.equal(manuallySelected.selected_items[0].impact, "unfavorable");
});

test("26. una evidencia estructurada válida puede atravesar el pipeline", () => {
  const context = parse(`HECHOS CONFIRMADOS\n${block({ fact: "Delantero titular ausente por lesión.", impact: "debilita la producción ofensiva." })}`);
  const selected = selectGeminiItems(context, [context.items[0].id]);
  assert.equal(selected.selected_items.length, 1);
  assert.ok(mapGeminiImpacts(selected.selected_items).length > 0);
});

test("27. la evidencia rechazada continúa sin influir", () => {
  const context = parse(`RUMORES\n${block({ fact: "Posible rotación sin confirmar." })}`);
  const selected = selectGeminiItems(context, [context.items[0].id]);
  assert.equal(selected.selected_items.length, 0);
  assert.equal(mapGeminiImpacts(selected.selected_items).length, 0);
});

test("28. Gemini continúa procesándose antes del Director", async () => {
  const source = await readFile(servicePath, "utf8");
  assert.ok(source.indexOf("const selectedGemini") < source.indexOf("const director = buildOperationalDirectorVerdict"));
});

test("29. Scout permanece ciego al precio", () => {
  const scout = buildScoutAtlas({ marketSelection: { ranked_candidates: [{ candidate_id: "goals:under:2.5", market_family: "goals", direction: "under", line: 2.5, selection: "Under 2.5", sports_score: 80, rank: 1, simple_sports_reasons: ["Distribución compatible."], limitations: [] }] } });
  assert.equal(scout.price_inputs_used, false);
});

test("30. la cuota continúa posterior al análisis completo", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /\{analysisCompleted \? <section className="p2-entry-panel p2-user-quote p2-final-quote-entry"/);
  assert.match(source, /evaluatePrice: Boolean\(reanalysis && manualQuoteReady\)/);
});
