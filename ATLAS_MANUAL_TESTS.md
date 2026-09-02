# Atlas — Checklist de pruebas manuales

> Checklist reutilizable. Estados: `[ ]` pendiente · `[x]` aprobado (requiere evidencia registrada junto al ítem: fecha + qué se observó) · `[!]` hallazgo (comportamiento anómalo o gap confirmado, con referencia al diagnóstico que lo respalda).
>
> **Regla:** no marcar `[x]` sin evidencia observada directamente. Un hallazgo de un diagnóstico de código no habilita marcar `[x]` — solo respalda un `[!]` hasta que se pruebe manualmente en la UI.

---

## Análisis individual

- [ ] Familia clásica (goals/corners/cards/total_shots/shots_on_goal) — flujo completo produce veredicto
- [ ] `asian_total_goals` — flujo completo con línea manual exacta
- [ ] Cuota exacta ("cuota") aceptada y validada correctamente
- [ ] Gemini — prompt generado, pegado manual parseado, evidencia seleccionable
- [ ] Orden cuota → Gemini — el veredicto/precio no se corrompe tras reanálisis Gemini
- [ ] Orden Gemini → cuota — el contexto Gemini se conserva tras evaluar precio
- [ ] Preservación de snapshot económico al reanalizar (`bbb4534`/`2459118`) — probar ambos órdenes explícitamente
- [ ] DirectorAtlas — veredicto deportivo, evaluación de precio y decisión final se muestran coherentes

## Jornada clásica

- [ ] `goals` — genera candidatos, aparece en ranking
- [ ] `corners` — ídem
- [ ] `cards` — ídem
- [ ] `total_shots` — ídem
- [ ] `shots_on_goal` — ídem
- [ ] `asian_total_goals` (futuro, tras integración) — genera candidatos, aparece en ranking
- [ ] `team_asian_handicap` (futuro, tras implementación) — genera candidatos, aparece en ranking
- [ ] `candidates` (catálogo completo / "otras opciones analizadas") se muestra correctamente
- [ ] `recommendedCandidates` se muestra correctamente
- [ ] Claridad visual — ningún fixture evaluado se muestra como "0%" falso

**[!] Hallazgo actual (confirmado por diagnóstico de código, pendiente de verificación visual directa):** `asian_total_goals` no aparece actualmente en Jornada clásica — ausente del checkbox "Mercados de interés" y del loop de evaluación automática (`src/core/intelligence/marketEngine.js:3-9`, `src/app/atlas-functional-client.js:2100,2819-2828`).

## Radar de Valor

Probar por familia:

- [ ] `goals`
- [ ] `corners`
- [ ] `cards`
- [ ] `total_shots`
- [ ] `shots_on_goal`
- [ ] `asian_total_goals`
- [ ] `team_asian_handicap` (futuro)

Además:

- [ ] Cuota exacta disponible — candidato se marca correctamente
- [ ] Sin cuota — candidato se degrada correctamente (sin error, sin dato falso)
- [ ] Fair odds calculado y mostrado
- [ ] Edge (conservador) calculado y mostrado
- [ ] EV técnico calculado y mostrado
- [ ] Estado "no evaluable" se comunica con claridad al usuario
- [ ] Universo de candidatos — verificar de dónde parte (ver pendiente de investigación en `ATLAS_DECISIONS_LOG.md`)
- [ ] Posible oportunidad de valor que no destaque en el ranking clásico — probar si Radar la encuentra igual

**[!] Hallazgo actual:** una prueba manual mostró 174 candidatos deportivos y 0 cuotas exactas; mecanismo de código conocido (`src/core/services/valueRadarService.js:~138-149`), causa operacional exacta no demostrada (ver `ATLAS_CURRENT_STATE.md`).

## Parlay

- [ ] Registro manual de combinación con familias clásicas
- [ ] Bloqueo de líneas `.25`/`.75` de `asian_total_goals` en combinadas (verificar mensaje explícito)
- [ ] `team_asian_handicap` (futuro) — verificar política de inclusión/exclusión una vez implementado

## Soñadora

- [ ] Registro manual de combinación "Soñadora"
- [ ] Mismas verificaciones de bloqueo de líneas asiáticas que Parlay

## LIVE

- [ ] Pipeline LIVE separado del prepartido — snapshot fresco y cuotas en vivo
- [ ] Persistencia en memoria de 15 minutos, desaparición al reiniciar si no se guarda

## Memoria

- [ ] Registro append-only NDJSON — ninguna edición manual necesaria para operar normalmente
- [ ] Resolución de predicción oficial para familias clásicas
- [ ] Resolución de predicción oficial para `asian_total_goals` (settlement de 5 estados)

## Bet Tracker

- [ ] Registro de apuesta individual — familias clásicas
- [ ] Registro y liquidación de apuesta `asian_total_goals` (botones "Media ganada"/"Media perdida"/"Push")
- [ ] `team_asian_handicap` (futuro) — liquidación una vez implementado

## Modelado independiente de cuotas y matemática de value (añadido 2026-09-01)

> Ninguno de estos ítems debe marcarse `[x]` hasta que exista implementación y evidencia observada directamente. Complementan, no sustituyen, los ítems ya listados arriba en Jornada clásica / Radar de Valor.

- [ ] Candidato clásico (goals/corners/cards/total_shots/shots_on_goal) generado y rankeado sin cuota disponible, sin degradar probabilidad/incertidumbre/Solidez/ranking
- [ ] Candidato `asian_total_goals` generado y evaluado deportivamente sin cuota disponible del proveedor
- [ ] Candidato `team_asian_handicap` (futuro) generado y evaluado deportivamente sin cuota disponible del proveedor
- [ ] Entrada manual de cuota exacta cuando el proveedor no la ofrece, preservando identidad exacta de la selección
- [ ] Cálculo de brecha en puntos porcentuales (PP) entre probabilidad Atlas y probabilidad implícita, para una selección/línea exacta
- [ ] Verificar que Solidez Atlas nunca se usa como probabilidad en el cálculo de PP/edge (regla inviolable)
- [ ] Cálculo no-vig cuando existen ambos lados verificables de la misma línea exacta
- [ ] Rechazo explícito de comparación entre líneas diferentes (ej. Over 7.5 vs. Under 7.0) para no-vig
- [ ] Fair odds/EV correcto en mercado binario simple sin push
- [ ] Fair odds/EV correcto en mercado asiático respetando full_win/half_win/push/half_loss/full_loss (no reducido a `1/P_ganar`)
- [ ] Transición visible de "oportunidad por cotizar" a "oportunidad evaluada" cuando aparece una cuota exacta, sin declarar `VALUE BET CONFIRMADA` antes de tiempo

## PP y cuota justa en mercados asiáticos (añadido 2026-09-01)

> Ninguno de estos ítems debe marcarse `[x]` hasta que exista implementación y evidencia observada directamente **en la UI real**. Varios de ellos ya tienen cobertura automatizada desde el commit `459e776` (ver sección "Favorabilidad Atlas y economía asiática" más abajo) — se anota explícitamente en cada caso para no generar una lectura confusa (automatizado ≠ verificado manualmente en UI).

- [ ] PP directo correcto en mercado binario (`P_Atlas − P_market`, con `P_market` bruto o no-vig según disponibilidad) — sin cobertura automatizada específica todavía, sigue pendiente en ambos sentidos.
- [ ] Prohibición verificada de PP ingenuo en líneas `.25`/`.75` (nunca `P(full_win)` ni `P(full_win+half_win)` contra `1/cuota` directamente) — **ya confirmado por test automatizado** (`asianPriceEquivalent.test.js`, caso E: la fórmula vieja daría −11.25pp donde la actual da ≈0); pendiente solo la verificación visual en UI real.
- [ ] Fair odds asiática calculada correctamente: `1 + [0.5×P(HL)+P(FL)] / [P(FW)+0.5×P(HW)]` — **ya confirmado por test automatizado** (`asianPriceEquivalent.test.js`); pendiente solo la verificación visual en UI real.
- [ ] Si se presenta, la "probabilidad económica equivalente" (`1/FairOdds`, ahora `price_equivalent_probability` / "Probabilidad equivalente Atlas por precio") se distingue visualmente en UI de una probabilidad deportiva literal — **el código fuente ya lo implementa** (`asianPriceEquivalentPresentation.test.js` verifica la etiqueta, el hint y la separación por código); pendiente la verificación visual real en pantalla.
- [ ] Coherencia entre fair odds, EV y precio ofrecido para una misma selección/línea exacta (los tres deben ser consistentes entre sí, no calculados con distintas fuentes de probabilidad) — **ya confirmado matemáticamente por test automatizado** (`asianPriceEquivalent.test.js`, propiedades B y C); pendiente solo la verificación visual en UI real.

## Favorabilidad Atlas y economía asiática — commit `459e776` (añadido 2026-09-01)

> Regla del checklist: no marcar como probado manualmente algo que solo fue verificado por test automatizado. Los ítems de la subsección "Confirmado automáticamente" describen lo que la suite ya cubre — se listan en `[x]` porque están genuinamente verificados por `npm test`/`npm run lint`/`npm run build` reales de esta sesión, no por inferencia. Los de "Pendiente manual" permanecen en `[ ]` hasta que alguien los pruebe en la UI real.

### Confirmado automáticamente (npm test 1295/1295, lint 0/0, build PASS — esta sesión)

- [x] Equivalencia `price_equivalent_probability ≈ 1/asianFairOdds` para líneas `.0/.25/.5/.75` (`asianPriceEquivalent.test.js`)
- [x] `expected_roi ≈ 0` y `raw_edge_pp ≈ 0` cuando la cuota = Fair Odds, para `.0/.25/.5/.75` (`asianPriceEquivalent.test.js`)
- [x] Signo de `raw_edge_pp` coincide con el signo de `expected_roi` (cuota > Fair Odds → ambos positivos; cuota < Fair Odds → ambos negativos) (`asianPriceEquivalent.test.js`)
- [x] Favorabilidad Atlas presentada en escala `/100`, nunca como probabilidad literal ni con signo `%` (`asianFavorabilityPresentation.test.js`, `asianSportsFavorability.test.js`)
- [x] Separación de capa económica (Fair Odds/EV/PP) frente a Favorabilidad/Solidez, por código fuente (`asianPriceEquivalentPresentation.test.js`)
- [x] Regresión clásica: `goals/corners/cards/total_shots/shots_on_goal` sin cambio de fórmula en `raw_edge_pp`/`conservative_edge_pp` (`asianPriceEquivalent.test.js`, `manualExactLineEvaluation.test.js`, `uxCoherencePatch.test.js`)
- [x] `npm test` global 1295/1295, `npm run lint` 0 errores/0 warnings, `npm run build` PASS — verificados directamente antes del commit `459e776`

### Pendiente manual (NO probado en UI real todavía)

- [ ] Análisis individual completo en la UI real con `asian_total_goals` de principio a fin
- [ ] Ingresar una cuota exacta manual para una línea asiática y observar el resultado
- [ ] Verificar visualmente "Favorabilidad Atlas: X/100" en pantalla
- [ ] Verificar visualmente "Probabilidad equivalente Atlas por precio: XX.X %" en pantalla
- [ ] Verificar visualmente la "Brecha de precio"/"Brecha conservadora" en pantalla
- [ ] Verificar visualmente "EV técnico" en pantalla
- [ ] Verificar el veredicto de DirectorAtlas para un análisis individual asiático real
- [ ] Verificar la experiencia visual completa (sin solapes, sin texto engañoso, sin regresión visual clásica)
- [ ] Confirmar en Jornada clásica real que nada cambió visualmente para las 5 familias clásicas
- [ ] Parlay — confirmar que el bloqueo de líneas `.25`/`.75` de `asian_total_goals` sigue funcionando en la UI real
- [ ] Soñadora — misma verificación que Parlay
- [ ] LIVE — sin relación directa con esta fase, pero pendiente de una pasada de regresión visual general
- [ ] Memoria — resolución real de una predicción `asian_total_goals` end-to-end
- [ ] Bet Tracker — liquidación real de una apuesta `asian_total_goals` con media ganancia/pérdida
- [ ] Futura integración de `asian_total_goals` a Jornada clásica (no implementada todavía; no aplica hasta esa fase)
