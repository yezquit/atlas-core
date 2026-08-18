function buildPerformanceInsights({
  player,
  performance,
  ranking,
  trend
}) {
  const insights = [];

  if (!performance) {
    return {
      player,
      insights: ["Sin datos suficientes para generar análisis."]
    };
  }

  if (performance.roi > 0) {
    insights.push("Rendimiento económico positivo.");
  } else if (performance.roi < 0) {
    insights.push("Rendimiento económico negativo.");
  } else {
    insights.push("Rendimiento económico equilibrado.");
  }

  if (trend?.direction === "improving") {
    insights.push("El rendimiento reciente muestra mejora.");
  }

  if (trend?.direction === "declining") {
    insights.push("El rendimiento reciente muestra caída.");
  }

  if (trend?.direction === "stable") {
    insights.push("El rendimiento reciente es estable.");
  }

  if (ranking?.position) {
    insights.push(
      `Actualmente ocupa la posición ${ranking.position} del ranking.`
    );
  }

  return {
    player,
    summary: generateSummary(insights),
    insights
  };
}

function generateSummary(insights) {
  if (insights.length === 0) {
    return "Sin conclusiones disponibles.";
  }

  return insights.slice(0, 3).join(" ");
}

export {
  buildPerformanceInsights
};
