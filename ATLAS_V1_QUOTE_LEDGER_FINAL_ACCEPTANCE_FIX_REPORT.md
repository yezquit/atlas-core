# ATLAS V1 — Informe final de aceptación del ledger de cotizaciones

## Resultado

Se corrigió la pérdida semántica que hacía que una cuota manual legítimamente vencida reapareciera como si nunca hubiera sido cotizada. El ledger ya distingue tres estados: cotización vigente, cotización conocida pero vencida y candidato nunca cotizado.

No se modificaron el modelo probabilístico, las líneas, `sports_score`, el ranking deportivo, `evaluateMarketPrice`, sus umbrales, Gemini, parlay, Supabase/Vercel ni `.env.local`. Tampoco se amplió el TTL.

## Causa raíz demostrada

La causa corresponde a **C: la cotización de Over 1.5 sí se encontraba, pero al construir la proyección posterior ya estaba marcada como `stale`**. No hubo pérdida de persistencia ni sobrescritura por Under 10.5.

Evidencia recuperada del historial operativo de Santos vs Macará (`fixture_id: 1606076`):

| Campo | Valor observado |
| --- | --- |
| Versión/análisis que contiene Over 1.5 | `1067f8c9-7e07-42bf-a743-7543478abf05` |
| Creación de esa versión | `2026-08-13T20:42:00.535Z` |
| Identificador de la cuota | `1606076:manual:betano:goals:over:1.5:1.28:2026-08-13t20-41-00.000z:america-bogota:initial` |
| Identidad canónica | `1606076:goals:over:1.5` |
| `observed_at` / `updated_at` | `2026-08-13T20:41:00.000Z` |
| Estado al persistir | `active_quote` |
| `verification_status` al persistir | `user_reported` |
| `freshness` al persistir | `fresh` |
| Versión/análisis posterior de Under 10.5 | `a93bd74b-5e0a-4458-aa71-bdebd5bfd5d0` |
| Creación de la versión posterior | `2026-08-13T21:44:26.373Z` |
| Estado de Over 1.5 al consultar esa proyección | `stale` |
| `verification_status` / `freshness` consultados | `stale` / `stale` |
| Edad calculada | `63.44` minutos |
| Límite aplicable | `15` minutos |
| Entrada al ranking operativo | No |
| Motivo exacto | `La cotización tiene 63.44 minutos y supera el límite de 15 minutos para esta fase.` |

El descarte de las demás hipótesis queda demostrado así:

- **A, no persistida:** descartada; la cuota existe como `active_quote` en su versión de origen.
- **B, identidad no encontrada:** descartada; se recupera por `1606076:goals:over:1.5`.
- **C, marcada stale:** confirmada; tenía 63.44 minutos al consultar la versión posterior.
- **D, sobrescrita por B:** descartada; A y B tienen identidades canónicas distintas y coexisten en la regresión secuencial.
- **E, proyección/version incorrecta:** descartada; la versión posterior consulta correctamente el historial acumulado y excluye A por vigencia.
- **F, otra causa:** no se encontró otra causa de pérdida. Sí existía un defecto adicional de representación: el estado stale se convertía visualmente en “Pendiente de precio”.

## Política temporal real

La vigencia se calcula desde `updated_at`; en una cuota manual este valor corresponde al instante reportado por el usuario (`consultedAt`/`receivedAt`). No se calcula desde el momento de volver a comparar ni desde la creación de una versión posterior.

La política observada es:

- límite general del proveedor: 180 minutos;
- a 24 horas o menos del inicio: 60 minutos;
- a 3 horas o menos: 30 minutos;
- durante la hora final: 15 minutos;
- una cuota manual queda además limitada a un máximo de 30 minutos.

En el caso persistido, el inicio era `2026-08-13T22:00:00.000Z`. Al consultar a las `21:44:26.373Z`, aplicaba la ventana final de 15 minutos. La cuota A había sido reportada a las `20:41:00.000Z`, por lo que sus 63.44 minutos excedían legítimamente el límite. No se aumentó ese TTL: se corrigió la forma de conservar y presentar el último precio conocido.

## Corrección aplicada

El ledger expone ahora de forma explícita:

- `current`: muestra casa, cuota, evaluación económica y decisión;
- `stale`: conserva el último precio conocido y muestra **“Cuota vencida — actualizar precio”**, junto con el motivo de vigencia;
- `never_quoted`: muestra **“Pendiente de precio”**.

También conserva la versión fuente de la cotización y el motivo exacto de inclusión o exclusión del ranking. Se añadió un diagnóstico determinista reutilizable sin introducir logs ruidosos en producción.

La cabecera de jornada ahora resume las cotizaciones vigentes de los candidatos relevantes:

- ninguna vigente: **Evaluación de precio pendiente**;
- algunas vigentes y otras pendientes o vencidas: **Evaluación operativa parcial** y “Hay opciones con precio evaluado y otras pendientes.”;
- todas vigentes: **Evaluación operativa disponible**.

El ranking operativo continúa incluyendo exclusivamente cotizaciones vigentes. No se cambió el ranking deportivo ni `evaluateMarketPrice`.

## Regresión secuencial A → B → comparación

La integración nueva reproduce A, B y C dentro de la misma jornada:

1. se reporta A, Over 1.5 @ Betano 1.28;
2. se consulta y A está activa;
3. se reporta B, Under 10.5 @ Betano 1.67;
4. se vuelve a consultar 31 segundos después de B;
5. A conserva 2.52 minutos de edad y B 0.52, ambas bajo el límite de 15 minutos;
6. ambas identidades exactas coexisten y C permanece sin cotización.

El ranking resultante es:

1. Under 10.5 @1.67 — `marginal` — Sí, pero con cautela.
2. Over 1.5 @1.28 — `unfavorable` — No.

Under 9.5 queda fuera del ranking operativo y visible como pendiente. Si la misma comparación se hace después de que A venza, B permanece en el ranking y A se muestra como vencida, no como nunca cotizada.

## Pruebas

Se añadieron ocho regresiones mínimas para comprobar:

1. A permanece activa después de evaluar B cuando sigue vigente.
2. B no sobrescribe A.
3. Las identidades exactas distintas coexisten.
4. Una cuota `user_reported_current` reciente no desaparece.
5. Una cuota stale se representa como vencida y conserva su trazabilidad.
6. El ranking vigente incluye A y B en el orden esperado.
7. La cabecera es parcial cuando existe mezcla de evaluado y pendiente.
8. La cabecera es disponible cuando todos los candidatos relevantes están cotizados.

La independencia entre confianza deportiva y precio continúa cubierta por la regresión previa y no se tocó ningún cálculo probabilístico.

## Validación final

- `git diff --check`: correcto.
- `npm run lint`: correcto.
- `npm test`: **432/432 pruebas correctas**, incluidas las 424 anteriores y las 8 nuevas.
- `npm run build`: correcto con Next.js 16.2.12; 15 rutas generadas.
- llamadas deportivas externas: ninguna.
- llamadas a Gemini API: ninguna.
- merge: no realizado.

## Commits

1. `e170028` — `fix: distinguish stale scout quotes in ledger`
2. `docs: report final quote ledger acceptance fix` — informe y cierre de aceptación.
