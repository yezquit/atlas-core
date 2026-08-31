const STATUS_LABELS = Object.freeze({
  available: "Disponible",
  blocked: "Bloqueada",
  complete: "Completa",
  high: "Alto",
  high_risk: "Riesgo alto",
  hit: "Acierto",
  incompatible: "Incompatible",
  incompatible_context: "Contexto incompatible",
  incompatible_direction: "Dirección incompatible",
  incompatible_fixture: "Partido incompatible",
  incompatible_line: "Línea incompatible",
  incompatible_market: "Mercado incompatible",
  invalid: "Inválida",
  live: "EN VIVO",
  miss: "Fallo",
  not_evaluable: "No evaluable",
  partial: "Parcial",
  pending: "Pendiente",
  prematch: "Prepartido",
  stale: "Desactualizada",
  unavailable: "No disponible",
  void: "Nulo",
  half_won: "Media ganada",
  half_lost: "Media perdida",
  push: "Push",
});

const MARKET_LABELS = Object.freeze({
  cards: "Tarjetas",
  corners: "Córners",
  goals: "Goles",
  shots_on_goal: "Remates a puerta",
  total_shots: "Remates totales",
  asian_total_goals: "Asiático (Más/Menos) — Total de goles",
});

const PROVIDER_STATUS_LABELS = Object.freeze({
  "1h": "Primer tiempo",
  "2h": "Segundo tiempo",
  ft: "Partido finalizado",
  "first half": "Primer tiempo",
  ht: "Descanso",
  halftime: "Descanso",
  "in play": "En juego",
  live: "EN VIVO",
  "match finished": "Partido finalizado",
  "not started": "No iniciado",
  ns: "No iniciado",
  pst: "Aplazado",
  "second half": "Segundo tiempo",
});

export function displaySelectionLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "No disponible";
  return text.replace(/\bUnder\b/gi, "Menos de").replace(/\bOver\b/gi, "Más de");
}

export function displayStatusLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "No disponible";
  return STATUS_LABELS[text.toLowerCase().replace(/[ -]+/g, "_")] || text;
}

export function displayMarketLabel(value) {
  const text = String(value || "").trim();
  return MARKET_LABELS[text] || text || "Mercado no disponible";
}

export function displayProviderStatus(value) {
  const text = String(value || "").trim();
  if (!text) return "No disponible";
  return PROVIDER_STATUS_LABELS[text.toLowerCase()] || displayStatusLabel(text);
}

export function displayCorrelationLabel(value) {
  if (value === "same_fixture_same_market_family") return "mismo partido y misma familia de mercado";
  if (value === "same_fixture_multiple_markets") return "varios mercados del mismo partido";
  return displayStatusLabel(value);
}
