import { PRICE_EVALUATION_STATUS } from "../contracts/operationalContracts.js";
import { evaluateMarketPrice } from "./marketSuitability.js";
import { selectCandidateQuote } from "./marketCandidateRanker.js";
import { isModelLimitation } from "./redTeamAtlas.js";

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function candidateSignals(candidate, assessment) {
  const favorable = unique(candidate.simple_sports_reasons || []);
  const contrary = unique([
    ...(assessment?.risk_flags || []).filter((item) => !isModelLimitation(item)),
    ...(candidate.limitations || []).filter((item) => !isModelLimitation(item)),
  ]);
  const pending = unique(assessment?.missing_evidence || []);
  return {
    favorable,
    contrary,
    pending,
    summary: `${favorable.length} señales favorables · ${contrary.length} contrarias · ${pending.length} pendientes`,
  };
}

export function buildScoutAtlas({ marketSelection, marketAssessments = [], lineOrigin = "atlas_selected", maximum = 5 } = {}) {
  const assessmentByFamily = new Map(marketAssessments.map((item) => [item.market_family, item]));
  const deduplicated = [...new Map((marketSelection?.ranked_candidates || [])
    .filter((candidate) => candidate.probability_status === "preliminary" && candidate.sports_score >= 45)
    .map((candidate) => [candidate.candidate_id, candidate])).values()]
    .slice(0, Math.max(3, Math.min(5, maximum)));
  const mostProbable = [...deduplicated].sort((left, right) => right.preliminary_probability - left.preliminary_probability || left.rank - right.rank)[0];
  const candidates = deduplicated.map((candidate, index) => {
    const labels = [];
    if (index === 0) labels.push("best_sports_support");
    if (candidate.candidate_id === mostProbable?.candidate_id) labels.push("highest_probability");
    if (!labels.length) labels.push("relevant_alternative");
    const assessment = assessmentByFamily.get(candidate.market_family);
    const signals = candidateSignals(candidate, assessment);
    return {
      ...candidate,
      sports_rank: index + 1,
      labels,
      sports_support: candidate.sports_score,
      signals,
      primary_risk: signals.contrary[0] || null,
      missing_data: signals.pending,
      line_origin: candidate.line_origin || lineOrigin,
      confidence_quality: assessment?.quality_status || "unavailable",
    };
  });
  return {
    contract: "ScoutAtlasResult",
    version: 1,
    price_inputs_used: false,
    candidates,
    primary_candidate_id: candidates[0]?.candidate_id || null,
    explanation: candidates.length
      ? "Ranking deportivo construido sin cuota, bookmaker, probabilidad implícita ni evaluación de precio."
      : "No se encontraron candidatos con respaldo deportivo suficiente.",
  };
}

const PRICE_PRIORITY = Object.freeze({
  [PRICE_EVALUATION_STATUS.FAVORABLE_PRELIMINARY]: 3,
  [PRICE_EVALUATION_STATUS.MARGINAL]: 2,
  [PRICE_EVALUATION_STATUS.UNFAVORABLE]: 1,
});

export function buildOperationalRanking({ scout, quotes = [], confidenceScore = 0, phase = "early_review" } = {}) {
  const priced = (scout?.candidates || []).flatMap((candidate) => {
    const selected = selectCandidateQuote(candidate, quotes);
    if (!selected.quote || !["verified_current", "user_reported_current"].includes(selected.status)) return [];
    const price = evaluateMarketPrice({
      oddsQuote: selected.quote,
      preliminaryProbability: {
        probability_status: candidate.probability_status,
        point_estimate: candidate.preliminary_probability,
        uncertainty_low: candidate.uncertainty_low,
        uncertainty_high: candidate.uncertainty_high,
      },
      confidenceScore,
      sampleSize: candidate.sample_size_effective,
      phase,
    });
    return [{ candidate, quote: selected.quote, price }];
  }).sort((left, right) =>
    (PRICE_PRIORITY[right.price.status] || 0) - (PRICE_PRIORITY[left.price.status] || 0) ||
    Number(right.price.price_gap ?? -Infinity) - Number(left.price.price_gap ?? -Infinity) ||
    left.candidate.sports_rank - right.candidate.sports_rank
  ).map((item, index) => ({ ...item, operational_rank: index + 1 }));
  return {
    contract: "OperationalMarketRanking",
    version: 1,
    candidates: priced,
    primary_candidate_id: priced[0]?.candidate?.candidate_id || null,
    sports_primary_candidate_id: scout?.primary_candidate_id || null,
    differs_from_sports_ranking: Boolean(priced[0] && priced[0].candidate.candidate_id !== scout?.primary_candidate_id),
    explanation: priced.length
      ? "La clasificación operativa compara únicamente opciones con cuota actual y no modifica el ranking deportivo."
      : "No hay opciones con precio actual para construir una clasificación operativa.",
  };
}
