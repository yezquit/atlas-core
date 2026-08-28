import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pagePath = new URL("../../app/page.js", import.meta.url);
const clientPath = new URL(
  "../../app/atlas-functional-client.js",
  import.meta.url
);
const layoutPath = new URL("../../app/layout.js", import.meta.url);
const gatewayPath = new URL("../services/sportsDataGateway.js", import.meta.url);
const serverPath = new URL("../services/sportsIntelligenceServer.js", import.meta.url);
const envExamplePath = new URL("../../../.env.example", import.meta.url);
const gitignorePath = new URL("../../../.gitignore", import.meta.url);

test("DirectorAtlas queda como única voz pública del flujo funcional", async () => {
  const [pageSource, clientSource] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(clientPath, "utf8"),
  ]);

  assert.doesNotMatch(pageSource, /^"use client"/);
  assert.match(pageSource, /<AtlasFunctionalClient/);
  assert.match(
    clientSource,
    /director-atlas-panel functional-director p2-director/
  );
  assert.doesNotMatch(clientSource, /atlasExecutiveAnswer/);
  assert.doesNotMatch(clientSource, /decisionEngine/);
  assert.match(clientSource, /analysis\.director/);
  assert.match(clientSource, /director\.estimated_probability/);
  assert.match(clientSource, /director\.probability_status === "preliminary"/);
});

test("la UI exige selección explícita y conserva el fixture ID", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.match(source, /type="date"/);
  assert.match(source, /onChange=\{\(event\) => changeDate/);
  assert.match(source, /name="fixtureId"/);
  assert.match(source, /function loadFixtures\(\)/);
  assert.match(source, /function analyzeSelectedFixture\(\)/);
  assert.match(
    source,
    /Number\(result\?\.selectedFixtureId\) !== requestedFixtureId/
  );
  assert.doesNotMatch(source, /setSelectedFixtureId\(String\(result/);
});

test("el modo sencillo muestra DirectorAtlas y separa la trazabilidad experta", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.match(source, /mode === "simple"/);
  assert.match(source, /<DirectorResult analysis=\{analysis\}/);
  assert.match(source, /<ExpertResult analysis=\{analysis\}/);
  assert.match(source, /data-result-mode="simple"/);
  assert.match(source, /data-result-mode="expert"/);
});

test("el modo experto agrupa toda la evidencia solicitada", async () => {
  const source = await readFile(clientPath, "utf8");

  for (const id of [
    "expert-identity",
    "expert-quality",
    "expert-league",
    "expert-home",
    "expert-away",
    "expert-referee",
    "expert-venue",
    "expert-markets",
    "expert-telemetry",
    "expert-rules",
  ]) {
    assert.match(source, new RegExp(`id="${id}"`));
  }
});

test("los acordeones son botones accesibles controlados por React", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.match(source, /function Accordion/);
  assert.match(source, /type="button"/);
  assert.match(source, /aria-expanded=\{open\}/);
  assert.match(source, /aria-controls=\{`\$\{id\}-content`\}/);
  assert.match(source, /onClick=\{\(\) => setOpen/);
  assert.doesNotMatch(source, /document\.(querySelector|getElementById)/);
});

test("los cambios de filtros invalidan resultados previos", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.match(source, /function invalidateJourney/);
  assert.match(source, /setJourney\(null\)/);
  assert.match(source, /function invalidateAnalysis/);
  assert.match(source, /setAnalysis\(null\)/);
  assert.match(source, /toggleJourneyCompetition[\s\S]*invalidateJourney\(\)/);
  assert.match(source, /changeCompetition[\s\S]*invalidateAnalysis/);
});

test("el layout no depende de Google Fonts", async () => {
  const source = await readFile(layoutPath, "utf8");

  assert.doesNotMatch(source, /next\/font\/google/);
  assert.match(source, /<html lang="es">/);
});

test("36. modo sencillo muestra el dictamen operativo", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /analysis_confidence_score/);
  assert.match(source, /market_suitability/);
  assert.match(source, /la decisión final corresponde al usuario/i);
});

test("37. modo experto expone trazabilidad operativa", async () => {
  const source = await readFile(clientPath, "utf8");
  for (const id of ["expert-odds", "expert-context", "expert-gemini", "expert-confidence", "expert-version-diff"]) {
    assert.match(source, new RegExp(`id="${id}"`));
  }
});

test("38. porcentaje aclarado como no probabilidad", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /Este porcentaje mide calidad y coherencia de la evidencia; no es una probabilidad de acierto/);
});

test("39. API key ausente del cliente", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.doesNotMatch(source, /API_FOOTBALL_KEY|x-apisports-key/);
});

test("40. ninguna clave Gemini requerida", async () => {
  const [source, envExample] = await Promise.all([readFile(clientPath, "utf8"), readFile(envExamplePath, "utf8")]);
  assert.doesNotMatch(source, /GEMINI_API_KEY|generativelanguage\.googleapis/);
  assert.doesNotMatch(envExample, /GEMINI_API_KEY\s*=/);
  assert.match(source, /Copiar prompt para Gemini Pro \+ Deep Research/);
});

test("41. presupuesto de reanálisis", async () => {
  const [source, envExample] = await Promise.all([readFile(serverPath, "utf8"), readFile(envExamplePath, "utf8")]);
  assert.match(source, /reanalysis: 60/);
  assert.match(envExample, /ATLAS_REANALYSIS_REQUEST_BUDGET=60/);
});

test("42. caché corta de odds", async () => {
  const source = await readFile(gatewayPath, "utf8");
  assert.match(source, /pathname: "\/odds"/);
  assert.match(source, /ttlSeconds: 60/);
  assert.match(source, /resource:odds/);
});

test("43. fixture ID inmutable en el flujo operativo", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /Number\(result\?\.selectedFixtureId\) !== requestedFixtureId/);
  assert.doesNotMatch(source, /setSelectedFixtureId\(String\(result/);
});

test("44. DirectorAtlas sigue siendo la única voz pública", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /Dictamen del Director Atlas/);
  assert.doesNotMatch(source, /atlasExecutiveAnswer|specialistEngine|decisionEngine/);
});

test("45. política de árbol limpio excluye persistencia generada", async () => {
  const source = await readFile(gitignorePath, "utf8");
  assert.match(source, /\/\.atlas-data\//);
  assert.match(source, /\/\.atlas-cache\//);
});
