export function buildSourceValidationPlan({
  scenario,
  specialistReports,
  marketEvaluation,
  analysisInput,
}) {
  const marketFamily = marketEvaluation?.marketFamily || "general";
  const market = (analysisInput?.mercado || "").toLowerCase();
  const hasLine = Boolean(analysisInput?.lineaMercado?.trim());
  const hasOdds = Boolean(analysisInput?.cuotaMercado?.trim());
  const marketDataStatus =
    hasLine && hasOdds
      ? "Reportado, falta validar"
      : hasLine || hasOdds
        ? "Parcialmente reportado"
        : "Pendiente";

  const missingData = Array.from(
    new Set(
      (specialistReports?.reports || []).flatMap(
        (report) => report.missingData || []
      )
    )
  );

  const requiredSources = [];

  function addSourceRequirement({
    data,
    priority,
    sourceType,
    reason,
    status = "Pendiente",
  }) {
    const exists = requiredSources.some((item) => item.data === data);

    if (!exists) {
      requiredSources.push({
        data,
        priority,
        sourceType,
        reason,
        status,
      });
    }
  }

  addSourceRequirement({
    data: "Competición y división",
    priority: "Alta",
    sourceType: "Fuente oficial / API confiable",
    reason:
      "Atlas debe confirmar que el partido pertenece a la competición correcta.",
    status: scenario?.resolvedCompetition?.resolved ? "Inferido, falta confirmar" : "Pendiente",
  });

  if (missingData.some((item) => includesAny(item, ["árbitro", "arbitro"]))) {
    addSourceRequirement({
      data: "Árbitro confirmado",
      priority: "Crítica",
      sourceType: "Fuente oficial / API confiable",
      reason:
        "Mercados de tarjetas y faltas dependen directamente del criterio arbitral.",
    });

    addSourceRequirement({
      data: "Historial arbitral",
      priority: "Alta",
      sourceType: "Proveedor estadístico / API deportiva",
      reason:
        "Atlas necesita promedio de tarjetas, faltas sancionadas y comportamiento en partidos intensos.",
    });
  }

  if (
    missingData.some((item) =>
      includesAny(item, ["alineación", "alineacion", "lesiones", "sanciones", "rotaciones"])
    )
  ) {
    addSourceRequirement({
      data: "Alineaciones oficiales",
      priority: "Crítica",
      sourceType: "Fuente oficial / API confiable",
      reason:
        "Mercados de remates, goles, pases y córners pueden cambiar con titulares o suplentes.",
    });

    addSourceRequirement({
      data: "Lesiones y sanciones",
      priority: "Alta",
      sourceType: "Fuente oficial / medios confiables con consenso",
      reason:
        "Ausencias relevantes pueden alterar el guion táctico y la calidad del mercado.",
    });
  }

  if (
    missingData.some((item) =>
      includesAny(item, ["promedios", "últimos", "ultimos", "tabla", "local", "visitante"])
    )
  ) {
    addSourceRequirement({
      data: "Estadísticas recientes",
      priority: "Alta",
      sourceType: "Proveedor estadístico / API deportiva",
      reason:
        "Atlas necesita muestra reciente para pasar de hipótesis inicial a evaluación cuantitativa.",
    });

    addSourceRequirement({
      data: "Tabla y necesidad competitiva",
      priority: "Alta",
      sourceType: "Fuente oficial / API confiable",
      reason:
        "La presión por puntos modifica intensidad, riesgo y comportamiento táctico.",
    });
  }

  if (marketFamily === "disciplinario" || market.includes("tarjeta") || market.includes("falta")) {
    addSourceRequirement({
      data: "Líneas de tarjetas/faltas",
      priority: "Alta",
      sourceType: "Casa de apuestas / API de odds",
      reason:
        "Atlas debe comparar el mercado técnico con la línea disponible antes de decidir.",
      status: marketDataStatus,
    });
  }

  if (
    marketFamily === "volumen ofensivo" ||
    market.includes("remate") ||
    market.includes("corner") ||
    market.includes("córner")
  ) {
    addSourceRequirement({
      data: "Líneas de remates/córners",
      priority: "Alta",
      sourceType: "Casa de apuestas / API de odds",
      reason:
        "Atlas necesita línea y cuota para evaluar si el mercado compensa el riesgo.",
      status: marketDataStatus,
    });
  }

  if (marketFamily === "posesion" || market.includes("pase")) {
    addSourceRequirement({
      data: "Líneas de pases/posesión",
      priority: "Alta",
      sourceType: "Casa de apuestas / API de odds",
      reason:
        "Mercados de pases requieren línea exacta para determinar si hay valor operativo.",
      status: marketDataStatus,
    });
  }

  addSourceRequirement({
    data: "Consenso de fuentes",
    priority: "Alta",
    sourceType: "Comparación IA entre fuentes",
    reason:
      "Atlas debe detectar contradicciones entre páginas, API y fuentes oficiales antes de confiar.",
  });

  const criticalPending = requiredSources.filter(
    (item) => item.priority === "Crítica" && item.status === "Pendiente"
  );

  const validationStatus =
    criticalPending.length > 0
      ? "Validación crítica pendiente"
      : requiredSources.length > 0
      ? "Validación pendiente"
      : "Sin validaciones requeridas";

  return {
    validationStatus,
    requiredSources,
    criticalPending,
    summary: buildSummary(requiredSources, criticalPending),
  };
}

function includesAny(value, needles) {
  const text = (value || "").toLowerCase();
  return needles.some((needle) => text.includes(needle));
}

function buildSummary(requiredSources, criticalPending) {
  if (criticalPending.length > 0) {
    return `Hay ${criticalPending.length} dato(s) crítico(s) pendiente(s). Atlas no debe emitir recomendación real todavía.`;
  }

  if (requiredSources.length > 0) {
    return `Atlas identificó ${requiredSources.length} validación(es) necesarias antes de elevar confianza.`;
  }

  return "Atlas no detectó validaciones pendientes en esta fase.";
}
