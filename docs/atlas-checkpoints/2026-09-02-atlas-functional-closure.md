# Checkpoint — Cierre funcional Atlas V3

**Fecha:** 2026-09-02
**Repositorio:** `yezquit/atlas-core`
**Rama:** `audit/atlas-engine-v3`
**HEAD base:** `f673db418b95321eb6b4f2a52fdff140d2f40a05` (`f673db4`)

## Estado Git al iniciar la documentación

- Working tree: CLEAN.
- Origin: 0 ahead / 0 behind.
- No se creó tag.
- Este checkpoint no modifica código ni despliega Railway.

## Validación técnica del cierre

- `npm test`: 1520/1520 PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- Next.js 16.2.12.
- TypeScript PASS.
- 22/22 páginas generadas.

## Producto cerrado

### Jornada

- Catálogo: `goals`, `total_shots`, `shots_on_goal`, `cards`, `corners`, `asian_total_goals`, `team_asian_handicap`.
- `candidates` conserva el universo deportivo.
- `recommendedCandidates` conserva comparabilidad clásica.
- `asianRecommendedCandidates` usa Favorabilidad Atlas.
- `combinationCandidates` excluye Asian.
- No existe fallback silencioso a `goals`.

### Individual

- Clásicos, Asian Total y Team Asian Handicap funcionales.
- Línea/equipo exactos, Gemini manual `user_reported`, cuota manual exacta y economía separada.
- Evaluar precio reutiliza el snapshot deportivo idéntico; cambiar línea obliga a reanalizar.

### Asian Total Goals

- Líneas no negativas en pasos de 0.25.
- Settlement FW/HW/Push/HL/FL.
- Identidad distinta de `goals`.

### Team Asian Handicap

- Equipo/lado explícito.
- Diferencia de goles desde la perspectiva del equipo seleccionado.
- Líneas firmadas y settlement de cinco estados.
- Identidad exacta: `fixture_id + market_family + team_id + line`.

### Semántica y economía

- Probabilidad clásica, Favorabilidad Atlas y Solidez Atlas permanecen separadas.
- Favorabilidad: `FW + 0.75·HW + 0.5·Push + 0.25·HL`, mostrada `/100`.
- `FairOdds = 1 + L/W` y `price_equivalent_probability = W/(W+L)`.
- Value Radar usa EV real de settlement y edge conservador.

### Combinaciones

- Parlay 2–4; Soñadora 5–15.
- Máximo una selección por `fixture_id + market_family`.
- Asian excluido hasta soportar settlement parcial por pata.

### LIVE

- Mercados clásicos funcionales.
- Asian no evaluable productivamente.
- Prematch solo lectura, sin contaminación ni autolearning.

### Memoria y Bet Tracker

- Clásicos, Asian Total y Team Asian Handicap.
- Memoria append-only.
- FW/HW → HIT, Push → VOID, HL/FL → MISS.
- Settlement excluido de calibración binaria.
- Bet Tracker admite settlement parcial individual; combinaciones conservan resultado global.

## Bugs cerrados en el bloque V3

- Evidencia histórica `null` presentada como 0%.
- Evaluación de cuota que reconstruía y perdía el snapshot deportivo.
- Familias solicitadas reemplazadas downstream por catálogo completo/fallback a `goals`.
- Comparación de Favorabilidad como si fuera probabilidad literal.
- Economía asiática binaria aplicada a settlement parcial.
- Presentación Journey Asian y compatibilidad clásica de `sportsAttractiveness`.
- Semántica de Scout settlement-aware.
- Integración transversal Team Asian Handicap.
- LIVE, Memoria y Bet Tracker sin semántica asiática completa.

Nota histórica: una hipótesis sobre `resultForLine` y un ternario no resultó ser la causa de un bug reproducible; no se registra como corrección funcional.

## Pendientes no bloqueantes

- Cuotas automáticas provider para Team Asian Handicap.
- Settlement parcial por pata en combinaciones.
- Calibración settlement-aware/multiclase con resultados reales.
- Nuevos mercados/deportes, rediseño opcional y registro central de mercados.

## Railway

`f673db4` no está confirmado como desplegado. No se tocó Railway en este bloque documental.

## Reanudación exacta

1. Commit de los siete documentos del cierre.
2. Push de `audit/atlas-engine-v3`.
3. Deploy del HEAD autorizado mediante el mecanismo Railway existente.
4. Smoke test de autenticación, Jornada, Individual, Asian, LIVE, Memoria y Bet Tracker.
5. Continuar solo con hotfixes de bugs reales; no abrir V4 de producto sin alcance explícito.
