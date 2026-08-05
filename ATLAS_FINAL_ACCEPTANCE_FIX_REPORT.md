# ATLAS — INFORME DE CORRECCIÓN FINAL DE ACEPTACIÓN

Fecha de cierre: 2026-08-05  
Repositorio: `/Users/yezidquitian/Documents/atlas-core`  
Rama: `rescue/atlas-core-v0.2`  
Tarea: Corrección final de aceptación y cierre de Atlas Operativo V1

## 1. Resultado ejecutivo

La base existente fue corregida sin reconstruir el proyecto, sin cambiar de rama, sin integrar Supabase o Vercel, sin usar Gemini API, sin añadir proveedores externos y sin eliminar módulos aprobados. DirectorAtlas continúa como única voz pública.

Atlas ahora interpreta la fecha como día calendario de la zona configurada, presenta un dictamen inmediato fuera de acordeones, calcula una probabilidad preliminar auditable cuando existe evidencia compatible, explica la frescura de la cuota, estructura el contexto manual de Gemini, separa aptitud individual de parlay y permite registrar resultados para calibración posterior.

La cobertura automatizada pasó de 133 a 178 pruebas. Las 45 pruebas nuevas corresponden una a una a los criterios de aceptación de esta corrección.

## 2. Causa del error de fecha

La fecha seleccionada se trataba principalmente como una cadena UTC del proveedor. El filtrado dependía de `date.utc` y la interfaz formateaba con la zona implícita del navegador. Como consecuencia, un partido nocturno de Bogotá podía quedar asociado al día UTC siguiente. Además, la clave de caché no expresaba un contrato de zona horaria normalizada.

## 3. Solución de zona horaria

Se añadió `dateTimeContext.js` con `America/Bogota` como valor predeterminado y validación de zonas IANA. Para cada fecha:

1. se construye el intervalo local completo;
2. sus extremos se convierten a UTC;
3. la consulta incluye `timezone` cuando el endpoint lo admite;
4. cada kickoff se normaliza a UTC y a hora local;
5. se filtra por `local_calendar_date` después de recibir los fixtures.

El fixture conserva `kickoff_utc`, `kickoff_local`, `timezone`, `local_calendar_date` y una etiqueta local. Explorar jornada, Analizar partido, Historial y las comparaciones usan esa identidad. La caché subió a esquema 2 y sus claves incluyen zona y fecha local, por lo que las entradas anteriores quedan invalidadas.

## 4. Modelo probabilístico preliminar

El modelo se denomina `preliminary-market-v1`. No parte de 50%, no reutiliza `analysis_confidence_score`, no consume porcentajes de Gemini y no afirma ventaja o valor esperado.

### Fórmula

Para una línea Over/Under exacta se calcula la frecuencia observada en:

- liga: peso base 0,25;
- local últimos 5: 0,10;
- local últimos 10: 0,10;
- visitante últimos 5: 0,10;
- visitante últimos 10: 0,10;
- local en casa: 0,175;
- visitante fuera: 0,175.

En tarjetas se incorpora árbitro con peso 0,15 y todos los pesos se normalizan. El árbitro debe estar confirmado, tener cobertura verificada y al menos cinco observaciones compatibles.

La tasa ponderada se contrae hacia la tasa válida de liga:

`p = (n_efectiva × p_ponderada + 8 × p_liga) / (n_efectiva + 8)`

La muestra efectiva parte de `1 / Σ(w² / n)` y se reduce cuando las submuestras apenas alcanzan sus mínimos. El intervalo se aproxima con Wilson al 90%. La salida ordinaria queda limitada entre 10% y 90%.

### Mínimos y bloqueos

- liga: 8 observaciones resueltas;
- últimos 5: 3 por equipo;
- últimos 10: 5 por equipo;
- rol local/visitante: 2 por equipo;
- árbitro para tarjetas: 5.

La probabilidad queda no disponible ante línea no interpretable, familia no soportada, muestra corta, cobertura incompatible, árbitro crítico ausente o contradicción severa. Se guardan estimación, intervalo, muestra efectiva, pesos, tasas observadas, eventos a favor/concedidos disponibles y limitaciones.

### Alcance por mercado

- Goles: totales observados de liga y equipos, forma y rol local/visitante.
- Remates: totales de remates con cobertura compatible y frecuencia respecto de la línea.
- Remates a puerta: totales observados y muestras por forma/rol.
- Tarjetas: tarjetas amarillas observadas y ajuste arbitral obligatorio.
- Córners: totales observados, forma y rol.

El contexto de alineaciones, ausencias y Gemini puede limitar la aptitud o la confianza, pero un texto manual no se convierte en una observación numérica deportiva.

## 5. Confianza separada

`analysis_confidence_score` conserva su fórmula de calidad, actualidad, muestra, cobertura, concordancia, contradicciones, contexto, cuotas y estabilidad. Su techo ordinario sigue siendo 92. La UI aclara que es calidad y coherencia de evidencia, no probabilidad de acierto ni probabilidad de ganar.

## 6. Decisión final e interfaz

DirectorAtlas produce una frase directa y una tarjeta principal fuera de los acordeones. El mapeo visible es:

- apto bajo condiciones: SÍ;
- viable con cautela: SÍ, PERO CON CAUTELA;
- solo revisión: TODAVÍA NO;
- no viable: NO;
- bloqueado: NO, ANÁLISIS BLOQUEADO;
- información insuficiente: TODAVÍA NO.

La tarjeta muestra partido, competición, hora local, mercado, selección, línea, cuota, bookmaker, frescura, probabilidad preliminar, incertidumbre, confianza, implícita, aptitud individual, parlay, evidencia, oposición, bloqueo, acción y siguiente revisión. Después de cada versión el encabezado recibe foco y se ejecuta scroll suave.

Los códigos internos se traducen en modo sencillo. El modo experto conserva muestras, fórmula, cobertura, cuotas, Gemini, cambios, telemetría y limitaciones. La navegación de tres modos quedó alineada en escritorio y apilada en móvil.

## 7. Cuotas y frescura

Las cuotas conservan `updated_at`, `consulted_at`, antigüedad, límite, fase, origen y motivo de vencimiento.

Límites documentados:

- proveedor, revisión temprana: 180 minutos;
- proveedor, un día antes: 60 minutos;
- proveedor, hasta tres horas: 30 minutos;
- proveedor, cerca del kickoff: 15 minutos;
- manual: máximo 30 minutos y 15 minutos cerca del kickoff.

Una cuota vencida conserva el candidato estadístico, pero bloquea la consideración y el parlay. El usuario puede informar casa, selección, línea, cuota y hora de consulta, y usar “Guardar cuota actual y reanalizar”. La nueva cuota queda `user_reported`, nunca verificada automáticamente.

## 8. Gemini manual

El parser ahora produce elementos visibles con resumen, categoría, fuente, dominio, fecha, procedencia, validación e impacto. Los rumores empiezan desmarcados, los datos no encontrados son limitaciones y las contradicciones se resaltan. Si no reconoce secciones, extrae párrafos como elementos sin verificar.

Solo los elementos seleccionados pasan al reanálisis. Pueden modificar concordancia, confianza, riesgos, faltantes y aptitud, sin modificar fixture, equipos, fecha, línea o cuota y sin aportar directamente una probabilidad. La comparación indica cuántos elementos se incorporaron y explica expresamente cuando no bastan para cambiar el dictamen.

## 9. Reanálisis temporal

Las seis fases se traducen a español. DirectorAtlas añade una regla de próxima revisión según distancia al kickoff. La diferencia entre versiones incluye valores anteriores y actuales de probabilidad, confianza, aptitud, veredicto, línea y cuota, además de Gemini, riesgos nuevos, riesgos resueltos y faltantes.

## 10. Aptitud individual y parlays

El formulario recoge el uso previsto —individual, parlay o ambos— sin alterar la evidencia. DirectorAtlas expone dos estados separados. Solo una selección apta, fresca, verificada y con probabilidad preliminar disponible puede ser candidato de parlay.

Cada candidato persiste fixture, familia, selección, línea, cuota, timestamp, confianza, estimación, intervalo y riesgos. El constructor de Historial no fabrica picks, exige seis candidatos para tres combinaciones y conserva controles de fixture, línea crítica, correlación y diversificación.

## 11. Resultados y calibración

El historial append-only admite eventos `prediction_result_recorded`. El usuario puede registrar el total real manualmente o solicitar actualización con API-FOOTBALL cuando el fixture y sus estadísticas estén disponibles.

Se conserva hit, miss, void o unresolved junto con la predicción original. La calibración calcula casos resueltos, hit rate, Brier, bandas, familia, competición y fase. No recalibra pesos automáticamente. El umbral de 200 casos resueltos solo habilita una revisión manual; el contrato sigue marcado `preliminary_unvalidated`.

## 12. QA visual

Se inició Atlas localmente y se revisó con el navegador integrado:

- escritorio 1280 px: tres modos alineados, sin overflow;
- móvil 390 × 844 px: navegación y columnas apiladas, sin overflow;
- selector de fecha dentro del ancho disponible;
- cero errores o advertencias de consola al cargar.

No se llamó al proveedor durante esta revisión visual. Por ese motivo, la tarjeta de Director con un expediente deportivo real debe repetirse manualmente cuando exista un fixture con cobertura suficiente; su estructura, foco, scroll, estados y responsive quedan cubiertos por pruebas automatizadas y CSS.

## 13. Pruebas

Se añadió `finalAcceptance.test.js` con 45 casos numerados:

- fecha/zona/caché;
- cinco modelos y sus bloqueos;
- shrinkage e incertidumbre;
- separación de probabilidad, confianza e implícita;
- frescura y cuota manual;
- Gemini y diferencias;
- tarjeta final, foco y traducciones;
- individual/parlay;
- resultados y calibración;
- fixture inmutable y voz pública.

Resultado final: 178 pruebas aprobadas, 0 fallidas, 0 omitidas.

## 14. Archivos

35 archivos de implementación y pruebas cambiaron antes de este informe: 1.416 inserciones y 127 eliminaciones. Los archivos nuevos principales son:

- `src/core/intelligence/dateTimeContext.js`;
- `src/core/intelligence/preliminaryMarketModel.js`;
- `src/core/intelligence/resultCalibration.js`;
- `src/core/testing/finalAcceptance.test.js`;
- `ATLAS_FINAL_ACCEPTANCE_CHECKLIST.md`;
- `ATLAS_FINAL_ACCEPTANCE_FIX_REPORT.md`.

No se borraron módulos ni funcionalidades aprobadas.

## 15. Comandos y resultados

```text
git branch --show-current       -> rescue/atlas-core-v0.2
npm run lint                    -> PASS
npm test                        -> PASS, 178/178
npm run build                   -> PASS, 15 rutas, sin Google Fonts
npm audit --omit=dev            -> PASS, 0 vulnerabilidades
git diff --check                -> PASS
```

La comprobación final de estado se registra al cerrar, después del commit documental.

## 16. Riesgos y limitaciones pendientes

- El modelo es preliminar y no ha sido calibrado con un historial real suficiente.
- Los pesos documentados son una primera política conservadora; no deben llamarse validados.
- Tarjetas usa tarjetas amarillas como unidad compatible; no modela equivalencias especiales para rojas.
- Las muestras de últimos 5 están contenidas en últimos 10; se ponderan por recencia y se declara esta dependencia.
- El intervalo Wilson sobre muestra efectiva es una aproximación y no un modelo generativo completo.
- La entrada manual de Gemini no verifica la verdad de la fuente; sigue siendo reportada por el usuario.
- El historial local no coordina múltiples instancias y sigue siendo inadecuado para un despliegue público.
- Actualizar un resultado desde el proveedor requiere que fixture, fecha, temporada y estadísticas finales sigan disponibles.
- La prueba visual completa con un dictamen real depende de cobertura deportiva real; no se inventaron datos para completarla.
- No se integró autenticación, Supabase o Vercel, conforme al alcance.

## 17. Commits

Commits de implementación:

1. `b43daad` — `fix: aplicar fecha local y timezone operativo`
2. `882cb00` — `feat: añadir probabilidad preliminar auditable`
3. `8ca1e7c` — `feat: registrar resultados y calibracion preliminar`
4. `b567f81` — `feat: destacar dictamen final y reanalisis`
5. `ea414a4` — `test: cubrir criterios finales de aceptacion`

El checklist y este informe se conservan en un commit documental separado. No se hizo merge a `main`.

