# Atlas V1 — Cierre final de comparación Gemini y opción manual

## 1. Comparación entre versiones

Después de un reanálisis, la vista sencilla muestra el bloque **“Qué cambió desde el análisis anterior”** aunque no cambien las cifras. La comparación incluye IDs anterior y actual, fecha y hora, fase, probabilidad preliminar, intervalo, confianza, mercado, dirección, línea, casa, cuota, probabilidad implícita, evaluación de precio, aptitud individual, parlay, riesgos, faltantes y elementos Gemini incorporados.

El contrato enlaza `previous_analysis_id`, `current_analysis_id`, `fixture_id` y `engine_version`. Si no existe una versión anterior válida se muestra **“No hay una versión anterior comparable.”** Para el caso sin cambios se conserva 67.4 %, confianza 87 %, Betano 1.25 y los mismos estados, y se presenta el mensaje prudente solicitado.

## 2. Selección segura de Gemini

La preselección automática exige fuente reconocida, fecha o indicación de vigencia, relevancia deportiva, fixture compatible y ausencia de rumor, contradicción, opinión de pronóstico o página genérica de soporte. Solo se admiten inicialmente las clasificaciones `official_competition`, `official_club`, `federation` y `recognized_media`.

Rumores, contradicciones, hechos sin fuente, datos no encontrados, agregadores débiles, hechos ya conocidos del fixture y soporte genérico comienzan desmarcados. Los datos no encontrados siguen disponibles como limitaciones para selección manual. Una contradicción muestra la advertencia **“Revisa esta contradicción antes de utilizarla.”**

## 3. Clasificación de impactos

Cada elemento conserva categoría, URL, dominio, fecha, clasificación y validación de fuente, mercados afectados, impacto y explicación. Los impactos internos siguen siendo estables y la interfaz muestra sus equivalentes favorables, desfavorables, limitantes o neutrales.

Una alineación probable no recibe dirección favorable o contraria solo por mencionar atacantes. Sin una relación explícita y verificable, queda neutral o limitante. El texto original se conserva para el modo experto y el resumen visible se limita a 180 caracteres sin URLs ni viñetas duplicadas.

## 4. Traducciones

Se añadieron traducciones visibles para línea no confirmada, cuota no confirmada, respuesta con rumores, fixture incompatible, fecha incompatible, contexto de equipo ambiguo, contradicción, fuente y estado `usable_as_context`. La vista sencilla utiliza etiquetas traducidas y no serializa contratos ni códigos internos.

## 5. Procedencia de línea

Las versiones persisten `line_origin` con los valores:

- `atlas_selected`;
- `user_selected`;
- `provider_quote`;
- `transferred_candidate`.

Un candidato transferido conserva procedencia Atlas. Introducir una cuota para la misma selección no cambia el origen y un reanálisis Gemini conserva el origen previo. Solo una opción realmente elegida por el usuario queda como `user_selected`. El Director muestra el texto correspondiente sin confundir procedencia de línea con procedencia de cuota.

## 6. Opción manual

El modo **“Analizar un mercado específico”** separa **“OPCIÓN QUE QUIERES ANALIZAR”** —familia, dirección y línea— de **“PRECIO ENCONTRADO”** —casa, cuota y hora—. El precio es opcional y los botones distinguen **“Analizar esta opción y cuota”** de **“Analizar esta opción sin cuota”**.

La selección exacta solicitada reemplaza únicamente al candidato principal de esa ejecución, conserva las alternativas como contexto y nunca reutiliza la probabilidad o cuota de otra selección. El caso Over 1.5 se evalúa independientemente aunque Atlas hubiera sugerido Under 3.5. El Director muestra **“Opción evaluada por solicitud del usuario.”** y el historial distingue ambas versiones por ID y procedencia.

## 7. Pruebas

Se añadió `src/core/testing/atlasV1FinalClosure.test.js` con las 30 regresiones obligatorias y sin llamadas externas. Cubre comparación visible, permanencia sin cambios, vínculos entre versiones, Betano 1.25, selección conservadora, soporte genérico, resúmenes, traducciones, procedencia, alternativa Over 1.5, independencia de probabilidades y cuotas, limpieza de nueva búsqueda, historial separado y ambos flujos integrados.

Resultado final: 308 pruebas aprobadas, cero fallos, cero cancelaciones y cero omisiones. Las 278 pruebas existentes permanecen aprobadas.

## 8. Archivos modificados

- `src/app/atlas-functional-client.js`
- `src/core/contracts/operationalContracts.js`
- `src/core/intelligence/analysisVersions.js`
- `src/core/intelligence/geminiManualContext.js`
- `src/core/services/operationalAnalysisService.js`
- `src/core/testing/atlasV1FinalClosure.test.js`
- `ATLAS_V1_FINAL_CLOSURE_REPORT.md`

No se modificaron `preliminary-market-v1`, el generador de líneas, el ranking deportivo, la lógica económica ni la política de parlays.

## 9. Comandos

| Comando | Resultado |
| --- | --- |
| `git branch --show-current` | `rescue/atlas-core-v0.2` |
| `npm run lint` | Correcto, sin errores ni advertencias |
| `npm test` | Correcto: 308 aprobadas, 0 fallidas |
| `npm run build` | Correcto: compilación de producción y 15 páginas generadas |
| `git diff --check` | Correcto, sin errores |
| `npm audit --omit=dev` | No se repitió: este entorno ya devolvió `ENOTFOUND registry.npmjs.org` y la instrucción prohíbe reintentar sin conectividad |

No se realizaron llamadas deportivas externas ni se conectó Gemini API.

## 10. Commits

- Implementación: `5e0fd56 fix: close Gemini comparison and manual option flow`.
- Documentación: informe registrado en el segundo y último commit de la tarea.

No se hizo merge a `main`.

## 11. Limitaciones pendientes

- La clasificación reconoce una lista conservadora de dominios; los dominios oficiales de clubes no configurados permanecen desmarcados hasta ser declarados explícitamente.
- La fecha extraída se conserva como dato reportado y no prueba por sí sola la vigencia real de la página.
- El contexto Gemini sigue siendo texto pegado por el usuario y no constituye verificación externa.
- El modelo deportivo continúa siendo preliminar y no calibrado; esta tarea no modificó su metodología.
- La auditoría de dependencias queda pendiente hasta disponer de conectividad con el registro npm.
- La revisión visual final en dispositivos físicos continúa siendo una comprobación manual.
