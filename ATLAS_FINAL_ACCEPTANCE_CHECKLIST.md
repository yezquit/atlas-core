# ATLAS — CHECKLIST FINAL DE ACEPTACIÓN OPERATIVA V1

Fecha: 2026-08-05  
Rama: `rescue/atlas-core-v0.2`  
Zona operativa por defecto: `America/Bogota`

## Convenciones

- `[x]`: comprobado en esta corrección.
- `[ ]`: prueba manual que debe repetirse con datos reales disponibles; no se simularon datos deportivos para marcarla como aprobada.

## 1. Escritorio

- [x] Los modos Explorar jornada, Analizar partido e Historial se muestran en una fila.
- [x] La página no presenta desbordamiento horizontal a 1280 px.
- [x] La fecha y los controles principales tienen etiquetas accesibles.
- [x] No se detectaron errores ni advertencias de consola al cargar la página.
- [ ] Ejecutar un análisis real con cobertura completa y confirmar visualmente el cuadro final con datos del proveedor.
- [ ] Comprobar manualmente modo sencillo y modo experto con un expediente real reanalizado.

## 2. Móvil

- [x] Revisión a 390 × 844 px sin desbordamiento horizontal.
- [x] La navegación se apila y permanece legible.
- [x] El selector de fecha cabe en el ancho disponible.
- [x] Tarjetas, columnas del Director y acciones pasan a una sola columna.
- [ ] Completar un análisis real en móvil y verificar teclado, scroll, foco y reanálisis de cuota.

## 3. Fecha y zona horaria

- [x] `ATLAS_DEFAULT_TIMEZONE=America/Bogota` está documentada en `.env.example`.
- [x] La fecha elegida genera el día local completo de 00:00:00.000 a 23:59:59.999.
- [x] El intervalo local se convierte a UTC antes de la consulta.
- [x] El proveedor recibe la zona horaria cuando el endpoint la admite.
- [x] Los fixtures se filtran nuevamente por `local_calendar_date` después de normalizarse.
- [x] Un kickoff `2026-08-05T01:20:00Z` pertenece al 4 de agosto en Bogotá y no al 5.
- [x] Se conservan `kickoff_utc`, `kickoff_local`, `timezone` y `local_calendar_date`.
- [x] La caché separa consultas por zona y fecha local; el contrato de caché cambió a versión 2.
- [x] Explorar, Analizar e Historial usan la zona configurada.

## 4. Familias de mercado y probabilidad

- [x] Goles produce una estimación solo con muestra compatible.
- [x] Remates totales produce una estimación solo con muestra compatible.
- [x] Remates a puerta produce una estimación solo con muestra compatible.
- [x] Tarjetas exige árbitro confirmado, cobertura verificada y muestra arbitral mínima.
- [x] Córners produce una estimación solo con muestra compatible.
- [x] La línea debe interpretarse como Over/Under exacto.
- [x] La probabilidad no parte de 50% y no copia la confianza informativa.
- [x] Muestra insuficiente, cobertura incompatible o contradicción crítica devuelven `unavailable`.
- [x] Se muestran estimación puntual, intervalo, muestra efectiva, metodología, entradas y limitaciones.
- [x] El modelo se identifica como `preliminary-market-v1` y `preliminary_unvalidated`.
- [x] No se declara valor esperado ni se superan extremos injustificados.
- [ ] Repetir cada familia con un fixture real cuya cobertura cumpla todos los mínimos.

## 5. Cuotas

- [x] Probabilidad implícita y probabilidad deportiva están separadas.
- [x] Una cuota vencida incluye antigüedad, límite, origen y motivo exacto.
- [x] Una cuota vencida bloquea la consideración final y la elegibilidad para parlay.
- [x] La entrada manual conserva casa, selección, línea, cuota y hora de consulta.
- [x] La cuota manual permanece reportada por el usuario; no se promueve a verificada.
- [x] “Guardar cuota actual y reanalizar” crea una nueva versión mediante el flujo existente.
- [ ] Probar con una cuota real vencida devuelta por el proveedor y actualizarla manualmente desde la UI.

## 6. Gemini manual

- [x] El flujo conserva copiar, pegar, validar, seleccionar y reanalizar.
- [x] Cada elemento muestra resumen, categoría, fuente, dominio, fecha, procedencia, validación e impacto.
- [x] Se muestran contadores de detectados, seleccionados, rechazados, rumores y limitaciones.
- [x] Los rumores empiezan desmarcados.
- [x] Los datos no encontrados se convierten en limitaciones.
- [x] Si fallan las secciones, el parser crea elementos por párrafos sin verificarlos.
- [x] Fixture, equipos, fecha, línea y cuota permanecen inmutables.
- [x] El contexto seleccionado puede afectar confianza, riesgos, faltantes y aptitud.
- [x] Gemini no proporciona directamente porcentajes deportivos.
- [x] Si el dictamen no cambia, la diferencia lo explica expresamente.
- [ ] Completar un ciclo manual con una respuesta real de Gemini y fuentes revisables.

## 7. Reanálisis temporal

- [x] Todas las fases se traducen a español natural.
- [x] DirectorAtlas indica próxima acción y momento de la siguiente revisión.
- [x] La comparación conserva valores anteriores y actuales de probabilidad, confianza, aptitud, veredicto, línea y cuota.
- [x] La comparación identifica contexto Gemini, riesgos nuevos, riesgos resueltos y faltantes.
- [x] Cada reanálisis crea una versión inmutable.
- [ ] Verificar manualmente las seis fases cerca de sus ventanas reales de kickoff.

## 8. Aptitud individual y parlay

- [x] El formulario permite Evaluación individual, Considerar para parlay o Ambos.
- [x] La elección de uso no modifica los datos deportivos.
- [x] DirectorAtlas muestra aptitud individual y elegibilidad para parlay por separado.
- [x] Un candidato apto conserva selección, línea, cuota, timestamp, confianza, probabilidad, incertidumbre y riesgos.
- [x] Historial construye parlays únicamente con candidatos guardados y elegibles.
- [x] La política no inventa selecciones para completar combinaciones.
- [x] Se controlan fixture repetido, línea crítica repetida y correlación.
- [ ] Reunir seis candidatos reales independientes para probar los tres parlays sin fabricar picks.

## 9. Historial, resultados y calibración

- [x] El historial filtra por la fecha local del fixture.
- [x] Puede registrarse un total real manual como hit, miss, void o unresolved.
- [x] Puede solicitarse actualización desde API-FOOTBALL usando la integración existente.
- [x] Los resultados se añaden al log append-only y no reescriben la predicción.
- [x] Se calculan casos resueltos, hit rate, Brier, bandas, familia, competición y fase.
- [x] No hay recalibración automática.
- [x] El umbral documentado para una revisión manual de calibración es 200 predicciones resueltas.
- [x] El modelo permanece preliminar aun cuando alcance el umbral; requiere validación humana posterior.
- [ ] Registrar un resultado real finalizado desde API-FOOTBALL y contrastarlo manualmente.

## 10. DirectorAtlas y claridad

- [x] DirectorAtlas es la única voz pública.
- [x] El cuadro principal no está dentro de un acordeón.
- [x] El cuadro usa texto, icono y contraste; no depende solo del color.
- [x] Se muestran SÍ, SÍ CON CAUTELA, TODAVÍA NO o NO según la aptitud.
- [x] El encabezado recibe foco y la página se desplaza suavemente al resultado.
- [x] Se distingue “Primer dictamen generado” de “Dictamen actualizado”.
- [x] El modo sencillo traduce estados; el modo experto conserva códigos y trazabilidad.
- [x] Confianza y probabilidad muestran aclaraciones independientes.

## 11. Validación automática final

- [x] `npm run lint`
- [x] `npm test` — 178 aprobadas, 0 fallidas.
- [x] `npm run build`
- [x] `npm audit --omit=dev` — 0 vulnerabilidades.
- [x] `git diff --check`
- [x] Rama confirmada: `rescue/atlas-core-v0.2`.
- [x] Sin merge a `main`.

