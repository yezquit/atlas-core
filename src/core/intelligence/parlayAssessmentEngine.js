function assessParlayRisk(parlay) {
  if (!parlay || !Array.isArray(parlay.selections)) {
    return null;
  }

  const selections = parlay.selections;

  let riskScore = 0;
  const risks = [];
  const strengths = [];

  /*
   * Cantidad de selecciones
   */
  if (selections.length >= 7) {
    riskScore += 30;

    risks.push(
      "La combinación depende del cumplimiento de múltiples eventos."
    );
  } else if (selections.length >= 5) {
    riskScore += 20;
  }

  /*
   * Cuota total
   */
  if (parlay.totalOdds >= 15) {
    riskScore += 25;

    risks.push(
      "La cuota elevada aumenta la varianza del resultado final."
    );
  }

  /*
   * Soporte individual
   */
  const supportedSelections = selections.filter(
    (item) => item.support === true
  );

  if (supportedSelections.length === selections.length) {
    strengths.push(
      "Todas las selecciones cuentan con soporte individual."
    );
  } else {
    riskScore += 15;

    risks.push(
      "Algunas selecciones tienen soporte limitado."
    );
  }

  /*
   * Mercados repetidos
   */
  const markets = selections.map(
    (item) => item.market
  );

  const repeatedMarkets = markets.filter(
    (market, index) =>
      markets.indexOf(market) !== index
  );

  if (repeatedMarkets.length > 0) {
    riskScore += 10;

    risks.push(
      "Existe concentración en mercados similares."
    );
  } else {
    strengths.push(
      "Los mercados presentan diversidad."
    );
  }


  let riskLevel = "medium";

  if (riskScore >= 60) {
    riskLevel = "high";
  } else if (riskScore < 30) {
    riskLevel = "low";
  }


  return {
    type: "parlay_assessment",

    riskLevel,

    riskScore,

    strengths,

    risks,

    conclusion:
      riskLevel === "high"
        ? "Combinación posible con soporte, pero con alta varianza."
        : riskLevel === "medium"
        ? "Combinación equilibrada con factores de riesgo moderados."
        : "Combinación con menor exposición relativa."
  };
}


export {
  assessParlayRisk
};
