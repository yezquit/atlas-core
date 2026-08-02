# Atlas Core — Informe de rescate Fase 1 funcional

Fecha: 2026-08-01  
Rama: `rescue/atlas-core-v0.2`  
Alcance: únicamente Fase 1 funcional; sin Supabase, Vercel, autenticación, scraping, APIs adicionales, probabilidades deportivas ni parlays.

## 1. Resultado ejecutivo

Atlas dispone ahora de un primer flujo web reducido y utilizable:

`fecha → liga → temporada → fixtures disponibles → selección explícita por fixture ID → datos disponibles → cobertura de mercado → DirectorAtlas`

La aplicación ya no ejecuta el prototipo completo dentro de `page.js`. La página pública es un componente de servidor pequeño y la interacción está aislada en un cliente que consume rutas internas. Las llamadas heredadas de API-FOOTBALL permanecen exclusivamente del lado servidor.

El flujo no estima probabilidades, no produce un pick accionable sin histórico y mantiene `parlayStatus: unsupported`. DirectorAtlas es la única voz pública. Un fixture nunca se elige automáticamente ni se sustituye por nombres de equipos.

`npm run lint`, `npm test` y `npm run build` pasan. `npm audit --omit=dev` termina con código 1 por tres vulnerabilidades altas heredadas de dependencias; se detallan en la sección 10.

## 2. Destino de los cuatro elementos no versionados

La inspección previa a cualquier eliminación quedó registrada en `ATLAS_PHASE_1_UNTRACKED_EVIDENCE.md`.

| Elemento | Evidencia | Destino |
| --- | --- | --- |
| `atlas-core@0.1.0` | Archivo regular vacío, 0 bytes | Eliminado como residuo |
| `next` | Archivo regular vacío, 0 bytes | Eliminado como residuo |
| `src/app/api/football/fixtures-by-league/` | Ruta útil pero duplicada, sin validación y con errores crudos | Capacidad consolidada en `fixtures`; ruta duplicada retirada |
| `src/app/api/football/search-leagues/` | Búsqueda arbitraria duplicada del catálogo y con errores crudos | Catálogo autorizado consolidado en `leagues`; ruta duplicada retirada |

Los dos archivos vacíos y las dos rutas eran elementos no rastreados, por lo que su retirada no genera una eliminación versionada. El documento de evidencia sí está versionado. Al cierre no queda ninguno de esos cuatro elementos ni otro archivo no rastreado sin explicación.

## 3. Flujo implementado

1. El usuario elige una fecha válida.
2. Elige una competición del catálogo colombiano autorizado.
3. Indica una temporada; para las ligas de año calendario debe coincidir con el año de la fecha.
4. `Cargar partidos` consulta `/api/football/fixtures`.
5. La UI muestra uno de los estados estables: `loading`, `success`, `empty`, `ambiguous`, `provider_error` o `unavailable`.
6. Si existen resultados, todos se muestran y ninguno queda seleccionado por defecto.
7. El usuario selecciona un radio identificado con el fixture ID del proveedor.
8. La elección no inicia análisis automático. El usuario debe pulsar `Analizar fixture`.
9. `/api/football/fixture-analysis` vuelve a resolver el fixture exclusivamente por el ID solicitado y rechaza cero, múltiples o discordantes resultados.
10. Solo se piden estadísticas del partido cuando está en vivo o finalizado.
11. Se evalúa cobertura únicamente para goles, remates, remates a puerta o tarjetas.
12. DirectorAtlas entrega un único dictamen prudente. La evidencia técnica aparece en un acordeón secundario y no actúa como otra voz de decisión.

Los cambios de fecha, liga, temporada o mercado invalidan cualquier resultado anterior. La respuesta del análisis también se rechaza en cliente si `selectedFixtureId` no coincide exactamente con el solicitado.

## 4. Contratos y estados

Se reutilizaron y ampliaron los contratos de `src/core/contracts/atlasContracts.js`:

- `AnalysisRequest`: entrada normalizada del análisis.
- `FixtureResult`: identidad y resolución no ambigua de un fixture.
- `FixtureStatisticsResult`: disponibilidad y procedencia de estadísticas.
- `EvidenceItem`: evidencia con estado estable y procedencia.
- `MarketAssessment`: cobertura, faltantes, accionabilidad y probabilidad no disponible.
- `PolicyDecision`: regla de precedencia en la que un bloqueo nunca autoriza.
- `DirectorVerdict`: voz pública final.
- `FixtureCatalogResult`: resultado estable para listados de fixtures de la Fase 1.

Estados de carga añadidos: `loading`, `success`, `empty`, `ambiguous`, `provider_error`, `unavailable`.

Estados de DirectorAtlas añadidos: `unavailable`, `insufficient_data`, `analyzable_not_actionable`, `viable_with_caution`, `blocked`.

`viable_with_caution` exige que el mercado sea accionable, exista muestra histórica positiva, no haya faltantes y toda la evidencia requerida esté verificada. El flujo actual no inventa esa condición: al carecer de histórico real, no genera recomendación.

## 5. Obtención de datos y seguridad

La obtención quedó separada en servicios claros:

- `apiFootballService.js`: validación, llamadas inyectables, timeout, normalización, caché y errores sanitizados.
- `apiFootballServer.js`: único adaptador que lee variables de entorno; importa `server-only`.
- `atlasAnalysisService.js`: orquesta fixture, estadísticas, cobertura y DirectorAtlas sin depender de Next.js.
- `atlasAnalysisServer.js`: une el servicio puro con el proveedor en servidor.

Controles implementados:

- fecha ISO real, liga de lista autorizada, temporada de cuatro dígitos compatible y fixture ID entero positivo;
- URL base HTTPS restringida a `v3.football.api-sports.io`;
- timeout de 8 segundos mediante `AbortController`;
- caché de fixtures de 300 segundos y estadísticas de 120 segundos;
- catálogo de ligas servido con caché pública controlada;
- respuestas sin `rawErrors`, información de cuenta ni API key;
- mensajes distintos para error de red, timeout, respuesta inválida, acceso no autorizado y limitación de plan;
- `.env.local` ignorado por Git;
- `.env.example` sin secretos y sin variables `NEXT_PUBLIC_` para el proveedor.

La clave solo se lee como `process.env.API_FOOTBALL_KEY` dentro del adaptador de servidor. No se transmite a componentes cliente ni se incluye en respuestas.

## 6. Rutas creadas o consolidadas

| Ruta | Resultado de la Fase 1 |
| --- | --- |
| `GET /api/football/leagues` | Catálogo local autorizado y cacheado; no consume proveedor |
| `GET /api/football/fixtures` | Consulta exacta por fecha, liga y temporada con contrato sanitizado |
| `GET /api/football/fixture-statistics` | Estadísticas normalizadas por fixture ID validado |
| `POST /api/football/fixture-analysis` | Orquestación completa del fixture seleccionado y DirectorAtlas |
| `GET /api/football/status` | Solo informa `available` o `unavailable`; no devuelve datos de cuenta |
| `GET /api/football/find-fixture` | Retirada funcionalmente con HTTP 410 para impedir selección por nombres |

Las rutas no versionadas `fixtures-by-league` y `search-leagues` no se conservaron como endpoints paralelos.

## 7. Evaluación deportiva acotada

La Fase 1 solo evalúa cobertura para:

- goles;
- remates totales;
- remates a puerta;
- tarjetas.

Una estadística de un único partido se etiqueta como evidencia del fixture actual, nunca como forma reciente. `TeamRecentProfile` y `RefereeProfile` permanecen incompletos sin histórico. La cobertura declara explícitamente ese histórico como faltante.

En todos los mercados:

- `estimatedProbability` es `null`;
- `probabilityStatus` es `unavailable`;
- `parlayStatus` es `unsupported`;
- no se usa la palabra “seguro” como calificación del mercado;
- no hay pick accionable sin una muestra histórica real suficiente.

## 8. DirectorAtlas como única voz pública

`page.js` ya no importa ni ejecuta `decisionEngine`, `atlasExecutiveAnswer`, especialistas, fiscales o gates desde el navegador. `atlasExecutiveAnswer` se conserva en el repositorio por compatibilidad y auditoría, pero no aparece en la vista funcional.

La UI solo presenta `analysis.director` como dictamen. El detalle de evidencia muestra disponibilidad técnica, no una segunda recomendación. Se eliminaron del flujo público las vistas simple/técnica anteriores, sus decisiones paralelas y la manipulación imperativa de acordeones.

## 9. Pruebas añadidas y comprobación visual

`src/core/testing/phaseOneFunctional.test.js` añade trece pruebas offline, sin llamadas externas:

1. fecha inválida;
2. liga inválida;
3. temporada inválida o incompatible;
4. respuesta sin fixtures;
5. múltiples fixtures sin autoselección;
6. selección exacta por ID;
7. ID duplicado declarado ambiguo;
8. temporada/recurso no permitido por el plan;
9. timeout sanitizado;
10. error sanitizado y clave ausente;
11. DirectorAtlas no recomienda sin histórico;
12. el fixture seleccionado no cambia silenciosamente;
13. `viable_with_caution` exige evidencia verificada.

`publicVoice.test.js` se adaptó para comprobar que DirectorAtlas es la única voz pública, la probabilidad visible usa estado y la interfaz conserva el fixture ID.

Resultado total: 37 pruebas, 37 aprobadas, 0 fallidas.

También se levantó el build de producción en `127.0.0.1`. La inspección del DOM confirmó fecha, selector de liga, temporada, botón de carga y estado visible. Tras corregir el evento del control de fecha, el valor `2026-08-01` actualizó el mensaje a `Carga los fixtures para la nueva fecha.`. La consola del navegador terminó con cero errores. No se dejó el servidor ejecutándose.

## 10. Resultados de comandos finales

| Comando | Resultado |
| --- | --- |
| `npm run lint` | Código 0; sin errores ni advertencias de ESLint |
| `npm test` | Código 0; 37/37 pruebas aprobadas |
| `npm run build` | Código 0; compilación Next.js 16.2.9 correcta, 10 páginas generadas, sin descarga de fuentes |
| `npm audit --omit=dev` | Código 1; 3 vulnerabilidades altas |
| `git diff --check` | Código 0; sin errores de espacios |

Hallazgos de `npm audit --omit=dev`:

- `next`: severidad alta, varios avisos; el reporte indica `No fix available` para la versión resoluble actual.
- `postcss`: severidad alta, heredada por Next.js; `No fix available`.
- `sharp`: severidad alta por vulnerabilidades heredadas de libvips; `npm audit` indica que existe corrección mediante actualización.

No se ejecutó `npm audit fix`: no fue solicitado, cambiaría dependencias fuera del objetivo funcional y no resolvería los dos grupos marcados sin corrección. Debe revisarse como tarea de seguridad prioritaria y probar una actualización controlada de Next.js/sharp cuando exista una versión compatible.

## 11. Limitaciones reales del plan de API y datos no verificados

La integración reconoce y muestra `unavailable` cuando API-FOOTBALL devuelve señales de plan, suscripción, temporada, cuota o acceso. Ese comportamiento está cubierto por pruebas offline y nunca expone el mensaje crudo del proveedor.

No fue posible confirmar en vivo el plan actual, la cuota, las temporadas habilitadas ni la cobertura deportiva. El entorno de ejecución bloqueó la única consulta controlada antes de que alcanzara la ruta local, por lo que no se consumió cuota y no se intentó evadir la restricción. En consecuencia, este informe no afirma que la temporada 2026 esté habilitada ni inventa fixtures o estadísticas.

Tampoco se verificaron en vivo:

- vigencia de los IDs de liga mantenidos en el catálogo;
- disponibilidad de fixtures para una fecha concreta;
- cobertura real de estadísticas por competición;
- comportamiento exacto de la cuenta ante sus límites de plan.

La aplicación sí está preparada para mostrar `success`, `empty`, `provider_error` o `unavailable` según la respuesta real, sin seleccionar otro partido.

## 12. Archivos modificados

### Configuración y documentación

- `.env.example`
- `ATLAS_PHASE_1_UNTRACKED_EVIDENCE.md`
- `ATLAS_PHASE_1_FUNCTIONAL_REPORT.md`

### Presentación

- `src/app/page.js`
- `src/app/atlas-functional-client.js`
- `src/app/globals.css`

### Rutas del servidor

- `src/app/api/football/find-fixture/route.js`
- `src/app/api/football/fixture-analysis/route.js`
- `src/app/api/football/fixture-statistics/route.js`
- `src/app/api/football/fixtures/route.js`
- `src/app/api/football/leagues/route.js`
- `src/app/api/football/status/route.js`

### Servicios, contratos y reglas

- `src/core/contracts/atlasContracts.js`
- `src/core/data/apiFootballLeagues.js`
- `src/core/services/apiFootballService.js`
- `src/core/services/apiFootballServer.js`
- `src/core/services/atlasAnalysisService.js`
- `src/core/services/atlasAnalysisServer.js`
- `src/core/modules/marketDataCoverage.js`
- `src/core/modules/directorAtlas.js`

### Pruebas

- `src/core/testing/phaseOneFunctional.test.js`
- `src/core/testing/publicVoice.test.js`

## 13. Riesgos pendientes

1. La cuenta y cobertura real de API-FOOTBALL siguen sin validación en vivo.
2. El catálogo de ligas y `currentSeason` se administra a mano y puede quedar obsoleto.
3. No existe todavía histórico real de equipos, ligas o árbitros; por diseño, el resultado no es accionable.
4. Las rutas heredadas `realFixtureLookup` y `realFixtureStatisticsLookup` aún conservan campos `rawErrors` en módulos no usados por la pantalla pública. Deben quedar aisladas o eliminarse en una fase posterior, con pruebas de no regresión.
5. La caché actual es la de Next.js, no un almacén auditable ni persistente.
6. No hay autenticación ni autorización; permanecen fuera del alcance expreso de esta fase.
7. Las tres vulnerabilidades altas de producción requieren seguimiento antes de exponer Atlas públicamente.
8. El estado `ambiguous` está implementado para respuestas duplicadas o incompatibles, pero necesita observación con datos reales del proveedor.

## 14. Siguiente fase recomendada

Realizar una fase corta de verificación y endurecimiento antes de añadir producto:

1. Validar con una cuenta autorizada una fecha y liga conocidas, sin escaneo masivo.
2. Registrar de forma reproducible qué temporadas y estadísticas permite el plan.
3. Actualizar de forma controlada Next.js/sharp y repetir lint, pruebas, build y audit.
4. Retirar o aislar definitivamente los lookups heredados que todavía modelan errores crudos.
5. Diseñar la ingesta histórica del mismo proveedor con trazabilidad, ventanas de muestra y límites de cuota.
6. Solo después, habilitar perfiles históricos verificables; mantener probabilidad y recomendación desactivadas hasta validar un modelo deportivo.

No se recomienda integrar todavía otra API, scraping, Supabase, Vercel, autenticación, parlays ni un motor probabilístico.

## 15. Criterios de aceptación

| Criterio | Estado |
| --- | --- |
| Elegir fecha y liga | Cumplido y comprobado en build de producción |
| Cargar fixtures reales o mostrar limitación real | Implementado; proveedor no verificado en vivo por restricción del entorno |
| Seleccionar fixture por ID | Cumplido |
| No cambiar fixture seleccionado | Cumplido y probado |
| Errores sanitizados | Cumplido y probado |
| API key ausente de cliente/respuestas | Cumplido por arquitectura y probado offline |
| DirectorAtlas como única voz | Cumplido y probado |
| Probabilidad no inventada | Cumplido: `null/unavailable` |
| Sin pick accionable sin histórico | Cumplido y probado |
| Lint, test y build | Cumplidos |
| Sin no rastreados inexplicados | Cumplido |
| Sin merge a `main` | Cumplido |
| Sin Supabase/Vercel | Cumplido |

## 16. Commits realizados antes de este informe

- `587a940 chore: documentar residuos no versionados de Atlas`
- `d677c3a feat: consolidar flujo deportivo seguro por fixture ID`
- `2c59970 feat: reemplazar prototipo por flujo funcional explícito`
- `f1c9bff fix: robustecer captura de fecha en el flujo funcional`
- `1eb9f47 docs: actualizar entorno servidor para la Fase 1`

No se hizo merge a `main` ni se modificó otra rama.
