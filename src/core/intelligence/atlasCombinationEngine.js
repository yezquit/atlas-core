import { combinedDecimalOdds } from "./parlayPolicy.js";
import { buildDirectorCombinationMessage } from "./directorParlayIntegration.js";
import { buildDecisionFrontier } from "./decisionFrontier.js";
import { isSettlementFavorabilityCandidate } from "./probabilityClassification.js";

export const COMBINATION_PRODUCT = Object.freeze({
  PARLAY: "parlay",
  DREAM: "dream",
});

export const COMBINATION_MODE = Object.freeze({
  AUTOMATIC: "automatic",
  MANUAL: "manual",
  MIXED: "mixed",
});

export const COMBINATION_LIMITS = Object.freeze({
  [COMBINATION_PRODUCT.PARLAY]: Object.freeze({ minimum: 2, maximum: 4 }),
  [COMBINATION_PRODUCT.DREAM]: Object.freeze({ minimum: 5, maximum: 15 }),
});

const CURRENT_QUOTE_STATUSES = new Set(["verified_provider", "user_reported"]);
const CURRENT_SOURCE_STATUSES = new Set(["verified_current", "user_reported_current"]);
const COMPARABLE_MARKET_FAMILY_GAP = 4;

function normalizedDirection(value) {
  const candidate = String(value || "").trim().toLowerCase();
  if (/^(under|menos)/.test(candidate)) return "under";
  if (/^(over|mas|más)/.test(candidate)) return "over";
  return null;
}

function number(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function combinationSelectionKey(candidate = {}) {
  const fixtureId = Number(candidate.fixture_id ?? candidate.fixtureId);
  const marketFamily = candidate.market_family ?? candidate.marketId ?? candidate.market;
  const direction = normalizedDirection(candidate.direction ?? candidate.selection);
  const line = number(candidate.line);
  if (!Number.isInteger(fixtureId) || fixtureId <= 0 || !marketFamily || !direction || line === null) return null;
  return `${fixtureId}:${marketFamily}:${direction}:${line}`;
}

export function classifyCombinationSize(size) {
  const selections = Number(size);
  if (!Number.isInteger(selections) || selections < 2 || selections > 15) return "single_or_invalid";
  return selections <= 4 ? COMBINATION_PRODUCT.PARLAY : COMBINATION_PRODUCT.DREAM;
}

export function normalizeCombinationTarget(value, product, fallback = null) {
  const limits = COMBINATION_LIMITS[product];
  if (!limits) return null;
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= limits.minimum && parsed <= limits.maximum) return parsed;
  const parsedFallback = Number(fallback);
  if (Number.isInteger(parsedFallback) && parsedFallback >= limits.minimum && parsedFallback <= limits.maximum) return parsedFallback;
  return limits.minimum;
}

export function validateCombinationRequest({ product, mode, selections } = {}) {
  const limits = COMBINATION_LIMITS[product];
  if (!limits) return { valid: false, errorCode: "invalid_product", message: "Elige Parlay Atlas o Soñadora Atlas." };
  if (!Object.values(COMBINATION_MODE).includes(mode)) {
    return { valid: false, errorCode: "invalid_mode", message: "Elige modo automático, manual o mixto." };
  }
  const count = Number(selections);
  if (!Number.isInteger(count) || count < limits.minimum || count > limits.maximum) {
    return {
      valid: false,
      errorCode: "invalid_selection_count",
      message: product === COMBINATION_PRODUCT.PARLAY
        ? "Parlay Atlas requiere entre 2 y 4 selecciones."
        : "Soñadora Atlas requiere entre 5 y 15 selecciones.",
    };
  }
  return { valid: true, count, limits };
}

function quoteCompatibility(candidate, quote) {
  if (!quote) return "unavailable";
  if (Number(quote.fixture_id ?? quote.fixtureId) !== Number(candidate.fixture_id ?? candidate.fixtureId)) return "incompatible_fixture";
  if ((quote.market_family ?? quote.marketFamily) !== (candidate.market_family ?? candidate.marketId ?? candidate.market)) return "incompatible_market";
  if (normalizedDirection(quote.direction ?? quote.selection) !== normalizedDirection(candidate.direction ?? candidate.selection)) return "incompatible_direction";
  if (number(quote.line) !== number(candidate.line)) return "incompatible_line";

  const candidateMode = candidate.analysis_mode ?? candidate.analysisMode;
  const quoteMode = quote.analysis_mode ?? quote.analysisMode ?? quote.mode;
  if (candidateMode === "live" && quoteMode === "prematch") return "incompatible_context";
  return "compatible";
}

function sportsScore(candidate) {
  return number(
    candidate.sports_score
      ?? candidate.sportsScore
      ?? candidate.technical_support_score
      ?? candidate.technicalSupport
      ?? candidate.confidence,
  );
}

function sportsStatus(candidate) {
  return candidate.overall_status
    ?? candidate.overallStatus
    ?? candidate.status
    ?? candidate.transferredCandidate?.overall_status
    ?? null;
}

// Elegibilidad V3 para el selector de combinaciones: exige la señal explícita
// ranking_eligible (o su alias rankingEligible) en true. No hay fallback a
// sportsStatus, sports_score ni preliminary_probability: un candidato que no
// declare explícitamente su elegibilidad V3 se trata como no elegible.
function sportsEligibility(candidate) {
  return candidate.ranking_eligible === true || candidate.rankingEligible === true;
}

function economicPriceAssessment(candidate, quote) {
  const compatibility = quoteCompatibility(candidate, quote);
  const decimalOdds = number(quote?.decimal_odds ?? quote?.decimalOdds);
  const verificationStatus = quote?.verification_status ?? candidate.odds_source_status ?? candidate.oddsSourceStatus;
  const sourceStatus = quote?.source_status ?? candidate.odds_source_state ?? candidate.oddsSourceState;
  const fresh = (quote?.freshness ?? candidate.freshness) === "fresh" && quote?.stale !== true;
  const currentSource = CURRENT_QUOTE_STATUSES.has(verificationStatus) || CURRENT_SOURCE_STATUSES.has(sourceStatus);
  let status = compatibility;

  if (compatibility === "compatible") {
    if (quote?.status === "blocked" || quote?.blocked === true) status = "blocked";
    else if (!fresh) status = "stale";
    else if (decimalOdds === null || decimalOdds <= 1) status = "invalid";
    else if (!currentSource) status = "unavailable";
    else status = "available";
  }

  return {
    status,
    usable: status === "available",
    decimalOdds: status === "available" ? decimalOdds : null,
    reason: status === "available" ? null : `price_${status}`,
  };
}

export function inspectCombinationCandidate(candidate = {}) {
  const key = combinationSelectionKey(candidate);
  const quote = candidate.active_quote ?? candidate.activeQuote ?? candidate.current_quote ?? candidate.currentQuote ?? null;
  const scoreValue = sportsScore(candidate);
  const status = sportsStatus(candidate);
  const rankingEligible = sportsEligibility(candidate);
  const estimatedProbability = number(candidate.estimated_probability ?? candidate.estimatedProbability);
  const technicalSupport = number(candidate.technical_support_score ?? candidate.technicalSupport);
  const probabilityPercent = number(candidate.probability_percent ?? candidate.probabilityPercent);
  const probabilityClassification = candidate.probability_classification ?? candidate.probabilityClassification ?? null;
  const sampleSize = number(candidate.sample_size_effective ?? candidate.sampleSize ?? candidate.transferredCandidate?.sample_size_effective);
  const uncertaintyLow = number(candidate.uncertainty_low ?? candidate.uncertaintyLow ?? candidate.uncertainty?.low ?? candidate.transferredCandidate?.uncertainty?.low);
  const uncertaintyHigh = number(candidate.uncertainty_high ?? candidate.uncertaintyHigh ?? candidate.uncertainty?.high ?? candidate.transferredCandidate?.uncertainty?.high);
  const price = economicPriceAssessment(candidate, quote);
  const reasons = [];

  // asian_total_goals y team_asian_handicap NUNCA son elegibles para
  // combinaciones mientras el motor combinado no soporte settlement parcial
  // (5 estados: full_win/half_win/push/half_loss/full_loss). team_asian_handicap
  // ya queda excluido indirectamente (su direction=home|away nunca produce un
  // selection_key válido), pero asian_total_goals SÍ produce uno sintácticamente
  // válido (direction=over/under real) — sin este guardia explícito quedaría
  // elegible si algún caller no pre-filtra settlement_favorability (el
  // servidor ya lo hace para combinationCandidates, pero este motor no debe
  // depender solo de eso). Reutiliza el mismo predicado central que ya usa
  // el resto de Atlas (probabilityClassification.js) — nunca reinterpreta
  // sports_favorability como probability aquí.
  if (isSettlementFavorabilityCandidate({
    market_family: candidate.market_family ?? candidate.marketId ?? candidate.market,
    probability_semantics: candidate.probability_semantics ?? candidate.probabilitySemantics,
  })) {
    reasons.push("asian_settlement_not_supported_in_combinations");
  }
  if (!key) reasons.push("invalid_identity");
  if (!rankingEligible) reasons.push(status ? `sports_status_${status}` : "sports_not_ranking_eligible");

  const sportsEligible = reasons.length === 0;

  return {
    eligible: sportsEligible,
    sports_eligible: sportsEligible,
    reasons: [...new Set(reasons)],
    economic_reasons: price.reason ? [price.reason] : [],
    economic_price_status: price.status,
    price_usable: price.usable,
    candidate: {
      ...candidate,
      selection_key: key,
      fixture_id: Number(candidate.fixture_id ?? candidate.fixtureId),
      market_family: candidate.market_family ?? candidate.marketId ?? candidate.market,
      direction: normalizedDirection(candidate.direction ?? candidate.selection),
      line: number(candidate.line),
      sports_score: scoreValue,
      sports_status: status,
      ranking_eligible: rankingEligible,
      estimated_probability: estimatedProbability,
      probability_percent: probabilityPercent,
      probability_classification: probabilityClassification,
      technical_support_score: technicalSupport,
      sample_size_effective: sampleSize,
      uncertainty_low: uncertaintyLow,
      uncertainty_high: uncertaintyHigh,
      sports_eligible: sportsEligible,
      sports_eligibility_reasons: [...new Set(reasons)],
      economic_price_status: price.status,
      economic_price_reasons: price.reason ? [price.reason] : [],
      economic_evaluation_status: candidate.price_status ?? candidate.priceStatus ?? null,
      price_usable: price.usable,
      decimal_odds: price.decimalOdds,
      observed_quote: quote,
      active_quote: price.usable ? quote : null,
    },
  };
}

export function assessCombinationCorrelation(left, right) {
  if (!left || !right) return { level: "low", reason: null };
  const sameFixture = Number(left.fixture_id ?? left.fixtureId) === Number(right.fixture_id ?? right.fixtureId);
  if (!sameFixture) return { level: "low", reason: null };
  const sameFamily = (left.market_family ?? left.marketId) === (right.market_family ?? right.marketId);
  if (sameFamily) return { level: "high", reason: "same_fixture_same_market_family" };
  return { level: "medium", reason: "same_fixture_multiple_markets" };
}

function uncertaintyWidth(candidate) {
  if (!Number.isFinite(candidate.uncertainty_low) || !Number.isFinite(candidate.uncertainty_high)) return Number.POSITIVE_INFINITY;
  return Math.max(0, candidate.uncertainty_high - candidate.uncertainty_low);
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value, decimals = 1) {
  return Number(Number(value).toFixed(decimals));
}

export function deriveCombinationStabilityScore(candidate = {}) {
  const inspected = inspectCombinationCandidate(candidate).candidate;
  const width = uncertaintyWidth(inspected);
  const uncertaintyScore = Number.isFinite(width) ? clamp(100 - width * 125) : 0;
  const sampleScore = clamp((Number(inspected.sample_size_effective) / 20) * 100);
  const technicalSupport = number(candidate.technical_support_score ?? candidate.technicalSupport) ?? inspected.sports_score ?? 0;
  const lineStability = number(candidate.line_stability_score ?? candidate.lineStabilityScore) ?? 50;
  const limitations = candidate.limitations ?? candidate.transferredCandidate?.limitations ?? candidate.transferredCandidate?.risks ?? candidate.risks ?? [];
  const limitationPenalty = Math.min(15, limitations.length * 3);
  // Complemento deportivo explicable: soporte 35%, incertidumbre inversa 25%,
  // muestra 15%, soporte técnico 15% y estabilidad de línea 10%, menos limitaciones.
  // No crea ni modifica probabilidades y no consulta precios.
  return round(
    clamp(
      Number(inspected.sports_score || 0) * 0.35 +
      uncertaintyScore * 0.25 +
      sampleScore * 0.15 +
      technicalSupport * 0.15 +
      lineStability * 0.1 -
      limitationPenalty,
    )
  );
}

export function combinationConservatismProfile(product, targetCount) {
  if (product !== COMBINATION_PRODUCT.DREAM || Number(targetCount) < 8) return "balanced";
  return Number(targetCount) >= 12 ? "very_conservative" : "conservative";
}

// Orden probability-first del selector V3 de combinaciones: estimated_probability
// decide primero; sports_score nunca interviene aquí (queda solo como métrica
// interna de soporte, expuesta para mostrar/auditar, no para ordenar). El
// desempate final usa la identidad estable de la selección (fixture_id +
// market_family + direction + line), ya codificada en selection_key.
function compareSportsCandidates(left, right) {
  const leftProbability = Number.isFinite(left.estimated_probability) ? left.estimated_probability : -1;
  const rightProbability = Number.isFinite(right.estimated_probability) ? right.estimated_probability : -1;
  if (rightProbability !== leftProbability) return rightProbability - leftProbability;
  const uncertaintyDifference = uncertaintyWidth(left) - uncertaintyWidth(right);
  if (uncertaintyDifference) return uncertaintyDifference;
  const sampleDifference = Number(right.sample_size_effective ?? -1) - Number(left.sample_size_effective ?? -1);
  if (sampleDifference) return sampleDifference;
  const leftSupport = Number.isFinite(left.technical_support_score) ? left.technical_support_score : -1;
  const rightSupport = Number.isFinite(right.technical_support_score) ? right.technical_support_score : -1;
  if (rightSupport !== leftSupport) return rightSupport - leftSupport;
  return String(left.selection_key).localeCompare(String(right.selection_key));
}

// Capa económica del optimizador: SOLO decide qué candidato, entre opciones
// ya deportivamente elegibles, entra primero cuando ambos tienen cuota
// exacta utilizable. Nunca crea, lee ni modifica estimated_probability ni
// sports_score fuera de esta comparación de selección. El criterio depende
// del producto: Parlay solo deja que el valor decida cuando las
// probabilidades son muy cercanas (equilibrio, no sacrifica probabilidad
// por cuota); Soñadora tolera una ventana más amplia (perfil más agresivo),
// sin tocar elegibilidad. Sin cuota utilizable en alguno de los dos, o fuera
// de la ventana de tolerancia, se conserva el orden deportivo puro.
const PARLAY_VALUE_PROBABILITY_TOLERANCE = 0.05;
const DREAM_VALUE_PROBABILITY_TOLERANCE = 0.15;

function valueFactor(candidate) {
  if (!candidate.price_usable) return null;
  const odds = Number(candidate.decimal_odds);
  const probability = Number(candidate.estimated_probability);
  if (!Number.isFinite(odds) || !Number.isFinite(probability)) return null;
  return probability * odds;
}

function compareForCombinationSelection(left, right, product) {
  const leftDecision = Number(left.selection_quality);
  const rightDecision = Number(right.selection_quality);
  if (Number.isFinite(leftDecision) && Number.isFinite(rightDecision) && leftDecision !== rightDecision) {
    return rightDecision - leftDecision;
  }
  const leftValue = valueFactor(left);
  const rightValue = valueFactor(right);
  const leftProbability = Number.isFinite(left.estimated_probability) ? left.estimated_probability : -1;
  const rightProbability = Number.isFinite(right.estimated_probability) ? right.estimated_probability : -1;
  const probabilityGap = Math.abs(leftProbability - rightProbability);
  const tolerance = product === COMBINATION_PRODUCT.DREAM ? DREAM_VALUE_PROBABILITY_TOLERANCE : PARLAY_VALUE_PROBABILITY_TOLERANCE;
  if (leftValue !== null && rightValue !== null && leftValue !== rightValue && probabilityGap <= tolerance) {
    return rightValue - leftValue;
  }
  return compareSportsCandidates(left, right);
}

function uniqueInspections(candidates) {
  const deduplicated = new Map();
  for (const candidate of candidates || []) {
    const inspection = inspectCombinationCandidate(candidate);
    const key = inspection.candidate.selection_key || `invalid:${deduplicated.size}`;
    const current = deduplicated.get(key);
    if (!current || compareSportsCandidates(inspection.candidate, current.candidate) < 0) deduplicated.set(key, inspection);
  }
  return [...deduplicated.values()];
}

function canAppend(selected, candidate) {
  return !selected.some((item) => assessCombinationCorrelation(item, candidate).level === "high");
}

function selectionsAreCompatible(selections) {
  return selections.every((candidate, index) => canAppend(selections.slice(0, index), candidate));
}

function correlationWarnings(selections) {
  const warnings = [];
  for (let index = 0; index < selections.length; index += 1) {
    for (const right of selections.slice(index + 1)) {
      const correlation = assessCombinationCorrelation(selections[index], right);
      if (correlation.level !== "low") warnings.push(correlation.reason);
    }
  }
  return [...new Set(warnings)];
}

function riskFor(product, selections, warnings) {
  if (product === COMBINATION_PRODUCT.DREAM) return { level: "high", score: Math.min(100, 55 + selections.length * 3 + warnings.length * 8) };
  if (warnings.includes("same_fixture_same_market_family")) return { level: "high", score: Math.min(100, 65 + selections.length * 5) };
  const scoreValue = Math.min(100, 18 + selections.length * 10 + warnings.length * 15);
  return { level: scoreValue >= 60 ? "high" : scoreValue >= 35 ? "medium" : "low", score: scoreValue };
}

function priceCoverage(selections) {
  const available = selections.filter((candidate) => candidate.price_usable).length;
  const total = selections.length;
  return {
    status: available === total && total > 0 ? "complete" : available > 0 ? "partial" : "unavailable",
    available,
    missing: total - available,
    total,
  };
}

function editedCombinationResult(combination, selections, { editing = true } = {}) {
  const target = Number(combination?.requested_selections);
  const limits = COMBINATION_LIMITS[combination?.product];
  const inspected = (selections || []).map((candidate) => inspectCombinationCandidate(candidate).candidate);
  const warnings = correlationWarnings(inspected);
  const coverage = priceCoverage(inspected);
  const current = inspected.length;
  const targetComplete = Number.isInteger(target) && current === target;
  const canConfirm = Boolean(limits && current >= limits.minimum && current <= limits.maximum);
  const correlationLevel = warnings.includes("same_fixture_same_market_family") ? "high" : warnings.length ? "medium" : "low";
  const status = targetComplete ? "ready" : "editing";
  const productLabel = combination?.product === COMBINATION_PRODUCT.DREAM ? "Soñadora Atlas" : "Parlay Atlas";
  const minimum = limits?.minimum ?? 0;
  const directorMessage = targetComplete
    ? buildDirectorCombinationMessage({ product: combination.product, status: "ready", selections: current })
    : canConfirm
      ? `${productLabel} conserva ${current}/${target} selecciones. Puedes mantener la combinación reducida o completar manualmente la pata pendiente.`
      : `${productLabel} conserva ${current}/${target} selecciones durante la edición, pero no puede confirmarse hasta alcanzar al menos ${minimum}.`;

  return {
    ...combination,
    status,
    editing,
    selections: inspected,
    current_selections: current,
    target_selections: target,
    target_complete: targetComplete,
    can_confirm: canConfirm,
    confirmation_status: canConfirm ? (targetComplete ? "target_complete" : "valid_reduced") : "blocked_minimum",
    confirmation_block_reason: canConfirm ? null : "minimum_product_selections",
    combined_decimal_odds: coverage.status === "complete" ? combinedDecimalOdds(inspected) : null,
    price_coverage: coverage,
    risk: riskFor(combination.product, inspected, warnings),
    correlation: { level: correlationLevel, warnings },
    director_message: directorMessage,
  };
}

export function removeCombinationSelection(combination, selectionKey) {
  if (!combination || !selectionKey || !Array.isArray(combination.selections)) return combination;
  const removalIndex = combination.selections.findIndex((candidate) => candidate.selection_key === selectionKey);
  if (removalIndex < 0) return combination;
  const remaining = combination.selections.filter((_, index) => index !== removalIndex);
  return editedCombinationResult(combination, remaining);
}

export function addCombinationSelection(combination, candidate) {
  if (!combination || !candidate || !Array.isArray(combination.selections)) return combination;
  const inspection = inspectCombinationCandidate(candidate);
  const key = inspection.candidate.selection_key;
  if (!inspection.sports_eligible || !key) return combination;
  if (combination.selections.some((item) => item.selection_key === key)) return combination;
  if (!canAppend(combination.selections, inspection.candidate)) return combination;
  if (combination.selections.length >= Number(combination.requested_selections)) return combination;
  return editedCombinationResult(combination, [...combination.selections, inspection.candidate]);
}

export function updateCombinationSelection(combination, candidate) {
  if (!combination || !candidate || !Array.isArray(combination.selections)) return combination;
  const inspection = inspectCombinationCandidate(candidate);
  const key = inspection.candidate.selection_key;
  const replacementIndex = combination.selections.findIndex((item) => item.selection_key === key);
  if (replacementIndex < 0 || !inspection.sports_eligible) return combination;
  const updated = combination.selections.map((item, index) => index === replacementIndex ? inspection.candidate : item);
  return editedCombinationResult(combination, updated, { editing: combination.editing === true });
}

function addDiversifiedCandidates(chosen, eligible, target, product) {
  while (chosen.length < target) {
    const validCandidates = eligible.filter((candidate) => (
      !chosen.some((item) => item.selection_key === candidate.selection_key)
      && canAppend(chosen, candidate)
    ));
    if (!validCandidates.length) break;

    // Cualquier elección entre varios candidatos válidos (el mejor global o
    // la alternativa de familia no usada) pasa por el mismo comparator
    // económico product-aware; nunca se mezcla un bestCandidate optimizado
    // con un fallback elegido por orden de inserción antiguo.
    const rankedValidCandidates = [...validCandidates].sort((left, right) => compareForCombinationSelection(left, right, product));
    const bestCandidate = rankedValidCandidates[0];
    const usedFamilies = new Set(chosen.map((candidate) => candidate.market_family));
    const comparableUnusedFamilyCandidates = usedFamilies.has(bestCandidate.market_family)
      ? rankedValidCandidates.filter((candidate) => (
        !usedFamilies.has(candidate.market_family)
        && bestCandidate.sports_score - candidate.sports_score <= COMPARABLE_MARKET_FAMILY_GAP
      ))
      : [];
    const comparableUnusedFamily = comparableUnusedFamilyCandidates.length
      ? [...comparableUnusedFamilyCandidates].sort((left, right) => compareForCombinationSelection(left, right, product))[0]
      : null;

    chosen.push(comparableUnusedFamily || bestCandidate);
  }
}

export function buildAtlasCombination({ candidates = [], product, mode, selections, selectedKeys = [] } = {}) {
  const validation = validateCombinationRequest({ product, mode, selections });
  if (!validation.valid) return { contract: "AtlasCombinationResult", version: 2, status: "invalid_request", ...validation, selections: [] };

  const profile = combinationConservatismProfile(product, validation.count);
  const inspected = uniqueInspections(candidates).map((inspection) => ({
    ...inspection,
    candidate: {
      ...inspection.candidate,
      combination_stability_score: deriveCombinationStabilityScore(inspection.candidate),
      combination_profile: profile,
    },
  }));
  const sportsEligible = inspected
    .filter((item) => item.sports_eligible)
    .map((item) => item.candidate)
    .sort(compareSportsCandidates);
  // Parlay and Soñadora share the same sports frontier but use distinct,
  // explicit profiles. This only orders eligible candidates; it never changes
  // their probability, sports score, or eligibility contract.
  const frontier = buildDecisionFrontier(sportsEligible, { product });
  const eligible = frontier.candidates.sort((left, right) => compareForCombinationSelection(left, right, product));
  const requestedKeys = [...new Set(selectedKeys.filter(Boolean))];
  const fixed = requestedKeys.map((key) => eligible.find((candidate) => candidate.selection_key === key)).filter(Boolean);
  const fixedSelectionsAreCompatible = selectionsAreCompatible(fixed);

  if (mode === COMBINATION_MODE.MANUAL && (requestedKeys.length !== validation.count || fixed.length !== validation.count || !fixedSelectionsAreCompatible)) {
    return {
      contract: "AtlasCombinationResult",
      version: 2,
      status: "insufficient_candidates",
      product,
      mode,
      requested_selections: validation.count,
      selections: fixed,
      eligible_candidates: eligible,
      rejected_candidates: inspected.filter((item) => !item.sports_eligible),
      director_message: buildDirectorCombinationMessage({
        product,
        status: fixedSelectionsAreCompatible ? "manual_incomplete" : "fixed_selection_invalid",
        selections: validation.count,
      }),
    };
  }

  if (mode === COMBINATION_MODE.MIXED && (requestedKeys.length > validation.count || fixed.length !== requestedKeys.length || !fixedSelectionsAreCompatible)) {
    return {
      contract: "AtlasCombinationResult",
      version: 2,
      status: "insufficient_candidates",
      product,
      mode,
      requested_selections: validation.count,
      selections: fixed,
      eligible_candidates: eligible,
      rejected_candidates: inspected.filter((item) => !item.sports_eligible),
      director_message: buildDirectorCombinationMessage({ product, status: "fixed_selection_invalid", selections: validation.count }),
    };
  }

  const chosen = mode === COMBINATION_MODE.AUTOMATIC ? [] : [...fixed];
  if (mode !== COMBINATION_MODE.MANUAL) {
    addDiversifiedCandidates(chosen, eligible, validation.count, product);
  }

  if (chosen.length !== validation.count) {
    return {
      contract: "AtlasCombinationResult",
      version: 2,
      status: "insufficient_candidates",
      product,
      mode,
      requested_selections: validation.count,
      selections: chosen,
      eligible_candidates: eligible,
      rejected_candidates: inspected.filter((item) => !item.sports_eligible),
      director_message: buildDirectorCombinationMessage({ product, status: "insufficient_candidates", selections: validation.count }),
    };
  }

  const warnings = correlationWarnings(chosen);
  const risk = riskFor(product, chosen, warnings);
  const coverage = priceCoverage(chosen);
  const correlationLevel = warnings.includes("same_fixture_same_market_family") ? "high" : warnings.length ? "medium" : "low";
  return {
    contract: "AtlasCombinationResult",
    version: 2,
    status: "ready",
    product,
    mode,
    combination_profile: profile,
    decision_frontier: frontier,
    requested_selections: validation.count,
    selections: chosen,
    combined_decimal_odds: coverage.status === "complete" ? combinedDecimalOdds(chosen) : null,
    combined_odds_is_probability: false,
    price_coverage: coverage,
    risk,
    correlation: { level: correlationLevel, warnings },
    eligible_candidates: eligible,
    rejected_candidates: inspected.filter((item) => !item.sports_eligible),
    director_message: buildDirectorCombinationMessage({ product, status: "ready", selections: chosen.length }),
  };
}

export function mergeJourneyExplorations(results = [], dates = []) {
  const successful = results.filter((item) => item?.status === "success");
  const source = successful.length ? successful : results.filter(Boolean);
  const candidates = [...new Map(source.flatMap((item) => item.candidates || []).map((candidate) => [combinationSelectionKey(candidate), candidate])).values()]
    .filter((candidate) => combinationSelectionKey(candidate));
  const combinationCandidates = [...new Map(source.flatMap((item) => item.combinationCandidates || item.candidates || []).map((candidate) => [combinationSelectionKey(candidate), candidate])).values()]
    .filter((candidate) => combinationSelectionKey(candidate));
  return {
    contract: "MultiDateJourneyExplorationResult",
    version: 1,
    status: successful.length ? "success" : source[0]?.status || "empty",
    reason: successful.length ? null : source[0]?.reason || "internal_safe_error",
    message: successful.length
      ? `Atlas reunió ${candidates.length} candidato(s) de ${dates.length} fecha(s) seleccionada(s).`
      : source[0]?.message || "No se encontraron candidatos para las fechas seleccionadas.",
    dates,
    dateResults: results,
    candidates,
    combinationCandidates,
    fixturesFound: source.reduce((total, item) => total + Number(item.fixturesFound || 0), 0),
    fixturesReviewed: source.reduce((total, item) => total + Number(item.fixturesReviewed || 0), 0),
    warnings: source.flatMap((item, index) => (item.warnings || []).map((warning) => `${dates[index] || "Fecha"}: ${warning}`)),
  };
}
