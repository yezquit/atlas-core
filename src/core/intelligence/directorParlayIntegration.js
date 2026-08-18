import { assessParlayRisk } from "./parlayAssessmentEngine.js";

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
