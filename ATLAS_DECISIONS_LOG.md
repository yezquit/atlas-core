# Atlas — Log de decisiones

> Log cronológico **append-only**. No reescribir ni eliminar entradas pasadas — añadir nuevas entradas al final con su propia fecha. No repite arquitectura estable (`ATLAS_CONTEXT_MASTER.md`) ni estado vivo (`ATLAS_CURRENT_STATE.md`); solo registra qué se decidió, cuándo, y con qué alcance.

---

## 2026-09-01 — Decisiones confirmadas

1. **Jornada clásica se conserva.** No se reemplaza ni se rediseña su filosofía actual.
2. **Radar no sustituye Jornada.** Es un modo paralelo.
3. **Jornada seguirá siendo deporte primero** — probabilidad deportiva, incertidumbre, Solidez Atlas y ranking deportivo, sin que la cuota participe en la selección.
4. **Radar será deporte + precio exacto** — busca discrepancias entre la evaluación deportiva de Atlas y el precio exacto disponible; no es un buscador de cuotas altas.
5. **Radar debe buscar valor en todas las familias de interés** (las siete del catálogo objetivo).
6. **Jornada clásica también debe poder analizar todas las familias de interés** (las siete del catálogo objetivo).
7. **Catálogo objetivo de siete familias:** `goals`, `asian_total_goals`, `team_asian_handicap`, `corners`, `cards`, `total_shots`, `shots_on_goal`.
8. **`asian_total_goals` y `team_asian_handicap` son mercados distintos.**
9. **`asian_total_goals` = total asiático del partido** (Over/Under sobre el total de goles del encuentro).
10. **`team_asian_handicap` = hándicap asiático aplicado a un equipo** (diferencia de goles del equipo ajustada por una línea firmada).
11. **No implementar hándicap europeo/normal.** Solo se aprueba la variante asiática.
12. **Team Asian Handicap debe soportar líneas firmadas:** enteras, `.25`, `.5`, `.75`, positivas, negativas y cero.
13. **La identidad futura de Team Asian Handicap deberá incluir equipo explícito**, no reutilizar `direction=over|under` (que en el sistema actual solo tiene sentido para mercados de total, no por equipo).
14. **Líneas asiáticas con liquidación parcial no deben entrar silenciosamente en Parlay/Soñadora** — mismo principio que ya aplica hoy a `asian_total_goals` (bloqueo de líneas .25/.75 en combinadas, `src/app/atlas-functional-client.js:2529-2530`), extensible a `team_asian_handicap` solo mediante decisión explícita, no por herencia automática.
15. **El mensaje "174 candidatos / 0 cuotas exactas" NO fue demostrado como consecuencia de confusión entre Team Asian Handicap y Asian Total Goals.** Un diagnóstico de código dedicado confirmó que ningún camino de normalización de odds clasifica un mercado de proveedor tipo "Asian Handicap" (por equipo) como `asian_total_goals` o `goals` (`src/core/intelligence/oddsIntelligence.js:6-13,44-49,197-198`).
16. **El mercado Team Asian Handicap del proveedor actualmente se descarta porque Atlas todavía no lo reconoce** — `mapProviderMarket` no tiene ningún token para "asian handicap"/"handicap asiatico", así que todo el bloque de apuesta se descarta antes de llegar a parseo de valor (`oddsIntelligence.js:44-49,198`).
17. **La ausencia actual de `asian_total_goals` en Jornada clásica es un gap frente al nuevo objetivo confirmado** (punto 6 de este log), no una decisión de diseño previa que deba preservarse.
18. **No modificar la lógica clásica estable para convertirla en lógica de value.** El criterio de ranking de Jornada (deporte primero) no debe generalizarse para depender de disponibilidad de cuota al integrar familias nuevas.

## 2026-09-01 — Pendiente de investigación (no es una decisión)

> `Determinar si el universo de candidatos que usa actualmente Value Radar es suficientemente amplio para descubrir oportunidades de valor que no quedarían destacadas por el ranking clásico.`

Contexto: Radar de Valor parte hoy de `highlighted` (candidatos ya filtrados por `ranking_eligible === true` y rankeados por criterio deportivo, `src/core/services/sportsIntelligenceService.js:826-828,841`) para las cinco familias clásicas, no del universo bruto de todos los candidatos posibles antes de ese filtro. No se ha determinado si esto excluye oportunidades de valor económico que un candidato de baja prioridad deportiva pero alto edge económico representaría. Esta pregunta queda abierta explícitamente como investigación futura, no como hallazgo confirmado ni como decisión tomada.

---

## 2026-09-01 — Actualización: modelado independiente de cuotas y matemática de value

> Esta entrada se añade tras la creación inicial del respaldo canónico, el mismo día. No reemplaza las 18 decisiones anteriores — las complementa. Ninguna de estas decisiones se ha implementado en código.

19. **Atlas puede generar, analizar y rankear candidatos deportivos aunque no exista una cuota disponible.** La disponibilidad de una cuota no define qué mercados o líneas puede modelar Atlas. Arquitectura conceptual: `DATOS DEPORTIVOS → MODELO ATLAS → CANDIDATO/LÍNEA DEPORTIVA → EVALUACIÓN DEPORTIVA`, y solo después, para precio, `CANDIDATO EXACTO → CUOTA EXACTA → EVALUACIÓN ECONÓMICA`. Detalle en `ATLAS_CONTEXT_MASTER.md`, sección 22.
20. **API-Football no debe tratarse como la autoridad que determina qué líneas deportivas puede analizar Atlas** — proporciona datos deportivos y, cuando existan, cuotas, pero no limita el modelado.
21. **Atlas debe poder modelar `asian_total_goals` y `team_asian_handicap` por sí mismo, aunque API-Football no publique esos mercados en odds** — estimando distribución de goles (asian_total_goals) o distribución de diferencia de goles por equipo (team_asian_handicap), evaluando líneas `.0/.25/.5/.75` y líneas firmadas por equipo (`home -0.25`, `away +0.25`, `home -0.5`, `away +0.75`, `team 0`) sin depender de que el proveedor haya mostrado primero esa línea.
22. **En Jornada clásica puede existir una recomendación/candidato deportivo sin cuota** — la falta de cuota no invalida probabilidad deportiva, incertidumbre, Solidez, ranking ni la recomendación deportiva.
23. **En Radar de Valor, sin cuota exacta, un candidato se muestra como "candidato deportivo" / "oportunidad por cotizar" / "busca precio" / "no evaluable económicamente todavía", nunca como `VALUE BET CONFIRMADA`** — esa etiqueta exige comparación contra una cuota exacta de la misma selección.
24. **La cuota exacta puede provenir de API-Football (si existe) o de entrada manual del usuario (si el proveedor no la ofrece)** — en ambos casos la identidad exacta se mantiene: `fixture_id+market_family+direction+line` para mercados estándar, `fixture_id+market_family+team_id+line` (con `side` conservado) para Team Asian Handicap (diseño futuro).
25. **La brecha económica se expresa en puntos porcentuales (`+X.XX PP`)** comparando probabilidad Atlas vs. probabilidad implícita de la cuota para la misma selección/línea exacta. No significa apuesta segura, garantía de ganancia ni certeza — es una discrepancia favorable o desfavorable entre modelo y precio. Fórmulas y ejemplo en `ATLAS_CONTEXT_MASTER.md`, sección 24.1.
26. **REGLA INVIOLABLE: `Solidez Atlas` no es una probabilidad.** Nunca calcular `Solidez − probabilidad implícita` para producir edge/PP; la brecha económica siempre compara probabilidades comparables (ej. Probabilidad Atlas 61 % vs. Probabilidad implícita 45 %, nunca Solidez 74 vs. 45). Detalle en `ATLAS_CONTEXT_MASTER.md`, sección 24.2.
27. **Probabilidad implícita bruta = `1/O`.** Cuando existan de forma verificable las cuotas de ambos lados de la misma línea exacta, se prefiere la referencia no-vig (`P_no_vig_A = qA/(qA+qB)`). No mezclar cuotas o probabilidades de líneas distintas (Over 7.5 y Under 7.5 son comparables; Over 7.5 y Under 7.0 no lo son). Detalle en `ATLAS_CONTEXT_MASTER.md`, sección 24.3.
28. **Para mercados binarios simples sin push: `Fair Odds ≈ 1/P_Atlas`, `EV = (P_Atlas × cuota) − 1`.** No generalizar ciegamente estas fórmulas a mercados asiáticos de cuarto. Detalle en `ATLAS_CONTEXT_MASTER.md`, sección 24.4.
29. **Para `asian_total_goals` y `team_asian_handicap`, el EV debe respetar toda la distribución de settlement** (`full_win/half_win/push/half_loss/full_loss`), no reducirse a `1/probabilidad_de_ganar`. Fórmula conceptual: `EV = P(FW)×(O−1) + P(HW)×0.5×(O−1) − P(HL)×0.5 − P(FL)`; push aporta retorno neto 0. Detalle en `ATLAS_CONTEXT_MASTER.md`, sección 24.5.
30. **El universo de exploración del Radar sigue como pendiente de investigación** (reafirmado, sin cambios respecto a la entrada anterior de este log) — no se ha modificado esa lógica.
31. **El "Prompt de rescate ATLAS" externo (guardado por el usuario fuera del repositorio) es versionado.** Cuando cambie una decisión estructural importante (filosofía de Jornada, Radar, mercados, proveedor, persistencia, arquitectura, workflow, reglas económicas), el coordinador debe advertir que el prompt anterior quedó parcialmente obsoleto y entregar una nueva versión completa para reemplazarlo — no depender de que el usuario edite fragmentos sueltos. El prompt de rescate más reciente siempre prevalece sobre versiones anteriores. Detalle operativo en `ATLAS_HANDOFF.md`.

**Ninguna de las decisiones 19-31 fue implementada en código en esta tarea** — son principios y reglas registrados para guiar diseño/implementación futura.

---

## 2026-09-01 — Aclaración: PP y cuota justa en mercados asiáticos

32. **En mercados asiáticos con settlement parcial, fair odds y EV son las métricas económicas primarias.** Cualquier brecha PP deberá construirse a partir de probabilidades económicas equivalentes comparables (`1/FairOdds` de ambos lados sobre la misma línea exacta) y no de una probabilidad bruta de full win. La brecha PP en mercados binarios simples (`P_Atlas − P_market`) y la de mercados asiáticos con settlement parcial son **dos tratamientos distintos** — no intercambiables. Fórmulas completas y el porqué de la distinción: `ATLAS_CONTEXT_MASTER.md`, secciones 24.1 y 24.5.

No implementada en código en esta tarea — es una aclaración documental sobre una decisión ya registrada (entradas 25 y 29 de este log).
