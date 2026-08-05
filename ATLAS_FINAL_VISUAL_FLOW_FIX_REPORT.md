# ATLAS_FINAL_VISUAL_FLOW_FIX_REPORT

## Alcance

Tarea ejecutada: **CORRECCIÓN FINAL CONCENTRADA DE FLUJO, CUOTAS Y EXPERIENCIA ATLAS V1**.

- Repositorio: `/Users/yezidquitian/Documents/atlas-core`
- Rama: `rescue/atlas-core-v0.2`
- No se añadieron APIs, integraciones externas, Supabase, Vercel ni llamadas deportivas.
- No se modificó el modelo deportivo; los cambios se limitaron a asociación y precedencia de cuotas, contratos de versión, presentación del resultado y flujo de navegación.

## 1. Problemas reproducidos

Se reprodujeron de forma offline los dos fallos principales:

1. Un escaneo podía contener candidatos válidos y, al mismo tiempo, mostrar el estado global `blocked` cuando el presupuesto de consultas se había agotado después de producir resultados.
2. Para la misma familia, dirección y línea, el ranking de precio ordenaba las cuotas únicamente por `decimal_odds`. Como consecuencia, Marathonbet 10.5 vencida se imponía sobre Betano 1.65 recién reportada por el usuario.

También se confirmó que “Abrir análisis profundo” solo transfería el fixture, que la muestra efectiva se mostraba con hasta tres decimales en modo sencillo y que el formulario mezclaba la selección deportiva con la cuota encontrada por el usuario.

## 2. Causa del estado global incorrecto

`scanSportsJourney` asignaba `DATA_LOAD_STATUS.BLOCKED` siempre que `telemetry.budgetExhausted` fuera verdadero, sin comprobar si ya había candidatos construidos.

Se añadió una resolución explícita del estado global:

- candidatos con precio pendiente: `success`, tono amarillo y mensaje **“Candidatos deportivos encontrados — evaluación de precio pendiente”**;
- todos los candidatos con precio actual: verde y **“Análisis de jornada completado”**;
- sin candidatos: gris y **“No se encontraron candidatos con respaldo suficiente”**;
- bloqueo rojo: solo si existe una condición crítica y no se pudo producir ningún candidato.

## 3. Explicación del ranking de familias

Cada candidato de jornada incorpora ahora:

- posición en el ranking general;
- `sports_score`;
- familias comparadas;
- mejor puntaje y posición por familia;
- explicación breve de por qué quedó debajo: muestra, cobertura, incertidumbre, probabilidad, dependencia crítica, ausencia de candidato válido o puntaje deportivo inferior.

La tarjeta muestra “Por qué ganó este mercado” y conserva la comparación completa dentro de “Ver comparación de mercados”. El ranking deportivo existente no fue alterado.

## 4. Corrección de muestra efectiva

`sample_size_effective` es una muestra ponderada construida a partir de submuestras que pueden solaparse; no es un conteo bruto de partidos independientes.

- modo sencillo: máximo un decimal y etiqueta **“Muestra efectiva ponderada”**;
- modo experto: máximo tres decimales;
- aclaración visible: **“Las submuestras pueden solaparse y no equivalen a partidos independientes”**;
- el número original permanece en los contratos y versiones técnicas.

Ejemplo verificado: `26.619` se presenta como `26,6` en español.

## 5. Transferencia de candidato

El traspaso desde jornada conserva:

`fixture_id`, modo específico, `market_family`, dirección, línea, selección, probabilidad preliminar, intervalo, `sports_score`, posición, razones, riesgos y versión metodológica.

La pantalla individual muestra “Candidato transferido desde la jornada” y ofrece:

- “Continuar con este candidato”;
- “Volver a comparar todas las opciones”.

El botón genérico pasa a llamarse “Reanalizar este candidato”. La familia queda bloqueada durante el traspaso y la respuesta se rechaza si intenta cambiarla silenciosamente.

## 6. Causa exacta de Marathonbet 10.5

El normalizador existente obtenía:

- la línea desde `value.value` o `value.handicap`;
- la cuota exclusivamente desde `value.odd`.

La prueba estructural `Over 10.5` + `odd: 1.65` conserva línea 10.5 y cuota 1.65. La reproducción exacta `Over 1.5` + `odd: 10.5` conserva cuota 10.5 porque ese valor está realmente en el campo `odd`; por sí mismo no es un intercambio de campos.

No existe en el repositorio el payload histórico original, el registro de caché original ni una captura serializada del objeto Marathonbet. Por ello no fue posible demostrar offline si el proveedor publicó realmente 10.5 o si el dato se corrompió antes de llegar a este código. No se inventó un límite universal de cuotas.

Se añadieron:

- identificador y nombre originales del bet;
- índice del valor dentro del bet;
- selección y handicap originales;
- constancia de que la cuota proviene de `odd`;
- descarte con advertencia sanitizada si selección y handicap contienen líneas contradictorias;
- detalle de descartes en modo experto.

## 7. Causa exacta de la cuota manual ignorada

La causa confirmada estaba en `marketCandidateRanker`: después de añadir Betano a la colección de cuotas, `comparableQuote` ordenaba todas las coincidencias por mayor cuota decimal. Marathonbet 10.5 vencida ganaba a Betano 1.65 sin considerar vigencia ni la acción manual explícita.

Ahora el selector:

1. exige misma familia, dirección y línea;
2. usa la cuota manual explícita como preferida para esa acción;
3. cuando no hay una preferencia explícita, prioriza verificada vigente, reportada vigente y finalmente vencida;
4. conserva todas las cotizaciones en el expediente.

## 8. Reglas de precedencia y `active_quote`

La versión operativa contiene `active_quote`. Para el caso reproducido se verificó:

- `source_status: user_reported_current`;
- `bookmaker_name: Betano`;
- `market_family: goals`;
- `direction: over`;
- `selection: Over 1.5`;
- `line: 1.5`;
- `decimal_odds: 1.65`;
- `implied_probability: 0.606061`;
- `timezone: America/Bogota`;
- `stale: false` al crearse.

La clave identificadora manual incorpora fixture, mercado, dirección, línea, cuota, bookmaker, hora consultada, zona horaria y versión de análisis. No existe una caché de resultados operativos/Director en esta base; la caché existente corresponde a solicitudes del proveedor. Se incorporó la clave completa para impedir colisiones si se añade esa caché posteriormente.

## 9. Cambios del Director Atlas

Director Atlas consume la cuota activa de la versión actual. El flujo probado muestra Betano 1.65 y 60.61% de probabilidad implícita, sin restaurar Marathonbet 10.5 ni marcar el precio como vencido.

Además:

- pronóstico deportivo y evaluación de precio se muestran como bloques independientes;
- una cuota nueva resuelve el faltante “Cuota actual para la línea exacta”;
- alineaciones y lesiones no publicadas quedan como limitaciones temporales, no como un bloqueo ficticio;
- la razón principal es deportiva;
- la explicación de confianza aparece aparte;
- nunca se afirma valor esperado positivo;
- cuando la estimación supera la implícita, se explicita que el intervalo es amplio y el modelo no está calibrado para afirmar valor esperado.

## 10. Gemini

No se rediseñó ni conectó Gemini. El flujo manual existente permanece: copiar, pegar, validar, seleccionar, reanalizar, versionar y comparar cambios.

La regresión Betano 1.65 → contexto Gemini → reanálisis conserva Betano 1.65 como `active_quote`. Una versión anterior solo puede aportar su cuota activa si pertenece al mismo fixture.

## 11. Nueva búsqueda e historial

“Nueva búsqueda” limpia candidato transferido, casa, dirección, línea, cuota y hora temporales. Cambiar fecha, competición, carga de fixtures o fixture seleccionado también evita arrastrar una cuota.

No se elimina ni reinicia el historial. Las versiones siguen siendo append-only y pueden conservar la versión con la cuota antigua, la versión manual nueva y una versión posterior con contexto Gemini.

## 12. Pruebas y comandos

Se añadió `src/core/testing/visualFlowFix.test.js` con las 30 regresiones obligatorias, todas offline.

Resultados finales:

| Comando | Resultado |
|---|---|
| `npm run lint` | Pasa, sin errores ni advertencias. |
| `npm test` | Pasa: 258 pruebas, 258 aprobadas, 0 fallidas. |
| `npm run build` | Pasa; Next.js compiló y generó 15 páginas sin descargar Google Fonts. |
| `npm audit --omit=dev` | No verificable: el entorno sin red devolvió `ENOTFOUND registry.npmjs.org`; no se obtuvo un informe de vulnerabilidades. |
| `npm ls --omit=dev --depth=1` | Pasa; árbol de producción resoluble. Las dependencias opcionales de otras plataformas aparecen como opcionales no instaladas. |
| `git diff --check` | Pasa, sin errores de espacios. |

No se realizaron llamadas deportivas externas.

## 13. Archivos modificados

- `src/app/atlas-functional-client.js`
- `src/app/globals.css`
- `src/core/contracts/operationalContracts.js`
- `src/core/intelligence/analysisVersions.js`
- `src/core/intelligence/marketCandidateRanker.js`
- `src/core/intelligence/oddsIntelligence.js`
- `src/core/modules/directorAtlas.js`
- `src/core/services/operationalAnalysisService.js`
- `src/core/services/sportsIntelligenceService.js`
- `src/core/testing/visualFlowFix.test.js`
- `ATLAS_FINAL_VISUAL_FLOW_FIX_REPORT.md`

## 14. Commits

- `c5c2dc5 fix: make manual odds the active quote`
- `ce5d253 fix: complete journey candidate handoff`
- `docs: record final visual flow correction` (informe final)

No se hizo merge a `main`.

## 15. Limitaciones pendientes

1. El payload Marathonbet histórico original no estaba conservado localmente; su autenticidad no puede determinarse sin una evidencia guardada del proveedor.
2. `npm audit --omit=dev` no pudo consultar el registro por la restricción de red. Debe repetirse cuando exista conectividad autorizada.
3. La probabilidad deportiva continúa marcada como preliminar y no calibrada; esta tarea no modificó el modelo.
4. La persistencia sigue siendo el historial local append-only existente. No se integró una base de datos.
5. No se realizó una prueba visual con datos deportivos en vivo, por la prohibición expresa de llamadas externas; la cobertura se hizo con integración offline y build de producción.
