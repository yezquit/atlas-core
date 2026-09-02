import { wilsonInterval } from "./preliminaryMarketModel.js";

// Matemática de settlement genérica, extraída de asianTotalGoals.js sin
// cambiar su comportamiento (ver asianTotalGoals.js, que ahora delega en
// estas funciones mediante wrappers idénticos en firma/salida). No depende
// de goles totales, direction (over/under) ni de ningún concepto propio de
// una familia — opera únicamente sobre líneas en pasos de 0.25 y sobre un
// perfil de settlement de 5 estados (full_win/half_win/push/half_loss/
// full_loss). Reutilizable por cualquier mercado con la misma forma de
// liquidación por cuarto de línea (hoy: asian_total_goals y
// team_asian_handicap).

function round(value, decimals = 6) {
  return Number(Number(value).toFixed(decimals));
}

/**
 * Divide una línea firmada en pasos de 0.25 en sus componentes de medio
 * punto (0.5) cuando cae exactamente en un cuarto (X.25/X.75), o devuelve la
 * propia línea como componente único en cualquier otro caso (entera o
 * media). Puramente aritmético: no valida signo ni rango de dominio — eso
 * es responsabilidad de cada familia (asian_total_goals exige líneas no
 * negativas; team_asian_handicap admite líneas firmadas).
 *
 * @param {number} line
 * @returns {number[]|null} 1 o 2 líneas de medio punto, o null si `line` no
 *   es un múltiplo finito de 0.25.
 */
export function splitQuarterStepLine(line) {
  const numericLine = Number(line);
  if (!Number.isFinite(numericLine)) return null;
  const quarter = Math.round(numericLine * 4);
  if (Math.abs(numericLine * 4 - quarter) > 1e-8) return null;
  const normalizedLine = quarter / 4;
  const fraction = ((quarter % 4) + 4) % 4;
  if (fraction === 1 || fraction === 3) return [normalizedLine - 0.25, normalizedLine + 0.25];
  return [normalizedLine];
}

/**
 * Combina 1-2 resultados parciales ("win"/"push"/"loss", cada uno con su
 * stake_fraction) en el estado de settlement de 5 posibles valores. Misma
 * reducción que asianTotalGoals.js ya usaba internamente (wins===1→
 * full_win, losses===1→full_loss, wins===0.5→half_win, losses===0.5→
 * half_loss, cualquier otra combinación→push — nunca inventa un sexto
 * estado).
 *
 * @param {{result:"win"|"push"|"loss", stake_fraction:number}[]} settledParts
 * @returns {"full_win"|"half_win"|"push"|"half_loss"|"full_loss"}
 */
export function combineSettlementParts(settledParts = []) {
  const wins = settledParts.filter((part) => part.result === "win").reduce((sum, part) => sum + part.stake_fraction, 0);
  const losses = settledParts.filter((part) => part.result === "loss").reduce((sum, part) => sum + part.stake_fraction, 0);
  return wins === 1 ? "full_win"
    : losses === 1 ? "full_loss"
      : wins === 0.5 ? "half_win"
        : losses === 0.5 ? "half_loss"
          : "push";
}

// Valor de settlement por observación para Favorabilidad Atlas: full_win=1,
// half_win=0.75, push=0.5, half_loss=0.25, full_loss=0. Y∈[0,1] siempre, por
// ser combinación convexa de estos cinco valores. Idéntico a
// asianTotalGoals.js#SETTLEMENT_VALUES.
const SETTLEMENT_VALUES = Object.freeze({ full_win: 1, half_win: 0.75, push: 0.5, half_loss: 0.25, full_loss: 0 });

export const SETTLEMENT_OUTCOME_VALUES = SETTLEMENT_VALUES;

// Extraído de asianTotalGoals.js#asianSettlementUncertainty (privada) sin
// cambiar su comportamiento: asianTotalGoals.js ahora delega en esta
// función con z=1.645 y minimumEffectiveSample=2 (mismos valores que ya
// usaba). Genérica: aproximación normal para la media ponderada de una
// variable acotada Y∈[0,1] (settlement), a partir de su varianza ponderada
// real (no p(1-p): Y no es Bernoulli) y una corrección de sesgo para pesos
// normalizados (Σwi=1): unbiasedVariance = weightedPopulationVariance ×
// n_eff/(n_eff-1). No es una garantía exacta de cobertura para muestras
// pequeñas; por debajo de minimumEffectiveSample devuelve el fallback
// conservador explícito ([0,1] completo) en vez de fingir precisión que no
// existe.
const DEFAULT_SETTLEMENT_UNCERTAINTY_Z = 1.645;

export function settlementUncertainty({ mean, weightedPopulationVariance, effectiveSampleSize, z = DEFAULT_SETTLEMENT_UNCERTAINTY_Z, minimumEffectiveSample = 2 } = {}) {
  if (!(effectiveSampleSize > minimumEffectiveSample)) {
    return { status: "insufficient_effective_sample", method: null, uncertainty_low: 0, uncertainty_high: 1 };
  }
  const unbiasedVariance = weightedPopulationVariance * (effectiveSampleSize / (effectiveSampleSize - 1));
  const standardError = Math.sqrt(Math.max(0, unbiasedVariance) / effectiveSampleSize);
  const margin = z * standardError;
  return {
    status: "estimated",
    method: "weighted_settlement_mean_normal_approx",
    uncertainty_low: Math.max(0, Math.min(1, mean - margin)),
    uncertainty_high: Math.max(0, Math.min(1, mean + margin)),
  };
}

/**
 * Favorabilidad Atlas (settlement_favorability) agregada a partir de un
 * objeto de probabilidades de settlement ya calculado (full_win/half_win/
 * push/half_loss/full_loss). full_loss aporta 0 explícitamente. NO es una
 * probabilidad literal de ganar — es la media ponderada del resultado de
 * liquidación. Genérica sobre cualquier familia con este mismo perfil de 5
 * estados.
 */
export function settlementFavorability(probabilities = {}) {
  const fullWin = Number(probabilities.full_win) || 0;
  const halfWin = Number(probabilities.half_win) || 0;
  const push = Number(probabilities.push) || 0;
  const halfLoss = Number(probabilities.half_loss) || 0;
  return fullWin + 0.75 * halfWin + 0.5 * push + 0.25 * halfLoss;
}

/**
 * EV técnico respetando el settlement completo (full/half win, push,
 * half/full loss) — nunca reducido a `probabilidad_de_ganar × cuota − 1`.
 * Genérica sobre cualquier `profile.probabilities` con esta forma.
 */
export function settlementExpectedValue(profile, decimalOdds) {
  const odds = Number(decimalOdds);
  const p = profile?.probabilities;
  if (!p || !Number.isFinite(odds) || odds <= 1) return null;
  return round(p.full_win * (odds - 1) + p.half_win * (odds - 1) / 2 - p.half_loss * 0.5 - p.full_loss);
}

/**
 * Cuota justa derivada directamente de EV=0: FairOdds = 1 + L/W, donde W y L
 * son las masas ponderadas de victoria/derrota (full + mitad de half).
 * Genérica sobre cualquier `profile` con `weighted_win_probability`/
 * `weighted_loss_probability`.
 */
export function settlementFairOdds(profile) {
  const weightedWin = Number(profile?.weighted_win_probability);
  const weightedLoss = Number(profile?.weighted_loss_probability);
  return weightedWin > 0 && Number.isFinite(weightedLoss) ? round(1 + weightedLoss / weightedWin) : null;
}

/**
 * Probabilidad equivalente por precio: el precio neutral equivalente
 * derivado de TODA la distribución de settlement, NO la probabilidad
 * literal de ganar. Algebraicamente equivalente a 1/settlementFairOdds.
 * Nunca debe llamarse "probabilidad de ganar" — solo sirve para comparar en
 * puntos porcentuales contra una probabilidad implícita de mercado sobre la
 * MISMA selección y línea exactas.
 */
export function settlementPriceEquivalentProbability({ weighted_win_probability, weighted_loss_probability } = {}) {
  const w = Number(weighted_win_probability);
  const l = Number(weighted_loss_probability);
  if (!Number.isFinite(w) || !Number.isFinite(l) || w + l <= 0) return null;
  return w / (w + l);
}

// Extraído de asianTotalGoals.js#asianPriceEquivalentInterval (privada) sin
// cambiar su comportamiento: asianTotalGoals.js ahora delega en esta
// función con z=1.96 y minimumDecisiveSample=2 (mismos valores que ya
// usaba). Genérico: intervalo aproximado de la probabilidad equivalente de
// precio — NO un intervalo de probabilidad literal de ganar. Usa la masa
// "decisiva" (W+L) como base de la proporción y escala el
// effective_sample_size deportivo por esa misma fracción decisiva antes de
// aplicar Wilson (wilsonInterval, preliminaryMarketModel.js) — no se
// inventa un método estadístico nuevo.
const DEFAULT_PRICE_EQUIVALENT_PROBABILITY_Z = 1.96;

export function settlementPriceEquivalentInterval({ weightedWinProbability, weightedLossProbability, effectiveSampleSize, z = DEFAULT_PRICE_EQUIVALENT_PROBABILITY_Z, minimumDecisiveSample = 2 } = {}) {
  const decisiveWeight = Number(weightedWinProbability) + Number(weightedLossProbability);
  if (!(decisiveWeight > 0)) return { low: null, high: null, method: null };
  const nDecisive = Number(effectiveSampleSize) * decisiveWeight;
  if (!(nDecisive > minimumDecisiveSample)) return { low: null, high: null, method: null };
  const p = Number(weightedWinProbability) / decisiveWeight;
  const [low, high] = wilsonInterval(p, nDecisive, z);
  return { low, high, method: "decisive_mass_wilson_95_percent" };
}

// ---------------------------------------------------------------------------
// Generación autónoma de líneas en pasos de 0.25, extraída de
// asianTotalGoals.js#generateAsianTotalGoalLines sin cambiar su
// comportamiento (asianTotalGoals.js ahora delega en generateQuarterStepLines
// con allowNegative:false). No recibe cuotas/bookmaker/líneas de mercado
// externas — el rango nace enteramente de la distribución deportiva
// recibida (mean/percentiles/dispersión).
// ---------------------------------------------------------------------------

export const QUARTER_LINE_STEP = 0.25;
export const DEFAULT_QUARTER_LINE_GENERATION_MAX_LINES = 13;

const MIN_QUARTER_LINE_RADIUS_QUARTERS = 3;
const MAX_QUARTER_LINE_RADIUS_QUARTERS = 6;

function clampInt(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

/**
 * Genera un conjunto finito, determinista, ordenado y sin duplicados de
 * líneas en pasos de 0.25, a partir de una distribución deportiva ya
 * calculada (mean, percentiles, dispersión). Con `allowNegative:false`
 * (comportamiento histórico de asian_total_goals) descarta líneas negativas;
 * con `allowNegative:true` (team_asian_handicap) las conserva, porque el
 * signo de la línea es parte del dominio de esa familia.
 *
 * @param {{projected_mean:number, percentile_10?:number, percentile_90?:number, dispersion?:number}} distribution
 * @param {{maxLines?:number, allowNegative?:boolean}} [options]
 * @returns {number[]}
 */
export function generateQuarterStepLines(distribution = {}, { maxLines = DEFAULT_QUARTER_LINE_GENERATION_MAX_LINES, allowNegative = false } = {}) {
  const projectedMean = Number(distribution.projected_mean);
  if (!Number.isFinite(projectedMean)) return [];
  const dispersion = Math.max(0.75, Number(distribution.dispersion) || 0.75);
  const percentile10 = Number(distribution.percentile_10);
  const percentile90 = Number(distribution.percentile_90);

  const centerQuarters = Math.round(projectedMean * 4);

  const dispersionRadiusQuarters = clampInt(
    Math.round(dispersion * 2),
    MIN_QUARTER_LINE_RADIUS_QUARTERS,
    MAX_QUARTER_LINE_RADIUS_QUARTERS,
  );

  const percentileRadiusQuarters = Number.isFinite(percentile10) && Number.isFinite(percentile90)
    ? Math.max(
      Math.abs(centerQuarters - Math.round(percentile10 * 4)),
      Math.abs(Math.round(percentile90 * 4) - centerQuarters),
    )
    : 0;

  const radiusQuarters = Math.min(
    MAX_QUARTER_LINE_RADIUS_QUARTERS,
    Math.max(dispersionRadiusQuarters, percentileRadiusQuarters),
  );

  const lines = [];
  for (let quarter = centerQuarters - radiusQuarters; quarter <= centerQuarters + radiusQuarters; quarter += 1) {
    const line = quarter / 4;
    if (allowNegative || line >= 0) lines.push(line);
  }

  if (lines.length <= maxLines) return lines;

  return [...lines]
    .sort((left, right) => Math.abs(left - projectedMean) - Math.abs(right - projectedMean))
    .slice(0, maxLines)
    .sort((left, right) => left - right);
}
