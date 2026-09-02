# ATLAS — Instrucciones de reanudación

Este documento permite retomar Atlas sin reconstruir conversaciones antiguas.

## Lectura obligatoria

En un chat nuevo, leer en este orden:

1. `AGENTS.md`
2. `ATLAS_CONTEXT_MASTER.md`
3. `ATLAS_CURRENT_STATE.md`
4. `ATLAS_DECISIONS_LOG.md`
5. `ATLAS_MANUAL_TESTS.md`
6. `RESCATE_ATLAS_V4.md`
7. El checkpoint más reciente de `docs/atlas-checkpoints/`

## Verificación inicial obligatoria

No asumir que este snapshot sigue vigente. Confirmar antes de actuar:

```bash
git branch --show-current
git rev-parse HEAD
git status --short
git rev-list --left-right --count origin/audit/atlas-engine-v3...HEAD
```

Snapshot documentado el 2026-09-02:

- rama `audit/atlas-engine-v3`;
- HEAD `f673db418b95321eb6b4f2a52fdff140d2f40a05`;
- working tree limpio antes de este bloque documental;
- origin 0 ahead / 0 behind.

## Estado funcional que no debe reconstruirse

- Jornada, Individual, Value Radar, LIVE clásico, Memoria y Bet Tracker están cerrados para el alcance V3.
- Familias productivas: cinco clásicas, `asian_total_goals` y `team_asian_handicap`.
- Favorabilidad Atlas no es probabilidad.
- Solidez Atlas no es probabilidad.
- Economía asiática usa settlement completo.
- Asian Total y Team Asian Handicap no se mezclan con shortlists de probabilidad clásica.
- Mercados asiáticos permanecen fuera de Parlay/Soñadora.
- Gemini es manual y su evidencia conserva procedencia `user_reported`.

## Estado de validación

- Tests: 1520/1520 PASS.
- Lint: PASS.
- Build: PASS, Next.js 16.2.12, TypeScript PASS, 22/22 páginas.

No repetir estas verificaciones por rutina durante una tarea documental; volver a ejecutarlas cuando un cambio de código o una autorización específica lo requiera.

## Railway

No asumir que `f673db4` está desplegado. El siguiente bloque operativo, tras commit y push de documentación, es verificar el mecanismo existente, desplegar el HEAD autorizado y hacer smoke test. No tocar variables, secretos ni volumen sin autorización expresa.

## Reglas de trabajo

- El repositorio local es la fuente de verdad.
- Diagnóstico, implementación, pruebas, commit, push y deploy son autorizaciones separadas salvo instrucción explícita.
- No imprimir secretos ni abrir `.env*`, `.atlas-data` o `.atlas-cache` sin necesidad y autorización.
- No consumir API-Football para una tarea que pueda resolverse por inspección o tests locales.
- No cambiar fórmulas, pesos o contratos cerrados por mejoras cosméticas.
- Corregir únicamente bugs reproducibles y con tests focalizados.

## Rescate vigente

`RESCATE_ATLAS_V4.md` reemplaza como documento de rescate vigente cualquier versión externa v3 o anterior. Los rescates antiguos conservan valor histórico, pero ya no describen el producto funcional cerrado.
