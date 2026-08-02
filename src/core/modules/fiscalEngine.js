import { PARLAY_STATUS } from "../contracts/atlasContracts.js";

export function runFiscalReview({ analysisInput, scenario, specialistReports }) {
  const objections = [];
  const warnings = [];
  let fiscalStatus = "Objeción moderada";
  let severityScore = 0;

  const reports = specialistReports?.reports || [];
  const missingData = reports.flatMap((report) => report.missingData || []);
  const uniqueMissingData = Array.from(new Set(missingData));

  const hasRefereeMissing = uniqueMissingData.some((item) =>
    item.toLowerCase().includes("árbitro") ||
    item.toLowerCase().includes("arbitro")
  );

  const hasLineupMissing = uniqueMissingData.some((item) =>
    item.toLowerCase().includes("alineación") ||
    item.toLowerCase().includes("alineacion")
  );

  const isParlay = analysisInput?.uso === "parlay";
  const market = (analysisInput?.mercado || "").toLowerCase();

  if (hasRefereeMissing && (market.includes("tarjeta") || market.includes("falta"))) {
    objections.push("El mercado disciplinario depende de árbitro confirmado.");
    severityScore += 25;
  }

  if (hasLineupMissing && (
    market.includes("remate") ||
    market.includes("gol") ||
    market.includes("pase") ||
    market.includes("corner") ||
    market.includes("córner")
  )) {
    objections.push("El mercado solicitado depende de alineaciones o jugadores clave no confirmados.");
    severityScore += 25;
  }

  if (isParlay) {
    warnings.push(
      "Parlay no está soportado en la Fase 0; esta elección no cambia el riesgo intrínseco del mercado."
    );
  }

  if (!scenario?.resolvedCompetition?.resolved) {
    objections.push("La competición no está confirmada con suficiente claridad.");
    severityScore += 20;
  }

  if (uniqueMissingData.length >= 6) {
    warnings.push("Hay varios datos faltantes; la salida debe mantenerse como análisis inicial.");
    severityScore += 15;
  }

  if (objections.length === 0) {
    fiscalStatus = "Sin objeción crítica";
    warnings.push("Fiscal no encontró objeción crítica, pero el análisis sigue siendo inicial.");
  }

  if (severityScore >= 50) {
    fiscalStatus = "Objeción fuerte";
  } else if (severityScore >= 20) {
    fiscalStatus = "Objeción moderada";
  }

  const recommendation =
    fiscalStatus === "Objeción fuerte"
      ? "No emitir recomendación. Mantener como análisis inicial o esperar validación."
      : fiscalStatus === "Objeción moderada"
      ? "Mantener cautela. No elevar a apuesta fuerte."
      : "Puede avanzar al Motor de Decisión preliminar.";

  return {
    fiscalStatus,
    severityScore,
    objections,
    warnings,
    missingData: uniqueMissingData,
    recommendation,
    parlayStatus: PARLAY_STATUS.UNSUPPORTED,
  };
}
