import { resolveCompetition } from "./competitionResolver";

function normalizeLocal(value) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function classifyScenario({ mode, partido, competicion, mercado }) {
  const normalizedPartido = normalizeLocal(partido);
  const normalizedCompeticion = normalizeLocal(competicion);
  const normalizedMercado = normalizeLocal(mercado);

  const resolvedCompetition = resolveCompetition({ partido, competicion });

  const tags = [];
  const candidateMarkets = new Set();
  const suggestedSpecialists = new Set();

  const isJourney = mode === "jornada";

  const isColombiaCompetition =
    resolvedCompetition.competitionId === "colombia-primera-a" ||
    resolvedCompetition.competitionId === "colombia-primera-b" ||
    normalizedCompeticion.includes("betplay") ||
    normalizedCompeticion.includes("colombia") ||
    normalizedCompeticion.includes("liga colombiana");

  const classicPairs = [
    ["america", "millonarios"],
    ["nacional", "medellin"],
    ["cali", "america"],
    ["santa fe", "millonarios"],
  ];

  const isClassic = classicPairs.some(([a, b]) => {
    return normalizedPartido.includes(a) && normalizedPartido.includes(b);
  });

  if (isJourney) {
    tags.push("Explorador de jornada");
    suggestedSpecialists.add("Competición");
    suggestedSpecialists.add("Estadístico");
    suggestedSpecialists.add("Noticias y Fuentes");
  } else {
    tags.push("Partido específico");
  }

  if (resolvedCompetition.resolved) {
    tags.push(`${resolvedCompetition.competitionName} / ${resolvedCompetition.division}`);
  } else if (isColombiaCompetition) {
    tags.push("Competición colombiana pendiente de confirmar");
  }

  if (isColombiaCompetition) {
    suggestedSpecialists.add("Competición");
    suggestedSpecialists.add("Contexto");
    candidateMarkets.add("faltas");
    candidateMarkets.add("tarjetas");
  }

  if (isClassic) {
    tags.push("Clásico / alta rivalidad");
    suggestedSpecialists.add("Contexto");
    suggestedSpecialists.add("Arbitral");
    suggestedSpecialists.add("Psicología Competitiva");
    candidateMarkets.add("tarjetas");
    candidateMarkets.add("faltas");
  }

  if (normalizedMercado) {
    candidateMarkets.add(normalizedMercado);

    if (normalizedMercado.includes("tarjeta")) {
      suggestedSpecialists.add("Arbitral");
      suggestedSpecialists.add("Contexto");
      suggestedSpecialists.add("Estadístico");
    }

    if (normalizedMercado.includes("falta")) {
      suggestedSpecialists.add("Arbitral");
      suggestedSpecialists.add("Contexto");
      suggestedSpecialists.add("Estadístico");
    }

    if (normalizedMercado.includes("pase")) {
      suggestedSpecialists.add("Táctico");
      suggestedSpecialists.add("Estadístico");
      suggestedSpecialists.add("Contexto");
    }

    if (normalizedMercado.includes("remate")) {
      suggestedSpecialists.add("Táctico");
      suggestedSpecialists.add("Estadístico");
      suggestedSpecialists.add("Plantillas");
    }

    if (normalizedMercado.includes("corner") || normalizedMercado.includes("corner")) {
      suggestedSpecialists.add("Táctico");
      suggestedSpecialists.add("Estadístico");
      suggestedSpecialists.add("Plantillas");
    }
  }

  if (candidateMarkets.size === 0) {
    ["tarjetas", "faltas", "pases", "remates", "córners", "saques de banda"].forEach(
      (market) => candidateMarkets.add(market)
    );
  }

  if (suggestedSpecialists.size === 0) {
    ["Competición", "Contexto", "Estadístico"].forEach((specialist) =>
      suggestedSpecialists.add(specialist)
    );
  }

  return {
    tags,
    candidateMarkets: Array.from(candidateMarkets),
    suggestedSpecialists: Array.from(suggestedSpecialists),
    resolvedCompetition,
    confidence: tags.length >= 3 ? "Media" : "Inicial",
    explanation:
      tags.length >= 3
        ? `Atlas detectó señales suficientes para clasificar el escenario inicial. ${resolvedCompetition.reason || ""}`
        : `Atlas realizó una clasificación básica. ${resolvedCompetition.reason || "Faltan más datos para elevar confianza."}`,
  };
}
