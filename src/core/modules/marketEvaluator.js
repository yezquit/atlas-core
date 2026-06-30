export function evaluateMarkets({ mercado, scenario, specialistReports, fiscalReview }) {
  const normalizedMarket = (mercado || "").toLowerCase().trim();

  const marketFamily = detectMarketFamily(normalizedMarket);
  const relatedMarkets = getRelatedMarkets(marketFamily);
  const missingData = Array.from(
    new Set(
      (specialistReports?.reports || []).flatMap(
        (report) => report.missingData || []
      )
    )
  );

  const fiscalObjections = fiscalReview?.objections || [];

  const evaluations = relatedMarkets.map((market) => {
    return evaluateSingleMarket({
      market,
      marketFamily,
      scenario,
      missingData,
      fiscalObjections,
    });
  });

  const primaryCandidate =
    evaluations.find((item) => item.role === "Principal") || evaluations[0];

  return {
    requestedMarket: mercado || "No especificado",
    marketFamily,
    primaryCandidate,
    evaluations,
    summary: buildSummary({ marketFamily, primaryCandidate, evaluations }),
  };
}

function detectMarketFamily(market) {
  if (!market) return "general";

  if (market.includes("tarjeta")) return "disciplinario";
  if (market.includes("falta")) return "disciplinario";
  if (market.includes("pase")) return "posesion";
  if (market.includes("remate")) return "volumen ofensivo";
  if (market.includes("corner") || market.includes("córner")) return "volumen ofensivo";
  if (market.includes("gol")) return "goles";
  if (market.includes("saque")) return "saques de banda";

  return "general";
}

function getRelatedMarkets(family) {
  const map = {
    disciplinario: [
      {
        name: "Tarjetas totales",
        role: "Principal",
        requiredData: ["Árbitro confirmado", "Promedio de tarjetas", "Historial disciplinario"],
        strengths: ["Captura tensión", "Útil en clásicos", "Fácil de entender"],
        fragility: "Alta si no hay árbitro confirmado",
      },
      {
        name: "Faltas totales",
        role: "Alternativo fuerte",
        requiredData: ["Promedio de faltas sancionadas", "Perfil arbitral", "Estilo físico de equipos"],
        strengths: ["Captura contacto sin depender de amarilla", "Puede ser más estable que tarjetas"],
        fragility: "Media si el árbitro deja jugar demasiado",
      },
      {
        name: "Tarjetas por equipo",
        role: "Alternativo específico",
        requiredData: ["Equipo más presionado", "Jugadores propensos", "Localía"],
        strengths: ["Útil si un equipo defiende más o llega presionado"],
        fragility: "Alta si cambia el guion del partido",
      },
    ],

    posesion: [
      {
        name: "Pases totales",
        role: "Principal",
        requiredData: ["Estilo táctico", "Posesión esperada", "Bloque rival"],
        strengths: ["Mercado estructural", "Menos dependiente del gol que otros mercados"],
        fragility: "Media si hay expulsión o cambio de guion temprano",
      },
      {
        name: "Pases del favorito",
        role: "Alternativo fuerte",
        requiredData: ["Favorito claro", "Alineación titular", "Dominio esperado"],
        strengths: ["Útil si un equipo domina posesión"],
        fragility: "Media si el favorito marca temprano y baja ritmo",
      },
      {
        name: "Posesión",
        role: "Alternativo",
        requiredData: ["Estilos", "Necesidad competitiva", "Localía"],
        strengths: ["Relacionada con control del partido"],
        fragility: "Media-alta por variación de marcador",
      },
    ],

    "volumen ofensivo": [
      {
        name: "Remates totales",
        role: "Principal",
        requiredData: ["Alineaciones", "Ritmo esperado", "Bloque defensivo"],
        strengths: ["Captura actividad ofensiva general"],
        fragility: "Alta ante bloque bajo o gol temprano",
      },
      {
        name: "Córners totales",
        role: "Alternativo fuerte",
        requiredData: ["Ataque por bandas", "Centros", "Bloque rival"],
        strengths: ["Puede capturar dominio sin gol"],
        fragility: "Media-alta si el ataque no profundiza",
      },
      {
        name: "Remates a puerta",
        role: "Alternativo frágil",
        requiredData: ["Calidad ofensiva", "Precisión", "Arqueros", "Alineaciones"],
        strengths: ["Más cercano al peligro real"],
        fragility: "Alta por depender de precisión",
      },
    ],

    goles: [
      {
        name: "Goles totales",
        role: "Principal",
        requiredData: ["Alineaciones", "Eficiencia ofensiva", "Contexto", "Cuotas"],
        strengths: ["Mercado popular y disponible"],
        fragility: "Alta por varianza natural del gol",
      },
      {
        name: "Goles del favorito",
        role: "Alternativo",
        requiredData: ["Favorito claro", "Alineación ofensiva", "Debilidad rival"],
        strengths: ["Más específico que goles totales"],
        fragility: "Alta si el favorito controla sin acelerar",
      },
      {
        name: "Ambos equipos anotan",
        role: "Alternativo frágil",
        requiredData: ["Capacidad ofensiva de ambos", "Defensas", "Necesidad de atacar"],
        strengths: ["Útil si ambos tienen incentivo ofensivo"],
        fragility: "Alta si un equipo especula",
      },
    ],

    "saques de banda": [
      {
        name: "Saques de banda totales",
        role: "Principal",
        requiredData: ["Juego por bandas", "Presión alta", "Despejes", "Ritmo"],
        strengths: ["Mercado de flujo colectivo", "Puede ser estable si hay bandas activas"],
        fragility: "Media por dependencia del estilo",
      },
      {
        name: "Saques de banda por equipo",
        role: "Alternativo",
        requiredData: ["Equipo que ataca por banda", "Lateralidad", "Presión rival"],
        strengths: ["Útil si un equipo carga mucho por bandas"],
        fragility: "Media-alta por cambio táctico",
      },
    ],

    general: [
      {
        name: "Tarjetas totales",
        role: "Candidato",
        requiredData: ["Árbitro", "Contexto", "Rivalidad"],
        strengths: ["Útil si hay tensión"],
        fragility: "Alta sin árbitro",
      },
      {
        name: "Faltas totales",
        role: "Candidato",
        requiredData: ["Árbitro", "Estilo físico", "Ritmo"],
        strengths: ["Captura contacto del partido"],
        fragility: "Media",
      },
      {
        name: "Pases totales",
        role: "Candidato",
        requiredData: ["Táctica", "Posesión", "Bloque rival"],
        strengths: ["Mercado estructural"],
        fragility: "Media",
      },
    ],
  };

  return map[family] || map.general;
}

function evaluateSingleMarket({ market, missingData, fiscalObjections }) {
  const missingRequired = market.requiredData.filter((required) =>
    missingData.some((item) =>
      item.toLowerCase().includes(required.toLowerCase().split(" ")[0])
    )
  );

  const hasFiscalRisk = fiscalObjections.some((objection) => {
    const lower = objection.toLowerCase();
    return (
      lower.includes("árbitro") ||
      lower.includes("arbitro") ||
      lower.includes("alineación") ||
      lower.includes("alineacion") ||
      lower.includes("parlay")
    );
  });

  let status = "Pendiente de datos";
  let confidence = 10;

  if (missingRequired.length >= 2 || hasFiscalRisk) {
    status = "Esperar validación";
    confidence = 10;
  } else if (missingRequired.length === 1) {
    status = "Observación";
    confidence = 20;
  } else {
    status = "Candidato preliminar";
    confidence = 25;
  }

  return {
    ...market,
    status,
    confidence: `${confidence}%`,
    missingRequired,
    validationNeeded: market.requiredData,
  };
}

function buildSummary({ marketFamily, primaryCandidate, evaluations }) {
  const alternatives = evaluations
    .filter((item) => item.name !== primaryCandidate.name)
    .map((item) => item.name)
    .join(", ");

  return `Familia detectada: ${marketFamily}. Mercado principal a revisar: ${primaryCandidate.name}. Alternativas: ${alternatives}.`;
}
