# Atlas Core — Informe de rescate, Fase 0

Fecha: 2026-08-01  
Repositorio: `/Users/yezidquitian/Documents/atlas-core`  
Rama: `rescue/atlas-core-v0.2`

## 1. Resultado ejecutivo

La Fase 0 quedó implementada sobre la base existente, sin reconstruir el proyecto, eliminar módulos, conectar servicios nuevos ni ejecutar consultas deportivas externas. El lint, las 23 pruebas automatizadas y el build de producción pasan. `DirectorAtlas` es la única voz de decisión visible en la vista simple.

La probabilidad deportiva ya no se calcula mediante una heurística: `estimatedProbability` es `null` y `probabilityStatus` es `unavailable` mientras no exista un modelo validado. Los estados internos de contratos y gates usan identificadores estables sin emojis. Parlay se conserva como solicitud de uso, no penaliza el análisis individual y siempre retorna `parlayStatus: "unsupported"` en esta fase.

La auditoría de producción detectó tres vulnerabilidades de severidad alta en la cadena de Next.js. No se ejecutó `npm audit fix`, porque modificar dependencias excede esta fase y parte de los avisos no tiene una corrección disponible según npm.

## 2. Criterios de aceptación

| Criterio | Resultado | Evidencia |
|---|---|---|
| Lint pasa | Cumplido | `npm run lint`, código 0 |
| Test existe y pasa | Cumplido | 23/23 pruebas, código 0 |
| Build sin Google Fonts | Cumplido | `next/font/google` eliminado; build, código 0 |
| Probabilidad no disponible | Cumplido | `estimatedProbability: null`, `probabilityStatus: "unavailable"` |
| Bloqueado nunca permitido | Cumplido | Precedencia absoluta y pruebas en ambos sentidos |
| Parlay unsupported | Cumplido | Contratos, gates, Fiscal, decisión y Director |
| Línea/cuota no reaparecen ausentes | Cumplido | Se propagan en `AnalysisRequest`, cobertura, fuentes, Director e historial |
| Estadísticas normalizadas leídas | Cumplido | Ruta `statistics.availableStats` y nombres `row.team.name` |
| Fixture ambiguo no confirmado | Cumplido | `status: "ambiguous"`, `selectedFixture: null` |
| DirectorAtlas única voz pública | Cumplido | Vista simple y prueba estática de presentación |

## 3. Archivos modificados

### Configuración y aplicación

- `.env.example`: plantilla vacía, sin secretos y con advertencia sobre variables públicas.
- `.gitignore`: permite versionar únicamente `.env.example` dentro del patrón de entornos.
- `package.json`: añade `npm test`, activa módulos ESM para las pruebas y conserva Next.js.
- `src/app/layout.js`: elimina Google Fonts remotas, usa el CSS y fuentes del sistema, y corrige metadatos e idioma.
- `src/app/page.js`: corrige `localStorage`, propaga el contrato de entrada, acepta fecha/temporada, conserva línea/cuota y limita la vista simple a DirectorAtlas.
- `src/app/api/football/find-fixture/route.js`: acepta fecha/temporada y deja de usar silenciosamente la temporada de desarrollo 2024.
- `src/app/api/football/fixtures/route.js`: usa la temporada actual por defecto y distingue temporadas explícitas.

### Contratos y decisión

- `src/core/contracts/atlasContracts.js`: contratos y constructores para `AnalysisRequest`, `FixtureResult`, `FixtureStatisticsResult`, `EvidenceItem`, `MarketAssessment`, `PolicyDecision` y `DirectorVerdict`.
- `validationGate.js`, `marketGate.js`, `gateCoordinator.js`: jerarquía de estados estable; un bloqueo tiene precedencia absoluta.
- `confidenceCalibration.js`: elimina la probabilidad heurística y conserva por separado respaldo técnico, disponibilidad del modelo y permiso operativo.
- `fiscalEngine.js`, `fiscalImpact.js`: eliminan la penalización circular por parlay y cualquier ajuste de probabilidad.
- `decisionEngine.js`, `specialistRouter.js`: elegir parlay no degrada confianza, fragilidad ni estado individual.
- `directorAtlas.js`: crea un `DirectorVerdict` prudente y contractual; no autoriza recomendación sin modelo validado.
- `atlasExecutiveAnswer.js`: permanece para auditoría técnica y marca parlay como no soportado.

### Evidencia, mercados y fixtures

- `teamRecentProfile.js`, `complementarySourceCoverage.js`: leen `realFixtureStatistics.statistics.availableStats`.
- `teamRecentProfile.js`: reconoce `marketFocusedStats.teamRows[].team.name`.
- `marketDataCoverage.js`, `marketCoverageImpact.js`, `marketLineContext.js`: conservan valores reportados y no los vuelven a declarar ausentes.
- `sourceConnectorMock.js`, `sourceValidation.js`: distinguen dato reportado de dato validado.
- `caseRecorder.js`: conserva línea, cuota, fecha y temporada en el expediente local.
- `fixtureMatcher.js`, `realFixtureLookup.js`: filtran fecha/temporada, no prefieren partidos terminados con árbitro y devuelven ambigüedad sin selección.
- `realFixtureStatisticsLookup.js`: retorna el contrato estable de estadísticas.
- `realFixtureSourceImpact.js`, `refereeProfile.js`: eliminan mensajes contradictorios y topes proxy de probabilidad.
- `competitionResolver.js`, `scenarioClassifier.js`: extensiones ESM explícitas requeridas por el ejecutor de pruebas.

### Pruebas

- `src/core/testing/atlasTrialCases.js`: cuatro casos convertidos en pruebas offline ejecutables con datos sintéticos identificables.
- `contracts.test.js`: invariantes de los siete contratos.
- `fixtureSelection.test.js`: ambigüedad, fecha, temporada, árbitro y resolución de liga.
- `phaseZeroPolicy.test.js`: precedencia de bloqueos, probabilidad no disponible, parlay, Fiscal y DirectorAtlas.
- `publicVoice.test.js`: vista simple y ausencia de Google Fonts.

## 4. Bugs corregidos

1. La probabilidad partía de 50% y subía por reglas no validadas. Esa ruta fue eliminada por completo.
2. `FiscalImpact` trataba “Sin objeción crítica” como objeción media por coincidencia de texto.
3. Los gates podían producir contratos incompatibles y degradar un bloqueo a un estado exploratorio.
4. Parlay se usaba como motivo circular de objeción, pérdida de confianza y mayor fragilidad.
5. Dos módulos buscaban `availableStats` en un nivel incorrecto.
6. El perfil reciente no reconocía el nombre normalizado dentro de `row.team.name`.
7. Línea y cuota ingresadas se perdían entre el formulario, cobertura, fuentes y dictamen.
8. La selección de fixtures privilegiaba un partido terminado con árbitro y ocultaba ambigüedades.
9. La búsqueda usaba 2024 como temporada silenciosa de desarrollo.
10. La vista simple presentaba dos voces finales y varios resúmenes heredados.
11. La lectura síncrona de `localStorage` provocaba el error de lint de React.
12. El build dependía de descargar Geist desde Google Fonts.

## 5. Pruebas automatizadas

Las 23 pruebas no hacen `fetch`, no consultan APIs deportivas y usan únicamente fixtures y estadísticas sintéticas dentro del arnés. Cubren:

- normalización e invariantes contractuales;
- bloqueo absoluto de ValidationGate o MarketGate;
- probabilidad `unavailable` y ausencia de ajustes fiscales;
- igualdad de la evaluación individual para uso simple o parlay;
- parlay siempre `unsupported`;
- lectura de estadísticas normalizadas y nombres de equipo;
- conservación de línea y cuota reportadas;
- selección inequívoca por fecha y temporada;
- ambigüedad sin fixture confirmado;
- prudencia del Director y única voz en vista simple;
- build sin importación de Google Fonts.

## 6. Comandos finales y resultados

### `npm run lint`

- Resultado: aprobado.
- Código de salida: 0.
- Errores: 0.
- Advertencias: 0.

### `npm test`

- Resultado: aprobado.
- Código de salida: 0.
- Pruebas: 23 aprobadas, 0 fallidas, 0 omitidas.
- Duración registrada: aproximadamente 79 ms.

### `npm run build`

- Resultado: aprobado.
- Código de salida: 0.
- Next.js: 16.2.9 con Turbopack.
- Compilación, verificación de tipos, recolección de datos y generación estática: correctas.
- No se descargaron fuentes; se usan fuentes del sistema.

### `npm audit --omit=dev`

- Primer intento: no verificable por bloqueo DNS del entorno (`ENOTFOUND registry.npmjs.org`).
- Reintento con acceso de red limitado a npm audit: completado.
- Código de salida: 1 porque existen vulnerabilidades.
- Resultado: 3 vulnerabilidades de severidad alta.
- Paquetes afectados: `next`, `postcss` y `sharp`.
- `sharp`: npm indica que existe corrección mediante actualización.
- `next` y `postcss`: el reporte incluye avisos sin corrección disponible para la resolución instalada.
- No se ejecutó corrección automática ni se cambió el lockfile.

## 7. Seguridad y variables de entorno

- `.env.example` no contiene valores ni secretos.
- No se añadió ninguna variable `NEXT_PUBLIC_*` con credenciales.
- Las variables de la integración heredada se consumen únicamente en Route Handlers de servidor.
- Next detectó un `.env.local` durante el build; su contenido no fue leído, mostrado ni modificado en esta fase.
- No se conectaron Supabase, Vercel ni nuevas APIs.
- No se ejecutó ninguna llamada a API-FOOTBALL ni a otra fuente deportiva.

## 8. Riesgos pendientes

1. **Dependencias con vulnerabilidades altas.** Requieren una tarea aislada de actualización, revisión de compatibilidad y nueva auditoría.
2. **Aplicación aún sin autenticación.** La privacidad web prevista depende de una fase posterior; no se integró Supabase en cumplimiento del alcance.
3. **Historial en `localStorage`.** Sigue limitado al dispositivo, no tiene control por usuario y puede borrarse desde el navegador.
4. **Sin modelo deportivo validado.** No existe probabilidad estimada ni recomendación accionable; esto es intencional y debe mantenerse hasta validar un modelo.
5. **Catálogo de temporadas mantenido a mano.** El valor `currentSeason` puede quedar obsoleto y debe administrarse explícitamente.
6. **Acordeones imperativos.** La vista todavía añade listeners sobre el DOM; funciona y pasa lint, pero merece migración posterior a estado React para evitar deuda de mantenimiento.
7. **Integración deportiva heredada.** Los Route Handlers siguen en el código, aunque no fueron invocados; requieren una decisión de producto y seguridad posterior.
8. **Fuentes simuladas.** `sourceConnectorMock` sigue siendo un módulo explícitamente simulado; nunca debe presentarse como evidencia real.
9. **Dos rutas no versionadas presentes.** `fixtures-by-league/` y `search-leagues/` ya estaban sin seguimiento antes de la fase. El build local las incluyó, pero no fueron inspeccionadas, modificadas ni añadidas a los commits.
10. **Artefactos no versionados.** `atlas-core@0.1.0` y `next` también preexistían sin seguimiento y se preservaron intactos.

## 9. Datos no verificados

- No se verificó ningún dato deportivo real, cuota, línea, árbitro, lesión, alineación o estadística externa.
- No se validó el contenido de `.env.local` ni la vigencia de credenciales.
- No se probó el comportamiento contra un proveedor deportivo real.
- No se realizó prueba manual en dispositivos físicos ni auditoría de accesibilidad completa.
- No se verificaron en ejecución las dos rutas no versionadas mencionadas; únicamente quedaron incluidas por detección automática del build de Next.js.
- No se corrigieron las vulnerabilidades de dependencias porque requerirían ampliar el alcance.

## 10. Commits de la Fase 0

- `35b68ff test: establecer contratos base de Atlas`
- `4af269d fix: estabilizar politica y retirar probabilidad heuristica`
- `a604001 fix: normalizar evidencia y resolver fixtures ambiguos`
- `1735727 fix: consolidar dictamen prudente en DirectorAtlas`
- `fd6f8b9 fix: aislar vista publica y eliminar fuentes remotas`
- `7de8bb8 fix: eliminar proxies y contradicciones de evidencia`

El informe se añade en un commit final independiente. No se hizo merge a `main`.

## 11. Siguiente fase recomendada

No iniciar otra fase dentro de esta ejecución. Para la siguiente fase, se recomienda primero una tarea corta de seguridad y reproducibilidad:

1. decidir el destino de los archivos y rutas no versionados;
2. actualizar `next`/`sharp` de forma controlada y repetir lint, pruebas, build y audit;
3. reemplazar la manipulación imperativa de acordeones por componentes React;
4. diseñar persistencia autenticada e historial por usuario sin implementarla hasta aprobar el esquema y las políticas RLS;
5. mantener `estimatedProbability: null` hasta contar con datos, metodología, calibración y validación documentadas.
