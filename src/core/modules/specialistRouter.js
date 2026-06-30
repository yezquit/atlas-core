export function routeSpecialists({ scenario, mercado, uso }) {
  const normalizedMarket = (mercado || "").toLowerCase();

  const specialists = [];

  function addSpecialist(name, reason, priority = "Media") {
    const alreadyExists = specialists.some((item) => item.name === name);

    if (!alreadyExists) {
      specialists.push({
        name,
        reason,
        priority,
      });
    }
  }

  const tags = scenario?.tags || [];
  const markets = scenario?.candidateMarkets || [];
  const competitionId = scenario?.resolvedCompetition?.competitionId;

  const isColombia =
    competitionId === "colombia-primera-a" ||
    competitionId === "colombia-primera-b";

  const isClassic = tags.some((tag) =>
    tag.toLowerCase().includes("clásico") ||
    tag.toLowerCase().includes("clasico") ||
    tag.toLowerCase().includes("rivalidad")
  );

  if (competitionId) {
    addSpecialist(
      "Competición",
      "La competición fue identificada y puede modificar el ADN del partido.",
      "Alta"
    );
  }

  if (isColombia) {
    addSpecialist(
      "Contexto",
      "El partido pertenece al fútbol colombiano, donde el contexto competitivo y emocional puede pesar bastante.",
      "Alta"
    );
  }

  if (isClassic) {
    addSpecialist(
      "Psicología Competitiva",
      "Atlas detectó clásico o alta rivalidad, lo que puede alterar intensidad, faltas y tarjetas.",
      "Alta"
    );

    addSpecialist(
      "Arbitral",
      "En partidos de alta rivalidad, el criterio arbitral puede cambiar fuertemente el análisis disciplinario.",
      "Alta"
    );
  }

  if (
    normalizedMarket.includes("tarjeta") ||
    markets.includes("tarjetas")
  ) {
    addSpecialist(
      "Arbitral",
      "El mercado de tarjetas depende directamente del perfil y criterio del árbitro.",
      "Alta"
    );

    addSpecialist(
      "Estadístico",
      "El mercado de tarjetas requiere revisar promedios, tendencias y muestra reciente.",
      "Media"
    );
  }

  if (
    normalizedMarket.includes("falta") ||
    markets.includes("faltas")
  ) {
    addSpecialist(
      "Arbitral",
      "El mercado de faltas depende del criterio arbitral y del nivel de contacto permitido.",
      "Alta"
    );

    addSpecialist(
      "Contexto",
      "Las faltas pueden aumentar por rivalidad, presión, necesidad competitiva o partido trabado.",
      "Alta"
    );

    addSpecialist(
      "Estadístico",
      "El mercado de faltas requiere revisar tendencias recientes de equipos y competición.",
      "Media"
    );
  }

  if (
    normalizedMarket.includes("pase") ||
    markets.includes("pases")
  ) {
    addSpecialist(
      "Táctico",
      "El mercado de pases depende de posesión, bloque rival, ritmo y forma de progresar.",
      "Alta"
    );

    addSpecialist(
      "Estadístico",
      "El mercado de pases requiere revisar volúmenes recientes y comportamiento local/visitante.",
      "Media"
    );
  }

  if (
    normalizedMarket.includes("remate") ||
    markets.includes("remates")
  ) {
    addSpecialist(
      "Táctico",
      "El mercado de remates depende de profundidad ofensiva, ritmo, bloque rival y necesidad de atacar.",
      "Alta"
    );

    addSpecialist(
      "Plantillas",
      "Los remates pueden depender de delanteros, extremos y generadores titulares.",
      "Alta"
    );

    addSpecialist(
      "Estadístico",
      "El mercado de remates requiere revisar volumen reciente y varianza.",
      "Media"
    );
  }

  if (
    normalizedMarket.includes("corner") ||
    normalizedMarket.includes("córner") ||
    markets.includes("córners")
  ) {
    addSpecialist(
      "Táctico",
      "Los córners dependen de ataque por bandas, centros, bloque bajo rival y presión ofensiva.",
      "Alta"
    );

    addSpecialist(
      "Plantillas",
      "Extremos y laterales titulares pueden modificar la proyección de córners.",
      "Media"
    );
  }

  if (uso === "parlay") {
    addSpecialist(
      "Parlay",
      "El usuario indicó uso en parlay, por lo que Atlas debe revisar madurez, compatibilidad y concentración de riesgo.",
      "Alta"
    );
  }

  if (specialists.length === 0) {
    addSpecialist(
      "Contexto",
      "No hay señales suficientes para especialistas avanzados; Atlas inicia con análisis contextual básico.",
      "Media"
    );

    addSpecialist(
      "Estadístico",
      "Atlas requiere una primera revisión de datos para detectar mercados candidatos.",
      "Media"
    );
  }

  return {
    specialists,
    summary: specialists
      .map((specialist) => specialist.name)
      .join(", "),
  };
}
