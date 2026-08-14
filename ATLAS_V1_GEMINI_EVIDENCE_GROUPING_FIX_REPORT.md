# ATLAS V1 — Informe del parche de agrupación de evidencia Gemini

Fecha: 2026-08-14

Rama: `rescue/atlas-core-v0.2`

Commit de implementación y pruebas: `73ae3a0`

## Resultado

El parser de contexto Gemini manual ahora conserva cada bloque `HECHO + IMPACTO + FUENTE + URL + FECHA` como un único elemento deportivo. El parche no modifica Scout, Director, confidence, probabilidades, cuotas, `evaluateMarketPrice`, rankings, historial, servicios ni infraestructura.

## Causa raíz

`parseGeminiResponse` recorría la respuesta línea por línea. Después de detectar una sección, limpiaba el marcador de lista y llamaba a `buildItem` por cada línea no vacía. En consecuencia, `HECHO`, `IMPACTO`, `FUENTE`, `URL` y `FECHA` se convertían en cinco tarjetas sin relación semántica.

El hecho llegaba a la validación sin URL ni fecha, mientras que la URL y la fecha aparecían después como elementos independientes. Por eso la evidencia real se mostraba como no informada y no podía atravesar correctamente el filtro.

El mismo flujo interpretaba `NINGUNO` como contenido de las secciones de rumores y contradicciones. Además, el fallback para respuestas sin elementos podía volver a crear un elemento probable incluso cuando la respuesta sí contenía secciones válidas vacías.

## Parser corregido

Se corrigió el parser existente; no se creó un parser paralelo.

- `HECHO:` abre un elemento dentro de la sección activa.
- Otro `HECHO:`, un cambio de sección o el final del documento cierra el elemento anterior.
- `IMPACTO:`, `FUENTE:`, `URL:` y `FECHA:` se adjuntan al hecho abierto.
- Las líneas de continuación se agregan al último campo activo, permitiendo impactos de varias líneas.
- Se toleran líneas en blanco, espacios, mayúsculas/minúsculas razonables y URLs largas.
- El formato histórico de una evidencia por línea o bullet continúa funcionando.
- Las propiedades huérfanas no generan tarjetas independientes.

El contrato anterior se conserva y se amplía de forma compatible con propiedades explícitas:

- `fact`
- `impact_text`
- `source_name`
- `source_url`
- `publication_date`

Los campos históricos `summary`, `text`, `source`, `urls`, `domain`, `publication_dates`, clasificación, estados de validación, mercados afectados y selección continúan presentes.

La UI solo cambia la representación derivada de la fuente: cuando existe `source_name`, muestra el nombre —por ejemplo, `Terra`— y conserva dominio y fecha en la misma tarjeta. Las respuestas antiguas siguen usando `source` como fallback.

## Impacto

`IMPACTO:` ya no genera un elemento propio. El texto se conserva en `impact_text` y alimenta la inferencia existente.

- `fortalece` se interpreta como favorable.
- `debilita` o `invalida` se interpreta como desfavorable.
- `sin cambio` se interpreta como neutral.
- Una combinación como `fortalece / debilita` se conserva como neutral/ambigua; no se fuerza una dirección arbitraria.

No se añadieron scores, pesos, coeficientes o fórmulas.

## NINGUNO y limitaciones

`NINGUNO`, sus variantes normalizadas básicas y una sección vacía producen cero elementos. En particular:

- `RUMORES / NINGUNO` produce 0 rumores.
- `CONTRADICCIONES / NINGUNO` produce 0 contradicciones.

Los bullets de `DATOS NO ENCONTRADOS` continúan creando limitaciones individuales. No requieren URL, no son seleccionables y no se convierten en evidencia favorable o desfavorable.

## Validación de fuentes

La agrupación ocurre antes de ejecutar `buildItem`; después se aplican sin relajación las reglas existentes de URL, dominio, clasificación, fecha, vigencia, relevancia, mercado, rumor, contradicción y selección.

La presencia de una URL no produce selección automática. Terra y Bnews no fueron hardcodeados ni promovidos a fuentes reconocidas. En el fixture real quedan clasificadas según la política general actual y sus hechos permanecen disponibles para revisión y selección manual porque ahora sí contienen conjuntamente hecho, impacto, URL y fecha.

También se añadió cobertura de una fuente oficial reconocida: un bloque estructurado de Dimayor, vigente y relevante para el mercado, conserva la selección automática existente y produce impactos mediante el pipeline actual.

## Resultado del fixture real

Para `Sport Recife vs Londrina`, fixture `1520819`, selección `Under 2.5`, la respuesta que antes producía 26 elementos fragmentados ahora produce:

- 3 hechos `confirmed`.
- 1 hecho `probable`.
- 0 rumores.
- 0 contradicciones.
- 4 limitaciones `not_found`.
- 8 elementos totales.
- 2 URLs únicas detectadas.
- Dominios `terra.com.br` y `bnews.com.br` asociados a sus hechos correspondientes.

Los nombres de fuente y la fecha escrita `14 de agosto de 2026` quedan en el mismo elemento que el hecho. Los tres usos de la URL de Bnews permanecen asociados a hechos separados y no se mezclan. El hecho probable puede seleccionarse manualmente y llega al contexto aplicado con impacto desfavorable; los rumores y limitaciones continúan sin poder influir.

El contador automático del fixture conserva la política de confianza existente: ninguna fuente desconocida se selecciona solo por tener URL. Esto es intencional y evita debilitar la validación.

## Pruebas

Se añadió un único archivo con 30 regresiones deterministas que cubren todas las fronteras solicitadas, incluida la respuesta real completa:

- Agrupación y cierre de elementos.
- Asociación de URL, fuente, fecha e impacto.
- Ausencia de tarjetas independientes para propiedades.
- `NINGUNO` en rumores y contradicciones.
- Limitaciones por bullet.
- Conservación de `confirmed`, `probable`, rumor y contradicción.
- Rechazo sin URL y no aceptación automática por URL.
- URLs repetidas sin mezcla de hechos.
- Líneas en blanco y URL larga.
- Fixture real reducido de 26 fragmentos a 8 elementos legítimos.
- Evidencia válida que atraviesa el pipeline y evidencia rechazada sin influencia.
- Gemini antes de Director, Scout ciego al precio y cuota posterior al análisis completo.

Resultados:

- Pruebas anteriores: **468/468**.
- Pruebas nuevas: **30/30**.
- Total final: **498/498**.
- `git diff --check`: correcto.
- `npm run lint`: correcto.
- `npm run build`: correcto con Next.js 16.2.12; compilación y generación de 15 páginas completadas.
- Sin llamadas deportivas externas.
- Sin Gemini API.

## Archivos modificados

- `src/core/intelligence/geminiManualContext.js`: agrupación estructurada, fechas escritas y mapeo seguro del impacto declarado.
- `src/app/atlas-functional-client.js`: muestra `source_name` cuando está disponible.
- `src/core/testing/geminiEvidenceGroupingFix.test.js`: 30 regresiones, incluido el fixture real.
- `ATLAS_V1_GEMINI_EVIDENCE_GROUPING_FIX_REPORT.md`: este informe.

## Commits

1. `73ae3a0` — `fix: group manual Gemini evidence fields`
2. Informe final — commit documental posterior a este archivo.

No se hizo merge. No se iniciaron ni modificaron Supabase o Vercel, no se tocó `.env.local` y no se añadieron dependencias, servicios o llamadas externas.
