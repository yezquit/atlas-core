# ATLAS — CHECKLIST FINAL DE ACEPTACIÓN DEL MOTOR DE SELECCIÓN V1

Fecha: 2026-08-05  
Rama: `rescue/atlas-core-v0.2`  
Zona operativa: `America/Bogota`

## Convenciones

- `[x]`: verificado automáticamente o en la comprobación real controlada.
- `[ ]`: prueba manual pendiente; no se marca aprobada sin observación directa.

## 1. Modo general

- [x] Genera candidatos antes de consultar cuotas.
- [x] Recorre las cinco familias cuando la muestra es compatible.
- [x] Genera ranking deportivo sin cuota.
- [x] Muestra candidato principal, alternativas y perfiles de línea.
- [x] No usa orden de llegada ni primera línea del proveedor como ranking.
- [ ] En escritorio, ejecutar otro fixture real con dos o más familias compatibles y revisar la explicación comparativa.

## 2. Mercado específico y cambio de familia

- [x] Goles nunca cambia silenciosamente a córners.
- [x] Tarjetas nunca cambia silenciosamente a córners.
- [x] Las cinco familias respetan el filtro específico en pruebas.
- [x] Se muestran al menos dos alternativas cuando existen.
- [ ] Cambiar manualmente entre las cinco familias en la UI y verificar el encabezado de cada resultado.

## 3. Varias líneas, Over y Under

- [x] Goles, córners y tarjetas usan catálogos válidos.
- [x] Remates y remates a puerta derivan medio puntos de su distribución.
- [x] Cada línea evalúa Over y Under.
- [x] Se descartan líneas absurdas o demasiado alejadas.
- [x] 7.5 y 8.5 conservan probabilidades distintas.
- [ ] Revisar en escritorio y móvil las alternativas más probable, mejor equilibrio y agresiva.

## 4. Sin cuota y cuota vencida

- [x] Sin cuota existe `sports_verdict`.
- [x] Sin cuota el cuadro dice “Todavía no — falta evaluar la cuota”.
- [x] Una cuota vencida no elimina el pronóstico.
- [x] Una cuota vencida queda fuera de parlay.
- [x] La verificación real mantuvo Over 2.5 con precio vencido.
- [ ] Confirmar visualmente que casa, frescura y acción se entienden sin abrir el modo técnico.

## 5. Cuota manual distinta

- [x] Una línea válida distinta se incorpora y recalcula.
- [x] El motor no reutiliza la probabilidad de la línea sugerida.
- [x] Selecciones combinadas como `Draw/Over` no coinciden con un total simple.
- [x] Existe el botón “Evaluar esta línea y cuota”.
- [ ] Introducir una cuota manual actual para una línea distinta y revisar la nueva versión en Historial.

## 6. Gemini manual

- [x] Mapea elementos a variables deportivas.
- [x] Limita contexto `user_reported` a 0.15 desviaciones estándar acumuladas.
- [x] Regenera distribución y ranking.
- [x] Muestra mensaje de mantener, cambiar o no producir efecto.
- [x] No usa Gemini API ni acepta su texto como probabilidad.
- [ ] Completar un ciclo de pegar, validar, seleccionar y reanalizar desde la UI.

## 7. Dictamen temprano

- [x] Existen estados temprano, provisional, actualizado y final prepartido.
- [x] Alineaciones ausentes reducen cobertura, pero no bloquean por definición.
- [x] Tarjetas puede quedar provisional y fuertemente limitada sin árbitro.
- [ ] Repetir un expediente un día antes, tres horas antes y 60–30 minutos antes.

## 8. Nueva búsqueda y repetición

- [x] “Nueva búsqueda” limpia estado volátil.
- [x] No elimina historial persistente.
- [x] Solo confirma cuando hay datos temporales sin incorporar.
- [x] “Repetir análisis” conserva configuración y crea otra versión.
- [ ] Probar ambos botones después de escribir contexto Gemini no validado.

## 9. Explorar jornada

- [x] Usa candidatos del ranking nuevo.
- [x] Muestra partido, mercado, línea, probabilidad, intervalo, score, precio y razón.
- [x] Favorece diversidad solo cuando la diferencia es de cuatro puntos o menos.
- [x] Conserva el límite configurable.
- [ ] Ejecutar una jornada real con más de un fixture y abrir dos candidatos diferentes.

## 10. Parlay

- [x] Exige candidato y versión del ranking.
- [x] Exige línea exacta, cuota actual, incertidumbre y confianza.
- [x] Mantiene la política de correlación.
- [x] No usa cuotas vencidas ni inventa candidatos.
- [ ] Reunir seis candidatos reales elegibles antes de probar la construcción completa.

## 11. DirectorAtlas

- [x] Continúa como única voz pública.
- [x] Separa dictamen deportivo de evaluación de precio.
- [x] Muestra Sí, Todavía no, Cautela, No e Información insuficiente.
- [x] La explicación simple y “qué podría cambiarlo” tienen máximo tres elementos.
- [x] Los códigos internos permanecen fuera del modo sencillo.
- [x] El análisis técnico completo sigue disponible.

## 12. Escritorio

- [x] El CSS incluye resumen principal en cuadrícula y tonos independientes.
- [x] El resultado no depende solo del color: usa icono y texto.
- [ ] Revisar a 1280 px el modo general, específico, precio pendiente y precio vencido.
- [ ] Confirmar foco, scroll y ausencia de desbordamiento horizontal en navegador real.

## 13. Móvil

- [x] El resumen, filtros y acciones pasan a una columna bajo 640 px.
- [x] Nueva búsqueda permanece disponible en navegación apilada.
- [ ] Revisar a 390 × 844 px selección, alternativas, formulario manual y Gemini.
- [ ] Confirmar teclado, foco, scroll y acciones en un dispositivo real.

## 14. Verificación real controlada

- [x] Un fixture: Santa Fe vs Chico, ID `1549722`.
- [x] Modo general y modo específico de goles.
- [x] Over/Under y seis líneas de goles generadas.
- [x] Ganador Over 2.5; primera línea del proveedor 1.5.
- [x] Pronóstico conservado con cuota vencida y alineaciones no disponibles.
- [x] 74 solicitudes externas totales entre descubrimiento y confirmación; límite 80.
- [x] Sin Gemini API, sin barrido de 17 ligas y sin declarar validación deportiva.

## 15. Validación automática final

- [x] `npm run lint`
- [x] `npm test` — 228 aprobadas, 0 fallidas.
- [x] Nueva batería — 50 aprobadas, 0 fallidas.
- [x] `npm run build`
- [x] `npm audit --omit=dev` — 0 vulnerabilidades.
- [x] `git diff --check`
- [x] Rama `rescue/atlas-core-v0.2`.
- [x] Sin merge a `main`.

