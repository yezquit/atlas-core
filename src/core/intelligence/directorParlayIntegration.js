import { assessParlayRisk } from "./parlayAssessmentEngine.js";

export function buildDirectorCombinationMessage({ product, status, selections = 0 } = {}) {
  const name = product === "dream" ? "Soñadora Atlas" : "Parlay Atlas";
  if (status === "ready" && product === "dream") {
    return `${name} preparada con ${selections} selecciones. Estas son las opciones con mejor soporte conjunto encontradas en el universo analizado. Es una combinación de alto riesgo por acumulación de eventos y no promete ganancias.`;
  }
  if (status === "ready") {
    return `${name} preparado con ${selections} selecciones. Estas son las opciones con mejor soporte conjunto encontradas en el universo analizado. Revisa disponibilidad de precios, correlación y riesgo antes de decidir.`;
  }
  if (status === "manual_incomplete") {
    return `Selecciona exactamente ${selections} opciones elegibles para construir la combinación manual.`;
  }
  if (status === "fixed_selection_invalid") {
    return "Alguna opción fijada no es elegible o excede el tamaño solicitado.";
  }
  return `No existen ${selections} candidatos con soporte deportivo suficiente y suficientemente diversificables. Atlas no forzará una combinación.`;
}

function buildDirectorParlayAssessment(parlayCandidate) {

  const normalizedParlay = {
    selections:
      parlayCandidate.selections ??
      parlayCandidate.legs ??
      [],
    
    totalOdds:
      parlayCandidate.totalOdds ?? 0
  };


  const assessment = assessParlayRisk(normalizedParlay);


  if (!assessment) {
    return null;
  }


  return {
    ...assessment,

    type: "parlay_assessment",

    supportedSelections:
      normalizedParlay.selections.filter(
        (item) => item.supported === true
      ).length,


    director_message:
      assessment.riskLevel === "high"
        ? "Riesgo alto: la combinación tiene soporte parcial pero una varianza elevada."
        : assessment.riskLevel === "medium"
        ? "Riesgo moderado: la combinación requiere revisión."
        : "Riesgo bajo: combinación con menor exposición."
  };
}

export {
  buildDirectorParlayAssessment
};
