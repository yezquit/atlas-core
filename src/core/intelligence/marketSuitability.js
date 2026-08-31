import {
  MARKET_SUITABILITY,
  ODDS_VERIFICATION_STATUS,
  PRICE_EVALUATION_STATUS,
} from "../contracts/operationalContracts.js";
import { evaluateValueOpportunity, VALUE_RADAR_STATUS } from "./valueRadar.js";

function round(value, decimals = 4) {
  return Number(Number(value).toFixed(decimals));
}

function percentageLabel(value) {
  return `${Number((Number(value) * 100).toFixed(1))}%`;
}

export function evaluateMarketPrice({
  oddsQuote = null,
  preliminaryProbability = null,
  confidenceScore = 0,
  sampleSize = 0,
  phase = "early_review",
  favorableGap = 0.03,
  controlledUncertaintyWidth = 0.25,
  marketFamily = null,
  asianSettlementProfile = null,
} = {}) {
  if (marketFamily === "asian_total_goals") {
    const value = evaluateValueOpportunity({
      candidate: {
        fixture_id: oddsQuote?.fixture_id,
        market_family: marketFamily,
        direction: oddsQuote?.direction || oddsQuote?.selection,
        line: oddsQuote?.line,
        estimated_probability: preliminaryProbability?.point_estimate,
        uncertainty_low: preliminaryProbability?.uncertainty_low,
        uncertainty_high: preliminaryProbability?.uncertainty_high,
      },
      quote: oddsQuote,
      asianSettlementProfile,
    });
    const status = value.status === VALUE_RADAR_STATUS.INTERESTING ? PRICE_EVALUATION_STATUS.FAVORABLE_PRELIMINARY
      : value.status === VALUE_RADAR_STATUS.NO_VALUE ? PRICE_EVALUATION_STATUS.UNFAVORABLE
        : value.status === VALUE_RADAR_STATUS.NOT_EVALUABLE ? PRICE_EVALUATION_STATUS.UNAVAILABLE
          : PRICE_EVALUATION_STATUS.MARGINAL;
    return {
      contract: "PriceEvaluation",
      version: 1,
      ...value,
      status,
      price_gap: Number.isFinite(value.raw_edge_pp) ? round(value.raw_edge_pp / 100) : null,
      price_gap_percentage_points: value.raw_edge_pp,
      expected_value_claimed: false,
      model_notice: "Evaluación asiática preliminar basada en liquidación completa; no garantiza resultados.",
      message: value.simple_message,
    };
  }
  const modelNotice = "El modelo es preliminar y aún no está suficientemente calibrado para afirmar valor esperado.";
  const base = {
    contract: "PriceEvaluation",
    version: 1,
    status: PRICE_EVALUATION_STATUS.UNAVAILABLE,
    decimal_odds: oddsQuote?.decimal_odds ?? null,
    implied_probability: oddsQuote?.implied_probability ?? null,
    preliminary_probability: preliminaryProbability?.point_estimate ?? null,
    uncertainty_low: preliminaryProbability?.uncertainty_low ?? null,
    uncertainty_high: preliminaryProbability?.uncertainty_high ?? null,
    uncertainty_width: null,
    price_gap: null,
    price_gap_percentage_points: null,
    confidence_score: confidenceScore,
    sample_size_effective: sampleSize,
    phase,
    quote_source_status: oddsQuote?.source_status || oddsQuote?.verification_status || "unavailable",
    bookmaker: oddsQuote?.bookmaker_name || null,
    expected_value_claimed: false,
    model_notice: modelNotice,
  };
  if (!oddsQuote) {
    return { ...base, message: "No existe una cuota actual para evaluar el precio." };
  }
  if (oddsQuote.freshness === "stale" || oddsQuote.verification_status === ODDS_VERIFICATION_STATUS.STALE || oddsQuote.stale) {
    return { ...base, status: PRICE_EVALUATION_STATUS.STALE, message: "La cuota venció; el pronóstico deportivo se conserva, pero el precio queda solo para revisión." };
  }
  const probability = Number(preliminaryProbability?.point_estimate);
  const implied = Number(oddsQuote.implied_probability);
  const low = Number(preliminaryProbability?.uncertainty_low);
  const high = Number(preliminaryProbability?.uncertainty_high);
  if (!Number.isFinite(probability) || !Number.isFinite(implied)) {
    return { ...base, status: PRICE_EVALUATION_STATUS.MARGINAL, message: `La cuota está vigente, pero falta una estimación comparable. ${modelNotice}` };
  }
  const gap = probability - implied;
  const uncertaintyWidth = Number.isFinite(low) && Number.isFinite(high) ? high - low : null;
  const comparison = {
    ...base,
    uncertainty_width: Number.isFinite(uncertaintyWidth) ? round(uncertaintyWidth) : null,
    price_gap: round(gap),
    price_gap_percentage_points: round(gap * 100, 1),
    implied_inside_interval: Number.isFinite(low) && Number.isFinite(high) ? implied >= low && implied <= high : null,
  };
  if (gap < 0) {
    return {
      ...comparison,
      status: PRICE_EVALUATION_STATUS.UNFAVORABLE,
      message: `La cuota ${oddsQuote.decimal_odds} implica una probabilidad del ${percentageLabel(implied)}, superior a la estimación preliminar de Atlas del ${percentageLabel(probability)}. No considero viable esta selección a este precio.`,
    };
  }
  const uncertaintyControlled = Number.isFinite(uncertaintyWidth) && uncertaintyWidth <= controlledUncertaintyWidth;
  const sufficientEvidence = confidenceScore >= 75 && Number(sampleSize) >= 5;
  if (gap >= favorableGap && uncertaintyControlled && sufficientEvidence) {
    return {
      ...comparison,
      status: PRICE_EVALUATION_STATUS.FAVORABLE_PRELIMINARY,
      message: `La estimación preliminar supera la probabilidad implícita con margen y una incertidumbre controlada. ${modelNotice}`,
    };
  }
  return {
    ...comparison,
    status: PRICE_EVALUATION_STATUS.MARGINAL,
    message: `La comparación de precio es marginal por el margen o la amplitud del intervalo. ${modelNotice}`,
  };
}

export function assessMarketSuitability({
  fixtureVerified = false,
  blocked = false,
  marketCandidate = false,
  sampleSufficient = false,
  requiredEvidenceAvailable = false,
  criticalContradictions = 0,
  line = null,
  oddsQuote = null,
  contextBlocked = false,
  confidenceScore = 0,
  threshold = 75,
  preliminaryProbability = null,
  sampleSize = preliminaryProbability?.sample_size_effective || (sampleSufficient ? 5 : 0),
  phase = "early_review",
  marketFamily = null,
  asianSettlementProfile = null,
} = {}) {
  const conditions = [];
  const priceEvaluation = evaluateMarketPrice({ oddsQuote, preliminaryProbability, confidenceScore, sampleSize, phase, marketFamily, asianSettlementProfile });
  let status;
  if (blocked || contextBlocked || !fixtureVerified) {
    status = MARKET_SUITABILITY.BLOCKED;
    conditions.push(!fixtureVerified ? "Verificar el fixture exacto." : "Resolver el bloqueo operativo informado.");
  } else if (!marketCandidate && !sampleSufficient) {
    status = MARKET_SUITABILITY.INSUFFICIENT_DATA;
    conditions.push("Completar una muestra deportiva suficiente.");
  } else if (!marketCandidate || criticalContradictions > 0) {
    status = MARKET_SUITABILITY.NOT_VIABLE;
    if (criticalContradictions > 0) conditions.push("Resolver las contradicciones críticas.");
  } else if (!requiredEvidenceAvailable) {
    status = MARKET_SUITABILITY.REVIEW_ONLY;
    conditions.push("Completar la evidencia relevante requerida por el mercado.");
  } else if (!line || !oddsQuote) {
    status = MARKET_SUITABILITY.REVIEW_ONLY;
    conditions.push("Añadir línea y cuota comparables.");
  } else if (
    oddsQuote.verification_status === ODDS_VERIFICATION_STATUS.STALE ||
    oddsQuote.freshness === "stale"
  ) {
    status = MARKET_SUITABILITY.REVIEW_ONLY;
    conditions.push("Actualizar la cuota vencida para completar la evaluación económica; el pronóstico deportivo se conserva.");
  } else if (preliminaryProbability?.probability_status !== "preliminary") {
    status = MARKET_SUITABILITY.REVIEW_ONLY;
    conditions.push("Completar la muestra compatible requerida por el modelo preliminar para esta línea exacta.");
  } else if (priceEvaluation.status === PRICE_EVALUATION_STATUS.UNFAVORABLE) {
    status = MARKET_SUITABILITY.NOT_VIABLE;
    conditions.push(priceEvaluation.message);
  } else if ([PRICE_EVALUATION_STATUS.UNAVAILABLE, PRICE_EVALUATION_STATUS.STALE].includes(priceEvaluation.status)) {
    status = MARKET_SUITABILITY.REVIEW_ONLY;
    conditions.push(priceEvaluation.message);
  } else if (confidenceScore < threshold) {
    status = MARKET_SUITABILITY.VIABLE_WITH_CAUTION;
    conditions.push(`Elevar la confianza informativa al umbral configurado de ${threshold}.`);
  } else if (priceEvaluation.status === PRICE_EVALUATION_STATUS.MARGINAL) {
    status = MARKET_SUITABILITY.VIABLE_WITH_CAUTION;
    conditions.push(priceEvaluation.message);
  } else {
    status = MARKET_SUITABILITY.SUITABLE_UNDER_CONDITIONS;
    conditions.push("Revisar nuevamente contexto, alineaciones y cuota antes del inicio.");
    if (oddsQuote.verification_status !== ODDS_VERIFICATION_STATUS.VERIFIED_PROVIDER) conditions.push("La cuota permanece reportada por el usuario.");
  }
  return {
    contract: "MarketSuitability",
    version: 1,
    status,
    apt_for_consideration: status === MARKET_SUITABILITY.SUITABLE_UNDER_CONDITIONS,
    conditions: [...new Set(conditions)],
    estimated_probability: preliminaryProbability?.point_estimate ?? null,
    probability_status: preliminaryProbability?.probability_status || "unavailable",
    uncertainty_low: preliminaryProbability?.uncertainty_low ?? null,
    uncertainty_high: preliminaryProbability?.uncertainty_high ?? null,
    price_evaluation: priceEvaluation,
  };
}
