import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

import { buildGeminiCleanupPrompt, buildGeminiResearchPrompt } from "../intelligence/geminiManualContext.js";

const testingDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientPath = path.resolve(testingDirectory, "../../app/atlas-functional-client.js");
const servicePath = path.resolve(testingDirectory, "../services/operationalAnalysisService.js");

function fixture(overrides = {}) {
  return {
    fixtureId: 1575140,
    teams: { home: { name: "Bayern München" }, away: { name: "VfB Stuttgart" } },
    date: { utc: "2026-08-28T18:30:00.000Z" },
    competition: { season: 2026 },
    ...overrides,
  };
}

test("1. existe el prompt de Gemini Pro + Deep Research (investigación)", () => {
  const prompt = buildGeminiResearchPrompt({
    fixture: fixture(),
    competition: { localName: "Bundesliga" },
    market: { market_label: "Goles", market_family: "goals" },
    selection: { selection: "Over 1.5", line: 1.5 },
  });
  assert.match(prompt, /INVESTIGACIÓN COMPLEMENTARIA MANUAL PARA ATLAS/);
  assert.match(prompt, /Fixture ID: 1575140/);
});

test("2. existe el prompt de Gemini Pro normal (depuración)", () => {
  const prompt = buildGeminiCleanupPrompt({
    fixture: fixture(),
    competition: { localName: "Bundesliga" },
    market: { market_label: "Goles", market_family: "goals" },
    selection: { selection: "Over 1.5", line: 1.5 },
  });
  assert.ok(prompt.includes("DEPURACIÓN Y FORMATEO PARA ATLAS (Gemini Pro normal)"));
  assert.match(prompt, /Fixture ID: 1575140/);
});

test("3. el prompt de depuración no vuelve a investigar ni genera probabilidades", () => {
  const prompt = buildGeminiCleanupPrompt({ fixture: fixture() });
  assert.match(prompt, /No vuelvas a investigar desde cero/i);
  assert.match(prompt, /No recomiendes apuestas/i);
  assert.match(prompt, /No generes probabilidades nuevas/i);
  assert.match(prompt, /No añadas conclusiones nuevas/i);
});

test("4. el prompt de depuración prohíbe explícitamente alterar estimated_probability y sports_score", () => {
  const prompt = buildGeminiCleanupPrompt({ fixture: fixture() });
  assert.ok(prompt.includes("No modifiques la probabilidad deportiva de Atlas (estimated_probability)"));
  assert.match(prompt, /No modifiques sports_score/i);
  assert.match(prompt, /Cualquier alteración de estimated_probability/i);
  assert.match(prompt, /Cualquier alteración de sports_score/i);
});

test("5. el prompt de depuración deja un lugar inequívoco para pegar la respuesta de Deep Research", () => {
  const prompt = buildGeminiCleanupPrompt({ fixture: fixture() });
  assert.match(prompt, /PEGA AQUÍ LA RESPUESTA COMPLETA DE GEMINI PRO \+ DEEP RESEARCH/);
  assert.ok(prompt.includes("[PEGAR AQUÍ LA RESPUESTA COMPLETA DE DEEP RESEARCH]"));
});

test("6. el prompt de depuración exige exactamente el formato ATLAS de 5 secciones", () => {
  const prompt = buildGeminiCleanupPrompt({ fixture: fixture() });
  assert.ok(prompt.includes("ESTADO DE BÚSQUEDA WEB: [conserva exactamente USADA o NO DISPONIBLE según el informe original]"));
  const outputFormat = prompt.slice(prompt.indexOf("FORMATO DE SALIDA OBLIGATORIO"));
  const sections = ["HECHOS CONFIRMADOS", "INFORMACIÓN PROBABLE", "RUMORES", "CONTRADICCIONES", "DATOS NO ENCONTRADOS"];
  let lastIndex = -1;
  for (const section of sections) {
    const index = outputFormat.indexOf(section);
    assert.ok(index > lastIndex, `${section} debe aparecer después de la sección previa`);
    lastIndex = index;
  }
});

test("7. el prompt de depuración prohíbe introducción, conclusión, recomendación y porcentajes nuevos", () => {
  const prompt = buildGeminiCleanupPrompt({ fixture: fixture() });
  assert.match(prompt, /PROHIBIDO EN TU RESPUESTA/);
  assert.match(prompt, /- Introducción\./);
  assert.match(prompt, /- Conclusión\./);
  assert.match(prompt, /- Recomendación de apuesta\./);
  assert.match(prompt, /- Porcentajes o probabilidades nuevas\./);
});

test("8. el prompt de depuración exige conservar fuente, URL, fecha y mover discrepancias a contradicciones", () => {
  const prompt = buildGeminiCleanupPrompt({ fixture: fixture() });
  assert.match(prompt, /Conserva FUENTE, URL y FECHA/i);
  assert.match(prompt, /discrepan entre sí sobre el mismo dato, mueve ese dato a CONTRADICCIONES/i);
  assert.match(prompt, /no pudo verificarse en el texto pegado, muévelo a DATOS NO ENCONTRADOS/i);
  assert.match(prompt, /No inventes información que no esté en el texto pegado/i);
  assert.match(prompt, /No inventes cuotas/i);
});

test("9. la UI expone los dos botones de copiar prompt en el orden Deep Research → Pro normal → Atlas", async () => {
  const source = await readFile(clientPath, "utf8");
  const deepResearchIndex = source.indexOf("Copiar prompt para Gemini Pro + Deep Research");
  const proNormalIndex = source.indexOf("Copiar prompt para Gemini Pro normal");
  assert.ok(deepResearchIndex > -1, "debe existir el botón de Deep Research");
  assert.ok(proNormalIndex > -1, "debe existir el botón de Pro normal");
  assert.ok(deepResearchIndex < proNormalIndex, "Deep Research debe aparecer antes que Pro normal en la UI");
});

test("10. la UI explica los 4 pasos de Deep Research", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /Copia este prompt\./);
  assert.match(source, /Abre Gemini Pro con Deep Research\./);
  assert.match(source, /Ejecuta la investigación\./);
  assert.match(source, /Copia la respuesta COMPLETA que entregue Deep Research\./);
});

test("11. la UI aclara que el paso de Pro normal sigue siendo manual, sin llamar a Gemini por API", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /Atlas no llama a Gemini por ti/);
  assert.ok(!source.includes("GEMINI_API_KEY"));
  assert.ok(!source.includes("generativelanguage.googleapis"));
});

test("12. la UI indica explícitamente que solo la respuesta limpia de Pro normal vuelve a Atlas", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.match(source, /No pegues aquí el informe largo original de Deep Research/);
  assert.match(source, /Pegar aquí solo la respuesta limpia de Gemini Pro normal/);
});

test("13. el servicio operativo construye y expone cleanupPrompt junto al prompt de investigación", async () => {
  const source = await readFile(servicePath, "utf8");
  assert.match(source, /buildGeminiCleanupPrompt/);
  assert.match(source, /cleanupPrompt/);
});
