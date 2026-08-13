import { confidenceLabel } from "../contracts/operationalContracts.js";

export const CONFIDENCE_WEIGHTS = Object.freeze({
  source_quality: 18,
  freshness: 14,
  sample_size: 14,
  variable_coverage: 14,
  source_concordance: 10,
  contradiction_control: 10,
  contextual_coverage: 8,
  verified_market_data: 8,
  provider_stability: 4,
});

function ratio(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

export function calculateAnalysisConfidence(input = {}) {
  const components = Object.entries(CONFIDENCE_WEIGHTS).map(([name, weight]) => {
    const normalizedValue = ratio(input[name]);
    return { name, weight, normalized_value: normalizedValue, points: normalizedValue * weight };
  });
  const rawScore = components.reduce((total, component) => total + component.points, 0);
  const extraordinary = Boolean(
    input.extraordinaryEvidence &&
    input.confirmedLineup &&
    input.verifiedOdds &&
    Number(input.criticalContradictions || 0) === 0 &&
    components.every((component) => component.normalized_value >= 0.95)
  );
  const score = Math.round(Math.min(extraordinary ? 100 : 92, rawScore));
  return {
    contract: "AnalysisConfidence",
    version: 1,
    analysis_confidence_score: score,
    confidence_label: confidenceLabel(score),
    represents_probability: false,
    formula: "Suma ponderada de calidad de fuente (18), actualidad de la evidencia deportiva (14), muestra (14), cobertura (14), concordancia (10), control de contradicciones (10), contexto (8), datos deportivos de mercado verificados (8) y estabilidad del proveedor (4). La cuota no altera esta confianza.",
    cap_applied: !extraordinary && rawScore > 92,
    extraordinary_evidence: extraordinary,
    components,
  };
}
