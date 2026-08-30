export const PRELIMINARY_MODEL_VERSION = "preliminary-market-v1";
import { buildCanonicalObservations } from "./canonicalObservations.js";

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
  // Keep the underlying sample once per threshold. For a half line no result
  // can be a push, therefore these are exact complements by construction.
  const overHits = resolved.filter((value) => value > parsedLine.line).length;
  const underHits = resolved.filter((value) => value < parsedLine.line).length;
  const hits = parsedLine.direction === "over" ? overHits : underHits;
  return {
    sample_size: resolved.length,
    hits,
    observed_rate: hits / resolved.length,
    over_hits: overHits,
    under_hits: underHits,
    over_rate: overHits / resolved.length,
    under_rate: underHits / resolved.length,
  };
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
  canonicalObservations = null,
  allowSpecificLimitedSample = false,
} = {}) {
  const supported = new Set(["goals", "total_shots", "shots_on_goal", "cards", "corners"]);
  if (!supported.has(marketFamily)) return unavailable("La familia de mercado no tiene metodología documentada.");
  const compatibleStatuses = allowSpecificLimitedSample
    ? ["verified", "partial", "insufficient_sample"]
    : ["verified", "partial"];
  const compatibleTeamCoverage = (profile) => compatibleStatuses.includes(profile?.quality_status);
  if (!compatibleStatuses.includes(leagueProfile?.quality_status) || !compatibleTeamCoverage(homeTeamProfile) || !compatibleTeamCoverage(awayTeamProfile)) {
    return unavailable("Las coberturas de liga y equipos no son compatibles para una estimación preliminar.");
  }
  const parsedLine = parsePreliminaryMarketLine({ selection, line });
  if (!parsedLine.valid) return unavailable("La selección y línea exacta no pueden interpretarse como Over/Under.");
  const criticalContradictions = contextItems.filter((item) => item.kind === "contradiction");
  if (criticalContradictions.length) return unavailable("Existen contradicciones críticas sin resolver.", criticalContradictions.map((item) => item.text));
  const canonical = canonicalObservations || buildCanonicalObservations({ marketFamily, leagueProfile, homeTeamProfile, awayTeamProfile });

  if (allowSpecificLimitedSample && canonical.observations.length) {
    const hasLeagueEvidence = canonical.observations.some((item) =>
      item.memberships.some((membership) => membership.source_name === "league")
    );
    if (!hasLeagueEvidence) {
      return unavailable("Falta una referencia histórica de liga para estimar la línea específica.");
    }
    return estimateCanonical({
      canonical,
      marketFamily,
      parsedLine,
      contextShift,
      contextItems,
      refereeLimited: marketFamily === "cards" && refereeProfile?.quality_status !== "verified",
      omittedCoverage: ["specific_mode_limited_sample"],
    });
  }

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
  const usableObservations = observations.filter((item) => item.observation && item.observation.sample_size >= item.minimum);
  const missingRequired = observations.filter((item) => !usableObservations.includes(item));
  const hasLeague = usableObservations.some((item) => item.name === "league");
  const hasHome = usableObservations.some((item) => item.name.startsWith("home_"));
  const hasAway = usableObservations.some((item) => item.name.startsWith("away_"));
  // Canonicalization prevents overlapping fixtures from being counted twice;
  // it does not relax the coverage contract of the preliminary model.
  if (!hasLeague || !hasHome || !hasAway || missingRequired.length) {
    return unavailable(
      "Faltan observaciones subyacentes de liga o de uno de los equipos para este mercado.",
      missingRequired.map((item) => `${item.name}: requiere ${item.minimum} observaciones.`)
    );
  }

  const omittedCoverage = missingRequired.map((item) => item.name);
  const observationsForModel = [...usableObservations];

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
      observationsForModel.push({ name: "referee", weight: 0.15, minimum: 5, observation: refereeObservation });
    }
  }

  const refereeLimited = marketFamily === "cards" && !observationsForModel.some((item) => item.name === "referee");

  const canonicalSources = new Set(canonical.sources.map((source) => source.name));
  if (canonical.observations.length && canonicalSources.has("league") && [...canonicalSources].some((name) => name.startsWith("home_")) && [...canonicalSources].some((name) => name.startsWith("away_"))) {
    return estimateCanonical({
      canonical,
      marketFamily,
      parsedLine,
      contextShift,
      contextItems,
      refereeLimited,
      omittedCoverage,
    });
  }

  const totalWeight = observationsForModel.reduce((sum, item) => sum + item.weight, 0);
  const inputsUsed = observationsForModel.map((item) => ({
    source: item.name,
    weight: rounded(item.weight / totalWeight),
    sample_size: item.observation.sample_size,
    hits: item.observation.hits,
    observed_rate: rounded(item.observation.observed_rate),
    over_hits: item.observation.over_hits,
    under_hits: item.observation.under_hits,
    over_rate: rounded(item.observation.over_rate),
    under_rate: rounded(item.observation.under_rate),
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
  const weightedOverRate = inputsUsed.reduce((sum, item) => sum + item.over_rate * item.weight, 0);
  const rawEffectiveSample = 1 / inputsUsed.reduce((sum, item) => sum + (item.weight ** 2) / item.sample_size, 0);
  const coverageFactor = Math.min(refereeLimited ? 0.65 : 1, ...observationsForModel.map((item) => item.observation.sample_size / (item.minimum * 2)));
  const effectiveSample = rawEffectiveSample * coverageFactor;
  const leagueInput = inputsUsed.find((item) => item.source === "league");
  const leagueRate = leagueInput.observed_rate;
  const leagueOverRate = leagueInput.over_rate;
  const shrinkageStrength = 8;
  const shrunkOver = ((effectiveSample * weightedOverRate) + (shrinkageStrength * leagueOverRate)) / (effectiveSample + shrinkageStrength);
  // Clamp only the canonical Over probability, then derive Under as its
  // complement. This prevents two separately rounded/regularized models from
  // recommending both sides of the same half-line.
  const canonicalOver = Math.min(0.9, Math.max(0.1, shrunkOver));
  const canonicalUnder = 1 - canonicalOver;
  const conservative = parsedLine.direction === "over" ? canonicalOver : canonicalUnder;
  const [low, high] = wilsonInterval(conservative, effectiveSample);
  const limitations = [
    "Modelo preliminar, aún no validado con suficiente historial.",
    "Las muestras de últimos 5 están contenidas en las de últimos 10 y reciben un peso separado de recencia.",
    "No se calcula valor esperado ni se afirma ventaja sobre el mercado.",
    ...(coverageFactor < 1 ? [`La muestra efectiva fue penalizada por cobertura pequeña (factor ${rounded(coverageFactor)}).`] : []),
    ...(omittedCoverage.length ? [`Cobertura parcial: no se usaron submuestras insuficientes (${omittedCoverage.join(", ")}).`] : []),
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
    canonical_threshold_distribution: {
      market_family: marketFamily,
      line: parsedLine.line,
      over_probability: rounded(canonicalOver),
      under_probability: rounded(canonicalUnder),
      effective_sample_size: rounded(effectiveSample),
      source_sample_sizes: inputsUsed.map((item) => ({ source: item.source, sample_size: item.sample_size })),
    },
    limitations,
    model_validation_status: "preliminary_unvalidated",
    represents_confidence: false,
  };
}

function estimateCanonical({ canonical, marketFamily, parsedLine, contextShift, contextItems, refereeLimited = false, omittedCoverage = [] }) {
  const shifted = canonical.observations.map((item) => ({ ...item, value: item.value + Number(contextShift || 0) }));
  const rateFor = (direction, items = shifted) => items.reduce((sum, item) => sum + item.effective_weight * ((direction === "over" ? item.value > parsedLine.line : item.value < parsedLine.line) ? 1 : 0), 0);
  const leagueItems = shifted.filter((item) => item.memberships.some((membership) => membership.source_name === "league"));
  const leagueWeight = leagueItems.reduce((sum, item) => sum + item.effective_weight, 0) || 1;
  const leagueOver = leagueItems.reduce((sum, item) => sum + (item.effective_weight / leagueWeight) * (item.value > parsedLine.line ? 1 : 0), 0);
  const rawOver = rateFor("over");
  const shrinkageStrength = 8;
  const shrunkOver = ((canonical.effective_sample_size * rawOver) + (shrinkageStrength * leagueOver)) / (canonical.effective_sample_size + shrinkageStrength);
  const over = Math.min(0.9, Math.max(0.1, shrunkOver));
  const point = parsedLine.direction === "over" ? over : 1 - over;
  const [low, high] = wilsonInterval(point, canonical.effective_sample_size);
  const inputs = canonical.sources.map((source) => {
    // `canonical.observations` contains one physical record per fixture. Keep
    // every matching record here: equal event values from different fixtures
    // are separate pieces of descriptive evidence.
    const sourceValues = canonical.observations
      .filter((item) => item.memberships.some((membership) => membership.source_name === source.name))
      .map((item) => item.value);
    const sourceObservation = observation(sourceValues, parsedLine);
    return {
      source: source.name,
      weight: rounded(source.effective_weight),
      sample_size: sourceObservation?.sample_size ?? source.unique_fixture_count,
      hits: sourceObservation?.hits ?? null,
      observed_rate: sourceObservation ? rounded(sourceObservation.observed_rate) : null,
      raw_fixture_ids: source.raw_fixture_ids,
    };
  });
  return {
    contract: "PreliminaryMarketProbability", version: 1, methodology_version: PRELIMINARY_MODEL_VERSION,
    probability_status: "preliminary", point_estimate: rounded(point), uncertainty_low: rounded(low), uncertainty_high: rounded(high),
    uncertainty_level: "90_percent_wilson_approximation", sample_size_effective: rounded(canonical.effective_sample_size), selection_direction: parsedLine.direction, exact_line: parsedLine.line,
    league_base_rate: rounded(parsedLine.direction === "over" ? leagueOver : 1 - leagueOver), shrinkage_strength: shrinkageStrength, coverage_penalty_factor: refereeLimited ? 0.65 : 1, context_shift_events: rounded(Number(contextShift) || 0), referee_dependency_status: refereeLimited ? "limited_missing_referee" : "satisfied_or_not_required",
    weights: BASE_WEIGHTS, inputs_used: inputs, canonical_fixture_ids: canonical.fixture_ids,
    canonical_threshold_distribution: { market_family: marketFamily, line: parsedLine.line, over_probability: rounded(over), under_probability: rounded(1 - over), effective_sample_size: rounded(canonical.effective_sample_size), source_sample_sizes: inputs.map((item) => ({ source: item.source, sample_size: item.sample_size })), fixture_ids: canonical.fixture_ids },
    limitations: ["Modelo preliminar, aún no validado con suficiente historial.", "Observaciones canónicas deduplicadas: un fixture físico se pondera una sola vez aunque pertenezca a varias fuentes.", ...(refereeLimited ? ["Tarjetas en estado provisional limitado: falta un árbitro confirmado con muestra compatible."] : []), ...(omittedCoverage.length ? [`Cobertura parcial: no se usaron submuestras insuficientes (${omittedCoverage.join(", ")}).`] : []), ...contextItems.filter((item) => item.kind === "not_found").map((item) => `Contexto no encontrado: ${item.text}`)], model_validation_status: "preliminary_unvalidated", represents_confidence: false,
  };
}
