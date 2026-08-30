import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const clientPath = new URL("../../app/atlas-functional-client.js", import.meta.url);
const cssPath = new URL("../../app/globals.css", import.meta.url);

test("InfoHint ofrece tooltip accesible por foco y no depende de title", async () => {
  const source = await readFile(clientPath, "utf8");
  const css = await readFile(cssPath, "utf8");
  const block = source.slice(source.indexOf("function InfoHint("), source.indexOf("function MetricLabel("));

  assert.match(block, /aria-label=/);
  assert.match(block, /aria-describedby=/);
  assert.match(block, /role="tooltip"/);
  assert.match(block, /<button type="button"/);
  assert.doesNotMatch(block, /title=/);
  assert.match(css, /\.p2-info-hint:hover \.p2-info-hint-tooltip/);
  assert.match(css, /\.p2-info-hint:focus-within \.p2-info-hint-tooltip/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("SOLIDEZ ATLAS explica respaldo técnico y niega equivalencia con probabilidad", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /Indica qué tan sólido y respaldado está técnicamente el análisis según calidad de muestra, incertidumbre, cobertura y estabilidad\. No es la probabilidad de acertar\./);
  assert.match(source, /<MetricLabel label="SOLIDEZ ATLAS"/);
});

test("Probabilidad estimada tiene ayuda estadística separada", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /Estimación de Atlas sobre la probabilidad de que ocurra esta selección\. Es una estimación estadística, no una garantía\./);
  assert.match(source, /<MetricLabel label="PROBABILIDAD ESTIMADA"/);
  assert.match(source, /<MetricLabel label="Probabilidad estimada Atlas"/);
});

test("Dirección Radar explica ALTA BAJA y NEUTRAL sin confundir BAJA con calidad", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /ALTA: las señales deportivas tienden hacia valores superiores/);
  assert.match(source, /BAJA: tienden hacia valores inferiores/);
  assert.match(source, /NEUTRAL: no existe una dirección suficientemente clara/);
  assert.match(source, /BAJA describe dirección, no baja calidad ni baja probabilidad/);
  assert.ok(source.includes('["Dirección Radar", radarDirectionLabel(radar.radar_direction)]'));
});

test("Radar define convergencia contraevidencia y coherencia", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /Indica cuánto coinciden y qué tan consistentes son las señales deportivas consideradas por el Radar\. No es una probabilidad\./);
  assert.match(source, /Señales relevantes que contradicen la oportunidad detectada\. Si son suficientemente fuertes, Atlas puede bloquear la oportunidad\./);
  assert.match(source, /Mide si los distintos componentes y la distribución del modelo son consistentes entre sí\. Puede ser correcta, problemática o desconocida según la evidencia disponible\./);
});

test("Soporte e incertidumbre tienen definiciones prudentes en atlasRecommendation", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /Representa el rango de duda alrededor de la estimación\. Una incertidumbre menor implica una estimación más precisa; una mayor exige más cautela\./);
  assert.match(source, /Resume la cantidad y calidad de evidencia que respalda esta lectura deportiva\. Más soporte no equivale automáticamente a mayor probabilidad\./);
  assert.match(source, /<MetricLabel label="Soporte" \/>/);
  assert.match(source, /<MetricLabel label="Incertidumbre" \/>/);
});

test("las ayudas no introducen fórmulas ni cambian valores de las métricas", async () => {
  const source = await readFile(clientPath, "utf8");
  const block = source.slice(source.indexOf("const METRIC_HINTS"), source.indexOf("function InfoHint("));
  assert.doesNotMatch(block, /sports_score\s*[+*/-]/);
  assert.doesNotMatch(block, /estimated_probability\s*[+*/-]/);
  assert.doesNotMatch(block, /radar_score\s*[+*/-]/);
});
