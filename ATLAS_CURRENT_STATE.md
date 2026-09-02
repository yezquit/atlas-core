# Atlas — Estado actual

> Snapshot operativo vivo. La arquitectura estable está en `ATLAS_CONTEXT_MASTER.md`; las decisiones históricas, en `ATLAS_DECISIONS_LOG.md`.

**Fecha:** 2026-09-02

## Git

- Repositorio remoto: `yezquit/atlas-core`.
- Rama: `audit/atlas-engine-v3`.
- HEAD: `f673db418b95321eb6b4f2a52fdff140d2f40a05` (`f673db4`).
- Working tree al iniciar este bloque documental: **CLEAN**.
- Sincronización inicial: `origin/audit/atlas-engine-v3...HEAD` = **0 ahead / 0 behind**.

## Última validación funcional cerrada

- `npm test`: **1520/1520 PASS**.
- `npm run lint`: **PASS**.
- `npm run build`: **PASS**.
- Next.js: **16.2.12**.
- TypeScript: **PASS**.
- Páginas generadas: **22/22**.

Estas validaciones corresponden al cierre funcional anterior. En este bloque documental no se repitieron pruebas, lint ni build.

## Producto funcional

### Jornada

- Familias: `goals`, `total_shots`, `shots_on_goal`, `cards`, `corners`, `asian_total_goals`, `team_asian_handicap`.
- `candidates`: catálogo deportivo completo.
- `recommendedCandidates`: shortlist clásica por probabilidad literal.
- `asianRecommendedCandidates`: shortlist settlement-aware por Favorabilidad Atlas.
- `combinationCandidates`: excluye mercados asiáticos.
- Respeta exactamente las familias solicitadas; no existe fallback silencioso a `goals`.
- El ranking es sports-first y no cambia por disponibilidad de cuota.

### Análisis individual

- Soporta familias clásicas, Asian Total Goals y Team Asian Handicap.
- Conserva línea/equipo exactos, contexto Gemini manual `user_reported` y cuota manual exacta.
- La evaluación puramente económica reutiliza el snapshot deportivo compatible y no recalcula el modelo.
- DirectorAtlas mantiene separadas decisión deportiva, Solidez, probabilidad/favorabilidad y economía.

### Mercados asiáticos

- `asian_total_goals`: líneas no negativas en pasos de 0.25, cinco estados de settlement y economía settlement-aware.
- `team_asian_handicap`: equipo/lado explícito, línea firmada, distribución de diferencia de goles y cinco estados de settlement.
- Favorabilidad Atlas: `FW + 0.75·HW + 0.5·Push + 0.25·HL`; escala `/100`, no probabilidad literal.
- Economía: `W = FW + 0.5·HW`, `L = FL + 0.5·HL`, `FairOdds = 1 + L/W`, `price_equivalent_probability = W/(W+L)` y EV de settlement.

### Value Radar

- Usa identidad exacta de cuota y economía settlement-aware.
- `EV <= 0`: `no_value`.
- `EV > 0` y edge conservador positivo: `interesting`.
- `EV > 0` sin confirmación conservadora positiva: `watch`.

### Combinaciones

- Parlay: 2–4 selecciones.
- Soñadora: 5–15 selecciones.
- Máximo una selección por `fixture_id + market_family`.
- Mercados asiáticos excluidos porque el contrato de combinación no liquida patas parciales.

### LIVE

- Flujo clásico funcional y separado del prepartido.
- Mercados asiáticos se muestran como no evaluables/no soportados productivamente en LIVE.
- El snapshot prepartido es solo lectura; LIVE no contamina Memoria ni aprende automáticamente.

### Memoria y Bet Tracker

- Memoria append-only para clásicos, Asian Total y Team Asian Handicap, sin autolearning.
- Team Asian Handicap conserva equipo/lado/línea.
- Resolución oficial: `full_win`/`half_win` → HIT; `push` → VOID; `half_loss`/`full_loss` → MISS.
- Settlements asiáticos quedan fuera de calibración binaria.
- Bet Tracker admite apuestas individuales clásicas y asiáticas, incluido settlement parcial.
- La liquidación individual permanece separada de la liquidación global de combinaciones.

## Identidad exacta de cuota

- Totales: `fixture_id + market_family + direction + line`.
- Team Asian Handicap: `fixture_id + market_family + team_id + line`.
- Cuando existe, también se conserva identidad de mercado/proveedor.
- Una cuota de `goals` nunca se reutiliza para `asian_total_goals`, ni viceversa.

## Railway

- El commit `f673db4` **no está documentado como desplegado**.
- Este bloque no toca Railway, variables ni volumen.
- Próximo paso operativo, después del commit y push documental: desplegar el HEAD autorizado y hacer smoke test.

## Pendientes no bloqueantes

- Mapping automático de cuotas provider/API-Football para Team Asian Handicap.
- Settlement parcial por pata dentro de combinaciones.
- Calibración settlement-aware/multiclase con resultados reales.
- Nuevas familias/deportes y rediseños opcionales.
- Consolidación futura del registro central de mercados.

## Próximo paso exacto

1. Revisar y commitear únicamente la documentación de este cierre.
2. Push de `audit/atlas-engine-v3`.
3. Desplegar el nuevo HEAD en Railway mediante el mecanismo existente.
4. Ejecutar smoke test de producción sin llamadas o escrituras innecesarias.
5. Abrir hotfix solo ante un bug real reproducible.
