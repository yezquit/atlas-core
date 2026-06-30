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
  let confidence = 35;
  let robustness = "Inicial";
  let fragility = "Media";
  let temporalStatus = "🔵 Análisis inicial";
  let mainReason =
    "Atlas tiene clasificación de escenario, especialistas activados, informes iniciales y fiscalización preliminar.";
  let mainRisk =
    "Todavía faltan fuentes externas, datos confirmados y validación final.";
  let invalidationCondition =
    "No usar como recomendación real hasta confirmar datos críticos.";
  let nextAction =
    "Conectar fuentes confiables, árbitro, estadísticas recientes y validación final.";

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
    confidence = 25;
    robustness = "Baja";
    fragility = "Alta";
    mainReason =
      "Atlas no tiene competición suficientemente confirmada, por lo que no puede avanzar a decisión fuerte.";
    mainRisk =
      "Analizar un partido en la división equivocada puede contaminar todo el análisis.";
    invalidationCondition =
      "La competición debe confirmarse antes de evaluar mercados.";
  } else if (hasStrongObjection) {
    decision = "Esperar validación";
    confidence = 40;
    robustness = "Baja-media";
    fragility = "Alta";
    mainReason =
      "El Fiscal detectó objeciones fuertes que impiden emitir recomendación.";
    mainRisk =
      fiscalReview?.objections?.join(" ") ||
      "Existen datos críticos pendientes.";
    invalidationCondition =
      "No avanzar hasta resolver las objeciones del Fiscal.";
  } else if (hasModerateObjection) {
    decision = "Análisis preliminar";
    confidence = 50;
    robustness = "Media";
    fragility = "Media-alta";
    mainReason =
      "Atlas tiene señales iniciales, pero todavía faltan datos críticos para elevar la decisión.";
    mainRisk =
      fiscalReview?.objections?.join(" ") ||
      "El análisis todavía depende de información pendiente.";
    invalidationCondition =
      "Si los datos críticos contradicen el escenario inicial, el mercado debe descartarse o bajar confianza.";
  } else {
    decision = "Apuesta aceptable preliminar";
    confidence = 65;
    robustness = "Media";
    fragility = "Media";
    mainReason =
      "La clasificación, especialistas y Fiscal no presentan objeción crítica en esta fase inicial.";
    mainRisk =
      "La decisión sigue siendo preliminar porque aún no existe validación final con fuentes externas.";
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
    if (confidence > 45) confidence -= 10;
    fragility = "Alta";
    nextAction =
      "No congelar para parlay todavía. Validar datos críticos y revisar compatibilidad antes de usar.";
  }

  if (confidence < 0) confidence = 0;
  if (confidence > 100) confidence = 100;

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
