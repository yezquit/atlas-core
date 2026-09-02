# Atlas — Contexto maestro de arquitectura

> Reglas estructurales estables del producto. El estado vivo está en `ATLAS_CURRENT_STATE.md`; el historial append-only, en `ATLAS_DECISIONS_LOG.md`.

## 1. Producto

Atlas es una aplicación web privada Next.js para análisis deportivo y apoyo prudente a decisiones. No es un tipster ni promete ganancias. Su principio es **“Comprender antes de decidir”**.

El producto obtiene y valida datos, construye evidencia deportiva, descarta opciones sin respaldo y presenta una única voz final mediante DirectorAtlas. La autenticación es personal y la persistencia productiva usa filesystem montado.

## 2. Capas

1. **Data Engine:** proveedor, validación, normalización, caché y persistencia.
2. **League Intelligence:** perfil estadístico y cobertura de la competición.
3. **Match Intelligence:** forma, localía, visitante, contexto, árbitro, alineaciones y lesiones cuando hay evidencia.
4. **Market Engine:** líneas, distribución, probabilidad/favorabilidad, Solidez, riesgo y economía.
5. **Director Atlas:** única voz pública que integra decisión, razones, riesgos, faltantes y próxima acción.

En código, `src/app` contiene interfaz y Route Handlers; `src/core/services` orquesta; `src/core/infrastructure` integra proveedor/persistencia; `src/core/intelligence` y `src/core/modules` contienen dominio.

## 3. Reglas transversales

- Deporte primero, precio después.
- Una cuota nunca cambia la probabilidad/favorabilidad, Solidez, línea, dirección, equipo o selección deportiva.
- `sports_score` es **Solidez Atlas**, no probabilidad.
- `radar_score` es **Convergencia Radar**, no probabilidad.
- Gemini es manual; su evidencia es `user_reported`, no verificación del proveedor.
- Missing data permanece explícito. No se inventan estadísticas, perfiles ni probabilidades.
- DirectorAtlas conserva las frases oficiales: `SÍ, ME GUSTA ESTA OPCIÓN`, `ESPERAR`, `NO ME GUSTA ESTA OPCIÓN`.

## 4. Catálogo funcional cerrado

Familias clásicas:

- `goals`
- `total_shots`
- `shots_on_goal`
- `cards`
- `corners`

Familias settlement-aware:

- `asian_total_goals`
- `team_asian_handicap`

`cards` conserva el contrato existente basado en total de tarjetas amarillas. No redefinirlo sin una decisión explícita.

## 5. Observaciones y modelado

`canonicalObservations` representa fixtures únicos por `fixture_id`. Un fixture puede pertenecer a varias ventanas mediante memberships y cuenta una vez dentro de cada source al que pertenece, sin deduplicar por valor numérico.

Distribución, effective sample size y probabilidad/favorabilidad usan el mismo dataset canónico. Los campos descriptivos `hits`, `sample_size` y `observed_rate` se reconstruyen solo desde observaciones reales del source. `null` nunca se convierte silenciosamente en cero; cero numérico real sí es evidencia válida.

Los componentes FOR/AGAINST, fuentes y pesos deben permanecer auditables. `model_coherence_warning` informa contraevidencia sin fabricar certeza.

## 6. Jornada

`scanSportsJourney` analiza los fixtures elegibles y respeta exactamente las familias solicitadas. Si una familia no produce candidatos, devuelve ausencia; nunca hace fallback a `goals`.

- `candidates`: catálogo completo de candidatos deportivos.
- `recommendedCandidates`: recomendaciones clásicas comparables por probabilidad literal.
- `asianRecommendedCandidates`: opciones asiáticas ordenadas internamente por `settlement_favorability`.
- `combinationCandidates`: universo clásico permitido para Parlay/Soñadora; excluye mercados asiáticos.

Agregar Radar no altera el orden deportivo de Jornada. Cada candidato conserva un `radarAnalysis` correspondiente a su propia familia e identidad.

## 7. Análisis individual

Flujo: fixture → familia → dirección/equipo → línea exacta → análisis deportivo → Gemini manual opcional → cuota exacta opcional → evaluación económica → DirectorAtlas.

Al evaluar solo precio, el cliente envía la versión deportiva fuente. El servidor reutiliza ese snapshot únicamente si coinciden exactamente fixture, familia, dirección/equipo y línea. No vuelve a ejecutar el análisis deportivo. Cambiar línea obliga a un nuevo análisis exact-line y nunca reutiliza la probabilidad de otra línea.

## 8. Probabilidad, Favorabilidad y Solidez

### Mercados clásicos

`estimated_probability` es probabilidad deportiva literal cuando el modelo puede calcularla. No se deriva de una base heurística de 50% y queda no disponible sin modelo/evidencia válida.

### Mercados asiáticos

Los cinco estados son:

- `full_win`
- `half_win`
- `push`
- `half_loss`
- `full_loss`

La Favorabilidad Atlas es:

```text
FW + 0.75·HW + 0.5·Push + 0.25·HL
```

Se presenta `/100`. No es probabilidad literal, no se compara directamente con `1/cuota` y no sustituye Solidez.

Solidez Atlas mide robustez/calidad de evidencia. Para semántica settlement-aware no usa el componente clásico `probabilityBalance`.

## 9. Economía

La economía existe solo con una cuota exacta compatible.

Mercados clásicos:

```text
implied_probability = 1 / decimal_odds
fair_odds ≈ 1 / estimated_probability
EV = estimated_probability × decimal_odds − 1
```

Mercados asiáticos:

```text
W = P(full_win) + 0.5·P(half_win)
L = P(full_loss) + 0.5·P(half_loss)
FairOdds = 1 + L/W
price_equivalent_probability = W/(W+L)
EV = P(FW)·(O−1) + P(HW)·0.5·(O−1) − P(HL)·0.5 − P(FL)
```

`price_equivalent_probability` es equivalente económico del precio justo, no probabilidad literal de ganar. Push tiene retorno neto cero.

Value Radar clasifica así:

- EV no positivo: `no_value`.
- EV positivo y edge conservador positivo: `interesting`.
- EV positivo sin edge conservador positivo: `watch`.

## 10. Asian Total Goals

- Identificador: `asian_total_goals`.
- Mercado: Asiático (Más/Menos) — Total de goles.
- Admite líneas no negativas en pasos de 0.25: `.0`, `.25`, `.5`, `.75`.
- Las líneas `.25`/`.75` se dividen en dos medias líneas según el contrato asiático.
- Conserva identidad distinta de `goals`, incluso cuando una línea `.5` tenga settlement matemáticamente equivalente.

## 11. Team Asian Handicap

- Identificador: `team_asian_handicap`.
- No es total asiático ni hándicap europeo.
- La variable deportiva es `goal_difference = goles_equipo_seleccionado − goles_rival`.
- Soporta equipo local/visitante y líneas firmadas enteras o de cuarto.
- Identidad: `fixture_id + market_family + team_id + line`; `side` se conserva como `home`/`away`.
- La entrada manual de cuota exige esa identidad exacta.
- El mapping automático de cuotas del proveedor queda como trabajo futuro no bloqueante.

## 12. Identidad exacta de cuota

- Totales/clásicos: `fixture_id + market_family + direction + line`.
- Team Asian Handicap: `fixture_id + market_family + team_id + line`.
- Cuando esté disponible, se conserva además la identidad real del mercado/proveedor.
- No se reutilizan cuotas entre fixtures, familias, direcciones, equipos o líneas distintas.
- `goals` y `asian_total_goals` nunca comparten cuota automáticamente.

## 13. DirectorAtlas y Radar

DirectorAtlas es la única voz pública. `atlasExecutiveAnswer` puede permanecer como implementación interna/auditoría, pero no compite en la vista simple.

Radar presenta `high → ALTA`, `low → BAJA`, `neutral → NEUTRAL`. La contraevidencia adversarial fallida puede mostrarse como `BLOQUEADA POR CONTRAEVIDENCIA`.

Sin cuota exacta, la probabilidad/favorabilidad deportiva puede seguir visible, pero cuota, probabilidad implícita y diferencia vs. cuota quedan no disponibles.

## 14. Combinaciones

- Parlay: 2–4 selecciones.
- Soñadora: 5–15 selecciones.
- Un fixture puede aportar varias patas, máximo una por `fixture_id + market_family`.
- Se conservan controles de duplicidad, contradicción, correlación y elegibilidad.
- Mercados asiáticos están excluidos hasta que el contrato de combinaciones soporte settlement parcial por pata.
- Una combinación registrada cuenta como una sola apuesta; sus patas son snapshot inmutable.

## 15. LIVE

LIVE es un pipeline separado del prepartido y vuelve a obtener su propio estado. Las familias clásicas son funcionales. Los mercados asiáticos no son productivamente evaluables en LIVE y deben indicarlo de forma explícita.

El snapshot prepartido mostrado en LIVE es de solo lectura. LIVE no modifica silenciosamente Memoria, no activa autolearning y no contamina perfiles prepartido.

## 16. Memoria Atlas

- Persistencia append-only.
- Soporta predicciones oficiales clásicas, Asian Total y Team Asian Handicap.
- Team Asian conserva equipo, lado y línea.
- Settlement oficial: FW/HW → HIT, Push → VOID, HL/FL → MISS.
- Casos settlement-aware se excluyen de calibración binaria; no se fuerzan a una etiqueta probabilística clásica.

## 17. Bet Tracker

- Mantiene compatibilidad con registros simples legacy.
- Soporta apuestas individuales clásicas y asiáticas con settlement parcial.
- Team Asian conserva `team_id`, `side` y línea.
- Payout/P&L se calcula con stake, cuota total aceptada y resultado real.
- Resultado individual y liquidación global de Parlay/Soñadora permanecen separados.

## 18. Seguridad, proveedor y persistencia

- API-Football es el proveedor deportivo externo configurado; no es la autoridad sobre qué líneas puede modelar Atlas.
- Secretos solo en variables de entorno del servidor. Nunca exponerlos al navegador, documentación o Git.
- `.env*`, `.atlas-data`, `.atlas-cache`, ledgers y credenciales son privados.
- Producción persiste en `/app/.atlas-data` mediante el volumen existente.
- No borrar, recrear o migrar destructivamente el volumen sin autorización explícita.

## 19. Estado de despliegue

El estado Git y la validación local están en `ATLAS_CURRENT_STATE.md`. No inferir que un commit está en Railway solo porque fue pushed. Verificar deployment ID y commit explícitamente.

## 20. Alcance futuro no bloqueante

- Mapping automático provider/API-Football para cuotas Team Asian Handicap.
- Settlement asiático por pata en combinaciones.
- Calibración settlement-aware/multiclase con muestras reales.
- Nuevas familias/deportes.
- Rediseño visual opcional.
- Registro central de familias/contratos si se autoriza una fase arquitectónica.

## 21. Rescate versionado

`RESCATE_ATLAS_V4.md` es el rescate vigente y sustituye cualquier rescate v3 o anterior como descripción del estado funcional actual. Las versiones previas solo conservan valor histórico.
