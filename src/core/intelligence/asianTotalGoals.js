import { wilsonInterval } from "./preliminaryMarketModel.js";

export const ASIAN_TOTAL_GOALS_FAMILY = "asian_total_goals";
export const ASIAN_TOTAL_GOALS_LABEL = "Asiático (Más/Menos) — Total de goles";

const OUTCOMES = Object.freeze(["full_win", "half_win", "push", "half_loss", "full_loss"]);

function round(value, decimals = 6) {
  return Number(Number(value).toFixed(decimals));
}

function validDirection(direction) {
  return ["over", "under"].includes(String(direction || "").toLowerCase());
}

export function splitAsianTotalLine(line, direction) {
  const numericLine = Number(line);
  const normalizedDirection = String(direction || "").toLowerCase();
  if (!Number.isFinite(numericLine) || numericLine < 0 || !validDirection(normalizedDirection)) return null;
  const quarter = Math.round(numericLine * 4);
  if (Math.abs(numericLine * 4 - quarter) > 1e-8) return null;
  const normalizedLine = quarter / 4;
  const fraction = ((quarter % 4) + 4) % 4;
  if (fraction === 1) return [normalizedLine - 0.25, normalizedLine + 0.25].map((partLine) => ({ direction: normalizedDirection, line: partLine, stake_fraction: 0.5 }));
  if (fraction === 3) return [normalizedLine - 0.25, normalizedLine + 0.25].map((partLine) => ({ direction: normalizedDirection, line: partLine, stake_fraction: 0.5 }));
  return [{ direction: normalizedDirection, line: normalizedLine, stake_fraction: 1 }];
}

// Contrato de línea válida para asian_total_goals: cualquier número finito,
// no negativo, múltiplo exacto de 0.25 (0, 0.25, 0.5, 0.75, 1, 1.25, ...).
// Deliberadamente distinta de isValidCandidateLine (candidateLineGenerator.js),
// que exige líneas semi-enteras (.5) para goals/corners/cards/total_shots/
// shots_on_goal — esas familias no se tocan aquí.
export function isValidAsianTotalGoalLine(line) {
  const numericLine = Number(line);
  if (!Number.isFinite(numericLine) || numericLine < 0) return false;
  const quarter = numericLine * 4;
  return Math.abs(quarter - Math.round(quarter)) <= 1e-8;
}

function settlePart(totalGoals, { direction, line }) {
  if (totalGoals === line) return "push";
  const wins = direction === "over" ? totalGoals > line : totalGoals < line;
  return wins ? "win" : "loss";
}

export function settleAsianTotalGoals({ totalGoals, line, direction } = {}) {
  const total = Number(totalGoals);
  const parts = splitAsianTotalLine(line, direction);
  if (!Number.isFinite(total) || !parts) return { status: "not_evaluable", parts: [] };
  const settledParts = parts.map((part) => ({ ...part, result: settlePart(total, part) }));
  const wins = settledParts.filter((part) => part.result === "win").reduce((sum, part) => sum + part.stake_fraction, 0);
  const losses = settledParts.filter((part) => part.result === "loss").reduce((sum, part) => sum + part.stake_fraction, 0);
  const status = wins === 1 ? "full_win"
    : losses === 1 ? "full_loss"
      : wins === 0.5 ? "half_win"
        : losses === 0.5 ? "half_loss"
          : "push";
  return { status, parts: settledParts };
}

export function asianSettlementDescription({ line, direction } = {}) {
  const parts = splitAsianTotalLine(line, direction);
  if (!parts) return null;
  const side = String(direction).toLowerCase() === "under" ? "Menos de" : "Más de";
  if (parts.length === 1) return `La apuesta se liquida completa en ${side} ${parts[0].line}.`;
  return `Esta apuesta divide el dinero: 50% a ${side} ${parts[0].line} y 50% a ${side} ${parts[1].line}.`;
}

export function asianSettlementExplanation({ line, direction } = {}) {
  const parts = splitAsianTotalLine(line, direction);
  if (!parts) return null;
  const normalizedDirection = String(direction).toLowerCase();
  const side = normalizedDirection === "under" ? "Menos de" : "Más de";
  if (parts.length === 1) {
    return `${asianSettlementDescription({ line, direction })} Si el total coincide con una línea entera, la apuesta se devuelve.`;
  }
  const lower = parts[0].line;
  const upper = parts[1].line;
  const fraction = ((Math.round(Number(line) * 4) % 4) + 4) % 4;
  if (normalizedDirection === "over" && fraction === 1) return `Tu apuesta se divide en dos partes: 50% a Más de ${lower} y 50% a Más de ${upper}. Con exactamente ${lower} goles recuperas una mitad y pierdes la otra. Con ${Math.ceil(upper)} o más ganas completa.`;
  if (normalizedDirection === "over") return `Tu apuesta se divide en dos partes: 50% a Más de ${lower} y 50% a Más de ${upper}. Con exactamente ${upper} goles ganas una mitad y la otra se devuelve. Con ${Math.ceil(upper) + 1} o más ganas completa.`;
  if (fraction === 1) return `Tu apuesta se divide en dos partes: 50% a Menos de ${lower} y 50% a Menos de ${upper}. Con exactamente ${lower} goles ganas una mitad y la otra se devuelve. Con ${Math.max(0, Math.floor(lower) - 1)} o menos ganas completa.`;
  return `Tu apuesta se divide en dos partes: 50% a Menos de ${lower} y 50% a Menos de ${upper}. Con exactamente ${upper} goles recuperas una mitad y pierdes la otra. Con ${Math.floor(lower)} o menos ganas completa.`;
}

// Valor de settlement por observación para Favorabilidad Atlas (sports_favorability):
// full_win=1, half_win=0.75, push=0.5, half_loss=0.25, full_loss=0. Y∈[0,1]
// siempre, por ser combinación convexa de estos cinco valores.
const SETTLEMENT_VALUES = Object.freeze({ full_win: 1, half_win: 0.75, push: 0.5, half_loss: 0.25, full_loss: 0 });

// Aproximación normal al 90% (mismo z que Wilson usa hoy para las familias
// clásicas), NO un intervalo de Wilson binomial: Y no es Bernoulli, así que
// se usa la varianza ponderada real de Y en vez de asumir p(1-p).
const SPORTS_FAVORABILITY_Z = 1.645;

// Por debajo de este effective_sample_size, la corrección de sesgo de la
// varianza ponderada (dividir por 1-Σwi² = (n_eff-1)/n_eff) es numéricamente
// inestable o directamente indefinida (n_eff<=1). No se inventa un método
// estadístico alternativo para este caso: se usa un fallback conservador
// explícito ([0,1] completo) en vez de fingir precisión que no existe.
const MIN_EFFECTIVE_SAMPLE_FOR_INTERVAL = 2;

/**
 * Favorabilidad Atlas agregada a partir de un objeto de probabilidades de
 * settlement ya calculado (full_win/half_win/push/half_loss/full_loss).
 * full_loss aporta 0 explícitamente. NO es una probabilidad literal de ganar
 * — es la media ponderada del resultado de liquidación. Se reduce
 * exactamente a P(full_win) cuando el mercado solo tiene full_win/full_loss.
 */
export function asianSportsFavorability(probabilities = {}) {
  const fullWin = Number(probabilities.full_win) || 0;
  const halfWin = Number(probabilities.half_win) || 0;
  const push = Number(probabilities.push) || 0;
  const halfLoss = Number(probabilities.half_loss) || 0;
  return fullWin + 0.75 * halfWin + 0.5 * push + 0.25 * halfLoss;
}

// Incertidumbre de Favorabilidad Atlas: aproximación normal para la media
// ponderada de una variable acotada Y∈[0,1] (settlement asiático), NO un
// Wilson binomial. Requiere la varianza ponderada real de Y (no p(1-p)) y
// aplica la corrección de sesgo para pesos normalizados (Σwi=1):
// unbiasedVariance = weightedPopulationVariance × n_eff/(n_eff-1).
// No es una garantía exacta de cobertura para muestras pequeñas.
function asianSettlementUncertainty({ mean, weightedPopulationVariance, effectiveSampleSize }) {
  if (!(effectiveSampleSize > MIN_EFFECTIVE_SAMPLE_FOR_INTERVAL)) {
    return { status: "insufficient_effective_sample", method: null, uncertainty_low: 0, uncertainty_high: 1 };
  }
  const unbiasedVariance = weightedPopulationVariance * (effectiveSampleSize / (effectiveSampleSize - 1));
  const standardError = Math.sqrt(Math.max(0, unbiasedVariance) / effectiveSampleSize);
  const margin = SPORTS_FAVORABILITY_Z * standardError;
  return {
    status: "estimated",
    method: "weighted_settlement_mean_normal_approx",
    uncertainty_low: Math.max(0, Math.min(1, mean - margin)),
    uncertainty_high: Math.max(0, Math.min(1, mean + margin)),
  };
}

// Aproximación normal al 95% (distinto del 90% que ya usa Favorabilidad
// Atlas — pedido explícitamente para este intervalo económico, que es una
// magnitud conceptualmente distinta).
const PRICE_EQUIVALENT_PROBABILITY_Z = 1.96;

// Misma cota que MIN_EFFECTIVE_SAMPLE_FOR_INTERVAL, aplicada aquí a la
// muestra "decisiva" (W+L, la masa que realmente decide el precio) en vez de
// a la muestra total — por debajo de esto no se inventa un intervalo.
const MIN_DECISIVE_SAMPLE_FOR_INTERVAL = 2;

/**
 * Probabilidad equivalente Atlas por precio: el precio neutral equivalente
 * derivado de TODA la distribución de settlement (full_win/half_win/push/
 * half_loss/full_loss), NO la probabilidad literal de ganar. Se demuestra
 * algebraicamente equivalente a 1/asianFairOdds(profile):
 *   asianFairOdds = 1 + L/W  ⟹  1/asianFairOdds = W/(W+L)
 * Nunca debe llamarse "probabilidad de ganar" ni usarse como tal — solo sirve
 * para comparar en puntos porcentuales contra una probabilidad implícita de
 * mercado sobre la MISMA selección y línea exactas.
 */
export function asianPriceEquivalentProbability({ weighted_win_probability, weighted_loss_probability } = {}) {
  const w = Number(weighted_win_probability);
  const l = Number(weighted_loss_probability);
  if (!Number.isFinite(w) || !Number.isFinite(l) || w + l <= 0) return null;
  return w / (w + l);
}

// Intervalo aproximado de Probabilidad equivalente de precio — NO un
// intervalo de probabilidad literal de ganar. Usa la masa "decisiva" (W+L)
// como base de la proporción y escala el effective_sample_size deportivo por
// esa misma fracción decisiva antes de aplicar Wilson, reutilizando el mismo
// helper (wilsonInterval, preliminaryMarketModel.js) que ya maneja tamaños de
// muestra fraccionales en el resto del proyecto — no se inventa un método
// estadístico nuevo.
function asianPriceEquivalentInterval({ weightedWinProbability, weightedLossProbability, effectiveSampleSize }) {
  const decisiveWeight = Number(weightedWinProbability) + Number(weightedLossProbability);
  if (!(decisiveWeight > 0)) return { low: null, high: null, method: null };
  const nDecisive = Number(effectiveSampleSize) * decisiveWeight;
  if (!(nDecisive > MIN_DECISIVE_SAMPLE_FOR_INTERVAL)) return { low: null, high: null, method: null };
  const p = Number(weightedWinProbability) / decisiveWeight;
  const [low, high] = wilsonInterval(p, nDecisive, PRICE_EQUIVALENT_PROBABILITY_Z);
  return { low, high, method: "decisive_mass_wilson_95_percent" };
}

export function buildAsianSettlementProfile({ canonicalObservations, line, direction } = {}) {
  const observations = canonicalObservations?.observations || [];
  const base = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0]));
  if (!observations.length || !splitAsianTotalLine(line, direction)) return null;
  // Reconstruimos, por observación, el valor de settlement Y directamente
  // desde settleAsianTotalGoals (nunca desde probabilidades ya redondeadas),
  // para que la media/varianza ponderadas de Favorabilidad Atlas se calculen
  // sobre datos sin redondear hasta el final.
  const settledObservations = [];
  for (const observation of observations) {
    const result = settleAsianTotalGoals({ totalGoals: observation.value, line, direction });
    if (!OUTCOMES.includes(result.status)) continue;
    const weight = Number(observation.effective_weight || 0);
    base[result.status] += weight;
    settledObservations.push({ weight, y: SETTLEMENT_VALUES[result.status] });
  }
  const totalWeight = Object.values(base).reduce((sum, value) => sum + value, 0);
  if (!(totalWeight > 0)) return null;
  const probabilities = Object.fromEntries(Object.entries(base).map(([key, value]) => [key, round(value / totalWeight)]));
  const weightedWin = probabilities.full_win + 0.5 * probabilities.half_win;
  const weightedLoss = probabilities.full_loss + 0.5 * probabilities.half_loss;

  // No asumimos que Σweight sea exactamente 1 por precisión de punto
  // flotante: normalizamos aquí explícitamente (wi = weight/totalWeight).
  const normalizedWeights = settledObservations.map((item) => item.weight / totalWeight);
  const unroundedFavorability = settledObservations.reduce(
    (sum, item, index) => sum + normalizedWeights[index] * item.y,
    0,
  );
  const weightedPopulationVariance = settledObservations.reduce(
    (sum, item, index) => sum + normalizedWeights[index] * (item.y - unroundedFavorability) ** 2,
    0,
  );

  // effective_sample_size reutiliza la misma semántica de canonicalObservations.js
  // (1/Σwi², índice de concentración de Kish) — no se redefine aquí para
  // evitar dos definiciones potencialmente divergentes del mismo concepto.
  const effectiveSampleSize = Number(canonicalObservations.effective_sample_size) || observations.length;
  const uncertainty = asianSettlementUncertainty({ mean: unroundedFavorability, weightedPopulationVariance, effectiveSampleSize });

  // Métrica económica — independiente de Favorabilidad Atlas y de su
  // intervalo. NUNCA se deriva de sports_favorability ni de
  // sports_favorability_uncertainty_low/high.
  const priceEquivalentProbability = asianPriceEquivalentProbability({
    weighted_win_probability: weightedWin,
    weighted_loss_probability: weightedLoss,
  });
  const priceEquivalentInterval = asianPriceEquivalentInterval({
    weightedWinProbability: weightedWin,
    weightedLossProbability: weightedLoss,
    effectiveSampleSize,
  });

  return {
    contract: "AsianSettlementProfile",
    version: 1,
    market_family: ASIAN_TOTAL_GOALS_FAMILY,
    direction: String(direction).toLowerCase(),
    line: Number(line),
    parts: splitAsianTotalLine(line, direction),
    probabilities,
    weighted_win_probability: round(weightedWin),
    weighted_loss_probability: round(weightedLoss),
    push_probability: probabilities.push,
    // Favorabilidad Atlas: NO es una probabilidad literal de ganar — es la
    // media ponderada del settlement (sección SETTLEMENT_VALUES arriba).
    sports_favorability: round(unroundedFavorability),
    sports_favorability_uncertainty_low: round(uncertainty.uncertainty_low),
    sports_favorability_uncertainty_high: round(uncertainty.uncertainty_high),
    sports_favorability_uncertainty_status: uncertainty.status,
    sports_favorability_method: uncertainty.method,
    // Probabilidad equivalente Atlas por precio — NO la probabilidad literal
    // de ganar. Es el precio neutral equivalente derivado de la distribución
    // completa de settlement; solo esta magnitud (y su intervalo) debe usarse
    // para comparar en puntos porcentuales contra una probabilidad implícita
    // de mercado. price_equivalent_probability_low/high quedan null cuando
    // W+L<=0 o la muestra decisiva es insuficiente — nunca se sustituyen por
    // un valor inventado.
    price_equivalent_probability: Number.isFinite(priceEquivalentProbability) ? round(priceEquivalentProbability) : null,
    price_equivalent_probability_low: Number.isFinite(priceEquivalentInterval.low) ? round(priceEquivalentInterval.low) : null,
    price_equivalent_probability_high: Number.isFinite(priceEquivalentInterval.high) ? round(priceEquivalentInterval.high) : null,
    price_equivalent_probability_method: priceEquivalentInterval.method,
    fixture_ids: canonicalObservations.fixture_ids || observations.map((item) => item.fixture_id),
    effective_sample_size: round(effectiveSampleSize),
  };
}

export function asianExpectedValue(profile, decimalOdds) {
  const odds = Number(decimalOdds);
  const p = profile?.probabilities;
  if (!p || !Number.isFinite(odds) || odds <= 1) return null;
  return round(p.full_win * (odds - 1) + p.half_win * (odds - 1) / 2 - p.half_loss * 0.5 - p.full_loss);
}

export function asianFairOdds(profile) {
  const weightedWin = Number(profile?.weighted_win_probability);
  const weightedLoss = Number(profile?.weighted_loss_probability);
  return weightedWin > 0 && Number.isFinite(weightedLoss) ? round(1 + weightedLoss / weightedWin) : null;
}

export function asianPayoutForStake({ outcome, stake, decimalOdds } = {}) {
  const amount = Number(stake);
  const odds = Number(decimalOdds);
  if (!OUTCOMES.includes(outcome) || !Number.isFinite(amount) || !Number.isFinite(odds)) return null;
  const profit = outcome === "full_win" ? amount * (odds - 1)
    : outcome === "half_win" ? amount * (odds - 1) / 2
      : outcome === "half_loss" ? -amount / 2
        : outcome === "full_loss" ? -amount : 0;
  return { payout: round(amount + profit, 2), profit_loss: round(profit, 2) };
}

// ---------------------------------------------------------------------------
// Generación autónoma de líneas asian_total_goals.
//
// Diseñada para ser pura y no recibir cuotas/bookmaker/líneas de mercado: solo
// consume el mismo resumen estadístico que ya produce buildMarketDistribution
// (candidateLineGenerator.js) para la familia "goals" — projected_mean,
// percentile_10, percentile_90, dispersion — sin necesitar una PMF nueva por
// total de goles (el diagnóstico previo confirmó que Atlas no tiene una hoy y
// que no hace falta para este paso: media/percentiles/dispersión bastan).
//
// No se conecta todavía a evaluateExactMarketLine ni a ningún flujo de
// Jornada/Radar — es infraestructura aislada, sin efectos en otras familias.
// ---------------------------------------------------------------------------

export const ASIAN_LINE_STEP = 0.25;

// Techo de líneas por fixture: 2×6+1 = 13. Elegido para reflejar, en pasos de
// 0.25, el mismo radio máximo (6) que dynamicHalfLines ya usa en
// candidateLineGenerator.js para total_shots/shots_on_goal en pasos de 1 —
// mismo principio de "cota razonable derivada del diseño existente", no un
// número arbitrario nuevo ni un catálogo global.
export const DEFAULT_ASIAN_LINE_GENERATION_MAX_LINES = 13;

const MIN_ASIAN_LINE_RADIUS_QUARTERS = 3; // 0.75 goles como radio mínimo
const MAX_ASIAN_LINE_RADIUS_QUARTERS = 6; // 1.5 goles como radio máximo (ver comentario de arriba)

function clampInt(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

/**
 * Genera un conjunto finito, determinista, ordenado y sin duplicados de
 * líneas asian_total_goals (múltiplos de 0.25, no negativas) plausibles para
 * un fixture, a partir de su distribución de goles ya calculada (mean,
 * percentiles, dispersión). No recibe ni consulta cuotas, bookmaker ni líneas
 * de mercado externas — el rango nace enteramente de la distribución
 * deportiva de ESE fixture, nunca de una constante global.
 *
 * @param {{projected_mean:number, percentile_10?:number, percentile_90?:number, dispersion?:number}} distribution
 * @param {{maxLines?:number}} [options]
 * @returns {number[]}
 */
export function generateAsianTotalGoalLines(distribution = {}, { maxLines = DEFAULT_ASIAN_LINE_GENERATION_MAX_LINES } = {}) {
  const projectedMean = Number(distribution.projected_mean);
  if (!Number.isFinite(projectedMean)) return [];
  const dispersion = Math.max(0.75, Number(distribution.dispersion) || 0.75);
  const percentile10 = Number(distribution.percentile_10);
  const percentile90 = Number(distribution.percentile_90);

  // Centro: la media proyectada, redondeada al cuarto de gol más cercano.
  const centerQuarters = Math.round(projectedMean * 4);

  // Radio derivado de la dispersión (más dispersión → rango más ancho),
  // acotado entre 0.75 y 1.5 goles (ver constantes de arriba).
  const dispersionRadiusQuarters = clampInt(
    Math.round(dispersion * 2),
    MIN_ASIAN_LINE_RADIUS_QUARTERS,
    MAX_ASIAN_LINE_RADIUS_QUARTERS,
  );

  // Si el usuario/histórico sitúa el percentil 10-90 más lejos del centro que
  // el radio por dispersión, se ensancha (nunca se reduce) hasta ese punto,
  // sin superar el techo máximo — así el rango cubre la masa observada
  // relevante del fixture concreto, no un radio arbitrario fijo.
  const percentileRadiusQuarters = Number.isFinite(percentile10) && Number.isFinite(percentile90)
    ? Math.max(
      Math.abs(centerQuarters - Math.round(percentile10 * 4)),
      Math.abs(Math.round(percentile90 * 4) - centerQuarters),
    )
    : 0;

  const radiusQuarters = Math.min(
    MAX_ASIAN_LINE_RADIUS_QUARTERS,
    Math.max(dispersionRadiusQuarters, percentileRadiusQuarters),
  );

  const lines = [];
  for (let quarter = centerQuarters - radiusQuarters; quarter <= centerQuarters + radiusQuarters; quarter += 1) {
    const line = quarter / 4;
    if (line >= 0) lines.push(line);
  }

  if (lines.length <= maxLines) return lines;

  // Salvaguarda adicional si un maxLines más estricto se pasa explícitamente:
  // conserva las líneas más cercanas a la media proyectada, reordenadas.
  return [...lines]
    .sort((left, right) => Math.abs(left - projectedMean) - Math.abs(right - projectedMean))
    .slice(0, maxLines)
    .sort((left, right) => left - right);
}
