function normalizeText(value = "") {
  return value
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function detectMarketSensitivity(marketText = "") {
  const market = normalizeText(marketText);

  if (
    market.includes("tarjeta") ||
    market.includes("amarilla") ||
    market.includes("roja") ||
    market.includes("cards")
  ) {
    return {
      level: "high",
      label: "Alta",
      reason: "El mercado depende directamente del criterio disciplinario del árbitro.",
      affectedMarkets: ["tarjetas", "amarillas", "rojas", "disciplina"],
    };
  }

  if (
    market.includes("falta") ||
    market.includes("foul") ||
    market.includes("penal") ||
    market.includes("penalty")
  ) {
    return {
      level: "medium_high",
      label: "Media-alta",
      reason: "El mercado puede verse afectado por el criterio de contacto, faltas y sanciones.",
      affectedMarkets: ["faltas", "penales", "disciplina"],
    };
  }

  if (
    market.includes("corner") ||
    market.includes("corners") ||
    market.includes("remate") ||
    market.includes("tiro") ||
    market.includes("pase") ||
    market.includes("posesion") ||
    market.includes("posesión")
  ) {
    return {
      level: "low",
      label: "Baja",
      reason: "El árbitro puede influir indirectamente, pero no es la variable principal del mercado.",
      affectedMarkets: [],
    };
  }

  return {
    level: "unknown",
    label: "No determinada",
    reason: "No se pudo determinar con precisión la sensibilidad del mercado al árbitro.",
    affectedMarkets: [],
  };
}

export function buildRefereeProfile({
  realFixtureLookup,
  marketText,
  sourceConfidence,
}) {
  const fixture = realFixtureLookup?.fixture || realFixtureLookup?.selectedFixture || null;

  const refereeName =
    fixture?.referee?.name ||
    fixture?.referee ||
    fixture?.officials?.referee ||
    null;

  const hasConfirmedFixture = Boolean(fixture?.fixtureId || fixture?.id);
  const hasReferee = Boolean(refereeName);

  const sensitivity = detectMarketSensitivity(marketText);

  const missingData = [];

  if (!hasConfirmedFixture) {
    missingData.push("Fixture real confirmado");
  }

  if (!hasReferee) {
    missingData.push("Árbitro confirmado del partido");
  }

  missingData.push("Histórico reciente del árbitro");
  missingData.push("Promedio de tarjetas por partido del árbitro");
  missingData.push("Promedio de faltas sancionadas por partido");
  missingData.push("Tendencia disciplinaria local/visitante");
  missingData.push("Comparación árbitro vs promedio de liga");

  let profileStatus = "unavailable";
  let profileLabel = "🔴 Perfil arbitral no disponible";
  let confidence = 0;
  let operationalUse = "No usar para decisión.";

  if (hasConfirmedFixture && hasReferee) {
    profileStatus = "identified";
    profileLabel = "🟡 Árbitro identificado, histórico pendiente";
    confidence = 28;
    operationalUse =
      "Puede usarse solo como dato contextual. No debe sostener una apuesta por sí solo.";
  }

  if (hasConfirmedFixture && hasReferee && sensitivity.level === "high") {
    confidence = 32;
    operationalUse =
      "Dato relevante para mercado disciplinario, pero requiere histórico antes de habilitar decisión fuerte.";
  }

  const impactOnDecision =
    sensitivity.level === "high" || sensitivity.level === "medium_high"
      ? "El árbitro es una variable importante para este mercado. Sin histórico, Atlas debe limitar la confianza."
      : "El árbitro no parece ser la variable principal para este mercado.";

  const sourceImpact =
    hasReferee && sensitivity.level === "high"
      ? {
          shouldLimitConfidence: true,
          reason:
            "Mercado sensible al árbitro con nombre detectado, pero sin histórico arbitral suficiente.",
          maxTechnicalSupport: 62,
          maxEstimatedProbability: 57,
        }
      : {
          shouldLimitConfidence: false,
          reason:
            "El árbitro no exige limitación adicional fuerte para este mercado en la versión actual.",
          maxTechnicalSupport: null,
          maxEstimatedProbability: null,
        };

  return {
    available: hasReferee,
    profileStatus,
    profileLabel,
    refereeName,
    hasConfirmedFixture,
    hasReferee,
    sensitivity,
    confidence,
    operationalUse,
    impactOnDecision,
    missingData,
    sourceImpact,
    informationScoreBefore:
      sourceConfidence?.informationScore ??
      sourceConfidence?.score ??
      sourceConfidence?.qualityScore ??
      null,
    summary: hasReferee
      ? `Árbitro detectado: ${refereeName}. El histórico arbitral todavía no está conectado.`
      : "Atlas no tiene árbitro confirmado para este partido.",
  };
}
