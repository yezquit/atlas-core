export const PRELIMINARY_MODEL_VERSION = "preliminary-market-v1";

const BASE_WEIGHTS = Object.freeze({
  league: 0.25,
  home_last_5: 0.1,
  home_last_10: 0.1,
  away_last_5: 0.1,
  away_last_10: 0.1,
  home_role: 0.175,
  away_role: 0.175,
});

function unavailable(reason, limitations = []) {
  return {
    contract: "PreliminaryMarketProbability",
    version: 1,
    methodology_version: PRELIMINARY_MODEL_VERSION,
    probability_status: "unavailable",
    point_estimate: null,
    uncertainty_low: null,
    uncertainty_high: null,
    sample_size_effective: 0,
    inputs_used: [],
    limitations: [reason, ...limitations],
    model_validation_status: "preliminary_unvalidated",
    represents_confidence: false,
  };
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function parsePreliminaryMarketLine({ selection, line } = {}) {
  const combined = normalize(`${selection || ""} ${line || ""}`);
  const match = String(line || selection || "").match(/-?\d+(?:[.,]\d+)?/);
  const direction = /\b(over|mas de|superior)\b/.test(combined)
    ? "over"
    : /\b(under|menos de|inferior)\b/.test(combined)
      ? "under"
      : null;
  const numericLine = match ? Number(match[0].replace(",", ".")) : null;
  return {
    direction,
    line: Number.isFinite(numericLine) ? numericLine : null,
    valid: Boolean(direction && Number.isFinite(numericLine)),
  };
}

function observation(values, parsedLine) {
  const numeric = (values || []).filter(Number.isFinite);
  const resolved = numeric.filter((value) => value !== parsedLine.line);
  if (!resolved.length) return null;
  const hits = resolved.filter((value) =>
    parsedLine.direction === "over" ? value > parsedLine.line : value < parsedLine.line
  ).length;
  return { sample_size: resolved.length, hits, observed_rate: hits / resolved.length };
}

function sample(profile, family, path) {
  let current = profile;
  for (const key of path) current = current?.[key];
  return current?.event_samples?.[family]?.match_totals || [];
}

function wilsonInterval(probability, sampleSize, z = 1.645) {
  const n = Math.max(1, sampleSize);
  const denominator = 1 + (z ** 2) / n;
  const center = (probability + (z ** 2) / (2 * n)) / denominator;
  const margin = (z / denominator) * Math.sqrt((probability * (1 - probability) / n) + (z ** 2) / (4 * n ** 2));
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function rounded(value) {
  return Number(value.toFixed(4));
}

export function estimatePreliminaryMarketProbability({
  marketFamily,
  selection,
  line,
  leagueProfile,
  homeTeamProfile,
  awayTeamProfile,
  refereeProfile,
  contextItems = [],
  contextShift = 0,
  allowLimitedReferee = false,
} = {}) {
  const supported = new Set(["goals", "total_shots", "shots_on_goal", "cards", "corners"]);
  if (!supported.has(marketFamily)) return unavailable("La familia de mercado no tiene metodología documentada.");
  const compatibleTeamCoverage = (profile) => ["verified", "partial"].includes(profile?.quality_status);
  if (!["verified", "partial"].includes(leagueProfile?.quality_status) || !compatibleTeamCoverage(homeTeamProfile) || !compatibleTeamCoverage(awayTeamProfile)) {
    return unavailable("Las coberturas de liga y equipos no son compatibles para una estimación preliminar.");
  }
  const parsedLine = parsePreliminaryMarketLine({ selection, line });
  if (!parsedLine.valid) return unavailable("La selección y línea exacta no pueden interpretarse como Over/Under.");
  const criticalContradictions = contextItems.filter((item) => item.kind === "contradiction");
  if (criticalContradictions.length) return unavailable("Existen contradicciones críticas sin resolver.", criticalContradictions.map((item) => item.text));

  const definitions = [
    ["league", BASE_WEIGHTS.league, leagueProfile?.event_samples?.[marketFamily]?.match_totals || [], 8],
    ["home_last_5", BASE_WEIGHTS.home_last_5, sample(homeTeamProfile, marketFamily, ["last_5"]), 3],
    ["home_last_10", BASE_WEIGHTS.home_last_10, sample(homeTeamProfile, marketFamily, ["last_10"]), 5],
    ["away_last_5", BASE_WEIGHTS.away_last_5, sample(awayTeamProfile, marketFamily, ["last_5"]), 3],
    ["away_last_10", BASE_WEIGHTS.away_last_10, sample(awayTeamProfile, marketFamily, ["last_10"]), 5],
    ["home_role", BASE_WEIGHTS.home_role, sample(homeTeamProfile, marketFamily, ["as_home"]), 2],
    ["away_role", BASE_WEIGHTS.away_role, sample(awayTeamProfile, marketFamily, ["as_away"]), 2],
  ];
  const shifted = (values) => values.map((value) => Number(value) + Number(contextShift || 0));
  const observations = definitions.map(([name, weight, values, minimum]) => ({
    name,
    weight,
    minimum,
    observation: observation(shifted(values), parsedLine),
  }));
  const missingRequired = observations.filter((item) => !item.observation || item.observation.sample_size < item.minimum);
  if (missingRequired.length) {
    return unavailable(
      "La muestra es insuficiente o incompatible para la línea exacta.",
      missingRequired.map((item) => `${item.name}: requiere ${item.minimum} observaciones resueltas.`)
    );
  }

  if (marketFamily === "cards") {
    const refereeValues = refereeProfile?.event_samples?.cards?.match_totals || [];
    const refereeObservation = observation(shifted(refereeValues), parsedLine);
    if (
      refereeProfile?.status !== "confirmed" ||
      refereeProfile?.quality_status !== "verified" ||
      !refereeObservation ||
      refereeObservation.sample_size < 5
    ) {
      if (!allowLimitedReferee) return unavailable("El mercado de tarjetas requiere árbitro confirmado y al menos cinco observaciones arbitrales compatibles.");
    } else {
      observations.push({ name: "referee", weight: 0.15, minimum: 5, observation: refereeObservation });
    }
  }

  const totalWeight = observations.reduce((sum, item) => sum + item.weight, 0);
  const inputsUsed = observations.map((item) => ({
    source: item.name,
    weight: rounded(item.weight / totalWeight),
    sample_size: item.observation.sample_size,
    hits: item.observation.hits,
    observed_rate: rounded(item.observation.observed_rate),
    events_for_sample_size: item.name.startsWith("home_")
      ? (item.name === "home_role" ? homeTeamProfile?.as_home : item.name === "home_last_5" ? homeTeamProfile?.last_5 : homeTeamProfile?.last_10)?.event_samples?.[marketFamily]?.for?.length || 0
      : item.name.startsWith("away_")
        ? (item.name === "away_role" ? awayTeamProfile?.as_away : item.name === "away_last_5" ? awayTeamProfile?.last_5 : awayTeamProfile?.last_10)?.event_samples?.[marketFamily]?.for?.length || 0
        : 0,
    events_conceded_sample_size: item.name.startsWith("home_")
      ? (item.name === "home_role" ? homeTeamProfile?.as_home : item.name === "home_last_5" ? homeTeamProfile?.last_5 : homeTeamProfile?.last_10)?.event_samples?.[marketFamily]?.conceded?.length || 0
      : item.name.startsWith("away_")
        ? (item.name === "away_role" ? awayTeamProfile?.as_away : item.name === "away_last_5" ? awayTeamProfile?.last_5 : awayTeamProfile?.last_10)?.event_samples?.[marketFamily]?.conceded?.length || 0
        : 0,
  }));
  const rateSpread = Math.max(...inputsUsed.map((item) => item.observed_rate)) - Math.min(...inputsUsed.map((item) => item.observed_rate));
  if (rateSpread > 0.65) return unavailable("Las submuestras son contradictorias para la línea exacta.", [`Dispersión observada: ${rounded(rateSpread)}.`]);
  const weightedRate = inputsUsed.reduce((sum, item) => sum + item.observed_rate * item.weight, 0);
  const rawEffectiveSample = 1 / inputsUsed.reduce((sum, item) => sum + (item.weight ** 2) / item.sample_size, 0);
  const refereeLimited = marketFamily === "cards" && !observations.some((item) => item.name === "referee");
  const coverageFactor = Math.min(refereeLimited ? 0.65 : 1, ...observations.map((item) => item.observation.sample_size / (item.minimum * 2)));
  const effectiveSample = rawEffectiveSample * coverageFactor;
  const leagueRate = inputsUsed.find((item) => item.source === "league").observed_rate;
  const shrinkageStrength = 8;
  const shrunk = ((effectiveSample * weightedRate) + (shrinkageStrength * leagueRate)) / (effectiveSample + shrinkageStrength);
  const conservative = Math.min(0.9, Math.max(0.1, shrunk));
  const [low, high] = wilsonInterval(conservative, effectiveSample);
  const limitations = [
    "Modelo preliminar, aún no validado con suficiente historial.",
    "Las muestras de últimos 5 están contenidas en las de últimos 10 y reciben un peso separado de recencia.",
    "No se calcula valor esperado ni se afirma ventaja sobre el mercado.",
    ...(coverageFactor < 1 ? [`La muestra efectiva fue penalizada por cobertura pequeña (factor ${rounded(coverageFactor)}).`] : []),
    ...(rateSpread > 0.4 ? ["Existe dispersión relevante entre submuestras."] : []),
    ...(refereeLimited ? ["Tarjetas en estado provisional limitado: falta un árbitro confirmado con muestra compatible."] : []),
    ...(Number(contextShift) !== 0 ? [`Contexto aplicado con desplazamiento acotado de ${rounded(Number(contextShift))} eventos.`] : []),
    ...contextItems.filter((item) => item.kind === "not_found").map((item) => `Contexto no encontrado: ${item.text}`),
  ];
  return {
    contract: "PreliminaryMarketProbability",
    version: 1,
    methodology_version: PRELIMINARY_MODEL_VERSION,
    probability_status: "preliminary",
    point_estimate: rounded(conservative),
    uncertainty_low: rounded(low),
    uncertainty_high: rounded(high),
    uncertainty_level: "90_percent_wilson_approximation",
    sample_size_effective: rounded(effectiveSample),
    selection_direction: parsedLine.direction,
    exact_line: parsedLine.line,
    league_base_rate: rounded(leagueRate),
    shrinkage_strength: shrinkageStrength,
    coverage_penalty_factor: rounded(coverageFactor),
    context_shift_events: rounded(Number(contextShift) || 0),
    referee_dependency_status: refereeLimited ? "limited_missing_referee" : "satisfied_or_not_required",
    weights: BASE_WEIGHTS,
    inputs_used: inputsUsed,
    limitations,
    model_validation_status: "preliminary_unvalidated",
    represents_confidence: false,
  };
}
