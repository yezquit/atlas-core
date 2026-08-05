# Atlas Core — Corrección puntual de precio, parlay y reanálisis Gemini

## 1. Causa corregida

La evaluación previa mezclaba cuatro conceptos distintos: respaldo deportivo, disponibilidad de cuota, conveniencia económica y elegibilidad para parlay. Una selección podía conservar respaldo deportivo y, aun así, aparecer como apta aunque la probabilidad implícita de la cuota superara la estimación preliminar de Atlas. El reanálisis con contexto Gemini tampoco describía explícitamente si el cambio alteraba esa relación económica.

La corrección mantiene separados esos conceptos y hace que `DirectorAtlas` comunique un único resultado coherente, sin crear un modelo nuevo ni modificar el generador de líneas, el ranking deportivo o el flujo de cuotas manuales.

## 2. Nueva lógica de evaluación de precio

Se añadió `evaluateMarketPrice` en `marketSuitability.js` y el contrato estable `PRICE_EVALUATION_STATUS` con estos estados internos:

- `favorable_preliminary`
- `marginal`
- `unfavorable`
- `unavailable`
- `stale`

La comparación usa exclusivamente la probabilidad preliminar ya calculada y la probabilidad implícita de la cuota activa:

`price_gap = preliminary_probability - implied_probability`

No se calcula valor esperado ni se presenta la estimación preliminar como un modelo validado. Una evaluación favorable exige, además de brecha positiva suficiente, controles mínimos de incertidumbre, confianza y muestra. Una cuota ausente o vencida permanece pendiente de revisión.

Caso de aceptación comprobado:

- Partido: Once Caldas vs América.
- Selección: Under 3.5.
- Probabilidad preliminar: 67.4 %.
- Intervalo: 51.4 %–80.1 %.
- Confianza: 87.
- Cuota Betano: 1.25.
- Probabilidad implícita: 80 %.
- Brecha: -12.6 puntos porcentuales.
- Evaluación: `unfavorable`.
- Aptitud individual: `not_viable_at_this_price`.
- Parlay: `not_eligible`.

## 3. Política de parlay

La elegibilidad de parlay ahora depende explícitamente de la evaluación de precio además del respaldo deportivo, la vigencia, la probabilidad preliminar, la incertidumbre y la confianza. Una cuota baja no vuelve elegible una selección por sí sola.

- `unfavorable` produce `not_eligible`.
- Cuota ausente o vencida produce `review_only`.
- `favorable_preliminary` puede producir `eligible` si cumple el resto de controles.
- `marginal` solo puede producir `eligible_with_caution` cuando la brecha es positiva y los demás controles se cumplen.

El candidato de UI solo se crea cuando el estado de parlay lo permite. Por ello, el caso Betano 1.25 no muestra el botón **Agregar como candidato a parlay**.

## 4. Coherencia de DirectorAtlas

`DirectorAtlas` sigue siendo la única voz pública y ahora expone por separado:

- respaldo deportivo provisional;
- evaluación de precio;
- aptitud individual;
- elegibilidad para parlay;
- razones y próxima acción.

Para una cuota desfavorable, el encabezado, la respuesta directa, la aptitud individual y el parlay comunican el mismo resultado: la selección puede conservar respaldo deportivo provisional, pero no es viable al precio actual. Un estado `caution` se presenta como **Solo con cautela**, sin convertirlo en una negativa contradictoria.

## 5. Reanálisis con contexto Gemini

El reanálisis continúa usando únicamente contexto pegado por el usuario; no se integró ni llamó ninguna API de Gemini. Se conserva de forma inmutable la identidad del fixture, la selección, la línea, la casa y la cuota activa.

La comparación de versiones incorpora cambios de:

- probabilidad preliminar;
- intervalo de incertidumbre;
- evaluación de precio;
- aptitud individual;
- elegibilidad para parlay.

Si el contexto eleva la estimación de 67.4 % a 71 %, pero la cuota 1.25 sigue implicando 80 %, la evaluación permanece `unfavorable` y el mensaje explica por qué. Si el contexto no aporta evidencia relevante, se informa que no fue suficiente para modificar el dictamen ni la evaluación económica. Si aporta evidencia contraria, refuerza el estado no viable.

## 6. Textos y fase temporal

Se corrigieron los textos visibles para:

- diferenciar una línea seleccionada por Atlas de una línea reportada por el usuario;
- traducir `provider_odd_invalid`;
- mostrar los estados económicos y de parlay sin códigos opacos en la vista sencilla;
- aclarar que la probabilidad es una estimación preliminar y no un modelo validado.

La fase temporal se calcula con la distancia real al inicio del partido y reconoce revisión temprana, día anterior, horas previas, tres horas, una hora, treinta minutos, tramo final y cierre prepartido.

## 7. Pruebas añadidas

Se creó `src/core/testing/priceParlayGeminiFix.test.js` con 20 pruebas ejecutables y sin llamadas externas. Cubren:

1. estado desfavorable para 67.4 % frente a 80 %;
2. brecha de -12.6 puntos porcentuales;
3. aptitud individual no viable;
4. parlay no elegible;
5. ausencia del botón de parlay;
6. coherencia integral de la respuesta;
7. cuota baja sin elegibilidad automática;
8. caso marginal positivo con cautela;
9. cuota vencida;
10. cuota ausente;
11. procedencia correcta de la línea Atlas;
12. traducción de cuota inválida del proveedor;
13. fase temporal real;
14. conservación de Betano 1.25 tras Gemini;
15. aumento a 71 % que sigue siendo desfavorable;
16. contexto no relevante;
17. evidencia contraria;
18. identidad inmutable del análisis;
19. cambios económicos entre versiones;
20. flujo integrado cuota manual → Director → Gemini → nuevo Director.

La suite completa terminó con 278 pruebas aprobadas, cero fallos y cero omisiones.

## 8. Comandos y resultados

| Comando | Resultado |
| --- | --- |
| `git branch --show-current` | `rescue/atlas-core-v0.2` |
| `git diff --check` | Correcto, sin errores |
| `npm run lint` | Correcto, sin errores ni advertencias |
| `npm test` | Correcto: 278 aprobadas, 0 fallidas |
| `npm run build` | Correcto: compilación de producción y 15 páginas generadas |
| `npm audit --omit=dev` | No se reintentó: en la verificación inmediatamente anterior del mismo entorno falló por `ENOTFOUND registry.npmjs.org`; se respetó la instrucción de no repetirlo sin conectividad |

La compilación no descargó Google Fonts. No se realizaron llamadas deportivas ni se conectaron APIs nuevas.

## 9. Archivos modificados

- `src/core/contracts/operationalContracts.js`
- `src/core/intelligence/marketSuitability.js`
- `src/core/intelligence/parlayPolicy.js`
- `src/core/modules/directorAtlas.js`
- `src/core/services/operationalAnalysisService.js`
- `src/core/intelligence/analysisVersions.js`
- `src/app/atlas-functional-client.js`
- `src/core/testing/priceParlayGeminiFix.test.js`
- `ATLAS_PRICE_PARLAY_GEMINI_FIX_REPORT.md`

## 10. Commits

- Implementación: `041b94d fix: align price evaluation and parlay decisions`.
- Documentación: se registra en un segundo y último commit separado para este trabajo.

No se hizo merge a `main`.

## 11. Limitaciones y trabajo posterior

- La probabilidad sigue siendo preliminar; esta corrección no crea ni valida un modelo deportivo.
- `favorable_preliminary` no equivale a ganancia esperada ni a recomendación garantizada.
- La política usa umbrales prudentes existentes o explícitos, pero requiere calibración futura con una muestra histórica suficiente.
- El reanálisis Gemini depende de contexto suministrado por el usuario y no verifica fuentes externas.
- La auditoría de dependencias queda pendiente hasta disponer de conectividad con el registro npm.
- No se abordaron cambios fuera del precio, parlay y coherencia del reanálisis solicitados.
