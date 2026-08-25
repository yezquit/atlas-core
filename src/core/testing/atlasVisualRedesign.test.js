import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testingDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(testingDirectory, "../../app");
const repositoryRoot = path.resolve(testingDirectory, "../../..");

test("UI 1. conserva byte por byte el asset maestro YEZQUIT final", async () => {
  const asset = await readFile(path.join(repositoryRoot, "public/brand/yezquit-master.png"));
  assert.equal(createHash("sha256").update(asset).digest("hex"), "10c03cf5b19009c97b32ccde3370718f987dbb6c7009056d5f6d72324a0bb648");
  assert.deepEqual([asset.readUInt32BE(16), asset.readUInt32BE(20)], [1254, 1254]);
});

test("UI 2. login y cabecera usan el asset maestro sin incrustarlo", async () => {
  const [login, home] = await Promise.all([readFile(path.join(appDirectory, "login/page.js"), "utf8"), readFile(path.join(appDirectory, "page.js"), "utf8")]);
  for (const source of [login, home]) {
    assert.match(source, /\/brand\/yezquit-master\.png/);
    assert.doesNotMatch(source, /data:image\//);
  }
});

test("UI 3. mantiene ATLAS como producto e identifica by YEZQUIT", async () => {
  const source = await readFile(path.join(appDirectory, "page.js"), "utf8");
  assert.match(source, /<h1>ATLAS<\/h1>/);
  assert.match(source, /by <strong>YEZQUIT<\/strong>/);
});

test("UI 4. declara todos los design tokens Atlas", async () => {
  const css = await readFile(path.join(appDirectory, "globals.css"), "utf8");
  for (const token of ["bg", "surface", "surface-muted", "text", "text-secondary", "border", "primary", "primary-soft", "positive", "warning", "negative", "neutral", "shadow", "radius-sm", "radius-md", "radius-lg"]) {
    assert.match(css, new RegExp(`--atlas-${token}:`));
  }
});

test("UI 5. la identidad Atlas es clara y el rojo no es dominante", async () => {
  const css = await readFile(path.join(appDirectory, "globals.css"), "utf8");
  assert.match(css, /--atlas-bg: #f3f7fb/);
  assert.match(css, /--atlas-primary: #1769d2/);
  assert.match(css, /\.atlas-byline strong\s*\{[^}]*#e13c48/s);
});

test("UI 6. móvil compacta layout sin usar transform scale", async () => {
  const css = await readFile(path.join(appDirectory, "globals.css"), "utf8");
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?body\s*\{[\s\S]*?font-size: 13\.5px/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?padding: var\(--atlas-space-3\)/);
  assert.doesNotMatch(css, /transform\s*:\s*scale\s*\(/i);
});

test("UI 7. conserva targets táctiles mínimos de 44px", async () => {
  const css = await readFile(path.join(appDirectory, "globals.css"), "utf8");
  assert.match(css, /\.p2-main-tabs button[\s\S]*?min-height: 44px/);
  assert.match(css, /\.primary-button,[\s\S]*?min-height: 44px/);
});

test("UI 8. Home expone acciones principales y secundarias", async () => {
  const source = await readFile(path.join(appDirectory, "atlas-functional-client.js"), "utf8");
  for (const label of ["Analizar jornada", "Analizar partido", "Atlas EN VIVO", "Parlay y Soñadora", "Memoria Atlas", "Rendimiento", "Historial", "Mis apuestas"]) assert.match(source, new RegExp(label));
});

test("UI 9. DirectorAtlas presenta resumen visual sin recalcular datos", async () => {
  const source = await readFile(path.join(appDirectory, "atlas-functional-client.js"), "utf8");
  assert.match(source, /className="p2-director-metrics"/);
  assert.match(source, /director\.sports_verdict\?\.sports_score/);
  assert.doesNotMatch(source, /sports_score\s*[+*/-]=/);
});

test("UI 10. el responsive cubre teléfono, tableta y escritorio", async () => {
  const css = await readFile(path.join(appDirectory, "globals.css"), "utf8");
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(min-width: 1280px\)/);
});

test("UI 11. no incorpora fuentes ni dependencias visuales remotas", async () => {
  const [css, layout] = await Promise.all([readFile(path.join(appDirectory, "globals.css"), "utf8"), readFile(path.join(appDirectory, "layout.js"), "utf8")]);
  assert.doesNotMatch(`${css}\n${layout}`, /fonts\.googleapis|next\/font\/google|@import\s+url/i);
});

test("UI 12. formularios mantienen foco visible y controles semánticos", async () => {
  const [css, login] = await Promise.all([readFile(path.join(appDirectory, "globals.css"), "utf8"), readFile(path.join(appDirectory, "login/login-form.js"), "utf8")]);
  assert.match(css, /:focus-visible/);
  assert.match(login, /<label htmlFor="atlas-username">/);
  assert.match(login, /autoComplete="current-password"/);
});

test("UI 13. el rediseño no toca módulos del motor desde la capa cliente", async () => {
  const source = await readFile(path.join(appDirectory, "atlas-functional-client.js"), "utf8");
  assert.doesNotMatch(source, /setSportsScore|setPreliminaryProbability|setFixtureId/);
  assert.match(source, /Number\(result\?\.selectedFixtureId\) !== requestedFixtureId/);
});

test("UI 14. navegación móvil separa destinos y acciones de sesión", async () => {
  const [source, css] = await Promise.all([readFile(path.join(appDirectory, "atlas-functional-client.js"), "utf8"), readFile(path.join(appDirectory, "globals.css"), "utf8")]);
  assert.match(source, /className="p2-main-destinations"/);
  assert.match(source, /className="p2-nav-utilities"/);
  assert.match(css, /\.p2-main-tabs\s*\{[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/);
  assert.match(css, /\.p2-main-tabs \.p2-main-destinations button\s*\{[\s\S]*?min-height: 44px;[\s\S]*?border: 1px solid/);
  assert.match(css, /\.p2-nav-utilities\s*\{[\s\S]*?border-top: 1px solid/);
});

test("UI 15. Atlas LIVE muestra lectura, viabilidad y precio por separado", async () => {
  const source = await readFile(path.join(appDirectory, "atlas-live.js"), "utf8");
  assert.match(source, /Lectura deportiva/);
  assert.match(source, /Viabilidad LIVE/);
  assert.match(source, /Línea LIVE actual evaluada como candidato independiente/);
  assert.match(source, /director\.market_viability/);
});
