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

> Ninguno de estos ítems debe marcarse `[x]` hasta que exista implementación y evidencia observada directamente.

- [ ] PP directo correcto en mercado binario (`P_Atlas − P_market`, con `P_market` bruto o no-vig según disponibilidad)
- [ ] Prohibición verificada de PP ingenuo en líneas `.25`/`.75` (nunca `P(full_win)` ni `P(full_win+half_win)` contra `1/cuota` directamente)
- [ ] Fair odds asiática calculada correctamente: `1 + [0.5×P(HL)+P(FL)] / [P(FW)+0.5×P(HW)]`
- [ ] Si se presenta, la "probabilidad económica equivalente" (`1/FairOdds`) se distingue visualmente en UI de una probabilidad deportiva literal
- [ ] Coherencia entre fair odds, EV y precio ofrecido para una misma selección/línea exacta (los tres deben ser consistentes entre sí, no calculados con distintas fuentes de probabilidad)
