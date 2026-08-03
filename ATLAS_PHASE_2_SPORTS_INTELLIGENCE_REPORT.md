# ATLAS — Informe de Fase 2: Sports Intelligence y Explorador de Jornada

Fecha de cierre: 2026-08-02  
Repositorio: `/Users/yezidquitian/Documents/atlas-core`  
Rama: `rescue/atlas-core-v0.2`  
Fase base: `a5403d8` (`atlas-api-pro-live-confirmed`)  
Principio conservado: **Comprender antes de decidir**

## 1. Resumen ejecutivo

La Fase 2 quedó implementada sobre la base existente, sin reconstruir el proyecto ni integrar Supabase, Vercel, autenticación, scraping u otro proveedor. Atlas dispone ahora de dos flujos públicos: **Explorar jornada** y **Analizar partido**. El resultado ofrece una vista sencilla centrada exclusivamente en DirectorAtlas y una vista experta con la trazabilidad técnica agrupada en acordeones accesibles.

Se añadieron perfiles de liga, forma reciente de equipos, contexto arbitral, sede/clima condicional y evaluación de cinco familias de mercado. `technical_support_score` representa completitud y calidad de evidencia, nunca probabilidad. `estimated_probability` permanece `null`, `probability_status` permanece `unavailable`, `can_recommend` es `false` y el parlay permanece `unsupported`.

El proveedor queda detrás de rutas de servidor, con presupuesto máximo, timeout, un reintento transitorio, límite de concurrencia, deduplicación, caché versionada y telemetría saneada. La API key no forma parte de contratos, respuestas, caché ni cliente.

La verificación real confirmó los 17 IDs del catálogo y la temporada 2026. Sobre Colombia Primera A, fecha 2026-08-02, se encontraron tres fixtures y se analizaron dos. Las dos ejecuciones controladas de cierre sumaron **129 solicitudes contabilizadas**, por debajo del límite combinado de 150; ninguna ejecución individual superó 150.

Estado final de calidad:

- lint: pasa;
- pruebas: 81/81 pasan;
- build: pasa con Next.js 16.2.12 y sin Google Fonts;
- audit de producción: 0 vulnerabilidades;
- `git diff --check`: pasa;
- rama correcta y sin merge a `main`.

## 2. Catálogo e IDs verificados

Los metadatos se consultaron mediante `/leagues?id=<id>` y se exigió una coincidencia exacta. Todos los IDs configurados coincidieron con el ID y nombre devueltos por API-FOOTBALL. La verificación de metadatos no escaneó fixtures de las 17 competiciones.

| Región | Competición Atlas | ID | Nombre del proveedor | Estado |
|---|---|---:|---|---|
| Sudamérica | Colombia Primera A | 239 | Primera A | verified |
| Sudamérica | Colombia Primera B | 240 | Primera B | verified |
| Sudamérica | Brasil Serie A | 71 | Serie A | verified |
| Sudamérica | Brasil Serie B | 72 | Serie B | verified |
| Sudamérica | Argentina Primera División | 128 | Liga Profesional Argentina | verified |
| Sudamérica | Argentina Primera Nacional | 129 | Primera Nacional | verified |
| Sudamérica | Copa Libertadores | 13 | CONMEBOL Libertadores | verified |
| Sudamérica | Copa Sudamericana | 11 | CONMEBOL Sudamericana | verified |
| México | Liga MX | 262 | Liga MX | verified |
| México | Liga de Expansión MX | 263 | Liga de Expansión MX | verified |
| Europa | Premier League | 39 | Premier League | verified |
| Europa | LaLiga | 140 | La Liga | verified |
| Europa | Bundesliga | 78 | Bundesliga | verified |
| Europa | Ligue 1 | 61 | Ligue 1 | verified |
| Europa | Serie A de Italia | 135 | Serie A | verified |
| Europa | UEFA Champions League | 2 | UEFA Champions League | verified |
| Europa | UEFA Europa League | 3 | UEFA Europa League | verified |

La procedencia queda registrada como `api-football:/leagues?id` y la fecha de verificación como `2026-08-02`. Un ID verificado no implica que todos los endpoints tengan cobertura; esa decisión se hace por temporada y mercado.

## 3. Temporadas y coverage

Todos los registros consultados incluyeron 2026. Rangos observados de temporadas disponibles:

| Competición | Temporadas observadas | Estadísticas de fixture 2026 | Lineups 2026 | Odds 2026 |
|---|---|---|---|---|
| Colombia Primera A | 2016–2026 | sí | sí | sí |
| Colombia Primera B | 2016–2026 | no | sí | sí |
| Brasil Serie A | 2010–2026 | sí | sí | sí |
| Brasil Serie B | 2012–2026 | sí | sí | sí |
| Argentina Primera División | 2015–2026 | sí | sí | sí |
| Argentina Primera Nacional | 2011–2026 | no | sí | sí |
| Copa Libertadores | 2019–2026 | sí | sí | no |
| Copa Sudamericana | 2019–2026 | sí | sí | sí |
| Liga MX | 2016–2026 | sí | sí | sí |
| Liga de Expansión MX | 2016–2026 | no | sí | sí |
| Premier League | 2010–2026 | no | no | no |
| LaLiga | 2010–2026 | no | no | no |
| Bundesliga | 2010–2026 | no | no | no |
| Ligue 1 | 2010–2026 | no | no | no |
| Serie A de Italia | 2010–2026 | no | no | no |
| UEFA Champions League | 2011–2026 | sí | sí | sí |
| UEFA Europa League | 2014–2026 | sí | sí | sí |

Notas de coverage relevantes:

- Colombia Primera A 2026 reportó fixtures, eventos, alineaciones, estadísticas de fixture/jugador, standings, jugadores, rankings, predictions y odds; injuries fue `false`.
- Colombia Primera B, Argentina Primera Nacional y Liga de Expansión MX reportaron estadísticas de fixture `false`.
- Las cinco grandes ligas europeas reportaron estadísticas de fixture, eventos, lineups y odds en `false` para la temporada 2026 consultada. Atlas no las convierte en afirmaciones permanentes: el objeto se vuelve a validar por temporada y se conserva en caché.
- Libertadores reportó odds `false`; Champions reportó standings `false`; Europa League reportó statistics_players y standings `false`.
- El objeto `coverage` completo se conserva en `competitionMetadata.seasonMetadata.coverage` y en la entrada versionada de caché; la tabla anterior es solo un resumen humano.

## 4. Arquitectura implementada

La separación final de Fase 2 es:

1. **Proveedor**: `providerRuntime.js` controla host, cuota, timeout, reintentos, concurrencia, deduplicación, errores y telemetría; `sportsDataGateway.js` traduce endpoints a resultados normalizados.
2. **Validación y contratos**: `atlasContracts.js`, `sportsIntelligenceContracts.js` y validadores de entrada mantienen estados internos estables sin emojis.
3. **Caché/persistencia**: `cacheStore.js` y `persistentCacheServer.js` aíslan infraestructura de dominio, versionan el schema y soportan tags.
4. **League Intelligence**: `leagueIntelligence.js` calcula perfiles por competición, temporada, ventana y muestra.
5. **Match Intelligence**: `teamRecentIntelligence.js` y el orquestador construyen forma general/local/visitante sin mezclar temporadas.
6. **Referee Intelligence**: `refereeIntelligence.js` usa coincidencia normalizada y fixtures históricos verificables.
7. **Weather/Venue Context**: `venueWeatherContext.js` conserva sede disponible y un contrato climático explícitamente no configurado.
8. **Market Engine**: `marketEngine.js` evalúa cinco mercados por requisitos, soporte y riesgo.
9. **DirectorAtlas**: recibe resultados procesados y emite el único dictamen público; no recalcula métricas.
10. **UI**: `page.js` conserva composición de servidor y `atlas-functional-client.js` maneja interacción, invalidación y accesibilidad.

## 5. League Intelligence

El perfil incluye `competition_id`, temporada, ventana, tamaño, fecha de generación, fuente, coverage, métricas, métricas no disponibles, calidad, etiquetas, warnings, referencias y versión de umbrales.

Las métricas implementadas abarcan resultados, goles, over/under, ambos marcan, localía, empates, tarjetas, faltas, córners, remates, remates a puerta, posesión, volatilidad y marcadores cerrados. Cada métrica conserva `value`, `sample_size`, `coverage_status`, `source_refs` y `warning`.

Los umbrales están documentados en `LEAGUE_PROFILE_THRESHOLDS` versión `league-v1`. El mínimo actual es ocho partidos. Una muestra menor solo produce `insufficient_sample`; no redacta etiquetas deportivas.

La ventana de servicio es de 120 días y el perfil toma como máximo los 10 fixtures finalizados más recientes de la misma liga y temporada. Es una decisión de control de cuota, no una afirmación sobre suficiencia universal.

## 6. Team Recent Intelligence

Para cada equipo se consultan hasta los últimos 10 partidos de la temporada exacta y se eliminan partidos futuros respecto al kickoff objetivo. Se producen:

- últimos 5 y últimos 10;
- forma general;
- separación como local y visitante;
- resultados, goles, over/under y ambos marcan;
- estadísticas detalladas cuando existen;
- descanso promedio y racha;
- periodo, muestra, IDs de fixtures, calidad, fuentes y advertencias.

Si hay resultados básicos pero no estadísticas detalladas, los resultados se conservan y la cobertura detallada queda limitada. No existe mezcla silenciosa de temporadas.

## 7. Referee Intelligence

El árbitro del fixture se normaliza y se busca por nombre exacto normalizado dentro del histórico de la liga. El fixture actual no se usa como historial. La búsqueda puede considerar hasta 10 coincidencias históricas dentro de la ventana, manteniendo los contratos `last_5`, `last_10` y `last_20`; el presupuesto impide descargar históricos indiscriminados.

La comparación con la liga solo se habilita si ambas muestras son compatibles y verificadas. Tarjetas requiere árbitro confirmado y muestra suficiente; en caso contrario el mercado queda limitado.

La verificación final encontró dos partidos verificables para J. Ospina, insuficientes frente al mínimo de cinco, por lo que tarjetas no fue candidato. Para Jose Bautista no encontró muestra histórica verificable y mantuvo `unavailable`.

## 8. Weather/Venue Context

La sede y ciudad procedentes del fixture se conservan con referencias. No se añadió una API meteorológica, no se infiere clima por ciudad y no se inventan altitud o superficie.

Sin fuente conectada, `weather_status` es `unavailable`, lo cual no bloquea mercados de forma universal. El contrato ya distingue forecast, observed, stale y unavailable, y contempla lluvia intensa, viento fuerte, temperatura extrema, altitud y superficie comprometida como riesgos condicionales. Se dejó un adaptador futuro que retorna `unavailable` hasta ser configurado de forma explícita.

## 9. Market Engine

Se evalúan:

- goles;
- remates totales;
- remates a puerta;
- tarjetas;
- córners.

Cada evaluación incluye requisitos, evidencia disponible/faltante, contexto de liga/equipos/árbitro/sede, muestra, calidad, riesgos, explicación y próxima acción. `technical_support_score` es un porcentaje de requisitos cubiertos con ajuste de riesgo; no es una probabilidad y no se usa como cuota justa.

Un mercado solo es candidato cuando no falta ningún requisito y alcanza el soporte mínimo. La salida mantiene `actionable: false`, `estimatedProbability: null` y `probabilityStatus: unavailable`. El selector abierto ordena por condición de candidato, soporte, muestra y nombre estable; el explorador limita además la cantidad de riesgos. No se ordena por probabilidad.

## 10. Explorar jornada

La vista permite elegir una fecha, una o varias competiciones, uno o varios mercados y un máximo entre 1 y 10 fixtures. Solo consulta las competiciones elegidas. El servicio:

1. verifica metadatos, temporada y fixtures por fecha;
2. analiza como máximo el límite solicitado;
3. reutiliza caché y un presupuesto compartido;
4. descarta evaluaciones sin condición de candidato;
5. ordena por soporte técnico, muestra y menor riesgo entre candidatos de calidad verificada;
6. devuelve máximo cinco candidatos.

El resumen muestra competiciones, encontrados, revisados, descartados, analizables, candidatos, requests, cache hits, tiempo y advertencias. Cada tarjeta de candidato conserva el fixture ID como dato secundario y permite transferir esa identidad exacta a **Analizar partido**; no ejecuta el análisis profundo automáticamente.

## 11. Analizar partido

El flujo exige fecha, competición, temporada y una selección explícita por radio de fixture ID. Un resultado con ID diferente se bloquea en servidor y se rechaza de nuevo en cliente.

El usuario puede solicitar todos los mercados compatibles o uno específico, e ingresar línea y cuota opcionales. Todo cambio de fecha, competición, temporada, fixture, mercado, línea o cuota invalida el análisis anterior. El servicio construye perfiles y DirectorAtlas únicamente al pulsar **Analizar partido**.

## 12. Modo sencillo

El modo sencillo abre por defecto un único acordeón de **Dictamen del Director Atlas**. Muestra solamente partido/competición, mercado, estado traducido, respaldo técnico, probabilidad no disponible, nivel operativo, razones, riesgos, faltantes, qué evitar, siguiente acción y parlay no soportado.

No se importa ni representa `atlasExecutiveAnswer`, `decisionEngine` u otra conclusión pública paralela.

## 13. Modo experto

Todos los acordeones expertos inician cerrados y agrupan:

- identidad del fixture;
- calidad, temporadas, coverage y referencias;
- perfil de liga;
- forma del local;
- forma del visitante;
- árbitro;
- sede y ambiente;
- cinco evaluaciones de mercado;
- requests, caché, deduplicación, reintentos y cuota conocida;
- reglas críticas y limitaciones.

Se usan botones reales, `aria-expanded`, `aria-controls`, regiones etiquetadas y estado React. No hay manipulación imperativa del DOM. La revisión visual confirmó diseño de escritorio y un viewport móvil de 390 px sin desbordamiento horizontal.

## 14. Consumo de requests

Presupuestos por defecto:

| Operación | Presupuesto |
|---|---:|
| Análisis individual | 45 |
| Escaneo de jornada | 90 |
| Perfil | 30 |
| Verificador controlado | límite duro 150 |

Todos son configurables por entorno, pero nunca superan 150 por ejecución. El runtime expone únicamente contadores y headers numéricos seguros.

Verificación real:

| Ejecución | Alcance | Requests usadas | Cache hits | Restante interno | Cuota diaria restante observada |
|---|---|---:|---:|---:|---:|
| 1 | 17 metadatos + Colombia A 2026 + 2 fixtures | 73 | 45 | 77 | 7434 |
| 2 | Código final, Colombia A 2026 + 2 fixtures | 56 | 44 | 94 | 7383 |
| Total de cierre | misma fecha, máximo 2 fixtures por ejecución | **129** | **89** | — | — |

No hubo reintentos ni bloqueos por presupuesto. El header confirmó límite diario 7500. La diferencia entre requests contabilizadas y variación del header puede incluir respuestas no debitadas por el proveedor; Atlas conserva su contador interno más conservador.

## 15. Caché

Existe caché en memoria para pruebas/verificador y caché persistente de desarrollo del lado servidor bajo `.atlas-cache/v1`, excluida de Git. Cada entrada guarda:

- `schemaVersion`;
- clave estable por ruta y parámetros;
- valor saneado;
- `fetchedAt` y `expiresAt`;
- fuente;
- external IDs;
- tags.

Los tags permiten invalidar por competición, temporada, equipo y fixture; el contrato admite árbitro cuando exista una consulta cacheable dedicada. La escritura es atómica y usa permisos de archivo restrictivos.

Las pruebas prueban que una respuesta exitosa repetida no genera red y que solicitudes concurrentes idénticas se deduplican. En vivo, repetir un análisis completo produjo 32 hits pero también cinco nuevas consultas, porque respuestas no exitosas no se almacenan. Se conserva esta conducta prudente para no fijar fallos transitorios; una futura política de caché negativa corta debe distinguir fallos estables de errores recuperables.

Para Supabase, la migración futura deberá convertir el adaptador de persistencia sin mover secretos ni lógica deportiva al cliente y conservar schema version, expiración, procedencia, external IDs y tags.

## 16. Pruebas

Resultado final: **81 pruebas, 81 aprobadas**.

La cobertura incluye los 40 casos mínimos solicitados y casos adicionales de contratos, selección ambigua, gates, sanitización, presupuesto exacto, catálogo y UI. Familias principales:

- perfiles de liga suficientes/insuficientes y métricas unavailable;
- últimos 5/10, local/visitante, futuro y temporada;
- caché, deduplicación, presupuesto, concurrencia y cuota;
- cinco mercados, faltantes, clima y arbitraje;
- escáner vacío/con candidatos/máximo cinco/budget stop;
- fixture ID inmutable;
- DirectorAtlas sin probabilidad y parlay unsupported;
- UI sencilla/experta, agrupación, acordeones e invalidación;
- clave y datos de cuenta ausentes de respuestas.

Todas las pruebas son offline y usan proveedor inyectado. `atlasTrialCases.js` sigue ejecutándose dentro de `npm test`.

## 17. Verificación real

Comando reproducible:

```bash
npm run verify:phase2 -- --date=2026-08-02 --max-fixtures=2 --verify-catalog
```

El script impone internamente un máximo de dos fixtures y 150 requests, independientemente de argumentos mayores. Carga `.env.local` o variables exportadas, usa caché de memoria y nunca imprime la API key, datos de cuenta ni errores crudos.

Resultado final sobre Colombia Primera A 2026, fecha 2026-08-02:

- tres fixtures exactos encontrados;
- fixtures analizados: `1549701` Junior vs Millonarios y `1549700` Jaguares vs Atletico Nacional;
- perfil de liga: 10 partidos, calidad partial, sin métricas marcadas unavailable;
- Junior: 7 partidos; Millonarios: 9; Jaguares: 9;
- J. Ospina: 2 partidos históricos, muestra insuficiente; tarjetas limitado;
- Jose Bautista: 0 partidos históricos verificables; tarjetas limitado;
- clima: unavailable, sin datos inventados;
- DirectorAtlas mantuvo probabilidad unavailable y parlay unsupported.

La respuesta de Atlético Nacional fue inconsistente entre las dos ejecuciones: la primera devolvió nueve partidos y la segunda no entregó muestra utilizable. Atlas no reutilizó ni fabricó el dato; en la ejecución final mostró la ausencia, redujo soporte a 68 y emitió **Analizable, pero aún no accionable**. Esto queda como riesgo real del proveedor a investigar con telemetría saneada por código de fallo.

## 18. Archivos modificados

Cambios respecto de `a5403d8`:

- configuración: `.env.example`, `.gitignore`, `package.json`, `package-lock.json`;
- informe: `ATLAS_PHASE_2_SPORTS_INTELLIGENCE_REPORT.md`;
- verificador: `scripts/verify-phase-2.mjs`;
- rutas: `journey-scan/route.js`, `match-intelligence/route.js`;
- UI: `page.js`, `atlas-functional-client.js`, `globals.css`;
- contratos/catálogo: `atlasContracts.js`, `sportsIntelligenceContracts.js`, `apiFootballLeagues.js`;
- infraestructura: `cacheStore.js`, `persistentCacheServer.js`, `providerRuntime.js`;
- inteligencia: `intelligenceUtils.js`, `leagueIntelligence.js`, `teamRecentIntelligence.js`, `refereeIntelligence.js`, `venueWeatherContext.js`, `marketEngine.js`;
- servicios: `apiFootballService.js`, `sportsDataGateway.js`, `sportsIntelligenceServer.js`, `sportsIntelligenceService.js`;
- Director: `directorAtlas.js`;
- pruebas: `providerRuntime.test.js`, `publicVoice.test.js`, `sportsIntelligence.test.js`, `sportsServices.test.js`.

No se eliminaron módulos históricos, no se reescribió el proyecto desde cero y no se modificó el historial Git.

## 19. Resultados de comandos

| Comando | Resultado |
|---|---|
| `git branch --show-current` | `rescue/atlas-core-v0.2` |
| `npm run lint` | exit 0, sin errores |
| `npm test` | exit 0, 81/81 |
| `npm run build` | exit 0, Next.js 16.2.12, 12 páginas/rutas generadas |
| `npm audit --omit=dev` | exit 0, 0 vulnerabilidades |
| `git diff --check` | exit 0, sin errores de whitespace |
| verificación real 1 | exit 0, 73 requests |
| verificación real 2 | exit 0, 56 requests |

Durante la revisión visual, `next dev` informó avisos `EMFILE` del watcher por el límite de archivos abiertos del entorno Codex. El servidor respondió HTTP 200 y la revisión fue válida; producción no mostró ese aviso y `next build` pasó.

## 20. Vulnerabilidades pendientes

Se actualizó de forma controlada:

- Next.js: 16.2.9 → 16.2.12;
- eslint-config-next: 16.2.9 → 16.2.12;
- Sharp: 0.34.5 transitivo → 0.35.3;
- PostCSS: 8.4.31 transitivo → 8.5.25.

Sharp se añadió como dependencia exacta y Sharp/PostCSS se fijaron mediante overrides para evitar que Next resolviera versiones vulnerables. Lint, pruebas y build pasaron después de la actualización. No se ejecutó `npm audit fix`.

`npm audit --omit=dev` no reporta vulnerabilidades pendientes. Esto es una fotografía al 2026-08-02; debe repetirse en mantenimiento.

## 21. Limitaciones

1. No existe modelo deportivo validado, probabilidad, cuota justa ni recomendación accionable.
2. Parlay no está implementado y permanece `unsupported`.
3. No hay fuente meteorológica; clima, altitud y superficie pueden quedar unavailable.
4. El histórico arbitral depende de árbitros presentes en fixtures de la misma liga y ventana; no existe endpoint directo usado.
5. Las ventanas actuales priorizan control de cuota: 120 días, 10 partidos de liga, 10 por equipo y hasta 10 coincidencias arbitrales.
6. La cobertura 2026 varía mucho entre competiciones y puede cambiar; debe validarse en cada ejecución.
7. Respuestas no exitosas no se cachean y pueden consumir nuevas consultas al repetir análisis.
8. La verificación real mostró variación del proveedor en forma reciente de un equipo; falta telemetría agregada por código seguro para aislar la causa.
9. La caché de desarrollo es local al filesystem y no sirve como persistencia distribuida o multi-instancia.
10. No hay autenticación ni separación por usuario, de acuerdo con el alcance explícito de esta fase.
11. No se integraron lesiones, alineaciones, odds reales o contexto competitivo aunque el coverage indique que algunos endpoints existen; añadirlos sería una fase deportiva nueva.
12. El escaneo es conservador y puede detenerse antes de revisar el máximo si agota el presupuesto.

## 22. Siguiente fase recomendada

La siguiente fase debería ser **estabilización de datos y persistencia privada**, no ampliación de apuestas:

1. añadir telemetría saneada agregada por endpoint/código para diagnosticar respuestas variables sin exponer payloads;
2. definir caché negativa corta para limitaciones estables del plan y mantener reintento para fallos transitorios;
3. validar mediante ejecuciones controladas cada combinación competición/temporada/coverage antes de habilitarla en el explorador;
4. convertir las métricas y estados técnicos a un diccionario de traducciones completo;
5. preparar el adaptador de persistencia para Supabase conservando contratos, tags y procedencia;
6. añadir autenticación y RLS solo en la fase autorizada;
7. mantener probabilidad unavailable hasta disponer de dataset, metodología, calibración y validación independientes.

## 23. Commits realizados

1. `f2450e0` — `feat: establecer catálogo y control de cuota de Fase 2`
2. `9436790` — `feat: construir inteligencia deportiva con muestras verificables`
3. `382b360` — `feat: ampliar mercados y dictamen prudente de DirectorAtlas`
4. `ba3dba3` — `feat: orquestar análisis y exploración con presupuesto`
5. `8844932` — `feat: entregar explorador y vistas sencilla y experta`
6. `f4a2e0c` — `chore: actualizar Next y dependencias de imágenes`
7. `a4f3020` — `test: añadir verificación deportiva controlada`

El commit final del informe se añade después de redactar este documento. No se realizó merge a `main`.
