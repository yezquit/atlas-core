export function generateSpecialistReports({ specialistRoute, scenario, mercado, uso }) {
  const reports = specialistRoute.specialists.map((specialist) => {
    return buildReport({ specialist, scenario, mercado, uso });
  });

  return {
    reports,
    summary: reports.map((report) => report.specialist).join(", "),
  };
}

function buildReport({ specialist, scenario, mercado, uso }) {
  const market = (mercado || "").toLowerCase();
  const competitionName = scenario?.resolvedCompetition?.competitionName || "Competición no confirmada";
  const division = scenario?.resolvedCompetition?.division || "División no confirmada";

  const base = {
    specialist: specialist.name,
    priority: specialist.priority,
    activationReason: specialist.reason,
    conclusion: "Informe inicial pendiente de datos externos.",
    evidence: [],
    confidence: "Inicial",
    risks: [],
    missingData: [],
    affectedMarkets: [],
    impact: "Aporta contexto preliminar al análisis.",
  };

  if (specialist.name === "Competición") {
    return {
      ...base,
      conclusion: `El partido fue asociado a ${competitionName} (${division}).`,
      evidence: [
        "Competición inferida desde equipos o texto ingresado por el usuario.",
        "La división afecta el ADN competitivo y la calidad del análisis.",
      ],
      confidence: scenario?.resolvedCompetition?.confidence || "Inicial",
      risks: [
        "La competición debe confirmarse con fuente oficial o API antes de decisiones reales.",
      ],
      missingData: [
        "Fecha del partido",
        "Jornada exacta",
        "Fuente oficial de competición",
      ],
      affectedMarkets: ["tarjetas", "faltas", "pases", "remates", "córners"],
      impact: "Define el marco competitivo inicial del análisis.",
    };
  }

  if (specialist.name === "Contexto") {
    return {
      ...base,
      conclusion: "El contexto competitivo todavía requiere información de tabla, momento y necesidad de puntos.",
      evidence: [
        "Atlas detectó fútbol colombiano como entorno inicial.",
        "El contexto puede modificar intensidad, ritmo y disciplina.",
      ],
      confidence: "Inicial",
      risks: [
        "Sin tabla, forma reciente y necesidad competitiva, el contexto aún no permite decisión fuerte.",
      ],
      missingData: [
        "Posición en tabla",
        "Últimos partidos",
        "Necesidad competitiva",
        "Localía confirmada",
      ],
      affectedMarkets: ["tarjetas", "faltas", "ritmo", "goles", "remates"],
      impact: "Ayuda a determinar presión, intensidad y posibles mercados relevantes.",
    };
  }

  if (specialist.name === "Arbitral") {
    return {
      ...base,
      conclusion: "El mercado disciplinario no puede elevarse a recomendación fuerte sin árbitro confirmado.",
      evidence: [
        market.includes("tarjeta") || market.includes("falta")
          ? "El mercado solicitado depende directamente del criterio arbitral."
          : "El árbitro puede modificar ritmo, faltas y tarjetas.",
      ],
      confidence: "Inicial",
      risks: [
        "Un árbitro permisivo puede invalidar mercados de tarjetas o faltas.",
        "Un árbitro muy sancionador puede aumentar valor disciplinario.",
      ],
      missingData: [
        "Árbitro confirmado",
        "Promedio de tarjetas",
        "Promedio de faltas sancionadas",
        "Historial en partidos de alta tensión",
      ],
      affectedMarkets: ["tarjetas", "faltas", "penales", "ritmo"],
      impact: "Especialista crítico si el análisis involucra tarjetas o faltas.",
    };
  }

  if (specialist.name === "Estadístico") {
    return {
      ...base,
      conclusion: "Se requiere muestra estadística reciente antes de calcular confianza.",
      evidence: [
        "Atlas identificó mercados candidatos, pero aún no consultó datos históricos ni recientes.",
      ],
      confidence: "Inicial",
      risks: [
        "Promedios sin contexto pueden inducir errores.",
        "Muestras pequeñas pueden distorsionar la decisión.",
      ],
      missingData: [
        "Promedios recientes",
        "Local/visitante",
        "Últimos 5 a 10 partidos",
        "Datos de la competición",
      ],
      affectedMarkets: ["todos los mercados medibles"],
      impact: "Permitirá pasar de hipótesis inicial a evaluación cuantitativa.",
    };
  }

  if (specialist.name === "Psicología Competitiva") {
    return {
      ...base,
      conclusion: "La carga emocional debe confirmarse con rivalidad, momento y presión real del partido.",
      evidence: [
        "Atlas detectó posible clásico o rivalidad alta.",
      ],
      confidence: "Inicial",
      risks: [
        "No todo partido con nombres fuertes se comporta como partido caliente.",
      ],
      missingData: [
        "Historial de rivalidad",
        "Presión de tabla",
        "Antecedentes recientes",
        "Ambiente del partido",
      ],
      affectedMarkets: ["tarjetas", "faltas", "ritmo", "goles"],
      impact: "Ayuda a estimar si el partido puede elevar intensidad o tensión.",
    };
  }

  if (specialist.name === "Táctico") {
    return {
      ...base,
      conclusion: "El análisis táctico requiere estilos, alineaciones y posible plan de partido.",
      evidence: [
        "Mercados como pases, remates y córners dependen fuertemente del guion táctico.",
      ],
      confidence: "Inicial",
      risks: [
        "Dominio territorial no siempre implica remates altos.",
        "Un bloque bajo puede subir pases y bajar profundidad.",
      ],
      missingData: [
        "Alineaciones",
        "Formaciones",
        "Estilo reciente",
        "Presión alta o bloque bajo",
      ],
      affectedMarkets: ["pases", "remates", "córners", "saques de banda", "goles"],
      impact: "Clave para mercados de volumen ofensivo y posesión.",
    };
  }

  if (specialist.name === "Plantillas") {
    return {
      ...base,
      conclusion: "La disponibilidad de jugadores puede modificar por completo algunos mercados.",
      evidence: [
        "Mercados ofensivos dependen de titulares, delanteros, extremos y generadores.",
      ],
      confidence: "Inicial",
      risks: [
        "Alineaciones alternativas pueden invalidar remates, goles, pases o córners.",
      ],
      missingData: [
        "Alineación oficial",
        "Lesiones",
        "Sanciones",
        "Rotaciones",
      ],
      affectedMarkets: ["goles", "remates", "pases", "córners"],
      impact: "No permite recomendación fuerte si el mercado depende de jugadores no confirmados.",
    };
  }

  if (specialist.name === "Parlay") {
    return {
      ...base,
      conclusion: uso === "parlay"
        ? "La selección requiere evaluación adicional antes de entrar a un parlay."
        : "No aplica revisión de parlay para este uso.",
      evidence: [
        "El usuario indicó que la selección puede usarse dentro de parlay.",
      ],
      confidence: "Inicial",
      risks: [
        "Una selección aceptable individualmente puede no ser apta para parlay.",
        "Falta revisar madurez temporal y concentración de riesgo.",
      ],
      missingData: [
        "Otras selecciones del parlay",
        "Horarios",
        "Mercados repetidos",
        "Información crítica pendiente",
      ],
      affectedMarkets: ["compatibilidad global del parlay"],
      impact: "Determina si la selección es apta, apta con advertencia, pendiente o no usable en parlay.",
    };
  }

  return base;
}
