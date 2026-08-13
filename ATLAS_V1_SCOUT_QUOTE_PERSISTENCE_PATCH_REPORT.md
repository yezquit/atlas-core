# ATLAS V1 — Informe del parche de persistencia de cotizaciones Scout

Fecha de cierre técnico: 2026-08-13
Rama: `rescue/atlas-core-v0.2`

## Causa raíz

La evaluación profunda sí guardaba cada versión y su `active_quote` en el historial append-only, pero la pantalla de jornada conservaba únicamente el resultado deportivo original de Scout. El botón **“Volver a comparar todas las opciones”** cambiaba de vista y limpiaba la cotización temporal sin reconstruir el estado económico del fixture. Por eso una alternativa ya evaluada reaparecía como pendiente aunque su cuota existiera en el historial.

Además, `analysisConfidence` utilizaba `selectedOdds.freshness` y `selectedOdds.verification_status` como entradas directas. Ese acoplamiento explicaba el salto observado de 74% a 87% al añadir solo casa, cuota y hora.

## Persistencia y rehidratación de cotizaciones

Se añadió `FixtureQuoteLedger`, una proyección determinista del historial append-only. La identidad compatible es exacta y canónica:

`fixture_id + market_family + direction + line`

La proyección conserva casa, cuota, hora observada, vigencia, estado económico, decisión, motivo, versión de origen y cotizaciones históricas. No usa similitud textual y no cruza fixtures, familias, direcciones ni líneas.

La ruta local de historial admite la vista `fixture_quotes`. Al finalizar un análisis, al escanear una jornada existente y al pulsar **“Volver a comparar todas las opciones”**, el cliente solicita esa proyección y rehidrata las tarjetas compatibles. No se ejecuta un nuevo Scout al volver.

## Fuente de verdad para `active_quote`

La fuente persistente sigue siendo `.atlas-data/v1/operational-history.ndjson`, mediante los contratos y versiones append-only existentes. No se añadió otra base de datos.

Para cada selección exacta:

- se toma la observación más reciente por casa;
- se recalcula su vigencia con la política temporal existente;
- las cotizaciones stale se excluyen del estado activo;
- entre casas compatibles se reutiliza `selectCandidateQuote`, sin cambiar su política;
- se expone una sola `active_quote` por selección;
- las restantes quedan trazables como no activas/históricas.

Solo las selecciones que tienen una versión de análisis compatible se proyectan como alternativas evaluadas. Una cuota de otro mercado presente en el mismo payload no crea por sí sola un estado operativo para ese candidato.

## Comportamiento de “Volver a comparar”

El botón ahora:

- conserva el fixture seleccionado;
- mantiene el objeto de jornada y los candidatos Scout originales;
- consulta las cotizaciones actuales del fixture en el historial local;
- rehidrata las tarjetas por identidad exacta;
- reconstruye el ranking operativo;
- conserva candidatos no cotizados como pendientes;
- no llama a `scanJourney` ni modifica el ranking deportivo.

Al reabrir una alternativa ya cotizada, casa, cuota y hora se precargan desde su `active_quote` vigente.

## Ranking operativo

La clasificación operativa de la jornada es un bloque separado del orden deportivo. Incluye únicamente alternativas con cuota vigente y reutiliza los estados económicos existentes:

1. `favorable_preliminary`;
2. `marginal`;
3. `unfavorable`.

Los desempates mantienen la brecha de precio y el rango deportivo ya existentes. No se modificaron `evaluateMarketPrice`, sus umbrales ni la metodología probabilística.

Cada fila muestra selección, línea, casa, cuota, decisión, evaluación y motivo breve. Las tarjetas Scout cotizadas muestran el precio y la decisión reales, sin presentarse simultáneamente como pendientes.

## Candidatos pendientes

Una alternativa sin `active_quote` vigente permanece visible en Scout como **“Pendiente de precio”**, pero no entra al ranking operativo. Una cotización stale queda histórica y tampoco entra como precio actual.

En el caso Santos vs Macará:

- `Under 10.5 córners · Betano @1.67` queda primero operativamente, `marginal`, **“Sí, pero con cautela”**;
- `Over 1.5 goles · Betano @1.28` queda después, `unfavorable`, **“No”**;
- `Under 9.5 remates a puerta` permanece pendiente;
- el orden deportivo original no se modifica.

## Actualización de cotizaciones

Una nueva observación vigente de la misma selección y casa reemplaza la cotización activa anterior en la proyección. La anterior permanece en el historial append-only. No se exponen dos precios activos simultáneos para la misma selección exacta.

Si existen varias casas actuales compatibles, la selección activa sigue la política previa de Atlas; las otras permanecen trazables y no contaminan otra línea.

## Revisión de confianza deportiva

La causa fue identificada antes de corregirla: la cuota alimentaba los componentes `freshness`, `verified_market_data` y `verifiedOdds` de la confianza.

Se mantuvieron la fórmula, los pesos, el techo y los umbrales. La confianza deportiva usa ahora las mismas entradas neutrales respecto del precio que tenía un análisis sin cuota (`freshness: 0.35`, `verified_market_data: 0`, `verifiedOdds: false`). Por tanto, añadir únicamente bookmaker, cuota y hora no altera el porcentaje.

La interfaz separa:

- **Confianza deportiva**, independiente de la cuota;
- **Completitud operativa**, con estados pendiente, precio vencido o precio evaluado.

La cuota todavía puede cambiar evaluación económica, decisión, aptitud individual y parlay según las reglas existentes.

## Alerta de cuota atípica

Se añadió una advertencia no bloqueante cuando la cuota repite una línea alta —por ejemplo, línea 10.5 y cuota 10.5— o cuando la cuota es excepcionalmente alta. La microcopy pide confirmar la copia exacta y aclara que Atlas no corrige ni rechaza el valor.

La validación contractual, la probabilidad implícita y la evaluación económica permanecen intactas. Una cuota normal como 1.67 no dispara la alerta.

## Pruebas nuevas

Se añadieron 29 regresiones en `scoutQuotePersistencePatch.test.js`, alineadas una por una con la lista de aceptación:

- persistencia de A y B al regresar;
- compatibilidad exacta;
- candidato C pendiente;
- independencia del ranking deportivo;
- ranking operativo solo con cotizadas;
- `marginal` por encima de `unfavorable`;
- resultados económicos 1.28/1.67 intactos;
- stale solo histórica;
- reemplazo de cotización y trazabilidad anterior;
- aislamiento entre casas y líneas;
- regreso sin nuevo Scout;
- invariancia de probabilidad, intervalo, `sports_score`, `overall_rank` y `family_rank`;
- confianza deportiva estable;
- parlay sensible al precio según su política;
- opción manual, Gemini e historial sin regresión;
- alerta atípica no bloqueante y cuota normal sin alerta.

La prueba 4 reproduce local y determinísticamente Santos vs Macará, sin llamadas deportivas externas ni Gemini API.

## Total final

- Pruebas anteriores: 395/395 intactas.
- Pruebas nuevas: 29/29.
- Total: **424/424**.

## Lint

`npm run lint`: correcto, sin errores ni advertencias.

## Build

`npm run build`: correcto con Next.js 16.2.12 y Turbopack. Las 15 páginas/rutas se generaron o clasificaron correctamente.

## Diff

`git diff --check`: correcto.

No se modificaron `.env.local`, dependencias, modelo probabilístico, generador de líneas, umbrales económicos, Supabase ni Vercel.

## Validación visual local

- composición de escritorio revisada;
- aviso 10.5/10.5 visible, legible y no bloqueante;
- formulario en dos columnas sin desbordes;
- breakpoint móvil de 390 × 844 revisado;
- cero errores de consola;
- no se ejecutaron consultas deportivas externas durante esta validación.

## Commits

1. `43ab0c8 fix: persist scout quotes for operational ranking`
2. `docs: report scout quote persistence patch` — informe de cierre.

No se realizó merge.

## Limitaciones restantes

- La fuente de verdad continúa siendo persistencia local de servidor; no hay sincronización multiusuario ni remota en V1.
- La vigencia se recalcula al consultar el ledger; una cuota que venza deja automáticamente el ranking activo y permanece histórica.
- La prueba visual del flujo completo con datos deportivos reales queda para aceptación manual, para evitar consumo de API durante este parche. La lógica completa del caso está cubierta por la integración determinística.
- El modelo probabilístico continúa preliminar y no calibrado con suficiente historial, sin cambios en este parche.

Estado: candidato de aceptación local. Esperar validación visual manual; no desplegar ni fusionar.
