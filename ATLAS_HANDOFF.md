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
5. **Verificar Git** (rama, HEAD, tag, working tree) antes de asumir cualquier estado — no confiar en lo que diga este documento sin confirmarlo primero. **A la fecha de esta actualización (2026-09-02), el HEAD real es `b9d60aa` (`b9d60aac45b4c63fcc9e41794677225690956fd2`, commit `fix(atlas): correct settlement-aware decision frontier economics`), rama `audit/atlas-engine-v3`, sincronizada con `origin` tras push (0 ahead/0 behind) — verificarlo de nuevo, no asumirlo eternamente cierto.** Los HEAD anteriores `459e776`, `5de939b`, `d45fe63`, `c77c8d9`, `b9b5efa` y `183419b` (commit documental) quedan como referencia histórica, ya superados.
6. **No tocar Railway sin autorización.**
7. **No consumir cuota API-Football sin autorización** (no ejecutar `verify:phase2`/`verify:operational` ni hacer llamadas reales sin pedirlo explícitamente).
8. **No mezclar implementación, pruebas globales, commit, push y deployment en una sola autorización.** Cada uno requiere confirmación explícita y separada.
9. **Jornada y Radar son modos paralelos** — no se sustituyen entre sí.
10. **Ambas deben terminar soportando las siete familias objetivo** (ver `ATLAS_CONTEXT_MASTER.md`).
11. **Team Asian Handicap todavía no está implementado.**
12. **`asian_total_goals` ya tiene modelado deportivo (Favorabilidad Atlas) y economía (`price_equivalent_probability`, Fair Odds/EV, edges corregidos) completamente implementados y verificados (commit `459e776`), y ahora también una distribución deportiva reutilizable (`buildAsianTotalGoalDistribution`, commit `d45fe63`, ver punto 12bis), pero SIGUE SIN estar integrado a Jornada clásica, Radar ni Individual.** No afirmar integración a Jornada — sigue siendo un gap confirmado, no completado.
12bis. **`buildAsianTotalGoalDistribution(context)` (commit `d45fe63`, `src/core/intelligence/candidateLineGenerator.js`)** compone `buildCanonicalObservations(...marketFamily:"goals") → buildMarketDistribution(...)` — sin fórmula nueva, sin cuotas, sin bookmaker, sin `implied_probability`, sin depender de líneas ofertadas por el proveedor; fuerza `marketFamily:"goals"` para construir la distribución subyacente de goles totales que ya usa la familia `goals`. Probada por 10 tests en `src/core/testing/asianTotalGoalDistribution.test.js`. **Es infraestructura deportiva AISLADA**: `d45fe63` no modificó Jornada, Radar, Individual, `sports_score`/`calculateSportsScore`/`marketCandidateRanker`, `decisionFrontier`, `valueRadarService` ni ningún archivo de UI.
12ter. **`isSettlementFavorabilityCandidate(candidate)` (commit `b9b5efa`, `src/core/intelligence/probabilityClassification.js`)** es el predicado semántico compartido (`probability_semantics==="settlement_favorability"`, con fallback defensivo `market_family==="asian_total_goals"` para candidatos antiguos). `calculateSportsScore` (`marketCandidateRanker.js`) ahora lo usa: para candidatos clásicos, comportamiento **byte-idéntico** al histórico (incluido `probabilityBalance` con ancla 0.68); para `settlement_favorability`, `probabilityBalance` se omite y Solidez se calcula solo con los 6 componentes neutrales (`uncertainty`/`effectiveSample`/`coverage`/`confidence`/`lineStability`/`sensitivity`) renormalizados sobre su peso combinado (0.70). Favorabilidad = atractivo deportivo; Solidez = robustez/calidad de evidencia — quedan explícitamente separados para esta semántica. Probado por 16 tests en `src/core/testing/sportsScoreSettlementFavorability.test.js`. **`b9b5efa` NO tocó** `rankMarketCandidates`, `lineProfiles`, `rankJourneyCandidatesByDecision`, `rankJourneyCandidatesByProbability`, `buildJourneyRecommendationShortlist`, `atlasCombinationEngine.js`, `decisionFrontier.js`, `scoutAtlas.js`, ni Jornada/Radar/Individual/UI.
12quater. **`calculateDecisionEconomics` (commit `b9d60aa`, `src/core/intelligence/decisionFrontier.js`) queda corregido para `settlement_favorability`.** Antes usaba `estimated_probability ?? preliminary_probability` (Favorabilidad Atlas para `asian_total_goals`) como probabilidad literal comparable contra `implied_probability` — reproducido y demostrado con un caso real (Favorabilidad 0.6375, `price_equivalent_probability`≈0.8235, cuota 1.50, implied≈0.6667: la fórmula antigua daba `edge≈-0.0292`, la correcta da `edge≈+0.1569` — **el signo del edge se invertía**, una cuota realmente favorable se veía como desfavorable). Ahora usa `isSettlementFavorabilityCandidate` para ramificar: clásicos conservan el comportamiento histórico exacto; `settlement_favorability` usa `candidate.asian_settlement_profile.price_equivalent_probability` para `edge = price_equivalent_probability − implied_probability`, y `asianExpectedValue(profile, odds)` (reutilizada, no reimplementada) para el EV en vez de la fórmula binaria `probability×odds−1` (inválida con settlement parcial). Sin `price_equivalent_probability` válida: **sin fallback a Favorabilidad, sin edge/EV fabricado** — economía `unavailable` (`edge:null`, `expected_value:null`, `quote_exact:false`), mismo contrato ya existente. Probado por 9 tests en `src/core/testing/decisionFrontierSettlementFavorability.test.js` (reprodujeron el bug antes del fix: 4/9 pass, 5/9 fail; después del fix: 9/9 pass). **`b9d60aa` NO tocó** `rankMarketCandidates`, `calculateSportsScore`, `rankJourneyCandidatesByDecision`, `rankJourneyCandidatesByProbability`, `buildJourneyRecommendationShortlist`, `atlasCombinationEngine.js`, `scoutAtlas.js`, Jornada, Radar, Parlay/Soñadora, UI, ni `asianFairOdds`/`asianExpectedValue`/`asianPriceEquivalentProbability` (solo se corrigió el consumidor).

**Snapshot técnico de `b9d60aa`:** `npm test` 1330/1330 (0 fail), `npm run lint` PASS (0 errores/0 warnings), `npm run build` PASS (Next.js 16.2.12, 22 páginas), `git diff --check` PASS — verificado directamente antes del commit.

**IMPORTANTE — `b9d60aa` NO resuelve toda la comparabilidad de ranking.** Solo corrigió la economía de `decisionFrontier.js`. Un diagnóstico dedicado sigue confirmando que los siguientes sitios leen `estimated_probability`/`preliminary_probability` en crudo, sin ninguna rama de `probability_semantics`, y por tanto seguirían tratando Favorabilidad como probabilidad literal si `asian_total_goals` se conectara hoy: `rankMarketCandidates` (comparador principal), `lineProfiles.most_probable`/`lineProfiles.aggressive`, `rankJourneyCandidatesByDecision`, `rankJourneyCandidatesByProbability`, `buildJourneyRecommendationShortlist`, el motor de combinaciones de Parlay/Soñadora (`atlasCombinationEngine.js`), y `scoutAtlas.js`. **No integrar `asian_total_goals` a `recommendedCandidates` cross-family ni a Jornada asumiendo que la comparabilidad ya está resuelta** — no lo está.

**PRÓXIMA PRIORIDAD — blindar los comparadores de probabilidad cruda:** el bug activo de `decisionFrontier` **ya quedó resuelto en `b9d60aa`** y deja de ser la prioridad inmediata. El siguiente bloque técnico debe auditar/corregir progresivamente los sitios listados arriba, por bloques pequeños (no un mega-commit), empezando por un diagnóstico de dependencias/alcance de cada uno antes de implementar — no asumir que basta con cambiarlos todos a la vez.

13. **Próximo bloque de trabajo actual (no rehacer lo ya terminado):**
    - La distribución deportiva de `asian_total_goals` **ya no es un bloqueo** — resuelta en `d45fe63`.
    - El diseño e implementación de `sports_score` semántico para `settlement_favorability` **ya no es un bloqueo** — resuelto en `b9b5efa`.
    - La economía de `decisionFrontier` para `settlement_favorability` **ya no es un bloqueo** — resuelta en `b9d60aa`.
    - Orden recomendado del próximo bloque:
      1. auditar/corregir progresivamente los comparadores restantes que leen probabilidad cruda (`rankMarketCandidates`, `lineProfiles`, `rankJourneyCandidatesByDecision`, `rankJourneyCandidatesByProbability`, `buildJourneyRecommendationShortlist`, `atlasCombinationEngine.js`, `scoutAtlas.js`) — diagnóstico de dependencias/alcance primero, implementación gradual por bloques pequeños después, cada uno con su propia verificación;
      2. definir el ranking interno de Asian Total: Favorabilidad como atractivo + Solidez como evidencia, sin convertir uno en el otro;
      3. diseñar la separación de `candidates` vs. shortlist cross-family para `asian_total_goals` (dos shortlists o filtro por semántica, sin implicar que fue descartado por peor);
      4. solo después, conectar la fábrica deportiva de `asian_total_goals` (`buildAsianTotalGoalDistribution` + `generateAsianTotalGoalLines` + `evaluateExactMarketLine`) a Jornada;
      5. adaptar la presentación de `JourneyCandidateCard` para Favorabilidad/Solidez;
      6. solo entonces validar la integración completa en Jornada;
      7. después, `team_asian_handicap`;
      8. Railway únicamente cuando la fase local esté suficientemente estable.
    - Además, sigue pendiente (sin cambio de orden): consolidar arquitectura de mercados (resolver los ~16 catálogos duplicados detectados); auditar la amplitud real del universo de candidatos del Radar (pendiente de investigación abierto en `ATLAS_DECISIONS_LOG.md`, sin resolver); solo después, continuar con Parlay/Soñadora/LIVE/Memoria/Bet Tracker según compatibilidad.
    - **No meter varias de estas tareas en un solo commit** — cada paso requiere su propia autorización y verificación separada.

---

## Prompt de rescate versionado (añadido 2026-09-01)

El "Prompt de rescate ATLAS" externo, guardado por el usuario en Bloc de notas (fuera de este repositorio), **es versionado**.

Cuando cambie una decisión estructural importante del proyecto — filosofía de Jornada, Radar, mercados, proveedor, persistencia, arquitectura, workflow, o reglas económicas — el coordinador **debe advertir al usuario** que el prompt anterior quedó parcialmente obsoleto y **entregar una nueva versión completa** para reemplazarlo. No depender de que el usuario edite manualmente fragmentos sueltos del prompt anterior.

> **El prompt de rescate más reciente siempre prevalece sobre versiones anteriores.**

**Estado a 2026-09-01 (post commit `459e776`):** la corrección de modelado/economía asiática (Favorabilidad Atlas, `price_equivalent_probability`, Fair Odds/EV, edges corregidos) es exactamente el tipo de decisión estructural que activa esta regla. **El prompt de rescate externo anterior queda parcialmente obsoleto** y debe reemplazarse por una nueva versión completa — **RESCATE ATLAS v3** — que el coordinador debe generar después de que el usuario acepte esta actualización documental. No se escribe aquí el prompt externo completo (vive fuera del repositorio, en Bloc de notas); esta sección solo registra que corresponde generarlo.

**Nota incremental (post commits `d45fe63`, `b9b5efa` y `b9d60aa`):** RESCATE ATLAS v3 sigue siendo el último rescate completo vigente, pero su snapshot de Git ya está anterior a los tres commits (distribución deportiva Asian Total aislada, `sports_score` semántico para `settlement_favorability`, y economía settlement-aware de `decisionFrontier`, ninguno integrado todavía a Jornada/Radar/Individual). Los tres son cambios incrementales y aislados — no activan por sí solos la regla de reemplazo de rescate completo. **No se declara todavía RESCATE ATLAS v4 obligatorio.** El próximo rescate completo deberá incorporar `d45fe63`, `b9b5efa`, `b9d60aa` y los cambios posteriores (comparadores de probabilidad cruda restantes, conexión a Jornada) cuando se cierre la fase de integración/ranking de Asian Total, o cuando ocurra otra decisión estructural mayor — no por cada commit pequeño.

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
