# RESCATE ATLAS V4

> Documento autocontenido para recuperar el proyecto en un chat nuevo. Este rescate sustituye v3 y cualquier versión anterior como referencia operativa vigente. Verificar siempre el repositorio antes de confiar en el snapshot.

## 1. Identidad del proyecto

- Proyecto: Atlas Core.
- Repositorio local: `/Users/yezidquitian/Documents/atlas-core`.
- Remoto: `yezquit/atlas-core`.
- Rama documentada: `audit/atlas-engine-v3`.
- HEAD base: `f673db418b95321eb6b4f2a52fdff140d2f40a05` (`f673db4`).
- Estado inicial del cierre documental: working tree CLEAN, origin 0 ahead / 0 behind.
- Aplicación Next.js privada, personal y respaldada por filesystem persistente.

## 2. Cómo retomar

Leer completamente, en orden:

1. `AGENTS.md`
2. `ATLAS_CONTEXT_MASTER.md`
3. `ATLAS_CURRENT_STATE.md`
4. `ATLAS_DECISIONS_LOG.md`
5. `ATLAS_MANUAL_TESTS.md`
6. `docs/atlas-checkpoints/2026-09-02-atlas-functional-closure.md`

Después verificar:

```bash
git branch --show-current
git rev-parse HEAD
git status --short
git rev-list --left-right --count origin/audit/atlas-engine-v3...HEAD
```

No reconstruir el estado desde una conversación antigua ni asumir que el HEAD documentado sigue vigente.

## 3. Principio de producto

Atlas es análisis deportivo y apoyo prudente a decisiones, no un tipster. Su principio es “Comprender antes de decidir”. No promete ganancias y nunca debe inventar estadísticas, cuotas, probabilidades o evidencia.

Arquitectura conceptual:

1. Data Engine.
2. League Intelligence.
3. Match Intelligence.
4. Market Engine.
5. Director Atlas como única voz pública.

Regla central: **deporte primero; precio después**.

## 4. Validación cerrada

- Tests: 1520/1520 PASS.
- Lint: PASS.
- Build: PASS.
- Next.js 16.2.12.
- TypeScript PASS.
- 22/22 páginas.

No repetir estas cifras como actuales después de cambios de código; volver a ejecutar el pipeline correspondiente.

## 5. Contratos inviolables

- `sports_score` = Solidez Atlas; no probabilidad.
- `estimated_probability` = probabilidad literal solo para semántica clásica calculable.
- `sports_favorability` = Favorabilidad Atlas settlement-aware; escala `/100`, no probabilidad literal.
- `radar_score` = Convergencia Radar; no probabilidad.
- Una cuota nunca cambia selección, línea, equipo, probabilidad/favorabilidad, Solidez o incertidumbre.
- Sin evidencia/modelo, el dato queda no disponible; `null` no se convierte en cero.
- DirectorAtlas conserva exactamente: `SÍ, ME GUSTA ESTA OPCIÓN`, `ESPERAR`, `NO ME GUSTA ESTA OPCIÓN`.

## 6. Mercados funcionales

Clásicos:

- `goals`
- `total_shots`
- `shots_on_goal`
- `cards`
- `corners`

Settlement-aware:

- `asian_total_goals`
- `team_asian_handicap`

No hay fallback a `goals` si una familia solicitada no produce candidatos.

## 7. Jornada

Jornada analiza fixtures elegibles y respeta `marketIds` solicitados.

- `candidates`: catálogo completo.
- `recommendedCandidates`: shortlist clásica por probabilidad literal.
- `asianRecommendedCandidates`: shortlist Asian por Favorabilidad.
- `combinationCandidates`: universo clásico para combinaciones; Asian excluido.

No ordenar clásicos y Asian mediante una magnitud cross-family común. Radar no cambia el orden deportivo.

## 8. Análisis individual

Soporta clásicos, Asian Total y Team Asian Handicap.

Flujo: fixture → selección exacta → análisis deportivo → Gemini manual opcional → precio exacto opcional → economía → DirectorAtlas.

Al pulsar EVALUAR CUOTA se usa `sourceAnalysisId`/versión fuente y se reutiliza el snapshot solo si coincide la identidad exacta. No ejecutar de nuevo el análisis deportivo si solo cambió el precio. Si cambia la línea/equipo/familia/dirección, ejecutar reanálisis; nunca reutilizar una probabilidad vieja.

Gemini es copy/paste manual. Su evidencia es `user_reported`, aun con URL válida; no falsificar procedencia provider.

## 9. Asian Total Goals

- Mercado: Asiático (Más/Menos) — Total de goles.
- Líneas no negativas en pasos de 0.25.
- Dirección Over/Under.
- Las quarter lines se dividen explícitamente entre dos medias selecciones.
- Estados: FW, HW, Push, HL, FL.
- Identidad distinta de `goals`.

## 10. Team Asian Handicap

- Hándicap asiático de equipo, no total asiático ni hándicap europeo.
- Equipo seleccionado explícito; lado `home`/`away`.
- Variable: goles del equipo seleccionado menos goles del rival.
- Línea firmada entera o de cuarto.
- Estados: FW, HW, Push, HL, FL.
- Identidad exacta: `fixture_id + market_family + team_id + line`.
- La cuota manual exacta funciona.
- La cuota automática provider/API-Football no está implementada y es futuro no bloqueante.

## 11. Favorabilidad y economía asiática

```text
Favorabilidad = FW + 0.75·HW + 0.5·Push + 0.25·HL
W = FW + 0.5·HW
L = FL + 0.5·HL
FairOdds = 1 + L/W
price_equivalent_probability = W/(W+L)
EV = FW·(O−1) + HW·0.5·(O−1) − HL·0.5 − FL
```

Favorabilidad mide atractivo deportivo settlement-aware; Solidez mide calidad de evidencia; `price_equivalent_probability` sirve para la comparación económica. Ninguna sustituye a las otras.

Value Radar:

- EV <= 0 → `no_value`.
- EV > 0 y edge conservador > 0 → `interesting`.
- EV > 0 sin edge conservador > 0 → `watch`.

## 12. Identidad de cuota

- Clásicos/Asian Total: `fixture_id + market_family + direction + line`.
- Team Asian: `fixture_id + market_family + team_id + line`.
- Mantener market/provider identity cuando exista.
- Nunca compartir quote entre `goals` y `asian_total_goals`.
- Nunca usar una quote de otro fixture, línea, dirección, equipo o familia.

## 13. Observaciones canónicas

`canonicalObservations` contiene fixtures únicos. Memberships expresan pertenencia a `home_role`, `away_role`, ventanas recientes y league. Dos fixtures con el mismo valor cuentan dos veces; no deduplicar por valor. Un fixture compartido cuenta una vez dentro de cada source, nunca dos veces en el mismo source.

`hits`, `sample_size` y `observed_rate` son descriptivos y se derivan del valor real de cada observación del source. Si no hay valores evaluables: hits/rate permanecen null y la UI suprime la afirmación. Un cero numérico real sí se muestra.

## 14. Combinaciones

- Parlay: 2–4.
- Soñadora: 5–15.
- Un mismo fixture puede aportar varias familias.
- Máximo una selección por `fixture_id + market_family`.
- Mantener controles de duplicado, contradicción, correlación y elegibilidad.
- Asian Total y Team Asian están bloqueados: el contrato actual no liquida settlement parcial por pata.
- Una combinación registrada cuenta como una apuesta global y conserva snapshot inmutable de patas.

## 15. LIVE

- Pipeline clásico separado y funcional.
- Snapshot prepartido solo lectura.
- Mercados Asian no evaluables/no soportados productivamente en LIVE.
- No autolearning, no escritura silenciosa en Memoria, no contaminación del modelo prepartido.
- Favorabilidad prepartido se muestra `/100`, nunca como probabilidad.

## 16. Memoria y predicción oficial

- Append-only.
- Soporta clásicos, Asian Total y Team Asian.
- Team Asian conserva equipo/lado/línea.
- FW/HW → HIT; Push → VOID; HL/FL → MISS.
- Settlement-aware excluido de calibración binaria.
- No hay autolearning.

## 17. Bet Tracker

- Compatible con registros simples legacy.
- Apuesta individual clásica/Asian/Team Asian.
- Settlement parcial y P/L coherente.
- Team Asian conserva equipo/lado/línea.
- Resultado individual separado de liquidación global Parlay/Soñadora.

## 18. Bugs importantes ya cerrados

- Hechos Gemini fragmentados y fuentes válidas tratadas como rechazadas.
- Prompt Gemini sin regla suficiente contra inferencias/desactualización.
- `null` convertido en 0% en motivos deportivos.
- EVALUAR CUOTA reconstruía y perdía el snapshot deportivo.
- Familias solicitadas reemplazadas downstream por todas las familias, permitiendo que `goals` ganara.
- Director pedía cuota mientras el panel consideraba la selección unavailable.
- Ranking/economía trataban Favorabilidad como probabilidad literal.
- Scout Asian ordenaba por probabilidad clásica en lugar de Favorabilidad.
- Presentación Journey Asian mezclaba semánticas.
- LIVE/Memoria/Bet Tracker no conservaban completamente settlement y Team Asian.
- Integración transversal Team Asian bloqueaba flujos que ya tenían contrato suficiente.

Una hipótesis histórica sobre `resultForLine`/ternario no terminó en bug reproducible; no reconstruir una corrección inexistente.

## 19. Seguridad y persistencia

- No leer ni imprimir valores de `.env*` o secretos.
- No versionar `.atlas-data`, `.atlas-cache`, ledgers, cookies o credenciales.
- Producción usa `/app/.atlas-data` en el volumen Railway existente.
- No borrar, recrear ni migrar destructivamente ese volumen.
- API-Football es proveedor externo; no llamar sin autorización cuando no sea imprescindible.

## 20. Railway

El commit `f673db4` no está confirmado como desplegado. El bloque documental no hace deploy. Tras commit/push de documentación, verificar el mecanismo existente y desplegar el HEAD autorizado; luego smoke test. No usar `railway up` si el mecanismo vigente es auto-deploy.

## 21. Pendientes reales no bloqueantes

- Mapping automático de cuotas Team Asian Handicap desde proveedor.
- Settlement parcial de patas Asian en combinaciones.
- Calibración settlement-aware/multiclase con datos reales.
- Nuevos mercados/deportes.
- Rediseño visual opcional.
- Registro central de mercados/contratos en una futura fase arquitectónica autorizada.

No tratar estos puntos como blockers para usar el producto actual.

## 22. Próxima secuencia exacta

1. Revisar `git diff --check` y los siete documentos.
2. Autorizar y crear commit documental.
3. Push de `audit/atlas-engine-v3`.
4. Verificar auto-deploy o mecanismo Railway existente.
5. Confirmar deployment/commit, login, rutas protegidas, arranque y volumen.
6. Hacer smoke funcional mínimo.
7. Detenerse; abrir solo hotfixes de bugs reales.

## 23. Reglas para un nuevo chat

- Verificar Git antes de actuar.
- Distinguir diagnóstico, implementación, pruebas, commit, push y deploy.
- No modificar por gusto ni abrir refactors cosméticos.
- No cambiar fórmulas/pesos sin evidencia y autorización.
- No mezclar clásicos con settlement-aware.
- No inventar datos para completar una pantalla.
- Preservar historial Git y datos persistentes.

## 24. Vigencia

RESCATE ATLAS v3 fue históricamente válido, pero queda reemplazado por este V4 porque describía Asian Total y Team Asian Handicap como parciales o futuros. Este documento es la referencia de rescate vigente desde el cierre funcional del 2026-09-02.
