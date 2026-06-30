export function createCaseRecord({
  analysisInput,
  scenario,
  specialistRoute,
  specialistReports,
  fiscalReview,
  decisionResult,
  parlayStatus,
}) {
  const now = new Date();

  const caseId = buildCaseId(now);

  const missingData = Array.from(
    new Set(
      (specialistReports?.reports || []).flatMap(
        (report) => report.missingData || []
      )
    )
  );

  return {
    caseId,
    createdAt: now.toISOString(),
    readableDate: formatReadableDate(now),

    input: {
      partido: analysisInput?.partido || "Partido pendiente",
      competicion: analysisInput?.competicion || "Competición pendiente",
      mercado: analysisInput?.mercado || "Mercado no especificado",
      uso: analysisInput?.uso || "analisis",
    },

    resolvedCompetition: {
      name: scenario?.resolvedCompetition?.competitionName || "No resuelta",
      division: scenario?.resolvedCompetition?.division || "No resuelta",
      confidence: scenario?.resolvedCompetition?.confidence || "Baja",
    },

    scenario: {
      tags: scenario?.tags || [],
      candidateMarkets: scenario?.candidateMarkets || [],
    },

    decision: {
      status: decisionResult?.decision || "Sin decisión",
      confidence: decisionResult?.confidence || "Sin calcular",
      robustness: decisionResult?.robustness || "Sin calcular",
      fragility: decisionResult?.fragility || "Sin calcular",
      temporalStatus: decisionResult?.temporalStatus || "Sin estado temporal",
      parlayStatus,
    },

    specialists: {
      activated: specialistRoute?.specialists || [],
      reportsCount: specialistReports?.reports?.length || 0,
    },

    fiscal: {
      status: fiscalReview?.fiscalStatus || "Sin fiscalización",
      severityScore: fiscalReview?.severityScore || 0,
      objections: fiscalReview?.objections || [],
      warnings: fiscalReview?.warnings || [],
    },

    pending: {
      missingData,
      auditStatus: "Pendiente",
      sourceValidation: "Pendiente",
    },
  };
}

function buildCaseId(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");

  return `AT-CASE-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function formatReadableDate(date) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
