# Atlas — Estado actual

> Documento operativo y corto: situación viva del repositorio. Se reemplaza/actualiza en cada sesión relevante; no repite arquitectura estable (ver `ATLAS_CONTEXT_MASTER.md`) ni el historial de decisiones (ver `ATLAS_DECISIONS_LOG.md`).

**Fecha:** 2026-09-01

## Git

- Rama: `audit/atlas-engine-v3`
- HEAD: `24591184448ff83a493dca90b90697e90bce2e4f` (`2459118`)
- Tag local sobre HEAD: `v3.0.1-stable`
- Working tree: limpio (verificado en esta sesión, `git status --porcelain` vacío)

## Runtime

- Next.js `16.2.12` (verificado contra `package.json` en esta sesión)
- React `19.2.4` / react-dom `19.2.4` (verificado contra `package.json` en esta sesión)

## Último estado automático conocido (no verificado en esta tarea documental)

- lint aprobado
- 1.207 tests aprobados, 0 fallos
- build aprobado
- `git diff --check` aprobado

**Nota obligatoria:** estas cuatro verificaciones corresponden al **estado previamente confirmado** reportado fuera de esta sesión. Esta tarea es exclusivamente documental — no se ejecutaron `npm run lint`, `npm test` ni `npm run build` en esta sesión para producir estos números; se registran tal como fueron comunicados, no como resultado propio de este diagnóstico.

## Railway

- Último commit **explícitamente confirmado históricamente** en Railway: `ba20d1e`.
- `bbb4534`: estado en Railway **no confirmado**.
- `2459118`: estado en Railway **no confirmado**.
- **No asumir** que el deployment actual de Railway corresponde a HEAD.

**Nota de procedencia:** esta información sobre Railway proviene de contexto reportado por el usuario, no de evidencia verificable dentro de este repositorio — un diagnóstico de código previo (ver referencia en `ATLAS_DECISIONS_LOG.md`) confirmó que el repositorio no contiene ninguna configuración, script ni documentación de Railway (`railway.json`, `Procfile`, `nixpacks.toml`, workflows `.github/`), por lo que el estado real de despliegue no puede verificarse localmente sin consultar el servicio.

## Estado actual de mercados

### Cinco familias clásicas

Actualmente integradas en Jornada clásica (seleccionables desde la UI, generan candidatos automáticamente, entran a ranking, pueden aparecer en `recommendedCandidates` y `candidates`):

- `goals`
- `corners`
- `cards`
- `total_shots`
- `shots_on_goal`

### `asian_total_goals`

Estado actual verificado por diagnóstico de código:

- **Análisis individual: SÍ** — seleccionable en el dropdown de familia (`SPECIFIC_SPORTS_MARKETS`, `src/core/intelligence/marketEngine.js:11-14`), aunque requiere línea manual exacta (sin catálogo automático de líneas).
- **Radar de Valor: SÍ**, mediante un pipeline especial — se construye en `buildJourneyValueRadar` (`src/core/services/valueRadarService.js:75-129`) con una llamada directa a `gateway.loadFixtureOdds`, separada de la construcción de candidatos clásicos.
- **Jornada clásica normal: NO** — el checkbox de "Mercados de interés" de Jornada usa `SPORTS_MARKETS` (5 familias, sin asian); el loop automático `evaluateSportsMarkets` tampoco la evalúa.

**Esto es un GAP frente al objetivo funcional confirmado** (ver catálogo de siete familias en `ATLAS_CONTEXT_MASTER.md`), no un comportamiento deseado.

### `team_asian_handicap`

Estado actual, confirmado por búsqueda exhaustiva en tres diagnósticos separados de esta sesión:

- **NO implementado.**
- **NO** contratos/tipos.
- **NO** UI.
- **NO** Radar.
- **NO** Jornada.
- **NO** análisis individual.

Está **APROBADO PARA DISEÑO/DESARROLLO FUTURO** (ver `ATLAS_DECISIONS_LOG.md`).

## Hallazgo de arquitectura: catálogos de familias

Se localizaron **aproximadamente 16 catálogos/listas** independientes o parcialmente duplicados relacionados con familias de mercado en el código (constantes, arrays, reglas, selectores UI, schemas). No existe hoy una única fuente de verdad completa — `src/core/intelligence/marketEngine.js` (`SPORTS_MARKETS`/`SPECIFIC_SPORTS_MARKETS`) es la más canónica, pero al menos 12 módulos mantienen listas manuales propias.

Existe **drift confirmado**: `src/app/atlas-live.js` (`MARKET_LABELS`, línea 6) **no contiene `asian_total_goals`** — nunca se actualizó cuando esa familia se añadió al resto del sistema.

**No corregir esto en esta tarea** — queda documentado como pendiente (ver `ATLAS_DECISIONS_LOG.md`).

## Hallazgo operativo: 174 candidatos / 0 cuotas exactas

Una prueba manual del usuario mostró el mensaje "Atlas encontró 174 candidatos deportivos, pero ninguno tiene una cuota exacta disponible para evaluar valor en este momento." El mecanismo de código que produce este mensaje está identificado con precisión (`src/core/services/valueRadarService.js:~138-149`), pero **la causa operacional exacta de ese run específico no fue demostrada** — requeriría la respuesta cruda de API-Football de esa sesión, no disponible en el repositorio. Ver `ATLAS_DECISIONS_LOG.md` y `ATLAS_MANUAL_TESTS.md`.

## Servidor local

`npm run dev` puede seguir activo en `http://localhost:3000` (Next.js 16.2.12, Turbopack) desde una acción previa de esta sesión de trabajo; no es parte del estado versionado del repositorio.
