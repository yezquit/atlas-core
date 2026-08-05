# ATLAS — CORRECCIÓN DEFINITIVA DEL MOTOR DE SELECCIÓN Y DECISIÓN V1

Fecha: 2026-08-05  
Rama: `rescue/atlas-core-v0.2`  
Alcance: selección de mercados, líneas, ranking, separación pronóstico/precio, DirectorAtlas, jornada, Gemini manual, cuota manual, parlays y pruebas.

## 1. Resultado

Atlas ya no valida únicamente una línea preseleccionada por una casa. El flujo operativo genera líneas deportivas antes de consultar el precio, calcula una estimación preliminar exacta por línea, ordena candidatos sin usar cuotas y después busca una cotización compatible.

Se mantienen las cinco familias existentes: goles, córners, tarjetas, remates totales y remates a puerta. No se añadieron APIs, familias ni servicios externos. El modelo continúa identificado como preliminar y no validado; no declara valor esperado ni promete rentabilidad.

## 2. Causa exacta del sesgo observado hacia córners

La causa no era una regla explícita que otorgara puntos extra a córners. Era la combinación de cuatro decisiones de flujo:

1. `analyzeSportsFixture` elegía un único `selectedMarket` con `selectBestSupportedMarket` antes de generar probabilidades por línea.
2. `operationalAnalysisService` solicitaba y seleccionaba cuotas únicamente para esa familia ya elegida; la línea del proveedor se convertía en la única línea evaluada.
3. El desempate de soporte terminaba en orden lexicográfico de familia, no en una comparación de oportunidades por línea.
4. La interfaz conservaba `marketId` entre búsquedas y el flujo de jornada devolvía solo el mercado previamente seleccionado por fixture.

Cuando córners tenía cobertura detallada más completa que otras familias, entraba repetidamente como `selectedMarket`; la selección temprana y el estado persistente reforzaban esa repetición. El proveedor no era la única causa, pero su primera línea pasaba a dominar después de la preselección.

La corrección elimina esa preselección del flujo operativo y de jornada. El ranking recibe todos los candidatos compatibles y aplica un desempate determinista independiente del orden de entrada: puntuación, intervalo, muestra, identificador de familia, línea y dirección.

## 3. Funcionamiento anterior y nuevo

### Antes

`datos -> soporte por familia -> una familia -> cuota/línea -> una probabilidad -> DirectorAtlas`

### Ahora

`datos -> distribuciones por familia -> líneas Over/Under -> probabilidad e incertidumbre por línea -> sports_score -> candidato principal y alternativas -> coincidencia exacta de cuota -> DirectorAtlas`

El modo general evalúa las cinco familias con muestra compatible. El modo específico filtra antes de generar líneas y nunca puede cambiar silenciosamente de familia.

## 4. Generador de líneas

`candidateLineGenerator` contiene catálogos explícitos para:

- goles: 0.5 a 5.5;
- córners: 5.5 a 14.5;
- tarjetas: 1.5 a 8.5.

Remates totales y remates a puerta usan líneas de medio punto alrededor de la media proyectada y un radio derivado de la dispersión. Las líneas se filtran con percentiles 10 y 90, dispersión y validez por familia. Una línea manual válida puede incorporarse y calcularse en el momento; no reutiliza la probabilidad de otra línea.

Cada candidato conserva familia, dirección, línea, media, mediana, dispersión, tasa empírica de liga, probabilidad preliminar, intervalo, muestra efectiva, fuentes, limitaciones y versión metodológica. Si las submuestras mínimas no son compatibles, no se fabrica una lista.

## 5. Distribución por mercado

No se impuso una distribución paramétrica única. Se usa frecuencia empírica suavizada y shrinkage hacia la liga, con etiquetas metodológicas distintas:

- goles: volumen discreto de goles;
- córners: volumen de acciones a balón parado;
- tarjetas: volumen disciplinario con dependencia arbitral explícita;
- remates totales: volumen de remates con líneas dinámicas;
- remates a puerta: volumen de precisión ofensiva con líneas dinámicas.

Las submuestras usan liga, últimos 5, últimos 10, local en casa y visitante fuera. Los perfiles mantienen producido y concedido para trazabilidad. La media proyectada pondera las fuentes; la probabilidad por línea conserva los pesos y el shrinkage existentes. Tarjetas puede producir un pronóstico provisional sin árbitro, pero aplica una penalización de cobertura de 0.65 y una advertencia fuerte.

Redondeo de interfaz: probabilidad e intervalo a un decimal como máximo; medias a dos decimales.

## 6. Ranking

`marketCandidateRanker` calcula `sports_score` sin usar cuota:

- equilibrio de probabilidad: 30%;
- incertidumbre: 20%;
- muestra efectiva: 15%;
- cobertura del mercado: 15%;
- confianza informativa: 5%;
- estabilidad/relevancia de línea: 10%;
- sensibilidad a limitaciones y contexto: 5%.

El centro de equilibrio se sitúa en 0.68 para evitar que una línea casi trivial gane solo por probabilidad. Las líneas contextuales o muy alejadas reciben penalización. Se exponen perfiles independientes: opción más probable, mejor equilibrio y opción más agresiva.

Estados de precio: `verified_current`, `user_reported_current`, `stale`, `unavailable`, `incompatible_line` e `incompatible_selection`. Estados globales: apto, cautela, candidato deportivo pendiente de precio, revisión, no viable, bloqueado o información insuficiente.

La verificación real detectó que `Draw/Over 2.5` podía interpretarse como `Over 2.5`. Se restringió la coincidencia para que Over/Under aparezca al inicio de la selección; una selección combinada ya no se acepta como total simple.

## 7. Pronóstico deportivo y evaluación de precio

DirectorAtlas entrega dos contratos visibles:

- `sports_verdict`: mercado, selección, línea, probabilidad, intervalo, sports score, confianza y estado temporal;
- `price_assessment`: casa, cuota, probabilidad implícita, frescura, compatibilidad y comparación preliminar.

Sin cuota o con cuota vencida, el pronóstico permanece. La evaluación económica queda pendiente. Aun cuando la estimación preliminar supere la implícita, Atlas explica que no existe calibración suficiente para afirmar valor esperado.

## 8. Dictamen temprano

La ausencia de alineaciones no bloquea por sí sola. Los estados son:

- `early_forecast`;
- `provisional_forecast`;
- `updated_forecast`;
- `final_pre_match_forecast`.

El Director advierte que alineaciones, bajas, árbitro, clima o cuotas pueden cambiar el dictamen. Un bloqueo solo prevalece por identidad, presupuesto, contradicción crítica o cierre prepartido, no por falta ordinaria de alineaciones.

## 9. Gemini manual

`geminiImpactMapper` traduce texto seleccionado a mercados afectados, dirección, magnitud, confianza, procedencia y explicación. Se cubren atacantes, extremos, laterales ofensivos, árbitro, clima, rotación, contexto competitivo y campo.

El impacto se expresa como fracción acotada de la desviación observada. Texto `user_reported` o no verificado se limita individualmente y el acumulado no puede superar 0.15 desviaciones estándar. Fuentes verificadas no superan 0.30. Tras incorporarlo se regeneran distribuciones y candidatos, se reordena el ranking y se muestra si el candidato se mantiene, cambia o no recibe efecto suficiente. No se llamó a Gemini API.

## 10. Cuota manual

La interfaz muestra la selección deportiva y permite informar casa, dirección, línea encontrada, cuota y hora. Si la casa ofrece otra línea válida, Atlas la añade a la distribución y calcula su probabilidad exacta. El botón visible es “Evaluar esta línea y cuota”. Mercado, dirección y línea deben coincidir para evaluar el precio.

## 11. Nueva búsqueda y repetición

“Nueva búsqueda” limpia fecha, fixture, candidatos, cuota temporal, texto Gemini, validación y resultado visual. Solo pide confirmación si detecta datos temporales sin incorporar. No llama al historial ni borra versiones persistentes.

“Repetir análisis” conserva fixture y configuración, ejecuta nuevamente el servicio y crea otra versión inmutable.

## 12. Explorar jornada

Jornada genera candidatos por fixture y familia, no solo un mercado por partido. Muestra selección, línea, probabilidad, intervalo, score, precio y razón. La diversidad se aplica únicamente cuando otra familia está a cuatro puntos o menos del candidato repetido; no se fuerza si la diferencia deportiva es mayor.

## 13. Parlays

Un candidato de parlay debe contener `candidate_id` y versión del ranking, línea exacta, probabilidad preliminar, cuota vigente verificada o reportada recientemente, intervalo con ancho máximo 0.35, confianza mínima de 60, aptitud individual y compatibilidad de correlación. Una cuota vencida nunca entra. La política no inventa candidatos.

## 14. Pruebas

- Suite total: 228 aprobadas, 0 fallidas.
- Nueva batería obligatoria: 50 aprobadas, 0 fallidas.
- Incluye cinco familias ganadoras bajo datos distintos, desempate determinista, modo específico, Over/Under, línea manual exacta, precio ausente/vencido, Gemini, cinco cuadros visuales, búsqueda, jornada, parlay, voz pública y fixture inmutable.

Resultados finales:

- `npm run lint`: aprobado.
- `npm test`: 228/228.
- `npm run build`: aprobado; 15 páginas/rutas generadas, sin descarga de Google Fonts.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- `git diff --check`: aprobado.

## 15. Verificación real controlada

Se usó un fixture de Colombia Primera A, Santa Fe vs Chico, fixture ID `1549722`, fecha 2026-08-08. Se ejecutaron modo general y modo específico de goles.

Resultado confirmado:

- líneas de goles generadas: 0.5, 1.5, 2.5, 3.5, 4.5 y 5.5, con Over y Under;
- ganador deportivo: Over 2.5 goles;
- probabilidad preliminar: 61.09%;
- intervalo: 45.14%–74.97%;
- `sports_score`: 87.3;
- primera línea recibida del proveedor: 1.5;
- la ganadora fue 2.5 y se seleccionó antes de evaluar precio;
- cuota coincidente encontrada, pero vencida: el precio quedó en revisión y el pronóstico se mantuvo;
- alineaciones no disponibles: no produjeron bloqueo;
- modo específico respetó goles;
- 37 solicitudes por corrida y 36 aciertos de caché.

Se hicieron dos corridas controladas: la primera descubrió la incompatibilidad de selección combinada y la segunda confirmó su corrección. Consumo externo total: 74 solicitudes, por debajo del máximo de 80. No se usó Gemini API, no se recorrieron 17 ligas y esta comprobación no se presenta como validación deportiva del modelo.

En ese fixture, remates, remates a puerta, tarjetas y córners produjeron valores centrales, pero no líneas candidatas porque sus submuestras exactas no cumplieron todos los mínimos. Atlas no inventó listas para esas familias.

## 16. Limitaciones pendientes

- El modelo sigue siendo preliminar y no calibrado con una muestra histórica suficiente.
- No existe evidencia para afirmar valor esperado o rentabilidad.
- El proveedor puede entregar muchas cuotas combinadas; la compatibilidad exacta quedó endurecida, pero conviene ampliar casos de normalización auditados.
- La verificación real cubrió un solo fixture y solo goles alcanzó muestra compatible.
- El texto Gemini manual conserva categoría `user_reported`; no sustituye fuentes verificadas.
- La revisión visual en dispositivos físicos y con cuotas actuales debe completarse manualmente.

## 17. Archivos modificados

Nuevos:

- `src/core/intelligence/candidateLineGenerator.js`
- `src/core/intelligence/marketCandidateRanker.js`
- `src/core/intelligence/geminiImpactMapper.js`
- `src/core/testing/selectionEngine.test.js`
- `ATLAS_FINAL_SELECTION_ENGINE_REPORT.md`

Actualizados:

- `src/core/intelligence/preliminaryMarketModel.js`
- `src/core/intelligence/marketSuitability.js`
- `src/core/intelligence/parlayPolicy.js`
- `src/core/modules/directorAtlas.js`
- `src/core/services/operationalAnalysisService.js`
- `src/core/services/sportsIntelligenceService.js`
- `src/app/atlas-functional-client.js`
- `src/app/globals.css`
- `scripts/verify-final-operational.mjs`
- `src/core/testing/finalAcceptance.test.js`
- `src/core/testing/operationalIntelligence.test.js`
- `ATLAS_FINAL_ACCEPTANCE_CHECKLIST.md`

## 18. Commits de implementación

- `7329082 feat(selection): generate and rank market lines`
- `47cb106 feat(decision): separate sports forecast from price`
- `c90c8fd feat(ui): expose analysis modes and clear verdicts`
- `de60548 test(selection): cover final decision engine`
- `1f8b7d3 fix(selection): enforce exact price compatibility`
- `76da859 fix(ui): lock manual quote to ranked candidate`

No se hizo merge a `main`.
