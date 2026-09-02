# Atlas — Estado actual

> Documento operativo y corto: situación viva del repositorio. Se reemplaza/actualiza en cada sesión relevante; no repite arquitectura estable (ver `ATLAS_CONTEXT_MASTER.md`) ni el historial de decisiones (ver `ATLAS_DECISIONS_LOG.md`).

**Fecha:** 2026-09-01

## Git

- Rama: `audit/atlas-engine-v3`
- HEAD: `459e776579ac510aff8684e320431c6d103c1ad6` (`459e776`)
- Últimos commits relevantes:
  - `459e776` — `feat(atlas): improve asian totals modeling and value economics`
  - `02d6cbf` — `docs: add canonical Atlas recovery context`
- Estado remoto: sincronizado con `origin/audit/atlas-engine-v3` — **0 ahead / 0 behind**, verificado tras `git push` (no por suposición).
- Working tree: **limpio**.
- **No hubo deploy a Railway** en esta fase. **No se creó ningún tag nuevo.**
- El tag local histórico `v3.0.1-stable` sigue apuntando a `2459118` — **no debe reinterpretarse** como si apuntara a `459e776`. `459e776` es el HEAD actual de la rama, sin tag propio.

## Runtime

- Next.js `16.2.12` (verificado contra `package.json` y contra la salida real de `npm run build` en esta sesión).
- React `19.2.4` / react-dom `19.2.4` (verificado contra `package.json`).

## Último estado automático — VERIFICADO en esta sesión (no reportado de fuera)

- `npm test`: **1295 tests, 1295 pass, 0 fail**.
- `npm run lint`: **PASS — 0 errores, 0 warnings**.
- `npm run build`: **PASS** (Next.js 16.2.12, Turbopack; compilación, TypeScript y generación de páginas estáticas sin errores).
- `git diff --check` / `git diff --cached --check`: **PASS** en ambos casos, antes y en el momento del commit.

A diferencia de la entrada anterior de este documento (que citaba cifras reportadas fuera de sesión), estas cuatro verificaciones se **ejecutaron directamente** como parte del pipeline de esta fase, inmediatamente antes del commit `459e776`.

## Railway

Sin cambios respecto a la entrada anterior — no se tocó Railway en esta fase:

- Último commit **explícitamente confirmado históricamente** en Railway: `ba20d1e`.
- `bbb4534`, `2459118`, `02d6cbf`, `459e776`: estado en Railway **no confirmado**.
- **No asumir** que el deployment actual de Railway corresponde al HEAD actual.
- El repositorio sigue sin contener configuración, script ni documentación de Railway (`railway.json`, `Procfile`, `nixpacks.toml`, workflows `.github/`) — el estado real de despliegue no puede verificarse localmente.

## Estado actual de mercados

### Cinco familias clásicas

Sin cambio funcional en esta fase — siguen integradas en Jornada clásica exactamente igual que antes:

- `goals`
- `corners`
- `cards`
- `total_shots`
- `shots_on_goal`

### `asian_total_goals` — modelado deportivo y económico completado; integración a Jornada sigue pendiente

**Nuevo en esta fase (commit `459e776`):**

- **Favorabilidad Atlas** (`sports_favorability`, escala `/100`) reemplaza `weighted_win_probability` como métrica deportiva principal del candidato — NO es una probabilidad literal de ganar. Fórmula: `FW + 0.75·HW + 0.5·Push + 0.25·HL`.
- Generación autónoma de líneas asiáticas (`generateAsianTotalGoalLines`), soportando matemáticamente cualquier línea no negativa en pasos de `0.25` (`.0/.25/.5/.75/...`), sin catálogo rígido como requisito.
- **`price_equivalent_probability`** (`= W/(W+L) = 1/asianFairOdds`) como magnitud económica nueva, comparable en puntos porcentuales contra la probabilidad implícita de una cuota — verificado matemáticamente (signo siempre coherente con el signo del EV).
- `raw_edge_pp` corregido: ya no usa `weighted_win_probability − implied` (podía dar edge negativo exactamente en el precio justo); ahora usa `price_equivalent_probability − implied`.
- `conservative_edge_pp` corregido: ya no usa el intervalo de Favorabilidad; usa un intervalo económico propio (`price_equivalent_probability_low/high`, aproximación Wilson sobre la masa económica decisiva `W+L`).
- `asianFairOdds`/`asianExpectedValue` auditados y confirmados matemáticamente correctos — **sin cambios de fórmula**.
- Clasificación del Radar (`INTERESTING`/`WATCH`/`NO_VALUE`) y `DirectorAtlas` (`parlay_eligibility_reason`) actualizados para usar las magnitudes económicas correctas en vez de Favorabilidad.

**Sin cambio (persiste igual que antes de esta fase):**

- **Análisis individual: SÍ** — seleccionable en el dropdown de familia (`SPECIFIC_SPORTS_MARKETS`, `src/core/intelligence/marketEngine.js:11-14`).
- **Radar de Valor: SÍ**, mediante el pipeline especial (`buildJourneyValueRadar`, `src/core/services/valueRadarService.js:75-129`), ahora con la economía corregida.
- **Jornada clásica normal: NO** — el checkbox de "Mercados de interés" sigue usando `SPORTS_MARKETS` (5 familias, sin asian); el loop automático `evaluateSportsMarkets` tampoco la evalúa.

**Esto sigue siendo un GAP frente al objetivo funcional confirmado** (catálogo de siete familias en `ATLAS_CONTEXT_MASTER.md`) — la integración a Jornada **no** se realizó en esta fase y no debe afirmarse como completada.

### `team_asian_handicap`

**Sin cambios — sigue sin implementarse.** Confirmado nuevamente: sin contratos/tipos, sin UI, sin Radar, sin Jornada, sin análisis individual. Sigue **APROBADO PARA DISEÑO/DESARROLLO FUTURO** (ver `ATLAS_DECISIONS_LOG.md`), con identidad propuesta `fixture_id + market_family + team_id + line` (+ `side: home|away`, sin reutilizar `direction=over|under`) y soporte requerido para líneas firmadas en pasos de cuarto (`...,-0.25, 0, +0.25,...`).

## Hallazgo de arquitectura: catálogos de familias (sin cambios en esta fase)

Se mantienen los **~16 catálogos/listas** independientes de familias de mercado ya documentados. No se tocó ese drift en esta fase (fuera de alcance). `src/app/atlas-live.js` (`MARKET_LABELS`) sigue sin incluir `asian_total_goals`.

## Hallazgo operativo: 174 candidatos / 0 cuotas exactas (sin cambios en esta fase)

Sigue documentado igual que antes — mecanismo de código identificado, causa operacional exacta de ese run no demostrada. No relacionado con la corrección económica de esta fase (esa corrección afecta `raw_edge_pp`/`conservative_edge_pp` una vez que SÍ existe una cuota exacta, no la disponibilidad de la cuota en sí).
