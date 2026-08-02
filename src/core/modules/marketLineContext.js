function normalizeText(value = "") {
  return value
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function parseNumber(value = "") {
  const match = value.toString().replace(",", ".").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function detectLineFamily(marketText = "", lineText = "") {
  const text = normalizeText(`${marketText} ${lineText}`);

  if (
    text.includes("tarjeta") ||
    text.includes("amarilla") ||
    text.includes("roja") ||
    text.includes("cards")
  ) {
    return {
      family: "disciplina",
      label: "Tarjetas / disciplina",
      lineSensitivity: "Alta",
      reason:
        "Las líneas de tarjetas dependen de árbitro, contexto competitivo, conducta reciente y ritmo del partido.",
    };
  }

  if (text.includes("falta") || text.includes("foul")) {
    return {
      family: "faltas",
      label: "Faltas",
      lineSensitivity: "Alta",
      reason:
        "Las líneas de faltas requieren histórico de equipos, árbitro y estilo de contacto.",
    };
  }

  if (
    text.includes("remate") ||
    text.includes("tiro") ||
    text.includes("arco") ||
    text.includes("puerta") ||
    text.includes("shots")
  ) {
    return {
      family: "volumen ofensivo",
      label: "Remates / remates a arco",
      lineSensitivity: "Alta",
      reason:
        "Las líneas de remates dependen de tendencia ofensiva/defensiva reciente y rol local/visitante.",
    };
  }

  if (text.includes("corner") || text.includes("corners")) {
    return {
      family: "córners",
      label: "Córners",
      lineSensitivity: "Alta",
      reason:
        "Las líneas de córners dependen de presión territorial, volumen ofensivo y córners concedidos.",
    };
  }

  if (
    text.includes("pase") ||
    text.includes("posesion") ||
    text.includes("posesión")
  ) {
    return {
      family: "control de juego",
      label: "Pases / posesión",
      lineSensitivity: "Media-alta",
      reason:
        "Las líneas de pases y posesión dependen del patrón táctico reciente y rival.",
    };
  }

  return {
    family: "general",
    label: "Mercado general",
    lineSensitivity: "No determinada",
    reason:
      "Atlas no pudo clasificar con precisión la sensibilidad de la línea para este mercado.",
  };
}

function classifyOdds(oddsNumber) {
  if (!oddsNumber) {
    return {
      status: "missing",
      label: "Cuota no informada",
      interpretation: "No se puede evaluar contexto económico.",
    };
  }

  if (oddsNumber < 1.35) {
    return {
      status: "very_low",
      label: "Cuota muy baja",
      interpretation:
        "Exige alta tasa de acierto. No debe aceptarse sin respaldo técnico muy fuerte.",
    };
  }

  if (oddsNumber < 1.65) {
    return {
      status: "low",
      label: "Cuota baja",
      interpretation:
        "Requiere buen respaldo técnico. Puede no compensar el riesgo si faltan datos.",
    };
  }

  if (oddsNumber <= 2.1) {
    return {
      status: "standard",
      label: "Cuota media",
      interpretation:
        "Rango operativo común. Debe conservarse como contexto hasta disponer de un modelo deportivo validado.",
    };
  }

  if (oddsNumber <= 3.2) {
    return {
      status: "high",
      label: "Cuota alta",
      interpretation:
        "Mayor retorno, pero normalmente implica más incertidumbre o menor probabilidad implícita.",
    };
  }

  return {
    status: "very_high",
    label: "Cuota muy alta",
    interpretation:
      "Alta incertidumbre. Atlas debe exigir evidencia excepcional antes de considerar acción.",
  };
}

export function buildMarketLineContext({
  marketText,
  lineText,
  oddsText,
  confidenceCalibration,
  marketGate,
  refereeProfile,
  teamRecentProfile,
}) {
  const normalizedLine = lineText?.trim() || "";
  const normalizedOdds = oddsText?.trim() || "";

  const hasLine = Boolean(normalizedLine);
  const hasOdds = Boolean(normalizedOdds);

  const lineNumber = parseNumber(normalizedLine);
  const oddsNumber = parseNumber(normalizedOdds);

  const family = detectLineFamily(marketText, normalizedLine);
  const oddsProfile = classifyOdds(oddsNumber);

  const technicalSupport = confidenceCalibration?.technicalSupport ?? null;
  const estimatedProbability = confidenceCalibration?.estimatedProbability ?? null;

  const missingData = [];

  if (!hasLine) missingData.push("Línea exacta del mercado");
  if (!hasOdds) missingData.push("Cuota real de la casa");
  if (!technicalSupport) missingData.push("Respaldo técnico calibrado");
  if (estimatedProbability === null) {
    missingData.push("Modelo deportivo validado no disponible en Fase 0");
  }

  if (refereeProfile?.sourceImpact?.shouldLimitConfidence) {
    missingData.push("Histórico arbitral suficiente para validar la línea");
  }

  if (teamRecentProfile?.sourceImpact?.shouldLimitConfidence) {
    missingData.push("Histórico reciente de equipos para validar la línea");
  }

  let status = "pending";
  let label = "🟡 Línea pendiente de validación";
  let valueRead = "No evaluable todavía.";
  let operationalEffect = "No usar línea/cuota para habilitar apuesta.";

  if (!hasLine && !hasOdds) {
    status = "missing";
    label = "🔴 Sin línea ni cuota";
    valueRead =
      "Atlas puede analizar técnicamente el mercado, pero no puede evaluar valor económico.";
    operationalEffect =
      "No convertir en apuesta real sin línea y cuota verificadas.";
  } else if (hasLine && !hasOdds) {
    status = "line_only";
    label = "🟠 Línea informada, cuota pendiente";
    valueRead =
      "La línea permite entender el umbral, pero falta cuota para evaluar si compensa el riesgo.";
    operationalEffect =
      "Mantener como análisis técnico. No cerrar decisión económica.";
  } else if (!hasLine && hasOdds) {
    status = "odds_only";
    label = "🟠 Cuota informada, línea pendiente";
    valueRead =
      "La cuota sin línea exacta no permite evaluar correctamente el mercado.";
    operationalEffect =
      "No tomar decisión hasta confirmar la línea.";
  } else {
    status = "available";
    label = "🔵 Línea y cuota informadas";
    valueRead =
      "Atlas puede comparar el umbral del mercado contra el respaldo técnico, pero aún debe respetar gates y datos faltantes.";
    operationalEffect =
      "Usar solo como contexto económico. No reemplaza el dictamen técnico.";
  }

  const blocksDecision =
    status !== "available";

  const cautionFlags = [];

  if (oddsNumber && oddsNumber < 1.65 && technicalSupport !== null && technicalSupport < 70) {
    cautionFlags.push(
      "Cuota baja con respaldo técnico insuficiente: riesgo de mala relación riesgo/recompensa."
    );
  }

  if (oddsNumber && oddsNumber > 2.1 && estimatedProbability !== null && estimatedProbability < 55) {
    cautionFlags.push(
      "Cuota alta con probabilidad estimada baja: posible mercado especulativo."
    );
  }

  if (lineNumber !== null && family.lineSensitivity === "Alta") {
    cautionFlags.push(
      "La línea pertenece a un mercado sensible; requiere histórico específico antes de acción fuerte."
    );
  }

  return {
    available: hasLine || hasOdds,
    status,
    label,
    marketFamily: family,
    lineText: normalizedLine || null,
    lineNumber,
    oddsText: normalizedOdds || null,
    oddsNumber,
    oddsProfile,
    technicalSupport,
    estimatedProbability,
    probabilityStatus:
      confidenceCalibration?.probabilityStatus || "unavailable",
    valueRead,
    operationalEffect,
    blocksDecision,
    cautionFlags,
    missingData,
    summary: hasLine || hasOdds
      ? `Línea/cuota recibida para evaluación contextual: ${normalizedLine || "línea no informada"} ${normalizedOdds ? `@ ${normalizedOdds}` : ""}.`
      : "Atlas no recibió línea ni cuota para este mercado.",
  };
}
