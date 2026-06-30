export function prepareAuditPlan({
  analysisInput,
  scenario,
  marketEvaluation,
  fiscalReview,
  decisionResult,
  sourceConfidence,
}) {
  const market = analysisInput?.mercado || "Mercado no especificado";
  const useCase = analysisInput?.uso || "analisis";

  const auditQuestions = [
    "¿La competición y división fueron correctas?",
    "¿El escenario fue clasificado correctamente?",
    "¿El mercado evaluado correspondía al contexto del partido?",
    "¿El Fiscal detectó los riesgos principales?",
    "¿La confianza asignada fue prudente?",
    "¿La decisión respetó el semáforo operativo?",
  ];

  const postMatchChecks = [
    "Resultado final del partido",
    "Resultado exacto del mercado evaluado",
    "Tarjetas/faltas/remates/pases/córners reales según mercado",
    "Alineaciones reales",
    "Árbitro real",
    "Cambios relevantes durante el partido",
  ];

  const specialChecks = [];

  const marketFamily = marketEvaluation?.marketFamily || "general";

  if (marketFamily === "disciplinario") {
    specialChecks.push(
      "Comparar tarjetas reales contra línea disponible",
      "Comparar faltas reales contra línea disponible",
      "Evaluar si faltas era mejor mercado que tarjetas",
      "Revisar si el árbitro condicionó correctamente el partido"
    );
  }

  if (marketFamily === "volumen ofensivo") {
    specialChecks.push(
      "Comparar remates/córners reales contra línea disponible",
      "Revisar impacto de gol temprano",
      "Revisar si el guion táctico esperado apareció"
    );
  }

  if (marketFamily === "posesion") {
    specialChecks.push(
      "Comparar pases reales contra línea disponible",
      "Revisar posesión real",
      "Revisar si el favorito dominó como se esperaba"
    );
  }

  if (useCase === "parlay") {
    specialChecks.push(
      "Verificar si la selección era apta para parlay",
      "Evaluar si había concentración de riesgo",
      "Revisar si era mejor usar apuesta simple que parlay"
    );
  }

  const expectedAuditResultTypes = [
    "✅ Acierto bien construido",
    "⚠️ Acierto mal construido",
    "🟡 Fallo bien construido",
    "❌ Fallo mal construido",
  ];

  const auditPriority =
    sourceConfidence?.criticalPendingCount > 0 ||
    fiscalReview?.fiscalStatus === "Objeción fuerte"
      ? "Alta"
      : "Media";

  return {
    auditStatus: "Pendiente",
    auditPriority,
    auditType: "Proceso + resultado",
    market,
    marketFamily,
    decisionToAudit: decisionResult?.decision || "Sin decisión",
    confidenceToAudit: decisionResult?.confidence || "Sin confianza",
    auditQuestions,
    postMatchChecks,
    specialChecks,
    expectedAuditResultTypes,
    summary:
      "Este expediente queda preparado para auditoría posterior. Atlas deberá evaluar tanto el resultado como la calidad del proceso.",
  };
}
