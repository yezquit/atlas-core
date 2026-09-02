# Atlas — Checklist de pruebas manuales

> `[ ]` pendiente · `[x]` observado y aprobado · `[!]` hallazgo. No marcar una prueba manual como aprobada únicamente porque exista cobertura automática.

## Evidencia automática de referencia

- [x] Suite global del cierre: 1520/1520 PASS.
- [x] Lint del cierre: PASS.
- [x] Build del cierre: PASS; Next.js 16.2.12; TypeScript PASS; 22/22 páginas.

## Login y navegación

- [ ] `/` sin sesión redirige a `/login`.
- [ ] Login válido establece sesión y abre Atlas.
- [ ] Navegación entre Jornada, Individual, LIVE, Combinaciones, Memoria y Mis apuestas.

## Jornada clásica

- [ ] `goals` genera exclusivamente candidatos de la familia solicitada.
- [ ] `total_shots` genera exclusivamente candidatos de la familia solicitada.
- [ ] `shots_on_goal` genera exclusivamente candidatos de la familia solicitada.
- [ ] `cards` genera exclusivamente candidatos de la familia solicitada.
- [ ] `corners` genera exclusivamente candidatos de la familia solicitada.
- [ ] Varias familias conservan catálogo completo sin fallback a `goals`.
- [ ] `recommendedCandidates` muestra mercado, dirección, línea, probabilidad, Solidez y Radar.
- [ ] Motivos deportivos nunca muestran `null de X` ni convierten ausencia en 0%.
- [ ] Introducir Radar/cuota no reordena el ranking deportivo de Jornada.

## Jornada Asian

- [ ] `asian_total_goals` aparece en catálogo y `asianRecommendedCandidates`.
- [ ] `team_asian_handicap` aparece con equipo/lado/línea correctos.
- [ ] Favorabilidad Atlas se muestra `/100`, nunca como porcentaje de ganar.
- [ ] Solidez Atlas se muestra por separado `/100`.
- [ ] Las opciones Asian no se presentan como peor/mejor que clásicas mediante una comparación cross-family inventada.

## Análisis individual clásico

- [ ] Seleccionar fixture, familia, dirección y línea exacta.
- [ ] Resultado muestra DirectorAtlas, línea, Solidez, probabilidad, Radar y contraevidencia coherentes.
- [ ] Gemini manual agrupa HECHO/IMPACTO/FUENTE/URL/FECHA y conserva `user_reported`.
- [ ] Cuota exacta manual muestra bookmaker, implícita, diferencia y EV cuando corresponda.
- [ ] EVALUAR CUOTA conserva familia/dirección/línea/probabilidad/Solidez del snapshot deportivo.
- [ ] Cambiar línea y reanalizar no reutiliza la probabilidad de la línea anterior.

## Análisis individual Asian Total

- [ ] Línea `.0`.
- [ ] Línea `.25` y split correcto.
- [ ] Línea `.5`.
- [ ] Línea `.75` y split correcto.
- [ ] Favorabilidad, settlement, Fair Odds, precio equivalente y EV se presentan con semántica correcta.
- [ ] Una cuota `goals` no se acepta como cuota `asian_total_goals`.

## Análisis individual Team Asian Handicap

- [ ] Elegir equipo local y línea firmada.
- [ ] Elegir equipo visitante y línea firmada.
- [ ] Cuota manual exacta conserva `fixture_id + market_family + team_id + line`.
- [ ] La selección no se confunde con Over/Under.
- [ ] Settlement de cinco estados y economía se muestran correctamente.

## Value Radar

- [ ] Sin cuota exacta: oportunidad por cotizar/no evaluable, sin value confirmado.
- [ ] Cuota exacta: implícita, Fair Odds, edge conservador y EV coherentes.
- [ ] EV no positivo produce `no_value`.
- [ ] EV positivo + edge conservador positivo produce `interesting`.
- [ ] EV positivo sin edge conservador positivo produce `watch`.
- [ ] Quote de otra identidad nunca se presenta como exacta.

## Parlay y Soñadora

- [ ] Parlay admite 2–4 selecciones.
- [ ] Soñadora admite 5–15 selecciones.
- [ ] Varias familias del mismo fixture son posibles.
- [ ] Dos selecciones de la misma `fixture_id + market_family` se bloquean.
- [ ] MIXED y MANUAL respetan la misma regla.
- [ ] Asian Total y Team Asian Handicap quedan bloqueados con explicación clara.
- [ ] Editar/Quitar no rompe la combinación.

## LIVE

- [ ] Flujo LIVE clásico obtiene un snapshot propio y no reutiliza el prepartido como si fuera live.
- [ ] Snapshot prepartido se muestra solo lectura.
- [ ] Favorabilidad prepartido se muestra `/100`, no como probabilidad.
- [ ] Asian en LIVE informa no evaluable/no soportado productivamente.
- [ ] LIVE no escribe Memoria ni activa autolearning sin acción explícita.

## Memoria

- [ ] Guardar y recuperar predicción clásica.
- [ ] Guardar y resolver Asian Total.
- [ ] Guardar y resolver Team Asian Handicap conservando equipo/lado/línea.
- [ ] FW/HW → HIT; Push → VOID; HL/FL → MISS.
- [ ] Settlement-aware no entra en calibración binaria.
- [ ] Registros siguen siendo append-only.

## Bet Tracker

- [ ] Registrar apuesta simple legacy y conservar compatibilidad.
- [ ] Registrar Asian Total individual y liquidar cada settlement.
- [ ] Registrar Team Asian Handicap y conservar equipo/lado/línea.
- [ ] Payout/P&L se calcula una sola vez con stake y cuota aceptada.
- [ ] Registrar Parlay/Soñadora como una apuesta global; patas desplegables no cuentan por separado.
- [ ] Void devuelve stake.

## Railway — pendiente tras próximo deploy

- [ ] Deployment corresponde al commit autorizado.
- [ ] Estado SUCCESS/RUNNING.
- [ ] `/` protege acceso y `/login` responde.
- [ ] Login autenticado abre Atlas.
- [ ] Logs de arranque sin errores.
- [ ] Volumen sigue montado en `/app/.atlas-data`.
- [ ] Smoke de Jornada, Individual, Asian, LIVE, Memoria y Bet Tracker sin escrituras destructivas.
