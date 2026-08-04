# ATLAS — INFORME DE FASE FINAL OPERATIVA

Fecha de cierre: 2026-08-04  
Repositorio: `/Users/yezidquitian/Documents/atlas-core`  
Rama: `rescue/atlas-core-v0.2`  
Motor: `atlas-operational-v1`  
Base preservada: tag `atlas-phase-2-complete`

## 1. Resumen ejecutivo

Atlas Core fue ampliado sobre la base Next.js existente y quedó operativo en local para explorar jornadas, analizar un fixture exacto, consultar contexto prepartido cubierto por API-FOOTBALL, normalizar cuotas, generar una solicitud manual para Gemini, validar el texto pegado, crear una nueva versión del análisis y conservar un historial append-only.

Se mantuvieron las reglas prudenciales: `estimated_probability` es siempre `null`, su estado es `unavailable`, la probabilidad implícita solo representa `1 / cuota decimal`, una cuota manual es `user_reported`, una cuota vencida bloquea la aptitud y DirectorAtlas sigue siendo la única voz pública. Atlas no ordena apostar ni usa expresiones de certeza o ganancia garantizada.

Resultado final verificado:

- lint: aprobado;
- pruebas: 133 aprobadas, 0 fallidas;
- build: aprobado, sin descarga de Google Fonts y sin advertencias de trazado;
- `npm audit --omit=dev`: 0 vulnerabilidades;
- verificación real: 65 solicitudes, máximo 120, dos fixtures, una competición;
- Gemini API: no usada;
- Supabase/Vercel: no integrados ni desplegados;
- rama final: `rescue/atlas-core-v0.2`, sin merge a `main`.

## 2. Funcionalidades terminadas

- Se conservaron Explorar jornada y Analizar partido.
- Se añadió Historial como tercer modo principal.
- El análisis operativo reutiliza íntegramente League, Team, Referee, Venue/Weather y Market Intelligence de Fase 2.
- Se añadió flujo de siete etapas: partido, datos deportivos, mercado/cuota, Gemini manual, validación, reanálisis y dictamen.
- Cada ejecución finalizada crea una versión con ID único, fase temporal, entradas, evidencia, cuotas, contexto, confianza y DirectorAtlas.
- Se añadió exportación JSON y eliminación lógica explícita con marca auditable.
- Se preparó un puerto de persistencia para sustituir el almacenamiento local por un adaptador futuro.

## 3. Odds y bookmakers

`oddsIntelligence.js` normaliza la respuesta pre-match de API-FOOTBALL y conserva:

- fixture, bookmaker, mercado, selección, línea, cuota decimal, actualización y fuente;
- frescura y verificación (`verified_provider`, `user_reported`, `stale`, `unavailable`);
- advertencias y probabilidad implícita etiquetada.

Controles aplicados:

- consulta de `/odds?fixture=<id>` solo en servidor;
- validación estricta del fixture ID;
- mapeo únicamente a las cinco familias soportadas;
- deduplicación por fixture, bookmaker, mercado, selección, línea y cuota;
- caché de 60 segundos y deduplicación concurrente del runtime;
- mejor cuota solo entre datos frescos, verificados y comparables en mercado, selección y línea;
- entrada manual de bookmaker, selección, línea y cuota, siempre `user_reported`;
- no existe cálculo de valor esperado porque no hay modelo deportivo validado.

## 4. Confianza del análisis

`analysis_confidence_score` mide calidad informativa, no posibilidad de acertar. La fórmula suma 100 puntos:

- calidad de fuentes: 18;
- actualidad: 14;
- tamaño de muestra: 14;
- cobertura de variables: 14;
- concordancia: 10;
- control de contradicciones: 10;
- contexto: 8;
- línea/cuota verificadas: 8;
- estabilidad del proveedor: 4.

El resultado se traduce a baja, limitada, moderada, alta, muy alta o excepcional. El techo ordinario es 92. Solo una evidencia extraordinaria, completa, concordante, con alineación confirmada y cuota verificada podría superar 92. El servicio operativo no activa esa excepción automáticamente.

Los tres conceptos están separados:

- `analysis_confidence_score`: calidad y coherencia de evidencia;
- `estimated_probability`: `null` / `unavailable`;
- `market_suitability`: `blocked`, `not_viable`, `insufficient_data`, `review_only`, `viable_with_caution` o `suitable_under_conditions`.

## 5. Gemini manual

Atlas genera un prompt copiable que incluye fixture ID, competición, temporada, hora UTC, equipos, mercado, selección, línea, cuota, datos verificados, faltantes, riesgos y hora del análisis.

El prompt exige fuentes y fechas, separa hechos, probables, rumores, contradicciones y datos no encontrados, y pide revisar lesiones, sanciones, alineaciones, rotaciones, árbitro, declaraciones, prioridad, descanso, viajes, clima, campo, noticias y movimientos de cuotas. Prohíbe inventar estadísticas, generar probabilidades o recomendar apostar.

La interfaz ofrece:

- “Copiar solicitud para Gemini”;
- “Pegar respuesta de Gemini”;
- “Validar contexto”;
- selección manual de elementos;
- “Reanalizar con contexto”.

No existe SDK, endpoint, clave ni llamada a Gemini.

## 6. Validación de contexto

El parser conserva texto original y versión estructurada. Extrae secciones, URLs, dominios, fechas, fixture mencionado, equipos, línea/cuota bloqueadas, timestamp y clasificación de fuentes.

Reglas verificadas:

- todo empieza como `user_reported`;
- un hecho sin URL queda `unverified`;
- un rumor no se selecciona automáticamente;
- un fixture o fecha incompatible bloquea el reanálisis con ese contexto;
- el texto no puede sustituir fixture, equipos, línea o cuota;
- las fuentes se clasifican conservadoramente en oficial de competición/club, federación, medio reconocido, periodista, agregador o desconocida;
- el usuario puede desmarcar elementos antes de crear una versión nueva;
- no pegar contexto no bloquea el análisis estructurado.

## 7. Reanálisis temporal

Las fases implementadas son:

- `early_review`;
- `day_before`;
- `three_hours_before`;
- `one_hour_before`;
- `thirty_minutes_before`;
- `final_pre_match`.

Cada versión conserva `analysis_id`, `fixture_id`, `created_at`, distancia al kickoff, fase, entradas, evidencia, cuotas, Gemini, confianza, Director, parlay y versión del motor. El log no sobrescribe análisis finalizados.

La comparación detecta evidencia nueva o retirada, cambios de alineación, árbitro, lesiones, clima, línea, cuota, confianza, aptitud y veredicto. Si no hay cambios materiales lo explica; si los hay, identifica el motivo.

## 8. DirectorAtlas

DirectorAtlas continúa como única voz pública. El contrato operativo versión 3 incluye todos los campos solicitados: identidad, hora, fase, mercado, selección, línea, cuota, fuente, probabilidad implícita, confianza, probabilidad estimada nula, aptitud, evidencia a favor/en contra, contradicciones, riesgos, faltantes, condiciones, parlay, próxima acción, referencias y motor.

La UI no presenta `atlasExecutiveAnswer`, `decisionEngine` ni especialistas como voces. `can_recommend` permanece falso porque Atlas no da una orden de apuesta; `authorizes_consideration` solo puede ser verdadero para `suitable_under_conditions`.

## 9. Picks individuales

Cada resultado incluye `IndividualPickAssessment` con mercado, selección, línea, cuota, fuente, aptitud, confianza, condiciones, razones y riesgos.

`apt_for_consideration` exige conjuntamente:

- fixture exacto;
- candidato deportivo y muestra suficiente;
- requisitos completos;
- ausencia de contradicciones críticas;
- línea y cuota;
- cuota fresca y verificada por proveedor;
- ausencia de bloqueos contextuales o de cuota;
- confianza mínima de 75;
- autorización de consideración por DirectorAtlas.

Una cuota manual puede dejar el mercado como viable con cautela, pero no como apto bajo condiciones hasta verificarse.

## 10. Parlays

La política de parlays es independiente. Solo consume picks individuales aptos, con cuota verificada y fresca. Exige seis candidatos para construir tres combinaciones de dos selecciones, no repite la misma selección/línea crítica, evita dos selecciones del mismo partido, detecta correlación y calcula únicamente producto decimal.

Estados: `unsupported`, `insufficient_candidates`, `blocked`, `review_only`, `allowed_with_caution`. La UI evalúa la política sobre expedientes ya cargados; no se creó un endpoint público adicional. La cuota combinada se etiqueta expresamente como no equivalente a probabilidad real.

En la verificación real el estado fue `insufficient_candidates`; no se fabricó ningún parlay.

## 11. Historial

El historial se guarda en `.atlas-data/v1/operational-history.ndjson`, ignorado por Git y creado con modo de archivo `0600`. El esquema es versión 1 y el log es append-only:

- `analysis_finalized` añade una versión;
- `analysis_deleted` añade una marca de eliminación, sin reescribir el log;
- eliminar exige `confirmation: "DELETE"` y confirmación visible del navegador;
- exportar genera JSON con versión y timestamp;
- se puede filtrar por fecha, competición, equipo, fixture, estado, mercado y fase;
- se pueden seleccionar dos versiones y comparar sus campos principales.

No se usa `localStorage` ni `sessionStorage` para datos deportivos.

## 12. Interfaz

La UI mantiene los tres modos solicitados y los acordeones React accesibles. El modo sencillo abre DirectorAtlas inmediatamente y muestra confianza, aclaración de no-probabilidad, mercado, selección, línea, cuota, aptitud, razones, riesgos, condiciones, próxima acción y responsabilidad del usuario.

El modo experto añade identidad, cobertura, liga, equipos, árbitro, sede/clima, mercados, odds, alineaciones/lesiones, Gemini, contradicciones, fórmula, telemetría, versión y diferencias.

Se añadieron estilos responsive, tablas con contenedor, flujo horizontal controlado, campos amplios y estados de carga/botones deshabilitados. La revisión interactiva con el navegador integrado no pudo ejecutarse porque el controlador requerido no estaba disponible en esta sesión; lint, pruebas estáticas, build y reglas CSS sí fueron verificados.

## 13. Control de costos

- presupuesto individual: 45;
- reanálisis: 60;
- jornada: 90;
- verificador real: límite duro 120;
- límite absoluto del runtime: 150;
- concurrencia configurable, máximo 5;
- caché persistente para históricos y caché de 60 segundos para odds;
- deduplicación de solicitudes idénticas;
- advertencia de cuota diaria por debajo de 15%;
- bloqueo preventivo por debajo de 5%;
- errores y metadatos de cuenta sanitizados;
- Gemini manual, costo automatizado cero.

## 14. Pruebas

Se añadieron las 45 pruebas solicitadas y pruebas complementarias de plataforma/cuota. El total pasó de 81 a 133.

Cobertura nueva principal:

- exactitud, frescura, entrada manual, implícita y comparación de odds;
- fórmula, rangos y techo de confianza;
- aptitud separada de confianza y probabilidad;
- prompt, parser, fuente, rumor, contradicción, identidad y selección manual de Gemini;
- alineaciones probables/confirmadas y lesiones no cubiertas;
- versiones, diferencias, historial y exportación;
- picks y bloqueo por cuota ausente/vencida;
- parlays, correlación, producto y no repetición;
- UI sencilla/experta, no-probabilidad, claves, presupuesto, caché, fixture y voz pública;
- advertencia/bloqueo de cuota diaria;
- adaptador local y restricción de hosts públicos.

Resultado: `133 passed`, `0 failed`, `0 skipped`.

## 15. Verificación real

Comando:

```bash
npm run verify:operational -- --date=2026-08-08 --max-fixtures=2
```

Alcance:

- Colombia Primera A, temporada 2026;
- una competición consultada, no las 17;
- tres fixtures encontrados, solo dos analizados;
- Santa Fe vs Chico, fixture `1549722`;
- Fortaleza FC vs Cucuta, fixture `1549718`;
- un reanálisis del primer fixture con texto sintético marcado explícitamente como prueba;
- ninguna llamada a Gemini.

Resultados observados:

- odds: no disponibles en la respuesta del proveedor para ambos fixtures;
- lineups: `data_unavailable` al momento de la consulta;
- injuries: `endpoint_unavailable` según coverage de la temporada;
- standings: verificados;
- confianza: 71 y 74;
- aptitud: `review_only` en ambos;
- probabilidad estimada: `unavailable`;
- parlay: `insufficient_candidates`;
- el texto sintético quedó `user_reported`, fuente `unknown`, sin promoverse a hecho verificado.

## 16. Consumo de API

Telemetría exacta de la verificación controlada:

- solicitudes reales: 65;
- límite duro: 120;
- restantes del presupuesto local: 55;
- cache hits: 43;
- cache misses: 65;
- deduplicadas concurrentes: 0;
- reintentos: 0;
- bloqueos de presupuesto: 0;
- cuota diaria informada: 7.500;
- cuota diaria restante al finalizar: 7.450;
- estado de cuota: `available`.

La diferencia entre solicitudes de esta ejecución y el contador diario puede incluir otras consultas realizadas previamente en la misma cuenta. Atlas solo atribuye a su ejecución las 65 registradas por su runtime.

## 17. Archivos modificados

32 archivos cambiaron respecto a `atlas-phase-2-complete`: 2.254 inserciones y 17 eliminaciones antes de añadir este informe.

Áreas principales:

- configuración: `.env.example`, `.gitignore`, `package.json`;
- verificación: `scripts/verify-final-operational.mjs`;
- rutas: operational-analysis, validate-context, operational-history;
- UI: `atlas-functional-client.js`, `globals.css`, `page.js`;
- contratos: operational y platform;
- infraestructura: historial en memoria/archivo y runtime de proveedor;
- inteligencia: odds, confianza, Gemini, contexto, aptitud, versiones y parlays;
- servicios: gateway, orquestador operativo, wrapper servidor y política local;
- pruebas: operationalIntelligence, operationalPlatform, providerRuntime y publicVoice.

No se eliminaron módulos heredados ni se reescribió el proyecto desde cero.

## 18. Comandos finales

```text
npm run lint                  -> PASS
npm test                      -> PASS, 133/133
npm run build                 -> PASS, 13 rutas listadas, sin Google Fonts
npm audit --omit=dev          -> PASS, 0 vulnerabilidades
git diff --check              -> PASS
git status --short --branch   -> limpio en rescue/atlas-core-v0.2 al cerrar
```

La primera ejecución de `npm audit` de la línea base falló por resolución DNS (`ENOTFOUND registry.npmjs.org`). Se repitió con permiso de red y finalizó con cero vulnerabilidades.

## 19. Limitaciones reales

- No existe un modelo deportivo validado; no hay probabilidad estimada ni valor esperado.
- API-FOOTBALL no devolvió odds para los dos fixtures reales probados.
- Colombia Primera A 2026 reportó injuries sin cobertura; esto no significa ausencia de lesiones.
- Las alineaciones todavía no estaban publicadas en la verificación realizada varios días antes del kickoff.
- No se configuró un endpoint seguro de `sidelined` por fixture; queda explícitamente no disponible.
- El clima permanece sin una fuente externa nueva, conforme a la prohibición de añadir APIs.
- El historial es local a una instancia y no ofrece coordinación multiinstancia.
- La clasificación de fuentes Gemini es determinista y conservadora; no verifica semánticamente la verdad de una URL.
- No se completó QA visual interactivo por indisponibilidad del controlador de navegador integrado.
- Las rutas operativas nuevas rechazan hosts públicos mientras no exista autenticación real; no se debe desplegar esta versión públicamente.

## 20. Tareas que requieren credenciales externas

Supabase no se integró. El contrato `OperationalPersistencePort` y las variables vacías quedaron preparados. Migración recomendada:

1. crear proyecto Supabase y guardar URL/anon/service role solo en entornos autorizados;
2. crear tablas `profiles`, `authorized_users`, `analysis_events`, `analysis_versions` y `audit_events`;
3. conservar `analysis_events` append-only y versionar el esquema;
4. habilitar Auth por email/contraseña y bloquear registro público no autorizado;
5. aplicar RLS por `auth.uid()`, rol y pertenencia del expediente;
6. prohibir service role en cualquier variable `NEXT_PUBLIC_*`;
7. implementar un adaptador Supabase compatible con `OperationalPersistencePort`;
8. migrar NDJSON mediante exportación JSON y conciliación de IDs;
9. sustituir la restricción localhost por sesión autenticada en middleware y rutas;
10. ejecutar pruebas de aislamiento entre usuarios antes de desplegar.

Vercel no se configuró. Después de completar autenticación y RLS:

1. conectar el repositorio conservando la rama de release acordada;
2. configurar variables server-only en Preview y Production;
3. no exponer `API_FOOTBALL_KEY` ni `SUPABASE_SERVICE_ROLE_KEY`;
4. usar almacenamiento Supabase, no el filesystem efímero de Vercel;
5. ejecutar lint, tests, build y pruebas RLS en Preview;
6. validar cuota, logs sanitizados y expiración de sesiones;
7. promover a Production solo tras revisión manual. No se ejecutó deploy.

## 21. Instrucciones de uso

1. Copiar `.env.example` a `.env.local` y completar únicamente `API_FOOTBALL_KEY` para uso local.
2. Ejecutar `npm install` si faltan dependencias.
3. Ejecutar `npm run dev` y abrir `http://localhost:3000`.
4. En Explorar jornada, elegir fecha, competiciones y mercados.
5. En Analizar partido, cargar la fecha/competición, seleccionar el fixture exacto y elegir mercado.
6. Si la cuota del proveedor no está disponible, introducir bookmaker, selección, línea y cuota; se mostrará como no verificada.
7. Ejecutar análisis y leer primero DirectorAtlas.
8. Copiar la solicitud Gemini, investigar manualmente y pegar la respuesta.
9. Validar, desmarcar elementos dudosos y reanalizar para crear otra versión.
10. Abrir Historial para filtrar, comparar, exportar, eliminar lógicamente o evaluar la política de parlays.
11. Para reproducir la comprobación real: `npm run verify:operational -- --date=2026-08-08 --max-fixtures=2`.

## 22. Commits realizados

Commits de implementación en esta fase:

1. `a6c4bf6` — `feat: define conservative operational intelligence`
2. `a67a2d0` — `feat: add operational analysis and append-only history`
3. `109f8b0` — `fix: scope local history tracing`
4. `83e5eb4` — `feat: add operational analysis and history interface`
5. `7b945f6` — `test: cover final operational policies`
6. `0ce6a72` — `chore: add bounded operational verification`
7. `af8d876` — `feat: secure local operations and finalize decision outputs`
8. `4100e28` — `docs: add final operational report`

La corrección factual final de este informe se conserva en un commit documental adicional. No se realizó merge a `main`.
