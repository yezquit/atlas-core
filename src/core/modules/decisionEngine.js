export function runDecisionEngine({
  analysisInput,
  scenario,
  specialistReports,
  fiscalReview,
  parlayStatus,
}) {
  const market = (analysisInput?.mercado || "").toLowerCase();
  const useCase = analysisInput?.uso || "analisis";

  let decision = "Análisis inicial";
  let confidence = 15;
  let robustness = "Inicial";
  let fragility = "Alta";
  let temporalStatus = "🔵 Análisis inicial";
  let mainReason =
    "Atlas solo ha realizado clasificación inicial del caso. Todavía no existe análisis estadístico, consulta de fuentes, árbitro, alineaciones ni validación externa.";
  let mainRisk =
    "La salida no puede interpretarse como recomendación porque aún no hay evidencia real suficiente.";
  let invalidationCondition =
    "No usar como recomendación real hasta conectar fuentes confiables, datos estadísticos y validación final.";
  let nextAction =
    "Conectar fuentes confiables, árbitro, estadísticas recientes, alineaciones y validación final.";

  const resolvedCompetition = scenario?.resolvedCompetition?.resolved;
  const fiscalStatus = fiscalReview?.fiscalStatus || "Objeción moderada";
  const missingDataCount = fiscalReview?.missingData?.length || 0;
  const hasStrongObjection = fiscalStatus === "Objeción fuerte";
  const hasModerateObjection = fiscalStatus === "Objeción moderada";

  const isDisciplinaryMarket =
    market.includes("tarjeta") || market.includes("falta");

  const isVolumeMarket =
    market.includes("pase") ||
    market.includes("remate") ||
    market.includes("corner") ||
    market.includes("córner") ||
    market.includes("saque");

  if (!resolvedCompetition) {
    decision = "Esperar validación";
    confidence = 10;
    robustness = "Baja";
    fragility = "Alta";
    temporalStatus = "🔴 No decidir todavía";
    mainReason =
      "Atlas no tiene competición suficientemente confirmada, por lo que no puede avanzar en el análisis.";
    mainRisk =
      "Analizar un partido en la división equivocada puede contaminar todo el proceso.";
    invalidationCondition =
      "La competición debe confirmarse antes de evaluar mercados.";
  } else if (hasStrongObjection) {
    decision = "Esperar validación";
    confidence = 15;
    robustness = "Baja";
    fragility = "Alta";
    temporalStatus = "🟠 Esperar validación";
    mainReason =
      "El Fiscal detectó objeciones fuertes y faltan datos críticos. Atlas no puede emitir recomendación.";
    mainRisk =
      fiscalReview?.objections?.join(" ") ||
      "Existen datos críticos pendientes.";
    invalidationCondition =
      "No avanzar hasta resolver las objeciones del Fiscal.";
  } else if (hasModerateObjection) {
    decision = "Análisis preliminar";
    confidence = 20;
    robustness = "Baja-media";
    fragility = "Alta";
    temporalStatus = "🔵 Análisis inicial";
    mainReason =
      "Atlas tiene una estructura inicial del caso, pero todavía faltan datos críticos para evaluar el mercado.";
    mainRisk =
      fiscalReview?.objections?.join(" ") ||
      "El análisis todavía depende de información pendiente.";
    invalidationCondition =
      "Si los datos críticos contradicen el escenario inicial, el mercado debe descartarse o bajar confianza.";
  } else {
    decision = "Análisis preliminar";
    confidence = 25;
    robustness = "Media-baja";
    fragility = "Media-alta";
    temporalStatus = "🔵 Análisis inicial";
    mainReason =
      "La clasificación inicial no presenta objeción crítica, pero aún no existe validación con fuentes externas.";
    mainRisk =
      "Sin datos reales, estadísticas, árbitro, alineaciones y fuentes, Atlas no puede elevar confianza.";
    invalidationCondition =
      "Datos oficiales o fuentes confiables que contradigan el escenario inicial.";
  }

  if (isDisciplinaryMarket && missingDataCount > 0) {
    temporalStatus = "🟠 Esperar validación";
    nextAction =
      "Confirmar árbitro, tendencia disciplinaria, datos recientes de tarjetas/faltas y contexto competitivo.";
  }

  if (isVolumeMarket && missingDataCount > 0) {
    temporalStatus = "🟠 Esperar validación";
    nextAction =
      "Confirmar alineaciones, estilo táctico, estadísticas recientes y posible guion de partido.";
  }

  if (useCase === "parlay" && parlayStatus !== "🟢 Apto para parlay") {
    confidence = Math.min(confidence, 15);
    fragility = "Alta";
    temporalStatus = "🟠 Esperar validación";
    nextAction =
      "No congelar para parlay todavía. Validar datos críticos y revisar compatibilidad antes de usar.";
  }

  return {
    decision,
    confidence: `${confidence}%`,
    robustness,
    fragility,
    temporalStatus,
    mainReason,
    mainRisk,
    invalidationCondition,
    nextAction,
  };
}
