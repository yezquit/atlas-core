# ATLAS — INSTRUCCIONES DE REANUDACIÓN

> Documento corto diseñado para iniciar un **nuevo chat** sin reconstruir conversaciones anteriores. No repite arquitectura ni decisiones — solo indica dónde leerlas y cómo proceder con seguridad.

1. **No inventar nunca el estado del código.** Todo lo que se afirme sobre Atlas debe verificarse contra el repositorio, no contra la memoria de la conversación.
2. **El coordinador del chat no tiene acceso directo garantizado al repositorio.**
3. **Actualmente las inspecciones/modificaciones se están realizando mediante Cloud** (Claude Code sobre `/Users/yezidquitian/Documents/atlas-core`).
4. **Antes de cualquier cambio, hacer que Cloud lea, en este orden:**
   - `AGENTS.md`
   - `ATLAS_CONTEXT_MASTER.md`
   - `ATLAS_CURRENT_STATE.md`
   - `ATLAS_DECISIONS_LOG.md`
   - `ATLAS_MANUAL_TESTS.md`
5. **Verificar Git** (rama, HEAD, tag, working tree) antes de asumir cualquier estado — no confiar en lo que diga este documento sin confirmarlo primero. **A la fecha de esta actualización (2026-09-01), el HEAD real es `459e776`, rama `audit/atlas-engine-v3`, sincronizada con `origin` (0 ahead/0 behind) — verificarlo de nuevo, no asumirlo eternamente cierto.**
6. **No tocar Railway sin autorización.**
7. **No consumir cuota API-Football sin autorización** (no ejecutar `verify:phase2`/`verify:operational` ni hacer llamadas reales sin pedirlo explícitamente).
8. **No mezclar implementación, pruebas globales, commit, push y deployment en una sola autorización.** Cada uno requiere confirmación explícita y separada.
9. **Jornada y Radar son modos paralelos** — no se sustituyen entre sí.
10. **Ambas deben terminar soportando las siete familias objetivo** (ver `ATLAS_CONTEXT_MASTER.md`).
11. **Team Asian Handicap todavía no está implementado.**
12. **`asian_total_goals` ya tiene modelado deportivo (Favorabilidad Atlas) y economía (`price_equivalent_probability`, Fair Odds/EV, edges corregidos) completamente implementados y verificados (commit `459e776`), pero SIGUE SIN estar integrado a Jornada clásica.** No afirmar integración a Jornada — sigue siendo un gap confirmado, no completado.
13. **Próximo bloque de trabajo actual (no rehacer lo ya terminado):**
    - consolidar arquitectura de mercados (resolver los ~16 catálogos duplicados detectados);
    - integrar `asian_total_goals` correctamente en Jornada clásica, sin alterar la filosofía SPORTS-FIRST;
    - diseñar/implementar `team_asian_handicap` (deportivo, independiente de cuotas, antes de integrarlo a Jornada/Radar);
    - auditar la amplitud real del universo de candidatos del Radar (pendiente de investigación abierto en `ATLAS_DECISIONS_LOG.md`, sin resolver);
    - solo después, continuar con Parlay/Soñadora/LIVE/Memoria/Bet Tracker según compatibilidad;
    - Railway únicamente cuando la fase local esté suficientemente estable.

---

## Prompt de rescate versionado (añadido 2026-09-01)

El "Prompt de rescate ATLAS" externo, guardado por el usuario en Bloc de notas (fuera de este repositorio), **es versionado**.

Cuando cambie una decisión estructural importante del proyecto — filosofía de Jornada, Radar, mercados, proveedor, persistencia, arquitectura, workflow, o reglas económicas — el coordinador **debe advertir al usuario** que el prompt anterior quedó parcialmente obsoleto y **entregar una nueva versión completa** para reemplazarlo. No depender de que el usuario edite manualmente fragmentos sueltos del prompt anterior.

> **El prompt de rescate más reciente siempre prevalece sobre versiones anteriores.**

**Estado a 2026-09-01 (post commit `459e776`):** la corrección de modelado/economía asiática (Favorabilidad Atlas, `price_equivalent_probability`, Fair Odds/EV, edges corregidos) es exactamente el tipo de decisión estructural que activa esta regla. **El prompt de rescate externo anterior queda parcialmente obsoleto** y debe reemplazarse por una nueva versión completa — **RESCATE ATLAS v3** — que el coordinador debe generar después de que el usuario acepte esta actualización documental. No se escribe aquí el prompt externo completo (vive fuera del repositorio, en Bloc de notas); esta sección solo registra que corresponde generarlo.

---

## PROMPT CORTO PARA NUEVO CHAT

Copiar y pegar al iniciar un chat nuevo:

```
Estoy retomando el proyecto Atlas (/Users/yezidquitian/Documents/atlas-core).
No reconstruyas el contexto desde la memoria de esta conversación: lee primero
AGENTS.md, luego ATLAS_CONTEXT_MASTER.md, ATLAS_CURRENT_STATE.md,
ATLAS_DECISIONS_LOG.md y ATLAS_MANUAL_TESTS.md en ese orden, y verifica el
estado real de Git antes de asumir nada. Esta tarea es de [diagnóstico /
implementación — especifica cuál] y el alcance es exactamente: [describe
la tarea concreta]. No toques Railway, no consumas cuota de API-Football,
y no mezcles commit/push/deploy con la tarea salvo que yo lo autorice
explícitamente en este mensaje.
```
