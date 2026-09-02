# Checkpoint — 2026-09-01 — Post modelado/economía Asian Total Goals (commit `459e776`)

> Fotografía histórica de un momento concreto. No se actualiza — para el estado vivo ver `ATLAS_CURRENT_STATE.md`; para arquitectura estable, `ATLAS_CONTEXT_MASTER.md`; para decisiones, `ATLAS_DECISIONS_LOG.md`. **No modifica** el checkpoint anterior (`2026-09-01-v3.0.1-pre-asian-market-integration.md`), que sigue siendo histórico e intacto.

## Identidad del checkpoint

- HEAD: `459e776579ac510aff8684e320431c6d103c1ad6` (`459e776`)
- Rama: `audit/atlas-engine-v3`
- Origin: sincronizado, **0 ahead / 0 behind** (verificado tras `git push`, no supuesto)
- Commits desde el checkpoint anterior: `02d6cbf` (respaldo canónico documental) → `459e776` (`feat(atlas): improve asian totals modeling and value economics`)
- **Sin deploy a Railway. Sin tag nuevo.** El tag `v3.0.1-stable` sigue apuntando a `2459118`, no a `459e776`.

## Verificación técnica (ejecutada directamente, no reportada de fuera)

- `npm test`: **1295 / 1295 / 0**
- `npm run lint`: **PASS — 0 errores, 0 warnings**
- `npm run build`: **PASS** (Next.js `16.2.12`, Turbopack)
- `git diff --check`: **PASS**

## HECHOS DE CÓDIGO (verificados, implementados y probados en `459e776`)

- **Favorabilidad Atlas** (`sports_favorability`, `/100`) reemplaza `weighted_win_probability` como métrica deportiva principal de `asian_total_goals`: `FW + 0.75·HW + 0.5·Push + 0.25·HL`. No es probabilidad literal.
- Generación autónoma de líneas asiáticas soporta matemáticamente cualquier línea no negativa en pasos de `0.25`, sin catálogo rígido.
- **`price_equivalent_probability = W/(W+L) = 1/FairOdds`** — nueva magnitud económica, comparable en PP contra la probabilidad implícita; signo siempre coherente con el signo del EV (demostrado y probado para `.0/.25/.5/.75`).
- `asianFairOdds`/`asianExpectedValue` auditadas: **correctas, sin cambio de fórmula**.
- `raw_edge_pp` corregido: `(price_equivalent_probability − implied) × 100`, reemplazando la fórmula antigua (`weighted_win_probability − implied`) que podía dar edge negativo exactamente en el precio justo.
- `conservative_edge_pp` corregido: usa un intervalo económico propio (`price_equivalent_probability_low/high`, aproximación Wilson sobre la masa decisiva `W+L`) — **ya no usa el intervalo de Favorabilidad**. `null` cuando no hay límite válido, nunca `0` inventado.
- Clasificación del Radar (`NO_VALUE`/`INTERESTING`/`WATCH`) y `DirectorAtlas` (`parlay_eligibility_reason`) actualizados para usar las magnitudes correctas — la regresión previa que podía sesgar clasificación/veredicto quedó corregida.
- Presentación separada: DEPORTIVO (Favorabilidad `/100`, Solidez `/100`) vs. ECONÓMICO (Cuota justa, Probabilidad equivalente Atlas por precio, Probabilidad implícita, Brecha de precio, Brecha conservadora, EV técnico) + perfil de settlement de 5 estados cuando disponible.

## DECISIONES FUNCIONALES (confirmadas, algunas ya implementadas, otras siguen como principio)

- Favorabilidad Atlas y `price_equivalent_probability` son nombres/contratos estructurales confirmados (`ATLAS_DECISIONS_LOG.md`, decisiones 33-45).
- No-vig para asiáticos: pendiente futuro — cuando se implemente, debe usar `price_equivalent_probability`, nunca Favorabilidad/Solidez/`weighted_win_probability` aislada.
- Compatibilidad con perfiles antiguos sin `price_equivalent_probability`: por diseño, no se reinterpreta Favorabilidad como magnitud económica; los campos nuevos quedan `null`. Reconstrucción desde `W`/`L` de un perfil antiguo es matemáticamente posible pero **deliberadamente no implementada** — pendiente futuro, no bug bloqueante.

## PENDIENTES (sin resolver, explícitamente no marcados como completados)

- **`asian_total_goals` sigue SIN integrarse a Jornada clásica** — gap confirmado frente al catálogo objetivo de siete familias, no un comportamiento final deseado.
- **`team_asian_handicap` sigue SIN implementarse** — aprobado para diseño/desarrollo futuro, identidad propuesta `fixture_id + market_family + team_id + line` + `side: home|away` (nunca `direction=over|under`), soporte requerido para líneas firmadas en pasos de cuarto.
- Universo de exploración del Radar: sigue como pregunta abierta, no resuelta en esta fase.
- Drift de ~16 catálogos de familias de mercado: sin tocar en esta fase.
- Hallazgo "174 candidatos / 0 cuotas exactas": sin relación con esta fase, causa operacional exacta sigue sin demostrarse.
- Toda la verificación manual en UI real (análisis individual asiático completo, DirectorAtlas real, Parlay/Soñadora/LIVE/Memoria/Bet Tracker) — pendiente, ver `ATLAS_MANUAL_TESTS.md`.

## Próximos pasos recomendados (recomendación, no implementación)

1. Cerrar esta actualización documental y generar **RESCATE ATLAS v3** (prompt de rescate externo actualizado).
2. Decidir arquitectura del catálogo canónico de mercados para eliminar el drift de listas duplicadas.
3. Diseñar la integración de `asian_total_goals` en Jornada clásica sin alterar la filosofía SPORTS-FIRST.
4. Implementar `team_asian_handicap` deportivo, independiente de cuotas.
5. Integrar Team Asian Handicap a Jornada/Radar.
6. Auditar la amplitud real del universo de candidatos del Radar.
7. Continuar con Parlay/Soñadora/LIVE/Memoria/Bet Tracker según compatibilidad.
8. Railway solo cuando la fase local esté suficientemente estable.

No se agrega `fouls`/`throw_ins` al catálogo objetivo actual — queda como idea futura sujeta a disponibilidad real de datos, sin decisión tomada.
