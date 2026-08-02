import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pagePath = new URL("../../app/page.js", import.meta.url);
const layoutPath = new URL("../../app/layout.js", import.meta.url);

test("la vista simple deja a DirectorAtlas como única voz de decisión", async () => {
  const source = await readFile(pagePath, "utf8");
  const simpleAllowedMatch = source.match(
    /const simpleAllowed = \[([\s\S]*?)\];/
  );

  assert.ok(simpleAllowedMatch);
  assert.match(simpleAllowedMatch[1], /director-atlas-panel/);
  assert.doesNotMatch(simpleAllowedMatch[1], /atlas-answer-panel/);
  assert.match(
    source,
    /viewMode === "technical" && analysis\.atlasExecutiveAnswer/
  );
  assert.match(source, /viewMode === "technical" && \(\s*<div className="result-grid">/);
});

test("el layout no depende de Google Fonts", async () => {
  const source = await readFile(layoutPath, "utf8");

  assert.doesNotMatch(source, /next\/font\/google/);
  assert.match(source, /<html lang="es">/);
});
