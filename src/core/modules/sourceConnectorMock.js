export function getMockSourceData({ scenario, analysisInput }) {
  const competition = scenario?.resolvedCompetition;
  const market = (analysisInput?.mercado || "").toLowerCase();
  const line = analysisInput?.lineaMercado?.trim() || null;
  const odds = analysisInput?.cuotaMercado?.trim() || null;
  const hasLineAndOdds = Boolean(line && odds);
  const hasReportedMarketData = Boolean(line || odds);

  const sourceData = [
    {
      data: "Competición y división",
      value: competition?.resolved
        ? `${competition.competitionName} (${competition.division})`
        : "No resuelta",
      source: "Base interna inicial de Atlas",
      sourceLevel: "Interna provisional",
      status: competition?.resolved ? "Inferido" : "Pendiente",
      confidence: competition?.resolved ? "Media" : "Baja",
      note: "Debe confirmarse luego con fuente oficial o API deportiva.",
    },
    {
      data: "Árbitro confirmado",
      value: "Pendiente",
      source: "No conectado",
      sourceLevel: "Pendiente",
      status: "Pendiente",
      confidence: "Baja",
      note: "Dato crítico para mercados de tarjetas y faltas.",
    },
    {
      data: "Alineaciones oficiales",
      value: "Pendiente",
      source: "No conectado",
      sourceLevel: "Pendiente",
      status: "Pendiente",
      confidence: "Baja",
      note: "Dato crítico para goles, remates, pases y córners.",
    },
    {
      data: "Estadísticas recientes",
      value: "Pendiente",
      source: "No conectado",
      sourceLevel: "Pendiente",
      status: "Pendiente",
      confidence: "Baja",
      note: "Necesario para evaluar promedios y tendencias.",
    },
    {
      data: "Líneas y cuotas",
      value: hasReportedMarketData
        ? `Línea: ${line || "no reportada"} · Cuota: ${odds || "no reportada"}`
        : market
          ? `Pendiente para mercado: ${market}`
          : "Pendiente",
      source: hasReportedMarketData ? "Usuario" : "No conectado",
      sourceLevel: hasReportedMarketData ? "Dato reportado" : "Pendiente",
      status: hasLineAndOdds
        ? "Reportado, falta validar"
        : hasReportedMarketData
          ? "Parcialmente reportado"
          : "Pendiente",
      confidence: hasReportedMarketData ? "Sin verificar" : "Baja",
      note: hasLineAndOdds
        ? "Atlas conserva los valores reportados, pero debe validarlos contra una fuente verificable."
        : "Atlas necesita los valores que aún falten antes de evaluar el contexto de mercado.",
    },
    {
      data: "Consenso de fuentes",
      value: "Pendiente",
      source: "No conectado",
      sourceLevel: "Pendiente",
      status: "Pendiente",
      confidence: "Baja",
      note: "Debe comparar fuente oficial, API y páginas deportivas confiables.",
    },
  ];

  const connectedCount = sourceData.filter((item) =>
    ["Confirmado", "Inferido"].includes(item.status)
  ).length;

  const pendingCount = sourceData.length - connectedCount;
  const reportedCount = sourceData.filter((item) =>
    item.status.toLowerCase().includes("reportado")
  ).length;

  return {
    status:
      pendingCount > connectedCount
        ? "Fuentes externas pendientes"
        : "Fuentes parcialmente conectadas",
    connectedCount,
    pendingCount,
    reportedCount,
    sourceData,
    summary:
      "Atlas todavía opera con datos internos e inferencias iniciales. Falta conectar fuentes externas confiables para elevar la decisión.",
  };
}
