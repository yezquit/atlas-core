import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pagePath = new URL("../../app/page.js", import.meta.url);
const clientPath = new URL(
  "../../app/atlas-functional-client.js",
  import.meta.url
);
const layoutPath = new URL("../../app/layout.js", import.meta.url);

test("DirectorAtlas queda como única voz pública del flujo funcional", async () => {
  const [pageSource, clientSource] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(clientPath, "utf8"),
  ]);

  assert.doesNotMatch(pageSource, /^"use client"/);
  assert.match(pageSource, /<AtlasFunctionalClient/);
  assert.match(clientSource, /className="director-atlas-panel functional-director"/);
  assert.doesNotMatch(clientSource, /atlasExecutiveAnswer/);
  assert.doesNotMatch(clientSource, /decisionEngine/);
  assert.doesNotMatch(clientSource, /estimatedProbability/);
  assert.match(clientSource, /analysis\.director\.probabilityStatus/);
});

test("la UI exige selección explícita y conserva el fixture ID", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.match(source, /type="date"/);
  assert.match(source, /name="fixtureId"/);
  assert.match(source, /function loadFixtures\(\)/);
  assert.match(source, /function analyzeSelectedFixture\(\)/);
  assert.match(
    source,
    /Number\(result\?\.selectedFixtureId\) !== requestedFixtureId/
  );
  assert.doesNotMatch(source, /setSelectedFixtureId\(String\(result/);
});

test("el layout no depende de Google Fonts", async () => {
  const source = await readFile(layoutPath, "utf8");

  assert.doesNotMatch(source, /next\/font\/google/);
  assert.match(source, /<html lang="es">/);
});
