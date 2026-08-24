import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testingDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(testingDirectory, "../../app");
const repositoryRoot = path.resolve(testingDirectory, "../../..");

test("UI 1. conserva byte por byte el asset maestro YEZQUIT aprobado", async () => {
  const asset = await readFile(path.join(repositoryRoot, "public/brand/yezquit-master.png"));
  assert.equal(createHash("sha256").update(asset).digest("hex"), "c364b7d399357884585b94801595ec5580374285e1ab845a4724d101c7b31b2d");
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
  const mobile = css.slice(css.lastIndexOf("@media (max-width: 640px)"));
  assert.match(mobile, /font-size: 13\.5px/);
  assert.match(mobile, /padding: var\(--atlas-space-3\)/);
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
