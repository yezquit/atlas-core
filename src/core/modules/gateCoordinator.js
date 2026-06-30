export function coordinateGates({
  validationGate,
  marketGate,
  sourceConfidence,
  analysisInput,
}) {
  const useCase = analysisInput?.uso || "analisis";
  const informationScore =
    sourceConfidence?.informationScore ??
    sourceConfidence?.score ??
    sourceConfidence?.qualityScore ??
    0;

  if (marketGate?.gateStatus === "blocked") {
    return {
      finalStatus: "blocked",
      finalLabel: "🔴 Mercado bloqueado",
      operationalPermission: "No decidir",
      canAnalyze: false,
      canRecommend: false,
      canUseInParlay: false,
      primaryReason:
        "El mercado solicitado no tiene datos base suficientes en la fuente actual.",
      requiredAction:
        "Conectar fuente complementaria o elegir un mercado con cobertura disponible.",
      informationScore,
      summary:
        "Atlas bloquea la operación porque el MarketGate detectó falta de cobertura del mercado.",
      hierarchy:
        "MarketGate tiene prioridad sobre ValidationGate cuando el mercado está bloqueado.",
    };
  }

  if (marketGate?.gateStatus === "limited") {
    return {
      finalStatus: "limited",
      finalLabel: "🟠 Solo análisis inicial",
      operationalPermission: "Explorar contexto, no recomendar",
      canAnalyze: true,
      canRecommend: false,
      canUseInParlay: false,
      primaryReason:
        "El mercado tiene cobertura parcial y requiere validación adicional.",
      requiredAction:
        "Completar datos faltantes antes de considerar decisión operativa.",
      informationScore,
      summary:
        "Atlas permite análisis inicial, pero bloquea recomendación y parlay.",
      hierarchy:
        "MarketGate limita la operación por cobertura incompleta.",
    };
  }

  if (marketGate?.gateStatus === "preliminary") {
    const isParlay = useCase === "parlay";

    return {
      finalStatus: isParlay ? "parlay_blocked" : "preliminary",
      finalLabel: isParlay
        ? "🟠 No apto para parlay todavía"
        : "🟡 Análisis preliminar",
      operationalPermission: isParlay
        ? "No usar en parlay"
        : "Análisis técnico preliminar",
      canAnalyze: true,
      canRecommend: false,
      canUseInParlay: false,
      primaryReason:
        "El mercado tiene datos estadísticos base, pero aún faltan línea/cuota y validación final.",
      requiredAction:
        "Agregar línea de mercado, cuota y comparación contra promedios antes de decidir.",
      informationScore,
      summary: isParlay
        ? "Atlas no permite llevar este mercado a parlay porque todavía falta validación operativa."
        : "Atlas permite análisis preliminar, pero no recomendación real.",
      hierarchy:
        "MarketGate permite análisis, pero ValidationGate mantiene prudencia operativa.",
    };
  }

  if (validationGate?.gateStatus === "blocked") {
    return {
      finalStatus: "blocked",
      finalLabel: "🔴 No decidir todavía",
      operationalPermission: "No decidir",
      canAnalyze: false,
      canRecommend: false,
      canUseInParlay: false,
      primaryReason: validationGate?.reason || "ValidationGate bloqueó la operación.",
      requiredAction: validationGate?.userAction || "Completar validación.",
      informationScore,
      summary:
        "Atlas bloquea la operación por condiciones generales de validación.",
      hierarchy:
        "ValidationGate bloquea cuando faltan condiciones generales críticas.",
    };
  }

  return {
    finalStatus: "exploratory",
    finalLabel: "🔵 Exploración controlada",
    operationalPermission: "Solo análisis exploratorio",
    canAnalyze: true,
    canRecommend: false,
    canUseInParlay: false,
    primaryReason:
      "Atlas no encontró bloqueo absoluto, pero todavía no hay condiciones para recomendación real.",
    requiredAction:
      "Completar datos de mercado, línea/cuota, fuentes complementarias y validación final.",
    informationScore,
    summary:
      "Atlas mantiene el análisis en modo exploratorio hasta completar validación.",
    hierarchy:
      "Estado final derivado de MarketGate + ValidationGate + SourceConfidence.",
  };
}
