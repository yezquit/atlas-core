# ATLAS V1 — Informe del parche final de coherencia UX

## Alcance

Parche aplicado únicamente sobre la presentación, el estado activo y las explicaciones del flujo Scout → análisis profundo → Director. No se modificaron `preliminary-market-v1`, probabilidades, intervalos, generación de líneas, `sports_score`, orden del ranking deportivo, ranking económico, umbrales, política de parlay, contratos de procedencia, Gemini manual, Supabase/Vercel ni `.env.local`. No se añadieron dependencias.

## Causa raíz de la cuota histórica activa

Las cotizaciones normalizadas se conservaban correctamente en `odds.quotes`, incluidas las vencidas. El problema estaba en el fallback que construía `selectedOdds`: después de no encontrar una cotización operativa vigente, aceptaba `primaryCandidate.price_quote`, que podía ser stale. Esa misma referencia se publicaba como `selectedOdds`, `activeQuote` y `analysisVersion.active_quote`, y llegaba a Director como precio actual. Por eso una cuota histórica como Superbet 13.00 podía aparecer visualmente junto con bookmaker y probabilidad implícita actuales aunque el usuario no hubiera introducido precio.

El parche establece una frontera explícita:

- `activeQuote` y `selectedOdds` solo aceptan cotizaciones `fresh` con estado `verified_current` o `user_reported_current`;
- una cotización stale compatible permanece en `odds.quotes`, `historicalOdds` y `historicalQuote`;
- la versión inmutable conserva esa cotización para auditoría, pero `active_quote` queda en `null`;
- una cotización reutilizada durante un reanálisis vuelve a evaluar su vigencia con la política temporal existente antes de considerarse activa.

## Veredicto deportivo y decisión operativa

Cuando existe tesis deportiva y falta precio actual, Director mantiene visibles selección, probabilidad preliminar, intervalo, respaldo deportivo y confianza. El encabezado expresa el veredicto deportivo mediante **“Atlas respalda deportivamente…”** o **“…conserva respaldo deportivo”**, según el umbral deportivo existente.

La capa económica se presenta aparte como **“Pendiente de precio”** y solicita una cuota actual. Aptitud individual y parlay también se muestran como pendientes de precio en modo sencillo, sin cambiar sus contratos o reglas internas. Con una cuota actual compatible, la evaluación económica existente conserva los estados `favorable_preliminary`, `marginal`, `unfavorable`, `stale` y `unavailable`, y sus decisiones actuales.

## Tratamiento histórico de cotizaciones stale

Una cotización vencida compatible aparece, de existir, en un bloque secundario **“Cotización anterior — no utilizada”** con casa, cuota y estado vencido. No se muestra su probabilidad implícita en el resumen actual y no participa en:

- la decisión operativa;
- la aptitud individual actual;
- el ranking operativo;
- la política de parlay;
- `activeQuote` o `analysisVersion.active_quote`.

## Razones deportivas

El modo sencillo dejó de usar como razones principales el equilibrio matemático, el puesto sin ámbito o la ubicación de la línea en la distribución. Ahora prioriza hasta tres señales reales disponibles:

- frecuencia de la selección exacta en la muestra del local como local;
- frecuencia de la selección exacta en la muestra del visitante como visitante;
- producción/concesión específica de goles, córners, remates, remates a puerta o tarjetas según la familia.

Los nombres de los equipos, aciertos, tamaño de muestra, porcentaje y promedios proceden de los perfiles ya existentes. Si no existe evidencia deportiva suficiente, no se inventa una tercera razón. Las razones matemáticas permanecen disponibles en la trazabilidad experta.

## Red Team y limitaciones del modelo

Se separaron dos inventarios:

- **Qué podría hacer fallar esta opción**: contradicciones, evidencia contraria, muestra competitiva comparable débil, rotación reportada, alineaciones, bajas, árbitro y otros riesgos deportivos/contextuales verificables;
- **Limitaciones del modelo**: modelo preliminar, calibración, distribución empírica, solapamiento de submuestras, independencia de observaciones y advertencias metodológicas globales.

Cuando no existe un riesgo específico del partido, la interfaz lo declara y no fabrica uno. Las limitaciones metodológicas quedan en un bloque colapsable y en la vista experta.

## Contexto competitivo

El modo sencillo muestra **“Contexto del partido”** antes de Scout con los campos realmente disponibles: competición, tipo, fase/ronda, ida/vuelta, agregado, local, visitante y descanso. Los campos ausentes se omiten. Para competiciones internacionales se aclara que el contexto se usa como señal de riesgo y no como ajuste automático de probabilidad.

## Ranking general y ranking de familia

Cada candidato conserva ahora, además del alias legado `rank`:

- `overall_rank`: posición general Scout;
- `family_rank`: posición dentro de su familia.

Ambos valores se transfieren desde jornada y se muestran con ámbito explícito en jornada, candidato transferido y Director. El cálculo y el orden del ranking deportivo no cambiaron.

## Microcopy corregida

- `Respaldo técnico` → **Respaldo deportivo** en jornada/modo sencillo.
- `Por qué ganó este mercado` → **Por qué Atlas destacó esta opción**.
- badge del candidato general #1 → **Mejor opción deportiva**.
- se eliminó la duplicación visual de `Equilibrio deportivo` para el mismo `sports_score`.
- el candidato transferido usa **Candidato listo para analizar** y confirma la transferencia correcta.
- la ausencia de precio usa **Cuota actual: No reportada** y **Evaluación de precio: Pendiente**.
- `¿Cómo leer Atlas?` incorpora Veredicto deportivo, Decisión operativa y Limitaciones del modelo.

## Pruebas nuevas

Se añadió `src/core/testing/uxCoherencePatch.test.js` con 23 regresiones específicas:

1. transferencia sin cuota no activa una histórica;
2. stale queda en histórico;
3. stale no decide;
4. stale no crea probabilidad implícita activa;
5. el veredicto deportivo permanece visible;
6. la decisión operativa queda pendiente;
7. la probabilidad deportiva no cambia;
8. el ranking deportivo no cambia;
9. las razones sencillas usan evidencia deportiva;
10. limitaciones metodológicas fuera del Red Team del partido;
11. riesgos contextuales reales dentro de Red Team;
12. ausencia de riesgo sin invención;
13. contexto internacional visible;
14. campos contextuales ausentes no inventados;
15. `overall_rank` y `family_rank` separados;
16. candidato secundario no llamado ganador;
17. ausencia de `Respaldo técnico` en jornada sencilla;
18. ausencia de duplicación `Equilibrio deportivo`;
19. estado semántico correcto del candidato transferido;
20. economía intacta con cuota válida;
21. opción manual intacta;
22. Gemini manual intacto;
23. historial intacto.

También se actualizaron tres aserciones antiguas de microcopy para que exijan el nuevo contrato visual sin debilitar su intención.

## Validación

- Total final: **395/395 pruebas verdes** (372 anteriores + 23 nuevas).
- `npm run lint`: **correcto**.
- `npm run build`: **correcto** con Next.js 16.2.12/Turbopack.
- `git diff --check`: **correcto**.
- Revisión local en navegador: pantalla inicial y glosario sin errores de consola; definiciones nuevas visibles y accesibles.
- Llamadas deportivas externas: **no realizadas**.
- Gemini API: **no utilizada**.
- `npm audit`: **no ejecutado**, de acuerdo con el encargo.

## Commits

1. `ba0d36b` — `fix: separate sports verdict from price state` (implementación y regresiones).
2. `docs: report final UX coherence patch` (este informe).

No se hizo merge a `main`.

## Limitaciones restantes

La comprobación del caso Santos vs Macará/Superbet se ejecutó mediante una integración local determinista que reproduce fixture, mercado, cuota stale y transferencia sin realizar llamadas deportivas externas. La aceptación visual con datos reales queda pendiente de la revisión manual solicitada. No se inició trabajo de Supabase ni Vercel.
