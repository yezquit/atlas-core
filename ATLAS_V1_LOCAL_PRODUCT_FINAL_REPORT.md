# ATLAS V1 — Informe final local de producto

Fecha de cierre: 2026-08-13

Rama: `rescue/atlas-core-v0.2`

Commit de implementación y pruebas: `96c95ca`

## Resultado

Atlas local quedó preparado para una única aceptación funcional real con un flujo sencillo centrado en decisiones comprensibles:

1. Jornada y competiciones.
2. Opciones encontradas por Scout.
3. Elección de una opción.
4. Análisis inicial sin recomendación definitiva.
5. Investigación manual en Gemini y validación de la respuesta.
6. Análisis completo y decisión deportiva `SÍ`, `NO` o `ESPERAR`.
7. Introducción de una cuota actual.
8. Decisión de precio `APOSTAR`, `NO APOSTAR` o `ESPERAR` cuando la cuota esté vencida.

No se hizo merge, no se inició Supabase ni Vercel, no se modificó `.env.local`, no se añadió ningún servicio o dependencia y no se usó una API de Gemini.

## Flujo sencillo

Scout conserva su función de preselección y sigue ciego al precio. La vista sencilla presenta inicialmente hasta tres tarjetas: la mejor opción inicial y dos alternativas. Cada tarjeta se limita al partido, mercado, línea, un motivo breve y el botón `Analizar esta opción`. Las restantes quedan bajo `Otras opciones encontradas` y el detalle matemático se mantiene plegado.

Al elegir una opción, el usuario ve `Análisis inicial` y `Completar análisis`. Todavía no se muestra una decisión final del Director ni se evalúa una cuota. Atlas genera un prompt específico para el partido, la selección, la línea y el contexto competitivo. El usuario lo consulta externamente en Gemini Pro, pega la respuesta y decide qué evidencia elegible incorporar.

Después de validar la respuesta, Atlas ejecuta el reanálisis y presenta `Análisis completo` en este orden:

1. Partido y contexto verificado.
2. Selección analizada.
3. Resultado de Atlas.
4. `Confianza Atlas: XX/100`.
5. Hasta tres razones.
6. Hasta dos riesgos.
7. Evidencia Gemini relevante.
8. Cuota.
9. Decisión final.
10. `Ver análisis completo`.

## Gemini antes del Director

La evidencia Gemini validada entra antes de construir Red Team, preflight y Director. El flujo reutiliza los contratos y mecanismos existentes; no añade coeficientes ni una metodología probabilística nueva.

La evidencia aceptada puede cambiar la selección operativa, los argumentos, los riesgos, las contradicciones y la confianza informativa. Una contradicción material aceptada puede producir `NO`; la falta concreta de una alineación crítica, parte médico o dato imprescindible puede producir `ESPERAR`. La incertidumbre normal no produce `ESPERAR`.

Los rumores, páginas genéricas, opiniones predictivas, elementos sin URL y datos no encontrados quedan inhabilitados para selección. Las contradicciones verificables requieren selección manual consciente. Una respuesta válida cuyos elementos fueron todos rechazados también puede completar el flujo, dejando trazado que no influyó evidencia externa.

El prompt pregunta expresamente si existe algo verificable que fortalezca, debilite o invalide la selección. Solicita solo cuando sea pertinente alineaciones, bajas, sanciones, rotaciones, arqueros, jugadores relevantes para el mercado, declaraciones, calendario, descanso, partido previo y siguiente, importancia competitiva, fase, ida/vuelta, agregado, necesidad de remontar o proteger, localía, clima, árbitro y noticias recientes.

## Decisión deportiva y decisión de precio

La tesis deportiva queda separada de la cuota:

- `🟢 SÍ, ME GUSTA ESTA OPCIÓN`: la evidencia completa sostiene el mercado.
- `🔴 NO ME GUSTA ESTA OPCIÓN`: la evidencia no lo sostiene o existe una contradicción material.
- `🟡 ESPERAR`: solo existe un bloqueante concreto con una acción clara.

Después entra la cuota del usuario. Atlas conserva `evaluateMarketPrice`, sus umbrales, la probabilidad implícita y los estados económicos internos. La voz sencilla traduce un estado positivo autorizado, incluido `marginal` o `caution`, a `🟢 APOSTAR`; un precio rechazado continúa como `🔴 NO APOSTAR`.

Por tanto, Atlas puede decir que le gusta una opción y después indicar `NO APOSTAR` porque la cuota exige demasiado. La cuota no cambia por sí sola la confianza del análisis deportivo.

Una cuota histórica vencida no se borra ni se evalúa como actual. Se muestra `Cuota vencida — actualízala para tomar una decisión.` y el botón `Actualizar cuota`. Una opción nunca cotizada sigue distinguiéndose de una cuota vencida.

## Lenguaje sencillo y modo experto

`Sí, pero con cautela` dejó de ser una conclusión del modo sencillo. También se retiraron de su superficie principal los estados económicos internos y conceptos como respaldo deportivo, decisión operativa, scores, intervalos, muestras ponderadas, preflight, line origin, probabilidad implícita, ledger y contratos.

Toda esa información permanece disponible en `Ver análisis completo`. El modo experto conserva Scout completo, probabilidades, intervalos, rankings deportivo y operativo, Red Team, preflight, evidencia Gemini, odds, historial, comparación de versiones, opción manual y trazabilidad. El modo sencillo y el experto consumen la misma decisión subyacente; no mantienen motores de decisión separados.

## Elementos preservados

- Metodología Scout, generación de candidatos y líneas, filtros y ranking deportivo.
- Scout ciego al precio.
- Probabilidad preliminar y cálculos existentes.
- Evaluación económica y sus umbrales.
- TTL y ledger append-only de cotizaciones.
- Historial y `analysisVersion`.
- Comparación antes/después.
- Opción manual y alternativas.
- Limpieza segura de una nueva investigación sin borrar historial.
- Flujo Gemini completamente manual y externo.

## Validación

- Pruebas previas conservadas: **432/432**.
- Regresiones nuevas: **36/36**.
- Total final: **468/468**.
- `git diff --check`: correcto.
- `npm run lint`: correcto, sin errores.
- `npm run build`: correcto con Next.js 16.2.12; 15 páginas generadas y rutas dinámicas compiladas.
- No hubo llamadas deportivas externas durante las pruebas.
- No existe integración con Gemini API.
- No se cambiaron Supabase, Vercel, dependencias ni configuración de entorno.

Las 36 regresiones cubren el contrato solicitado: Scout sin precio, preselección visual, Gemini antes de Director, filtro e influencia de evidencia, `NO` por contradicción, `ESPERAR` por bloqueante concreto, probabilidad intacta, precio posterior, confianza independiente de cuota, voz sencilla, estados internos de precio, cotización vencida, experto, opción manual, historial/versiones, nueva investigación, responsive, consola y ausencia de cambios de infraestructura.

## Revisión visual

Se abrió la aplicación local sin ejecutar un escaneo deportivo:

- Escritorio `1440 × 900`: composición correcta, ancho de documento igual al viewport, sin overflow horizontal y sin avisos o errores de consola.
- Móvil `390 × 844`: navegación y controles en una columna, botones dentro de `35–355 px`, ancho de documento de `390 px`, sin overflow horizontal y sin avisos o errores de consola.

Los estados posteriores a una respuesta deportiva real quedaron cubiertos por regresiones de estructura, orden, texto y CSS; no se simuló una consulta deportiva externa para fabricar una aceptación visual.

## Commits

1. `96c95ca` — `fix: complete simple analysis before price`
2. Informe final — commit documental posterior a este archivo.

No se hizo merge.

## Limitaciones reales y siguiente acción

La precisión deportiva, la disponibilidad de fixtures y la actualidad de las fuentes siguen dependiendo de los proveedores y de la evidencia que el usuario aporte. `Confianza Atlas` mide la solidez del análisis disponible; no garantiza un resultado. Atlas no convierte noticias en variaciones probabilísticas arbitrarias.

Queda pendiente únicamente la aceptación manual real solicitada: ejecutar una jornada, elegir una opción, completar Gemini, revisar `SÍ/NO/ESPERAR`, introducir una cuota, comprobar `APOSTAR/NO APOSTAR` y abrir `Ver análisis completo` para verificar la trazabilidad. Este cierre no inicia una fase posterior.
