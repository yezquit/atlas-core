const MARKET_FAMILIES = Object.freeze([
  "goals",
  "corners",
  "cards",
  "total_shots",
  "shots_on_goal",
]);

const RULES = Object.freeze([
  { pattern: /delanter|goleador|atacante|nueve\b/, markets: ["goals", "total_shots", "shots_on_goal"], absent: true, explanation: "Disponibilidad de un atacante relevante." },
  { pattern: /extremo|winger/, markets: ["goals", "corners", "total_shots", "shots_on_goal"], absent: true, explanation: "Disponibilidad de un jugador de amplitud ofensiva." },
  { pattern: /lateral ofensiv|carrilero/, markets: ["corners", "total_shots"], absent: true, explanation: "Disponibilidad de un jugador de progresión por banda." },
  { pattern: /arbitro|referee/, markets: ["cards"], absent: false, explanation: "Información arbitral relevante para disciplina." },
  { pattern: /lluvia|viento|tormenta|clima fuerte|calor extremo|frio extremo/, markets: ["goals", "corners", "total_shots", "shots_on_goal"], absent: false, defaultDirection: "decrease", explanation: "Condiciones ambientales con posible impacto en ritmo y precisión." },
  { pattern: /rotacion|suplentes|descanso de titulares/, markets: MARKET_FAMILIES, absent: false, defaultDirection: "decrease", explanation: "Rotación con efecto transversal incierto." },
  { pattern: /eliminacion|final|clasificacion|descenso/, markets: ["goals", "cards", "total_shots"], absent: false, defaultDirection: "neutral", explanation: "Contexto competitivo que puede alterar ritmo y disciplina." },
  { pattern: /campo|cesped|superficie/, markets: ["goals", "corners", "total_shots", "shots_on_goal"], absent: false, defaultDirection: "decrease", explanation: "Estado de la superficie con posible efecto en ritmo y precisión." },
]);

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function directionFor(text, rule) {
  if (/ausente|baja|lesion|sancion|no juega|descartad|rotacion/.test(text)) return rule.absent ? "decrease" : rule.defaultDirection || "decrease";
  if (/recuperad|disponible|regresa|confirmad/.test(text)) return rule.absent ? "increase" : "neutral";
  return rule.defaultDirection || "neutral";
}

function magnitudeFor(text, sourceStatus) {
  if (sourceStatus === "user_reported" || sourceStatus === "unverified") return /muy grave|multiple|varios titulares|extremo/.test(text) ? "low" : "minimal";
  if (/multiple|varios titulares|extremo/.test(text)) return "high";
  if (/titular|fuerte|importante/.test(text)) return "moderate";
  return "low";
}

export function mapGeminiImpacts(items = []) {
  return items.flatMap((item) => {
    const text = normalize(item?.text || item?.summary);
    const sourceStatus = item?.verification_status || item?.validation_status || "unverified";
    return RULES.filter((rule) => rule.pattern.test(text)).map((rule, index) => ({
      id: `${item?.id || "context"}:${index}`,
      source_item_id: item?.id || null,
      affected_markets: [...rule.markets],
      direction: directionFor(text, rule),
      magnitude_class: magnitudeFor(text, sourceStatus),
      confidence: sourceStatus === "verified_provider" ? "high" : sourceStatus === "user_reported" ? "limited" : "low",
      source_status: sourceStatus,
      explanation: rule.explanation,
    }));
  });
}

const STANDARD_DEVIATION_EFFECT = Object.freeze({ minimal: 0.04, low: 0.08, moderate: 0.16, high: 0.24 });

export function contextShiftForMarket(impacts = [], marketFamily) {
  const relevant = impacts.filter((impact) => impact.affected_markets?.includes(marketFamily));
  let standardizedShift = 0;
  for (const impact of relevant) {
    const sign = impact.direction === "increase" ? 1 : impact.direction === "decrease" ? -1 : 0;
    let amount = STANDARD_DEVIATION_EFFECT[impact.magnitude_class] || 0;
    if (["user_reported", "unverified"].includes(impact.source_status)) amount = Math.min(amount, 0.08);
    standardizedShift += sign * amount;
  }
  const hasOnlyUnverified = relevant.length > 0 && relevant.every((impact) => ["user_reported", "unverified"].includes(impact.source_status));
  const limit = hasOnlyUnverified ? 0.15 : 0.3;
  standardizedShift = Math.max(-limit, Math.min(limit, standardizedShift));
  return {
    market_family: marketFamily,
    standardized_shift: Number(standardizedShift.toFixed(3)),
    applied_impacts: relevant,
    source_limit: limit,
    changed_distribution: standardizedShift !== 0,
  };
}

