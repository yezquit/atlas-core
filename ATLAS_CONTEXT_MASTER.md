# Atlas — Contexto maestro de arquitectura

> Documento de arquitectura y reglas **estables**. No es un registro de estado vivo (ver `ATLAS_CURRENT_STATE.md`) ni un log de decisiones (ver `ATLAS_DECISIONS_LOG.md`). Se actualiza solo cuando cambia una regla estructural real, no en cada sesión.

## 1. Qué es Atlas

Atlas es una aplicación personal Next.js (App Router) de análisis deportivo y evaluación de valor de apuestas, ejecutada como una instalación de un solo usuario con filesystem persistente propio. Las únicas páginas de producto son `/` y `/login`; Jornada, partido, LIVE, combinaciones, memoria, historial y apuestas son **modos de estado del cliente** dentro de `src/app/atlas-functional-client.js`, no rutas independientes. (Fuente: `AGENTS.md`.)

## 2. Principio "Comprender antes de decidir"

Atlas separa siempre la comprensión deportiva de un partido (probabilidad, incertidumbre, contexto) de la decisión económica (si una cuota representa valor). Este principio se expresa arquitectónicamente en la separación entre Jornada clásica (comprensión deportiva) y Radar de Valor (decisión económica) — ver secciones 8 y 9.

## 3. Arquitectura general

- `src/app` — páginas, Route Handlers (límite de mutación; no hay Server Actions), UI de cliente y presentación.
- `src/core/services` — orquesta casos de uso.
- `src/core/infrastructure` — adaptadores de proveedor, caché y archivos.
- `src/core/intelligence` — lógica de dominio mayormente pura.
- Módulos marcados `server-only` y código que usa `node:crypto`/`node:fs/promises`/archivos locales deben mantenerse fuera de bundles de cliente y del runtime Edge. (Fuente: `AGENTS.md`.)

## 4. Seguridad

El host de API-Football está allowlisted de forma estricta. Los secretos (`.env.local` y variantes) y los directorios de datos privados (`.atlas-data/`, `.atlas-cache/`) nunca deben abrirse, imprimirse ni versionarse. (Fuente: `AGENTS.md`.)

## 5. API-Football

API-Football es el único proveedor externo. Las rutas directas de fixture/catálogo y los pipelines de Jornada/operacional/LIVE usan intencionalmente rutas de caché, presupuesto y telemetría **distintas**; no deben fusionarse sin justificación. (Fuente: `AGENTS.md`.)

## 6. Análisis prepartido

El pipeline prepartido rechaza fixtures ya iniciados o finalizados y recursos post-kickoff. Es un pipeline separado del pipeline LIVE (ver sección 15). (Fuente: `AGENTS.md`.)

## 7. Análisis individual

Flujo completo verificado por diagnóstico de código: análisis deportivo inicial (`sportsIntelligenceService.js`) → generación de prompt Gemini → pegado manual → parseo/selección de evidencia → reanálisis → cuota exacta ("cuota exacta") → veredicto final vía DirectorAtlas. La familia de mercado se selecciona desde una lista fija (`SUPPORTED_MARKET_IDS` = `SPECIFIC_SPORTS_MARKETS`, `src/core/intelligence/marketEngine.js:11-14`). Ruta de entrada: `src/app/api/football/operational-analysis/route.js`; orquestador: `src/core/services/operationalAnalysisService.js`.

## 8. Jornada clásica

Ver "Filosofía de Jornada clásica" (sección 9 más abajo). Ruta de entrada: `src/app/api/football/journey-scan/route.js`; orquestador: `scanSportsJourney` (`src/core/services/sportsIntelligenceService.js`).

## 9. Filosofía de Jornada clásica — DECISIÓN FUNCIONAL (2026-09-01)

**La Jornada clásica SE MANTIENE.** Su objetivo es encontrar las mejores opciones deportivas mediante:
- probabilidad deportiva;
- incertidumbre;
- Solidez Atlas;
- ranking deportivo.

**La cuota NO debe modificar:** probabilidad deportiva, Solidez, ranking, ni la selección exacta. Esta separación está verificada en código: el filtro de elegibilidad de ranking (`ranking_eligible === true`, `sportsIntelligenceService.js:826-828`) y el ranking (`rankJourneyCandidatesByDecision`) operan antes e independientemente de la hidratación de cuota.

## 10. Radar de Valor

Ver "Filosofía de Radar de Valor" (sección 11). Construido en `src/core/services/valueRadarService.js` (`buildJourneyValueRadar`), consumido dentro de `journey.valueRadar` en la respuesta de Jornada.

## 11. Filosofía de Radar de Valor — DECISIÓN FUNCIONAL (2026-09-01)

**Radar es un modo PARALELO, no sustituto de Jornada.** Su objetivo es buscar discrepancias entre la evaluación deportiva de Atlas y el precio exacto disponible. Debe considerar: probabilidad/precio implícito, fair odds, edge conservador, EV técnico, incertidumbre y settlement correcto cuando corresponda. **Radar NO es simplemente un buscador de cuotas altas.**

## 12. Gemini manual

Gemini es estrictamente manual (copy/paste): Atlas genera un prompt y parsea texto pegado localmente. No hay llamadas a una API de Gemini. La evidencia proveniente de Gemini se etiqueta siempre `user_reported`, nunca como verificada por el proveedor. (Fuente: `AGENTS.md`; confirmado en código: `src/core/intelligence/geminiManualContext.js:182,549,584`.)

## 13. DirectorAtlas

Produce el veredicto deportivo (`sports_verdict`), la evaluación de precio (`price_assessment`) y la decisión final de idoneidad. Implementado en `src/core/modules/directorAtlas.js`, invocado desde `operationalAnalysisService.js`.

## 14. Parlay y Soñadora

Registro manual de combinaciones. Existe una regla de bloqueo ya implementada para `asian_total_goals`: las líneas de cuarto (.25/.75) **no** se admiten en combinadas, solo como apuestas individuales (`src/app/atlas-functional-client.js:2529-2530`), porque no hay soporte demostrado de liquidación parcial de piernas dentro de una combinada.

## 15. Memoria (Memoria Atlas)

Registros append-only en NDJSON (`.atlas-data/v1/`; nunca reescritos ni editados a mano). Resuelve predicciones oficiales, incluida la liquidación de `asian_total_goals` vía `officialPrediction.js` reutilizando el stat `"goals"`.

## 16. Bet Tracker

Registro y liquidación de apuestas individuales (`src/core/infrastructure/betLedger.js`), con outcomes `won/half_won/lost/half_lost/void/push` y UI de liquidación condicionada por `market_family`.

## 17. LIVE

Pipeline separado del prepartido: re-obtiene snapshots frescos y cuotas en vivo. Los análisis LIVE exitosos se mantienen en memoria 15 minutos y desaparecen al reiniciar si no se guardan. (Fuente: `AGENTS.md`.)

## 18. Persistencia

Filesystem local, persistente, de una sola instalación personal. No apto para despliegue serverless u horizontalmente escalado sin reemplazar la persistencia y la coordinación en memoria. (Fuente: `AGENTS.md`.)

## 19. Railway

Ver `ATLAS_CURRENT_STATE.md` para el estado de despliegue conocido. No hay configuración, script ni documentación de Railway dentro de este repositorio (verificado por diagnóstico de código: sin `railway.json`, `Procfile`, `nixpacks.toml`, ni workflows en `.github/`).

## 20. Reglas de identidad exacta

- Se preserva la identidad exacta del fixture (fecha, timezone, competición autorizada, temporada, ID) en todo el pipeline; la búsqueda por nombre está deshabilitada intencionalmente. (Fuente: `AGENTS.md`.)
- Toda coincidencia de cuota exige identidad completa: `market_family` + `direction` normalizada + `line` numérico exacto (`isExactQuote`, `src/core/intelligence/marketCandidateRanker.js:42-46`), con `fixture_id` aplicado por indexación previa.

## 21. Separación estricta entre deporte y precio

Es la regla transversal más importante del sistema: Jornada clásica calcula probabilidad/incertidumbre/Solidez/ranking **sin que la cuota participe**; Radar de Valor calcula valor económico **sin reescribir** la probabilidad deportiva ya calculada. Ningún cambio futuro debe generalizar el criterio de ranking de Jornada para depender de disponibilidad de cuota, ni permitir que Gemini o una cuota alteren la selección deportiva ya hecha (guardas verificadas en código: `parseGeminiResponse` fuerza `selected=false` ante fixture incompatible, `geminiManualContext.js:515-544`; ningún ítem Gemini se marca nunca como verificado por proveedor).

---

## Catálogo funcional objetivo

Objetivo confirmado (2026-09-01) — siete familias de mercado:

1. `goals` — Goles
2. `asian_total_goals` — Total Asiático de Goles / Hándicap Asiático de Goles
3. `team_asian_handicap` — Hándicap Asiático por Equipo
4. `corners` — Córners
5. `cards` — Tarjetas
6. `total_shots` — Remates totales
7. `shots_on_goal` — Remates a puerta

**Importante:** solo se aprueba **hándicap asiático**. No se está aprobando hándicap europeo/normal.

## Regla transversal confirmada

Tanto **Jornada clásica** como **Radar de Valor** deben terminar teniendo acceso a las siete familias de interés. Lo que cambia entre los dos modos es el **criterio de decisión** (deporte primero vs. deporte + precio exacto), no el catálogo funcional objetivo.

**Estado actual frente al objetivo (verificado por diagnóstico de código, no inferido):** `asian_total_goals` no participa hoy del loop automático de evaluación de Jornada clásica ni de su checkbox de "Mercados de interés" (`SPORTS_MARKETS`, `src/core/intelligence/marketEngine.js:3-9`, no incluye `asian_total_goals`; el checkbox de Jornada en `src/app/atlas-functional-client.js:2100,2819-2828` usa esa misma lista). **Esta ausencia es un GAP frente al objetivo confirmado, no un comportamiento deseado** — no debe leerse como una decisión de diseño definitiva. Ver `ATLAS_CURRENT_STATE.md` para el detalle vivo y `ATLAS_DECISIONS_LOG.md` para la decisión formal.

---

## 22. Modelado independiente de cuotas — PRINCIPIO ARQUITECTÓNICO (añadido 2026-09-01)

**Atlas puede generar, analizar y rankear candidatos deportivos aunque NO exista una cuota disponible.** La disponibilidad de una cuota **no** define qué mercados o líneas puede modelar Atlas.

Arquitectura conceptual correcta, en dos etapas separadas:

```
DATOS DEPORTIVOS → MODELO ATLAS → CANDIDATO/LÍNEA DEPORTIVA → EVALUACIÓN DEPORTIVA
```

y solo después, cuando se desea evaluar precio:

```
CANDIDATO EXACTO → CUOTA EXACTA → EVALUACIÓN ECONÓMICA
```

API-Football proporciona datos deportivos y, cuando estén disponibles, cuotas. **API-Football no debe tratarse como la autoridad que determina qué líneas deportivas puede analizar Atlas** — esa autoridad es el modelo de Atlas sobre los datos deportivos, no la oferta de mercado de un proveedor de cuotas.

**Aplicación a mercados asiáticos:** Atlas debe poder modelar por sí mismo `asian_total_goals` y `team_asian_handicap` aunque API-Football no publique esos mercados en odds:
- `asian_total_goals`: Atlas debe poder estimar su distribución de goles y evaluar líneas asiáticas compatibles, incluidas líneas `.0/.25/.5/.75`.
- `team_asian_handicap`: Atlas deberá modelar la distribución de diferencia de goles desde la perspectiva de cada equipo y evaluar líneas firmadas (ej. `home -0.25`, `away +0.25`, `home -0.5`, `away +0.75`, `team 0`), sin depender de que un bookmaker/proveedor haya mostrado primero esa línea.

Este principio es arquitectónico, no una implementación — no se ha modificado código para materializarlo. Ver `ATLAS_DECISIONS_LOG.md`, entrada 2026-09-01 (actualización), para el detalle de la decisión.

## 23. Estados de un candidato en Radar de Valor sin cuota — PRINCIPIO ARQUITECTÓNICO (añadido 2026-09-01)

Tanto Jornada clásica como Radar de Valor pueden identificar un candidato deportivo **antes de conocer el precio**.

**En Jornada clásica:** puede existir una recomendación/candidato deportivo sin cuota. La falta de cuota no invalida probabilidad deportiva, incertidumbre, Solidez, ranking ni la recomendación deportiva — estos se calculan enteramente a partir de datos deportivos (ver sección 21, "deporte primero, precio después").

**En Radar de Valor:** sin cuota exacta, el candidato puede mostrarse conceptualmente como *candidato deportivo* / *oportunidad por cotizar* / *busca precio* / *no evaluable económicamente todavía*. Pero **no puede declararse `VALUE BET CONFIRMADA` sin comparar contra una cuota exacta correspondiente a la misma selección**.

La cuota exacta puede provenir de (1) API-Football, si existe, o (2) entrada manual del usuario, si el proveedor no la ofrece. En ambos casos la identidad exacta debe seguir protegida:
- Mercados estándar: `fixture_id + market_family + direction + line`.
- Team Asian Handicap (diseño futuro, aún no implementado): `fixture_id + market_family + team_id + line`, con `side` (`home`/`away`) conservado cuando corresponda — ver sección 20 y el diagnóstico de mercados asiáticos referenciado en `ATLAS_DECISIONS_LOG.md`.

## 24. Métricas económicas — principios matemáticos (añadido 2026-09-01)

Estos son principios matemáticos documentados como referencia estable. **Actualización (459e776):** para `asian_total_goals`, la sección 24.5 (fair odds/EV asiático) ya está implementada y verificada por tests — ver sección 26 más abajo para el contrato exacto. El resto de esta sección (24.1-24.4) sigue siendo un principio de referencia sin implementación específica confirmada — verificar contra el código antes de asumir que una fórmula está implementada en un caso concreto.

### 24.1 Brecha en puntos porcentuales (PP) — tiene DOS tratamientos según el tipo de settlement (aclarado 2026-09-01)

**A. Mercados binarios/simples.** Cuando existe una probabilidad deportiva Atlas directamente comparable con la probabilidad implícita de la misma selección exacta:

```
PP_gap = P_Atlas − P_market
```

donde `P_market` puede ser la probabilidad implícita bruta (`1/cuota`) o, preferiblemente, la referencia no-vig cuando estén disponibles ambos lados exactos comparables (sección 24.3).

> Ejemplo conceptual: P_Atlas = 61 %, P_market = 45 % → gap = **+16 PP**.

Esta brecha significa que Atlas estima la selección X puntos porcentuales por encima (o por debajo) de lo que exige ese precio. **No significa** apuesta segura, garantía de ganancia ni certeza — debe describirse siempre como una discrepancia favorable o desfavorable entre modelo y precio.

**B. Mercados asiáticos con settlement parcial** (`asian_total_goals` con líneas `.25/.75`, `team_asian_handicap` con líneas `-0.25/+0.25/-0.75/+0.75`, etc.). **No** comparar ingenuamente `P(full_win)` ni `P(full_win + half_win)` contra `1/cuota` como si fueran la misma clase de probabilidad — mezclaría una probabilidad parcial de settlement con una probabilidad implícita de resultado binario, produciendo una PP matemáticamente falsa. Ver sección 24.5 para el tratamiento correcto (fair odds/EV asiático) y para cómo construir, solo si es necesario, una PP asiática correcta.

### 24.2 Solidez Atlas NO es probabilidad — REGLA INVIOLABLE

`Solidez Atlas` no es una probabilidad. **Nunca** calcular `Solidez − probabilidad implícita` para producir edge/PP. La brecha económica debe comparar siempre probabilidades comparables entre sí.

> Ejemplo: Probabilidad Atlas = 61 %, Solidez = 74/100, Probabilidad implícita = 45 %. El cálculo económico usa **61 % vs. 45 %**, nunca 74 vs. 45.

### 24.3 Probabilidad implícita y referencia no-vig

Para una cuota decimal `O`: `P_implícita_bruta = 1 / O`.

Cuando existan de forma verificable las cuotas de **ambos lados de la misma línea exacta**, Atlas puede calcular una referencia de mercado ajustada por margen/no-vig. Para dos lados A y B:

```
qA = 1/OA
qB = 1/OB
P_no_vig_A = qA / (qA + qB)
P_no_vig_B = qB / (qA + qB)
```

Cuando exista información suficiente y comparable, la referencia no-vig es preferible para medir la visión del mercado. **No mezclar cuotas o probabilidades de líneas distintas** — p. ej. Over 7.5 y Under 7.5 son comparables; Over 7.5 y Under 7.0 no son complementos exactos y no deben usarse para calcular una probabilidad no-vig común.

### 24.4 Cuota justa y EV en mercados binarios simples

Para un mercado binario simple sin push:

```
Fair Odds ≈ 1 / P_Atlas
EV = (P_Atlas × cuota) − 1
```

Estas fórmulas solo aplican directamente cuando el settlement es binario apropiado. **No generalizarlas ciegamente a mercados asiáticos de cuarto.**

### 24.5 Matemática de mercados asiáticos (líneas de cuarto)

Para `asian_total_goals` y `team_asian_handicap` con líneas asiáticas, la evaluación económica debe respetar toda la distribución de settlement: `full_win`, `half_win`, `push`, `half_loss`, `full_loss`. La cuota justa/EV **no** debe reducirse automáticamente a `1 / probabilidad_de_ganar` cuando existen medias ganancias, medias pérdidas o pushes.

Para una cuota decimal `O`, forma conceptual del EV:

```
EV = P(FW) × (O − 1)
   + P(HW) × 0.5 × (O − 1)
   − P(HL) × 0.5
   − P(FL)
```

Push aporta retorno neto 0.

**Cuota justa (fair odds) asiática** correspondiente a esa misma distribución (aclarado 2026-09-01):

```
FairOdds = 1 + [0.5 × P(HL) + P(FL)] / [P(FW) + 0.5 × P(HW)]
```

(válida cuando el denominador `P(FW) + 0.5×P(HW)` es distinto de cero). Esta cuota justa representa el precio de equilibrio según el settlement completo modelado por Atlas — es la métrica económica primaria en mercados asiáticos con settlement parcial, junto con el EV de arriba.

**PP en mercados asiáticos (si la interfaz llegara a mostrarla):** no debe etiquetarse `1/FairOdds` como una probabilidad literal de "que ocurra la apuesta". Puede construirse una *probabilidad económica equivalente Atlas* = `1/FairOdds` y compararla contra una referencia de precio equivalente del mercado, siempre sobre el mismo fixture, misma familia, mismo equipo (si aplica) y misma línea exacta. En la UI debe distinguirse visualmente de una probabilidad deportiva literal, ya que no significan lo mismo — el objetivo es evitar que una métrica visualmente atractiva produzca una comparación matemáticamente falsa.

Esto es un principio matemático documentado — no se ha modificado código en esta tarea para implementarlo.

## 25. Universo de exploración del Radar (pendiente)

El Radar actual recibe, para las cinco familias clásicas, candidatos ya filtrados por `ranking_eligible` de Jornada clásica. Sigue pendiente de investigación si ese universo es suficientemente amplio para detectar oportunidades de valor que no quedarían destacadas por la Jornada clásica. No se ha modificado esa lógica. Ver `ATLAS_DECISIONS_LOG.md` para el registro formal de este pendiente.

## 26. Favorabilidad Atlas y economía de `asian_total_goals` — IMPLEMENTADO (commit `459e776`)

A diferencia de las secciones 22-25 (principios arquitectónicos sin implementación confirmada), este contrato **sí está implementado** en `src/core/intelligence/asianTotalGoals.js`/`valueRadar.js`/`candidateLineGenerator.js`/`directorAtlas.js` y verificado por tests dedicados.

**Métrica deportiva — Favorabilidad Atlas:**
```
sports_favorability = FW + 0.75·HW + 0.5·Push + 0.25·HL   (escala /100 en UI)
```
No es probabilidad literal de ganar, no es comparable con `1/cuota`, no es edge económico. Solidez Atlas permanece independiente. `probability_semantics: "settlement_favorability"` marca este contrato en el candidato.

**Métrica económica — Probabilidad equivalente Atlas por precio:**
```
W = P(full_win) + 0.5·P(half_win)
L = P(full_loss) + 0.5·P(half_loss)
FairOdds = 1 + L/W                    (auditada y confirmada correcta, sin cambios)
price_equivalent_probability = W/(W+L) = 1/FairOdds
```
Esta magnitud **sí** vive en el espacio apropiado para compararse contra la probabilidad implícita de una cuota — su signo frente a `implied` coincide siempre con el signo del EV real (propiedad demostrada algebraicamente y confirmada por tests para líneas `.0/.25/.5/.75`). Sigue sin ser la probabilidad literal de ganar.

**Brecha económica corregida:**
```
raw_edge_pp = (price_equivalent_probability − implied_probability) × 100
```
Reemplaza la fórmula antigua (`weighted_win_probability − implied`), que podía dar edge negativo exactamente en el precio justo cuando existía masa de `half_win`/`push`/`half_loss`.

**Intervalo económico (no el de Favorabilidad):**
```
decisive_weight = W + L
n_decisive = effective_sample_size × decisive_weight
p = W/(W+L)
[price_equivalent_probability_low, price_equivalent_probability_high] = aproximación Wilson(p, n_decisive)
conservative_edge_pp = (price_equivalent_probability_low − implied_probability) × 100   (o null si no hay límite válido)
```
Es una **aproximación estadística**, no una calibración empírica validada.

**Clasificación del Radar:** `expected_roi ≤ 0 → NO_VALUE`; `expected_roi > 0` y `conservative_edge_pp > 0 → INTERESTING`; `expected_roi > 0` y (`conservative_edge_pp ≤ 0` o `null`) → `WATCH`.

**Presentación:** DEPORTIVO (`Favorabilidad Atlas: X/100`, `Solidez Atlas: X/100`, nunca con signo `%`) separado de ECONÓMICO (`Cuota justa Atlas`, `Probabilidad equivalente Atlas por precio`, `Probabilidad implícita del mercado`, `Brecha de precio`, `Brecha conservadora`, `EV técnico`), más el perfil de settlement (`Gana completa/Gana media/Devolución/Pierde media/Pierde completa`) cuando esté disponible.

Detalle completo de decisiones: `ATLAS_DECISIONS_LOG.md`, entrada "Implementado en commit `459e776`" (decisiones 33-45).
