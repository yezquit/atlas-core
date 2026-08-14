# ATLAS V1 — Informe de cierre local definitivo

Fecha: 2026-08-14

Rama: `rescue/atlas-core-v0.2`

Commit de implementación y pruebas: `55c66fa`

## Resultado

Se completaron exclusivamente los tres ajustes solicitados:

1. El prompt Gemini exige desde la primera consulta el mismo formato estructurado que consume el parser.
2. `CompetitiveFixtureContext`, que ya se construía, vuelve a formar parte del resultado del análisis y llega a la vista.
3. El modo sencillo reemplaza el mensaje técnico del precio por microcopy humana sin modificar el estado económico interno.

No se modificaron Scout, Director, probabilidades, confidence, `evaluateMarketPrice`, thresholds, TTL, rankings, historial, parser, dependencias, `.env.local` o infraestructura.

## Prompt Gemini

El productor y el consumidor quedaron alineados. Para cada hecho confirmado o probable, el prompt solicita obligatoriamente un bloque completo:

```text
HECHO: [un único hecho verificable]
IMPACTO: [fortalece / debilita / invalida / sin cambio / mixto] + explicación breve
FUENTE: [nombre concreto]
URL: [URL directa completa que respalda específicamente el hecho]
FECHA: [fecha de publicación o actualización de esa fuente]
```

El prompt declara que los cinco campos forman un solo bloque y que cada nuevo `HECHO:` inicia otro. Prohíbe separar fuente, URL o fecha como elementos, inventar URLs, reutilizar una URL ajena al hecho o citar portadas y referencias genéricas como Google Sports Data, Google o resultados de búsqueda.

Si no existe una URL directa verificable, el dato no debe presentarse como confirmado y debe pasar a `DATOS NO ENCONTRADOS`. La fecha debe pertenecer a la fuente citada. La información probable mantiene su sección y no se promueve a confirmada por tener URL.

Las cinco secciones permanecen exactamente en este orden:

1. `HECHOS CONFIRMADOS`
2. `INFORMACIÓN PROBABLE`
3. `RUMORES`
4. `CONTRADICCIONES`
5. `DATOS NO ENCONTRADOS`

Para rumores o contradicciones vacíos se exige escribir únicamente `NINGUNO`. El prompt conserva la pregunta central sobre información material para fortalecer, debilitar o invalidar la selección, mantiene el inventario contextual existente y continúa prohibiendo recomendaciones de apuesta, probabilidades y cambios silenciosos de fixture, mercado, línea o cuota.

## Causa raíz de “Contexto competitivo: No disponible”

La causa demostrada correspondía al caso A del diagnóstico solicitado.

`analyzeSportsFixture` construía correctamente `competitiveContext` mediante `buildCompetitiveContext` y lo utilizaba al evaluar mercados. Sin embargo, el objeto no estaba incluido en el resultado retornado por el servicio. Como consecuencia:

- `operationalAnalysisService` recibía `base.competitiveContext` como `undefined`.
- El prompt recurría parcialmente a campos del fixture.
- Red Team y preflight no recibían el contexto construido.
- La vista experta consultaba `analysis.competitiveContext` y mostraba `No disponible`.

No era necesario crear otro sistema, cambiar inferencias ni reconstruir contexto desde la UI.

## Materialización corregida

El servicio ahora devuelve el mismo `CompetitiveFixtureContext` que ya construía. Para el nombre y país usa el catálogo administrado verificado, conservando ronda, temporada y demás campos normalizados del fixture del proveedor.

El resultado materializa, cuando existen:

- Competición, país, temporada, ronda y tipo cualitativo.
- Equipo local y visitante.
- Ida, vuelta o partido único/grupo cuando la ronda lo permite.
- Agregado solo cuando está presente.
- Partido anterior, siguiente, descanso y próxima competición únicamente cuando los contratos actuales los suministran.
- Rotación solo con el estado ya previsto por el contrato.

No se inventan posiciones, agregado, fase, siguiente competición, necesidad táctica o rotaciones.

No se cambió el contrato de historial. Cada análisis y reanálisis Gemini vuelve a ejecutar `analyzeSportsFixture`; al devolver ahora su contexto, el resultado operativo conserva los mismos datos API antes y después de Gemini. La evidencia manual complementa el análisis sin sobrescribir los campos verificados.

## Caso Sport Recife vs Londrina

La regresión integrada para el fixture `1520819` comprueba que el resultado contiene:

- `Brasil Serie B`.
- Temporada `2026`.
- `Regular Season - 22`.
- Tipo `domestic_league`.
- Sport Recife como local.
- Londrina como visitante.
- Agregado `null`, porque no fue entregado.

El reanálisis con evidencia Gemini estructurada conserva competición, ronda y roles exactamente. La sección experta ya dispone del objeto y deja de resumirse como `No disponible`.

El caso determinista económico conserva:

- Under 2.5.
- Confianza Atlas `74/100`.
- Betano `@1.83`.
- Estado interno `marginal`.
- Decisión pública `APOSTAR`.

Ninguna fórmula o decisión fue modificada para obtener este resultado.

## Copas e internacionales

Las pruebas verifican el contrato existente con tres escenarios:

- Copa Brasil: copa doméstica, semifinal y vuelta cuando la ronda contiene soporte explícito.
- Copa Libertadores: competición internacional y fase de grupos cuando eso es lo único conocido.
- Copa Sudamericana: competición internacional, octavos de final, vuelta y agregado `1–0` cuando todos esos campos existen.

También se verifica que una semifinal sin información de ida/vuelta no inventa un número de partido y que un fixture sin agregado permanece con agregado nulo.

El contexto sigue siendo explicativo y no produce ajustes probabilísticos.

## Microcopy sencilla de precio

La vista sencilla dejó de imprimir directamente `price.message`, que contiene vocabulario técnico del modo experto.

La voz pública ahora usa:

- Positivo favorable: `La cuota actual acompaña bien la lectura de Atlas.`
- Positivo autorizado: `La cuota actual es suficiente para esta opción según el análisis de Atlas.`
- Precio rechazado con tesis deportiva positiva: `Me gusta el mercado, pero no lo jugaría a esta cuota.`
- Precio rechazado con tesis negativa: `Atlas no recomienda esta opción a la cuota actual.`
- Cuota vencida: `Cuota vencida — actualízala para tomar una decisión.`

El modo sencillo no muestra `marginal`, valor esperado, amplitud del intervalo ni calibración. El modo experto conserva el objeto completo de `price_assessment`, probabilidades, probabilidad implícita y demás trazabilidad económica.

## Pruebas y validación

Se añadió un único archivo con 24 regresiones para el prompt, los contextos de liga/copa/internacional, el reanálisis Gemini y la voz pública del precio.

Resultados finales:

- Pruebas anteriores: **498/498**.
- Pruebas nuevas: **24/24**.
- Total: **522/522**.
- `git diff --check`: correcto.
- `npm run lint`: correcto.
- `npm test`: correcto.
- `npm run build`: correcto con Next.js 16.2.12; 15 páginas generadas.
- Sin llamadas deportivas externas.
- Sin Gemini API.
- Sin dependencias nuevas.

## Archivos modificados

- `src/core/intelligence/geminiManualContext.js`: formato estricto del prompt.
- `src/core/services/sportsIntelligenceService.js`: devolución y materialización del contexto ya construido.
- `src/app/atlas-functional-client.js`: microcopy pública del precio.
- `src/core/testing/localFinalPolish.test.js`: 24 regresiones deterministas.
- `ATLAS_V1_LOCAL_FINAL_POLISH_REPORT.md`: este informe.

## Commits

1. `55c66fa` — `fix: align Gemini prompt and competitive context`
2. Informe final — commit documental posterior a este archivo.

No se hizo merge. No se iniciaron Supabase o Vercel y no se abrió ninguna fase posterior.
