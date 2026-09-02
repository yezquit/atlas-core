# ATLAS — INSTRUCCIONES DE REANUDACIÓN

> Documento corto diseñado para iniciar un **nuevo chat** sin reconstruir conversaciones anteriores. No repite arquitectura ni decisiones — solo indica dónde leerlas y cómo proceder con seguridad.

1. **No inventar nunca el estado del código.** Todo lo que se afirme sobre Atlas debe verificarse contra el repositorio, no contra la memoria de la conversación.
2. **El coordinador del chat no tiene acceso directo garantizado al repositorio.**
3. **Actualmente las inspecciones/modificaciones se están realizando mediante Cloud** (Claude Code sobre `/Users/yezidquitian/Documents/atlas-core`).
4. **Antes de cualquier cambio, hacer que Cloud lea, en este orden:**
   - `AGENTS.md`
   - `ATLAS_CONTEXT_MASTER.md`
   - `ATLAS_CURRENT_STATE.md`
   - `ATLAS_DECISIONS_LOG.md`
   - `ATLAS_MANUAL_TESTS.md`
5. **Verificar Git** (rama, HEAD, tag, working tree) antes de asumir cualquier estado — no confiar en lo que diga este documento sin confirmarlo primero. **A la fecha de esta actualización (2026-09-01), el HEAD real es `d45fe63` (`d45fe63b855b6b927a9feaf5fe780b91d19a460a`, commit `feat(atlas): add asian total sports distribution builder`), rama `audit/atlas-engine-v3`, sincronizada con `origin` tras push (0 ahead/0 behind) — verificarlo de nuevo, no asumirlo eternamente cierto.** Los HEAD anteriores `459e776` y `5de939b` (commit documental) quedan como referencia histórica, ya superados.
6. **No tocar Railway sin autorización.**
7. **No consumir cuota API-Football sin autorización** (no ejecutar `verify:phase2`/`verify:operational` ni hacer llamadas reales sin pedirlo explícitamente).
8. **No mezclar implementación, pruebas globales, commit, push y deployment en una sola autorización.** Cada uno requiere confirmación explícita y separada.
9. **Jornada y Radar son modos paralelos** — no se sustituyen entre sí.
10. **Ambas deben terminar soportando las siete familias objetivo** (ver `ATLAS_CONTEXT_MASTER.md`).
11. **Team Asian Handicap todavía no está implementado.**
12. **`asian_total_goals` ya tiene modelado deportivo (Favorabilidad Atlas) y economía (`price_equivalent_probability`, Fair Odds/EV, edges corregidos) completamente implementados y verificados (commit `459e776`), y ahora también una distribución deportiva reutilizable (`buildAsianTotalGoalDistribution`, commit `d45fe63`, ver punto 12bis), pero SIGUE SIN estar integrado a Jornada clásica, Radar ni Individual.** No afirmar integración a Jornada — sigue siendo un gap confirmado, no completado.
12bis. **`buildAsianTotalGoalDistribution(context)` (commit `d45fe63`, `src/core/intelligence/candidateLineGenerator.js`)** compone `buildCanonicalObservations(...marketFamily:"goals") → buildMarketDistribution(...)` — sin fórmula nueva, sin cuotas, sin bookmaker, sin `implied_probability`, sin depender de líneas ofertadas por el proveedor; fuerza `marketFamily:"goals"` para construir la distribución subyacente de goles totales que ya usa la familia `goals`. Probada por 10 tests nuevos en `src/core/testing/asianTotalGoalDistribution.test.js`. **Es infraestructura deportiva AISLADA**: `d45fe63` no modificó Jornada, Radar, Individual, `sports_score`/`calculateSportsScore`/`marketCandidateRanker`, `decisionFrontier`, `valueRadarService` ni ningún archivo de UI. No integrarla productivamente sin una autorización separada.

**Snapshot técnico de `d45fe63`:** `npm test` 1305/1305 (0 fail), `npm run lint` PASS (0 errores/0 warnings), `npm run build` PASS (Next.js 16.2.12, 22 páginas), `git diff --check` PASS — verificado directamente antes del commit.

13. **Próximo bloque de trabajo actual (no rehacer lo ya terminado):**
    - La distribución deportiva de `asian_total_goals` (media/percentiles/dispersión sin cuotas) **ya no es un bloqueo** — resuelta e implementada en `d45fe63` (`buildAsianTotalGoalDistribution`), aislada y probada.
    - **Bloqueo técnico principal actual: diseño de la semántica de `sports_score`/ranking para `probability_semantics==="settlement_favorability"`.** `calculateSportsScore` (`marketCandidateRanker.js`) contiene `probabilityBalance = clamp(100 − |probability−0.68|×180)`, diseñado alrededor de una magnitud tratada como probabilidad literal de ganar. **No está demostrado** que sea semánticamente correcto alimentar ese componente directamente con `sports_favorability`, aunque ambos estén numéricamente en `[0,1]`: dos perfiles de settlement pueden tener Favorabilidad similar con distribuciones `FW/HW/Push/HL/FL` muy distintas (ver `ATLAS_DECISIONS_LOG.md`, decisión 52). No integrar `asian_total_goals` al ranking cross-family de Jornada reutilizando `probabilityBalance` sin una decisión semántica explícita.
    - Orden recomendado del próximo bloque:
      1. diseñar la semántica de `sports_score` para `settlement_favorability`;
      2. preservar sin cambios los 6 componentes semánticamente neutrales ya identificados (`uncertainty`, `effectiveSample`, `coverage`, `confidence`, `lineStability`, `sensitivity`) donde sea posible;
      3. decidir cómo tratar el componente `probabilityBalance` para esta semántica (sin inventar todavía un nuevo "punto dulce" para Favorabilidad sin evidencia empírica);
      4. decidir elegibilidad provisional de `asian_total_goals` en `recommendedCandidates` cross-family (posiblemente separada del resto hasta resolver comparabilidad);
      5. solo después, conectar la fábrica deportiva de `asian_total_goals` (`buildAsianTotalGoalDistribution` + `generateAsianTotalGoalLines` + `evaluateExactMarketLine`) a Jornada;
      6. mantener el catálogo completo de candidatos separado de la shortlist para evitar inundación por múltiples líneas asiáticas por fixture.
    - Además, sigue pendiente (sin cambio de orden): consolidar arquitectura de mercados (resolver los ~16 catálogos duplicados detectados); diseñar/implementar `team_asian_handicap` (deportivo, independiente de cuotas, antes de integrarlo a Jornada/Radar); auditar la amplitud real del universo de candidatos del Radar (pendiente de investigación abierto en `ATLAS_DECISIONS_LOG.md`, sin resolver); solo después, continuar con Parlay/Soñadora/LIVE/Memoria/Bet Tracker según compatibilidad; Railway únicamente cuando la fase local esté suficientemente estable.

---

## Prompt de rescate versionado (añadido 2026-09-01)

El "Prompt de rescate ATLAS" externo, guardado por el usuario en Bloc de notas (fuera de este repositorio), **es versionado**.

Cuando cambie una decisión estructural importante del proyecto — filosofía de Jornada, Radar, mercados, proveedor, persistencia, arquitectura, workflow, o reglas económicas — el coordinador **debe advertir al usuario** que el prompt anterior quedó parcialmente obsoleto y **entregar una nueva versión completa** para reemplazarlo. No depender de que el usuario edite manualmente fragmentos sueltos del prompt anterior.

> **El prompt de rescate más reciente siempre prevalece sobre versiones anteriores.**

**Estado a 2026-09-01 (post commit `459e776`):** la corrección de modelado/economía asiática (Favorabilidad Atlas, `price_equivalent_probability`, Fair Odds/EV, edges corregidos) es exactamente el tipo de decisión estructural que activa esta regla. **El prompt de rescate externo anterior queda parcialmente obsoleto** y debe reemplazarse por una nueva versión completa — **RESCATE ATLAS v3** — que el coordinador debe generar después de que el usuario acepte esta actualización documental. No se escribe aquí el prompt externo completo (vive fuera del repositorio, en Bloc de notas); esta sección solo registra que corresponde generarlo.

**Nota incremental (post commit `d45fe63`):** RESCATE ATLAS v3 sigue siendo el último rescate completo vigente, pero su snapshot de Git quedó anterior a `d45fe63` (implementación aislada de `buildAsianTotalGoalDistribution`, sin integración a Jornada/Radar/Individual/`sports_score`). Este cambio es incremental y aislado — no activa por sí solo la regla de reemplazo de rescate completo. **No se declara todavía RESCATE ATLAS v4 obligatorio.** El próximo rescate completo deberá incorporar `d45fe63` y los cambios posteriores cuando se cierre la fase de integración/ranking de Asian Total (diseño de `sports_score` semántico + conexión a Jornada) o cuando ocurra otra decisión estructural mayor — no por cada commit pequeño.

---

## PROMPT CORTO PARA NUEVO CHAT

Copiar y pegar al iniciar un chat nuevo:

```
Estoy retomando el proyecto Atlas (/Users/yezidquitian/Documents/atlas-core).
No reconstruyas el contexto desde la memoria de esta conversación: lee primero
AGENTS.md, luego ATLAS_CONTEXT_MASTER.md, ATLAS_CURRENT_STATE.md,
ATLAS_DECISIONS_LOG.md y ATLAS_MANUAL_TESTS.md en ese orden, y verifica el
estado real de Git antes de asumir nada. Esta tarea es de [diagnóstico /
implementación — especifica cuál] y el alcance es exactamente: [describe
la tarea concreta]. No toques Railway, no consumas cuota de API-Football,
y no mezcles commit/push/deploy con la tarea salvo que yo lo autorice
explícitamente en este mensaje.
```
