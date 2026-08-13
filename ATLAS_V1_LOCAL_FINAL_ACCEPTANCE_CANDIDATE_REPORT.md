# Atlas V1 — candidato final de aceptación local

Fecha de cierre técnico: 13 de agosto de 2026  
Repositorio: `/Users/yezidquitian/Documents/atlas-core`  
Rama exclusiva: `rescue/atlas-core-v0.2`

## 1. Estado inicial

La ejecución comenzó sobre la rama requerida y con el árbol de trabajo limpio:

```text
rescue/atlas-core-v0.2
## rescue/atlas-core-v0.2
```

La base existente ya tenía Next.js, DirectorAtlas como voz pública, selección manual, procedencia de línea, modelo preliminar, cuotas normalizadas, parlay controlado, Gemini manual, comparación de versiones e historial append-only. No se reconstruyó el proyecto ni se sustituyó esa arquitectura.

## 2. Causas de los problemas cerrados

1. El ranking deportivo ya ordenaba sin cuota, pero la aplicación no materializaba un contrato Scout separado ni mostraba varias opciones útiles por fixture.
2. La evaluación de precio estaba integrada en el flujo final, pero no existía una clasificación operativa explícita para varias alternativas cotizadas.
3. La normalización conservaba competición y ronda del fixture, pero los perfiles recientes perdían la procedencia competitiva de cada observación.
4. La exploración analizaba fixtures antes de validar conjuntamente estado normalizado y hora de inicio; por eso podía admitir partidos fuera del recorrido prepartido.
5. Los riesgos estaban distribuidos entre Director, contexto y evidencia, sin una etapa Red Team ni un pre-vuelo compacto.
6. Una nueva investigación Gemini limpiaba parte del estado, pero podía seguir mostrando como activa una comparación del reanálisis anterior.
7. El historial permitía ocultar una versión y exportar, pero no tenía una acción global segura con conteo, doble confirmación y frase exacta.
8. El modo sencillo repetía detalles y jerga que pertenecen a la vista experta.

## 3. Archivos modificados

### Nuevos

- `src/core/intelligence/competitiveContext.js`
- `src/core/intelligence/prematchEligibility.js`
- `src/core/intelligence/redTeamAtlas.js`
- `src/core/intelligence/scoutAtlas.js`
- `src/core/testing/atlasV1LocalFinalAcceptance.test.js`
- `ATLAS_V1_LOCAL_FINAL_ACCEPTANCE_CANDIDATE_REPORT.md`

### Actualizados

- `src/app/api/football/journey-scan/route.js`
- `src/app/api/operational-history/route.js`
- `src/app/atlas-functional-client.js`
- `src/app/globals.css`
- `src/core/contracts/platformContracts.js`
- `src/core/contracts/sportsIntelligenceContracts.js`
- `src/core/infrastructure/operationalHistory.js`
- `src/core/infrastructure/operationalHistoryServer.js`
- `src/core/intelligence/teamRecentIntelligence.js`
- `src/core/modules/footballFixtureNormalizer.js`
- `src/core/services/apiFootballServer.js`
- `src/core/services/operationalAnalysisService.js`
- `src/core/services/sportsIntelligenceService.js`

No se eliminó ningún módulo, no se tocó `.env.local`, no se añadió una dependencia y no se cambió el framework.

## 4. Scout Atlas

Se añadió `ScoutAtlasResult` como salida deportiva explícita. Recibe candidatos ya generados por la metodología existente y:

- filtra los que no alcanzan el umbral deportivo que Atlas ya usaba;
- deduplica por `candidate_id`;
- conserva hasta cinco opciones útiles, sin rellenar con opciones débiles;
- etiqueta mejor respaldo, mayor probabilidad y alternativa relevante sin duplicar tarjetas;
- expone probabilidad preliminar, intervalo, respaldo deportivo, calidad informativa, señales favorables, señales contrarias, faltantes, riesgo principal y `line_origin`;
- declara `price_inputs_used: false`.

Antes de construir el análisis deportivo, el orquestador fuerza `odds: null`, `manualOdds: null` y `manualCandidateOdds: []`. La cuota, bookmaker, probabilidad implícita y evaluación económica no entran en Scout.

## 5. Contexto competitivo y muestras

Se añadió `CompetitiveFixtureContext`, que conserva cuando existen:

- competición, país, temporada y ronda;
- clasificación cualitativa como liga doméstica, copa doméstica o competición internacional;
- ida, vuelta o partido único/grupo según la ronda disponible;
- agregado cuando el proveedor lo entrega;
- condición local/visitante;
- días medios de descanso ya calculados;
- partido anterior/siguiente y próxima competición cuando se suministran al contrato;
- rotación confirmada o reportada, diferenciando un hecho de un riesgo.

Los perfiles recientes ahora conservan `sample_origins` con fixture, competición, país, temporada, ronda, condición y fecha. El contexto informa si no hay muestra comparable suficiente. No se añadieron coeficientes de probabilidad por tipo de torneo, fase, país o nombre de competición.

## 6. Red Team y pre-vuelo

`RedTeamAtlasResult` reúne evidencia contraria, contradicciones, riesgos de mercado, limitaciones de la estimación, contexto competitivo, alineaciones y lesiones. El modo sencillo presenta como máximo tres elementos.

Una alineación probable sin impacto causal verificado se clasifica como `neutral / no concluyente`; no se fuerza como favorable o desfavorable.

`AtlasPreflight` separa:

- confirmado;
- pendiente no crítico;
- bloqueante.

Revisa identidad del fixture, suficiencia deportiva, línea, contexto competitivo, cuota actual y alineaciones. La ausencia de una cuota o alineación no se transforma por sí sola en bloqueo crítico.

## 7. Director Atlas

DirectorAtlas sigue siendo la única voz pública final. Scout y Red Team son etapas visibles de soporte, no voces paralelas.

El modo sencillo prioriza:

1. contexto del partido;
2. Scout deportivo;
3. contexto Gemini incorporado;
4. Red Team;
5. clasificación operativa cuando hay precios;
6. pre-vuelo;
7. decisión del Director;
8. comparación activa de versiones.

El Director conserva los estados existentes de SÍ, cautela, esperar/revisar y NO. No se redujeron umbrales ni se cambió la metodología para generar más conclusiones positivas.

## 8. Separación deporte/precio

Hay dos salidas diferentes:

- `ScoutAtlasResult`: clasificación deportiva, siempre sin cuotas.
- `OperationalMarketRanking`: solo opciones con una cotización actual y exactamente compatible por fixture, familia, dirección y línea.

La clasificación operativa usa la evaluación económica ya existente (`favorable_preliminary`, `marginal`, `unfavorable`) y puede elegir una alternativa distinta. Esa decisión no reordena ni recalcula Scout.

Las regresiones verifican que cambiar cuota de 1,20 a 2,00, cambiar bookmaker o quitar la cuota no altera candidatos, probabilidad preliminar, intervalo, respaldo ni orden deportivo.

## 9. Casos de cuotas

- Under 3.5 con probabilidad preliminar de 67,4 % y cuota 1,25 sigue siendo desfavorable porque la cuota exige 80 %.
- Una alternativa cotizada de forma independiente puede quedar mejor posicionada operativamente sin desplazar al ganador deportivo.
- Dos cuotas de líneas distintas se mantienen aisladas.
- Una cuota incompatible por línea o dirección no se reutiliza.
- La opción manual explícita conserva prioridad aunque también existan cotizaciones Scout.
- Desde cada tarjeta Scout se pueden reportar casa, cuota y hora; el reanálisis envía todas las cotizaciones completas como contratos separados.

## 10. Partidos iniciados, finalizados y no disponibles

`prematchEligibility` combina el estado normalizado, el kickoff y el reloj actual.

Se excluyen de nuevas candidaturas prepartido:

- iniciado (`1H`);
- descanso (`HT`);
- segundo tiempo (`2H`);
- finalizado (`FT`);
- aplazado (`PST`);
- cancelado (`CANC`);
- otros estados no programados o sin kickoff verificable.

La ruta productiva pasa el reloj real del servidor. Los tests cubren futuro, inicio, descanso, segundo tiempo, final, aplazado, cancelación, Bogotá y cruce de medianoche. El historial previo no se elimina.

## 11. Gemini

Se mantuvo el flujo completamente manual y sin Gemini API.

La acción **Nueva investigación complementaria** limpia:

- texto pegado;
- elementos detectados;
- selección temporal;
- validaciones/alertas temporales;
- comparación activa anterior.

La interfaz distingue **Último reanálisis guardado** de una investigación nueva. El historial, las versiones y el contexto ya incorporado permanecen persistentes.

El filtro previo sigue dejando desmarcados rumores, contradicciones, soporte genérico y hechos sin fuente suficiente. Gemini no puede cambiar fixture, línea, cuota, bookmaker o `line_origin` sin una acción explícita admitida por los contratos.

## 12. Glosario, léxico y UI

Se añadió **¿Cómo leer Atlas?** con definiciones para probabilidad preliminar, intervalo, confianza, respaldo deportivo, línea, cuota, implícita, evaluación de precio, marginal, aptitud, parlay, muestra ponderada y procedencia de línea.

La ayuda usa elementos nativos `details/summary`, `title` y etiquetas accesibles. Funciona con clic, teclado y touch; `title` aporta ayuda de hover sin convertirlo en el único mecanismo.

En la vista sencilla se reemplazó la jerga `sports score` por **Respaldo deportivo**. Se limitan a tres las razones y riesgos. La vista experta conserva contratos, objetos normalizados, procedencia, muestras, Scout, contexto, Red Team, pre-vuelo y ambas clasificaciones.

No se rediseñó la aplicación; se reutilizaron componentes y estilos existentes con tarjetas responsivas.

## 13. Opción manual

Se conserva la selección independiente de familia, dirección y línea, con bookmaker/cuota opcionales. La UI mantiene **Opción evaluada por solicitud del usuario** y `line_origin = user_selected`.

La opción manual sigue calculando su propia probabilidad y evaluación. No reutiliza automáticamente probabilidad, cuota ni evaluación de la opción sugerida por Atlas.

## 14. Historial

- **Nueva búsqueda** sigue limpiando solo la sesión y no llama al historial.
- La eliminación individual continúa como marca auditable, sin romper relaciones versionadas.
- **Borrar todo el historial local** consulta el conteo total real, muestra la cantidad afectada, pide una primera confirmación y exige escribir `BORRAR HISTORIAL`.
- La implementación añade una marca `history_archived_all` al log append-only y oculta eventos anteriores. Es recuperable desde el log y no elimina físicamente configuración, secretos, catálogo, `.env` ni código.
- La exportación JSON existente permanece disponible.

## 15. Pruebas nuevas

Se añadió un archivo con exactamente 64 regresiones, correspondientes a los 64 casos obligatorios. Incluye deporte/precio, Scout, deduplicación, contexto, muestras, cuotas exactas, clasificación operativa, decisiones, Red Team, fixture temporal, Gemini, procedencia de línea, opción manual, accesibilidad, léxico, modo simple/experto, pre-vuelo, historial y exposición de secretos.

Resultado total:

```text
tests: 372
pass: 372
fail: 0
cancelled: 0
skipped: 0
```

Las 308 pruebas existentes permanecen sin modificaciones debilitantes y pasan junto con las 64 nuevas. Los tests no hacen llamadas deportivas externas ni usan Gemini API.

## 16. Validación técnica

| Comando | Resultado |
|---|---|
| `git diff --check` | Correcto, sin errores de espacios ni parches inválidos |
| `npm run lint` | Correcto, 0 errores |
| `npm test` | Correcto, 372/372 |
| `npm run build` | Correcto, compilación Next.js y 15 páginas generadas |
| `npm audit --omit=dev` | No ejecutado: en este entorno local ya se había verificado un fallo de conectividad `ENOTFOUND`; la instrucción exige ejecutarlo solo con conectividad normal y no repetir indefinidamente |

El primer intento de build fue rechazado por el sandbox con `EPERM` al escribir `.next/trace-build`; se repitió con permiso de escritura local y compiló correctamente. No descargó Google Fonts ni otros recursos de fuentes.

## 17. Commits

1. `dc50720 feat: close Atlas V1 local decision flow`
2. `docs: record Atlas V1 local acceptance candidate` (commit exclusivo de este informe)

No se hizo merge a `main` ni se creó tag.

## 18. Limitaciones pendientes

- El modelo deportivo sigue siendo preliminar y no validado con suficiente historial real.
- No se afirma EV validado, ROI, ventaja demostrada, rentabilidad o apuesta segura.
- Próximo partido, agregado, diferencia de categoría, tabla y rotación solo aparecen cuando los contratos reciben datos verificables; Atlas no los inventa.
- La clasificación de liga/copa/internacional es cualitativa y explicativa; no aplica ajustes matemáticos.
- El archivado total es lógico y recuperable por diseño append-only; no compacta físicamente el archivo local.
- No se ejecutó `npm audit` por ausencia previamente comprobada de conectividad normal.

## 19. Aceptación visual/manual requerida

Antes de declarar aceptación de producto conviene revisar manualmente en PC y móvil:

1. orden vertical contexto → Scout → Red Team → precio → Director;
2. legibilidad de 3–5 tarjetas Scout en pantallas estrechas;
3. ingreso y actualización de dos cuotas Scout reales;
4. diferencia visual entre ranking deportivo y operativo;
5. navegación por teclado del glosario y ayudas `?`;
6. flujo touch del glosario y de las cotizaciones;
7. nueva investigación Gemini después de un reanálisis;
8. doble confirmación del archivado total usando datos locales prescindibles;
9. textos SÍ, cautela, esperar y NO con expedientes reales;
10. exclusión visual de un fixture iniciado o finalizado devuelto por el proveedor.

## 20. Declaraciones de alcance

Atlas **no** se convirtió en el Scout externo usado como referencia conceptual. No se copiaron vectores A/B/C, handicap asiático obligatorio, reglas LATAM, umbrales de 96 horas, stake, ROI, “oro”, EV validado ni garantías.

La cuota no interviene en Scout. El modelo sigue siendo preliminar. No se añadieron Supabase, Vercel, Docker, CI/CD, nuevas APIs deportivas, Gemini API ni servicios de pago.

Este documento presenta la rama como **candidato de aceptación local**. La siguiente fase, Atlas Multiplataforma Privado, no se inició.
