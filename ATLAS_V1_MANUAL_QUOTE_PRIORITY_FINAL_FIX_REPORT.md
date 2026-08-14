# ATLAS V1 — Informe final de prioridad de cuota manual

## Estado

- Rama verificada: `rescue/atlas-core-v0.2`.
- Fix local terminado.
- Sin merge.
- Sin cambios en Supabase, Vercel o dependencias.
- Commits creados: `0/2`. El entorno rechazó la escritura del commit local por límite de uso; los cambios quedan disponibles en el árbol de trabajo.

## Diagnóstico determinista

El caso Sport Recife vs Londrina, `Under 2.5`, se reprodujo con estas dos cotizaciones vigentes y compatibles:

- reportada explícitamente por el usuario: Betano `1.83`;
- proveedor: SBO `1.93`.

Antes del parche, la regresión produjo:

- `active_quote`: SBO `1.93`;
- probabilidad implícita: `0.518135` (`1 / 1.93`);
- evaluación económica, Director y UI construidos con SBO `1.93`.

La ejecución previa al cambio dejó 10 de las 14 nuevas pruebas en fallo y confirmó la causa.

### Causa exacta

- **A — No se persiste Betano 1.83:** descartada. La cuota sí entraba en `odds.quotes` como `user_reported_current`.
- **B — Se persiste, pero `active_quote` selecciona SBO 1.93:** confirmada.
- **C — Se pierde la procedencia manual:** descartada. Betano conservaba `source: manual_user_input` y `source_status: user_reported_current`.
- **D — Se recupera una cuota API por prioridad incorrecta:** confirmada como mecanismo causal.
- **E — Otra causa:** no encontrada.

El servicio calculaba correctamente `manualQuote` y la conservaba en el conjunto de cotizaciones. Sin embargo, al resolver `selectedOdds`, consultaba primero `operationalSelectedOdds`. El ranking operativo general considera una cuota `verified_provider` antes que una `user_reported_current`; por eso devolvía SBO `1.93`. Ese valor se convertía después en `active_quote` y se propagaba sin alteración a todas las capas posteriores.

## Corrección aplicada

La selección de la cuota activa ahora reconoce primero la cotización manual recién reportada para la acción explícita de actualización, únicamente cuando cumple todos estos controles:

- fuente manual reportada por el usuario;
- estado `user_reported_current`;
- vigencia actual;
- mismo fixture;
- misma familia de mercado;
- misma dirección;
- misma línea exacta.

Solo si esa cotización no cumple el contrato se consultan las alternativas existentes del ranking, candidato o proveedor. Las demás cotizaciones permanecen en `odds.quotes` y la mejor cuota automática sigue expuesta como referencia, sin sustituir la activa durante la actualización manual.

No se modificó `evaluateMarketPrice`. El objeto manual seleccionado llega intacto a:

- `selectedOdds`;
- `activeQuote` y `analysisVersion.active_quote`;
- `implied_probability`;
- `suitability.price_evaluation`;
- Director y decisión individual;
- modo sencillo;
- modo experto.

En el modo experto se separaron visualmente `Casa activa`, `Cuota activa` y `Mejor cuota comparable (referencia)`.

## Regresiones añadidas

Se añadieron 14 pruebas deterministas para cubrir:

1. Betano 1.83 manual vence a SBO 1.93 durante la actualización explícita.
2. `active_quote` conserva Betano.
3. `active_quote` conserva 1.83.
4. La probabilidad implícita usa 1.83 (`0.546448`).
5. La evaluación económica recibe Betano 1.83.
6. La decisión final recibe 1.83.
7. El modo sencillo presenta Betano 1.83.
8. El modo experto identifica Betano 1.83 como activa.
9. SBO 1.93 permanece como referencia y no como activa.
10. Una nueva actualización Betano 1.85 reemplaza la activa y la comparación conserva 1.83 como versión anterior.
11. Una línea distinta no contamina Under 2.5.
12. Un fixture distinto no contamina la evaluación.
13. Una cuota manual vencida no permanece activa.
14. Cambiar el precio activo no altera candidato, selección, línea, probabilidad, incertidumbre, puntaje deportivo ni Scout.

## Validación final

| Comando | Resultado |
|---|---|
| `git diff --check` | Correcto |
| `npm run lint` | Correcto |
| `npm test` | `536/536` pruebas correctas (`522` existentes + `14` nuevas) |
| `npm run build` | Correcto con Next.js `16.2.12` |

## Archivos modificados

- `src/core/services/operationalAnalysisService.js`
- `src/app/atlas-functional-client.js`
- `src/core/testing/manualQuotePriorityFinalFix.test.js`
- `ATLAS_V1_MANUAL_QUOTE_PRIORITY_FINAL_FIX_REPORT.md`

## Exclusiones respetadas

No se modificaron Scout, Gemini, Director deportivo, probabilidades deportivas, confidence, thresholds, `evaluateMarketPrice`, contexto competitivo, historial general, Supabase, Vercel ni dependencias.
