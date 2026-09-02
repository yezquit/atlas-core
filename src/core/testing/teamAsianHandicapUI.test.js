import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Sigue el mismo patrón de verificación por código fuente que
// journeyAsianPresentation.test.js / asianFavorabilityPresentation.test.js:
// no hay arnés de renderizado de componentes (jsdom/testing-library) en
// este repositorio.

let clientSource;
let labelsSource;

test.before(async () => {
  clientSource = await readFile(path.resolve("src/app/atlas-functional-client.js"), "utf8");
  labelsSource = await readFile(path.resolve("src/app/presentation-labels.js"), "utf8");
});

// -----------------------------------------------------------------------
// Sección Jornada — título genérico, distingue Total vs Team AH.
// -----------------------------------------------------------------------

test("la sección Asian de Jornada usa un título genérico, no 'ASIAN TOTAL'", () => {
  assert.match(clientSource, /OPCIONES ASIÁTICAS/);
  assert.doesNotMatch(clientSource, /OPCIONES ASIAN TOTAL/);
});

test("cada tarjeta de la sección Asian distingue Total de goles vs Hándicap por equipo vía displayMarket(candidate.marketId)", () => {
  assert.match(labelsSource, /asian_total_goals: "Asiático \(Más\/Menos\) — Total de goles"/);
  assert.match(labelsSource, /team_asian_handicap: "Asiático — Hándicap por equipo"/);
  assert.match(clientSource, /displayMarket\(candidate\.marketId \|\| candidate\.market\)/);
});

// -----------------------------------------------------------------------
// Checkbox de Jornada: team_asian_handicap (y asian_total_goals) ahora son
// seleccionables por el usuario, no solo enviables por opt-in ciego.
// -----------------------------------------------------------------------

test("el checkbox de mercados de Jornada itera specificMarkets (incluye asian_total_goals y team_asian_handicap), no solo los 5 clásicos", () => {
  const start = clientSource.indexOf("3 · Mercados de interés");
  const end = clientSource.indexOf("</fieldset>", start);
  const marketFilterBlock = clientSource.slice(start, end);
  assert.match(marketFilterBlock, /specificMarkets\.map\(\(market\) => \(/);
  assert.doesNotMatch(marketFilterBlock, /\{markets\.map\(\(market\) => \(/);
});

// -----------------------------------------------------------------------
// Individual — selector de equipo (Local/Visitante) cuando la familia es
// team_asian_handicap, en vez de Dirección (Más de/Menos de).
// -----------------------------------------------------------------------

test("Individual muestra un selector Local/Visitante para team_asian_handicap en vez de Dirección over/under", () => {
  assert.match(clientSource, /marketId === "team_asian_handicap" \? \(/);
  assert.match(clientSource, /<span>Equipo \(opcional\)<\/span>/);
  assert.match(clientSource, /<option value="home">Local<\/option><option value="away">Visitante<\/option>/);
});

test("el payload de Individual nunca envuelve el equipo (home/away) como 'Más de'/'Menos de'", () => {
  assert.match(
    clientSource,
    /const reportedSelection = manualMarketFamily === "team_asian_handicap"\s*\n\s*\? reportedDirection/,
  );
});

// -----------------------------------------------------------------------
// Clásicos intactos: la Dirección over/under sigue existiendo para el
// resto de familias.
// -----------------------------------------------------------------------

test("las familias clásicas conservan el selector Dirección (Más de/Menos de) sin cambios", () => {
  assert.match(clientSource, /<option value="over">Más de<\/option><option value="under">Menos de<\/option>/);
});
