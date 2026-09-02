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
5. **Verificar Git** (rama, HEAD, tag, working tree) antes de asumir cualquier estado — no confiar en lo que diga este documento sin confirmarlo primero. **A la fecha de esta actualización (2026-09-01), el HEAD real es `b9b5efa` (`b9b5efa123f507157fdd83efd7549c3985482488`, commit `feat(atlas): add semantic sports score for settlement favorability`), rama `audit/atlas-engine-v3`, sincronizada con `origin` tras push (0 ahead/0 behind) — verificarlo de nuevo, no asumirlo eternamente cierto.** Los HEAD anteriores `459e776`, `5de939b`, `d45fe63` y `c77c8d9` (commit documental) quedan como referencia histórica, ya superados.
6. **No tocar Railway sin autorización.**
7. **No consumir cuota API-Football sin autorización** (no ejecutar `verify:phase2`/`verify:operational` ni hacer llamadas reales sin pedirlo explícitamente).
8. **No mezclar implementación, pruebas globales, commit, push y deployment en una sola autorización.** Cada uno requiere confirmación explícita y separada.
9. **Jornada y Radar son modos paralelos** — no se sustituyen entre sí.
10. **Ambas deben terminar soportando las siete familias objetivo** (ver `ATLAS_CONTEXT_MASTER.md`).
11. **Team Asian Handicap todavía no está implementado.**
12. **`asian_total_goals` ya tiene modelado deportivo (Favorabilidad Atlas) y economía (`price_equivalent_probability`, Fair Odds/EV, edges corregidos) completamente implementados y verificados (commit `459e776`), y ahora también una distribución deportiva reutilizable (`buildAsianTotalGoalDistribution`, commit `d45fe63`, ver punto 12bis), pero SIGUE SIN estar integrado a Jornada clásica, Radar ni Individual.** No afirmar integración a Jornada — sigue siendo un gap confirmado, no completado.
12bis. **`buildAsianTotalGoalDistribution(context)` (commit `d45fe63`, `src/core/intelligence/candidateLineGenerator.js`)** compone `buildCanonicalObservations(...marketFamily:"goals") → buildMarketDistribution(...)` — sin fórmula nueva, sin cuotas, sin bookmaker, sin `implied_probability`, sin depender de líneas ofertadas por el proveedor; fuerza `marketFamily:"goals"` para construir la distribución subyacente de goles totales que ya usa la familia `goals`. Probada por 10 tests en `src/core/testing/asianTotalGoalDistribution.test.js`. **Es infraestructura deportiva AISLADA**: `d45fe63` no modificó Jornada, Radar, Individual, `sports_score`/`calculateSportsScore`/`marketCandidateRanker`, `decisionFrontier`, `valueRadarService` ni ningún archivo de UI.
12ter. **`isSettlementFavorabilityCandidate(candidate)` (commit `b9b5efa`, `src/core/intelligence/probabilityClassification.js`)** es el predicado semántico compartido (`probability_semantics==="settlement_favorability"`, con fallback defensivo `market_family==="asian_total_goals"` para candidatos antiguos). `calculateSportsScore` (`marketCandidateRanker.js`) ahora lo usa: para candidatos clásicos, comportamiento **byte-idéntico** al histórico (incluido `probabilityBalance` con ancla 0.68); para `settlement_favorability`, `probabilityBalance` se omite y Solidez se calcula solo con los 6 componentes neutrales (`uncertainty`/`effectiveSample`/`coverage`/`confidence`/`lineStability`/`sensitivity`) renormalizados sobre su peso combinado (0.70). Favorabilidad = atractivo deportivo; Solidez = robustez/calidad de evidencia — quedan explícitamente separados para esta semántica. Probado por 16 tests nuevos en `src/core/testing/sportsScoreSettlementFavorability.test.js`. **`b9b5efa` NO tocó** `rankMarketCandidates`, `lineProfiles`, `rankJourneyCandidatesByDecision`, `rankJourneyCandidatesByProbability`, `buildJourneyRecommendationShortlist`, `atlasCombinationEngine.js`, `decisionFrontier.js`, `scoutAtlas.js`, ni Jornada/Radar/Individual/UI.

**Snapshot técnico de `b9b5efa`:** `npm test` 1321/1321 (0 fail), `npm run lint` PASS (0 errores/0 warnings), `npm run build` PASS (Next.js 16.2.12, 22 páginas), `git diff --check` PASS — verificado directamente antes del commit.

**IMPORTANTE — `b9b5efa` NO resuelve toda la comparabilidad de ranking.** Solo corrigió `calculateSportsScore`. Un diagnóstico dedicado confirmó que los siguientes sitios siguen leyendo `estimated_probability`/`preliminary_probability` en crudo, sin ninguna rama de `probability_semantics`, y por tanto seguirían tratando Favorabilidad como probabilidad literal si `asian_total_goals` se conectara hoy: `rankMarketCandidates` (comparador principal), `lineProfiles.most_probable`/`lineProfiles.aggressive`, `rankJourneyCandidatesByDecision`, `rankJourneyCandidatesByProbability`, `buildJourneyRecommendationShortlist`, el motor de combinaciones de Parlay/Soñadora (`atlasCombinationEngine.js`), y `scoutAtlas.js`. **No integrar `asian_total_goals` a `recommendedCandidates` cross-family ni a Jornada asumiendo que `b9b5efa` resolvió toda la comparabilidad** — no la resolvió.

**BUG ACTIVO CONFIRMADO — próxima prioridad inmediata, independiente de la integración a Jornada:** `calculateDecisionEconomics` en `src/core/intelligence/decisionFrontier.js` todavía usa `estimated_probability ?? preliminary_probability` como probabilidad literal para calcular `edge = probability − implied` cuando existe cuota exacta. Para `asian_total_goals` ese valor es Favorabilidad, no una probabilidad comparable contra `implied` — el mismo patrón ya corregido en `valueRadar.js` (que usa `price_equivalent_probability`) pero **nunca propagado a `decisionFrontier.js`**. Un diagnóstico confirmó que esto es **alcanzable hoy en producción** vía `operationalAnalysisService.js:775` → `marketCandidateRanker.js:273` (flujo de "Análisis individual"/"mercado específico" con `asian_total_goals` + cuota exacta, automática del proveedor o pegada manualmente) — no es solo teórico. Debe corregirse (usando `price_equivalent_probability`, la referencia económica settlement-aware ya implementada) antes de continuar con integración/ranking más amplio. No corregido todavía.

13. **Próximo bloque de trabajo actual (no rehacer lo ya terminado):**
    - La distribución deportiva de `asian_total_goals` **ya no es un bloqueo** — resuelta en `d45fe63`.
    - El diseño e implementación de `sports_score` semántico para `settlement_favorability` **ya no es un bloqueo** — resuelto en `b9b5efa` (`calculateSportsScore` + `isSettlementFavorabilityCandidate`).
    - Orden recomendado del próximo bloque:
      1. corregir el bug activo de `calculateDecisionEconomics` en `decisionFrontier.js` para `settlement_favorability` (usar `price_equivalent_probability`, no probabilidad literal);
      2. probarlo de forma focalizada y luego con `npm test` global;
      3. auditar/corregir progresivamente los comparadores restantes que leen probabilidad cruda (`rankMarketCandidates`, `lineProfiles`, `rankJourneyCandidatesByDecision`, `rankJourneyCandidatesByProbability`, `buildJourneyRecommendationShortlist`, `atlasCombinationEngine.js`, `scoutAtlas.js`) — no en un solo commit, cada uno con su propia verificación;
      4. diseñar la separación de `candidates` vs. shortlist cross-family para `asian_total_goals` (dos shortlists o filtro por semántica, sin implicar que fue descartado por peor);
      5. solo después, conectar la fábrica deportiva de `asian_total_goals` (`buildAsianTotalGoalDistribution` + `generateAsianTotalGoalLines` + `evaluateExactMarketLine`) a Jornada;
      6. adaptar la presentación de `JourneyCandidateCard` para Favorabilidad/Solidez;
      7. solo entonces validar la integración completa en Jornada;
      8. después, `team_asian_handicap`;
      9. Railway únicamente cuando la fase local esté suficientemente estable.
    - Además, sigue pendiente (sin cambio de orden): consolidar arquitectura de mercados (resolver los ~16 catálogos duplicados detectados); auditar la amplitud real del universo de candidatos del Radar (pendiente de investigación abierto en `ATLAS_DECISIONS_LOG.md`, sin resolver); solo después, continuar con Parlay/Soñadora/LIVE/Memoria/Bet Tracker según compatibilidad.
    - **No meter varias de estas tareas en un solo commit** — cada paso requiere su propia autorización y verificación separada.

---

## Prompt de rescate versionado (añadido 2026-09-01)

El "Prompt de rescate ATLAS" externo, guardado por el usuario en Bloc de notas (fuera de este repositorio), **es versionado**.

Cuando cambie una decisión estructural importante del proyecto — filosofía de Jornada, Radar, mercados, proveedor, persistencia, arquitectura, workflow, o reglas económicas — el coordinador **debe advertir al usuario** que el prompt anterior quedó parcialmente obsoleto y **entregar una nueva versión completa** para reemplazarlo. No depender de que el usuario edite manualmente fragmentos sueltos del prompt anterior.

> **El prompt de rescate más reciente siempre prevalece sobre versiones anteriores.**

**Estado a 2026-09-01 (post commit `459e776`):** la corrección de modelado/economía asiática (Favorabilidad Atlas, `price_equivalent_probability`, Fair Odds/EV, edges corregidos) es exactamente el tipo de decisión estructural que activa esta regla. **El prompt de rescate externo anterior queda parcialmente obsoleto** y debe reemplazarse por una nueva versión completa — **RESCATE ATLAS v3** — que el coordinador debe generar después de que el usuario acepte esta actualización documental. No se escribe aquí el prompt externo completo (vive fuera del repositorio, en Bloc de notas); esta sección solo registra que corresponde generarlo.

**Nota incremental (post commits `d45fe63` y `b9b5efa`):** RESCATE ATLAS v3 sigue siendo el último rescate completo vigente, pero su snapshot de Git ya está anterior a ambos commits (distribución deportiva Asian Total aislada, y `sports_score` semántico para `settlement_favorability`, ninguno integrado todavía a Jornada/Radar/Individual). Ambos son cambios incrementales y aislados — no activan por sí solos la regla de reemplazo de rescate completo. **No se declara todavía RESCATE ATLAS v4 obligatorio.** El próximo rescate completo deberá incorporar `d45fe63`, `b9b5efa` y los cambios posteriores (corrección de `decisionFrontier`, comparadores restantes, conexión a Jornada) cuando se cierre la fase de integración/ranking de Asian Total, o cuando ocurra otra decisión estructural mayor — no por cada commit pequeño.

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
