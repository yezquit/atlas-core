export const PROBABILITY_CLASSIFICATION_VERSION = "probability-classification-v1";

export const ESTIMATED_PROBABILITY_REPRESENTS = "estimated_event_probability";

export const PROBABILITY_CLASSIFICATION = Object.freeze({
  VERY_HIGH: "MUY ALTA",
  HIGH: "ALTA",
  GOOD: "BUENA",
  MODERATE: "MODERADA",
  RISKY: "RIESGOSA",
  VERY_RISKY: "MUY RIESGOSA",
});

const THRESHOLDS = Object.freeze([
  { minimum: 0.85, label: PROBABILITY_CLASSIFICATION.VERY_HIGH },
  { minimum: 0.75, label: PROBABILITY_CLASSIFICATION.HIGH },
  { minimum: 0.65, label: PROBABILITY_CLASSIFICATION.GOOD },
  { minimum: 0.55, label: PROBABILITY_CLASSIFICATION.MODERATE },
  { minimum: 0.45, label: PROBABILITY_CLASSIFICATION.RISKY },
]);

// Ningún estado real del repositorio ("preliminary_unvalidated" en
// model_validation_status; "eligible_for_manual_validation_review" o
// "preliminary_insufficient_history" en calibration_status) afirma
// calibración. Esta lista queda vacía a propósito: solo se activa cuando
// el modelo empiece a emitir un estado real que la demuestre.
const CALIBRATED_MODEL_VALIDATION_STATUSES = Object.freeze([]);

export function isValidProbability(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

export function toProbabilityPercent(probability) {
  if (!isValidProbability(probability)) return null;
  return Number((probability * 100).toFixed(1));
}

export function classifyProbability(probability) {
  if (!isValidProbability(probability)) return null;
  const matched = THRESHOLDS.find((tier) => probability >= tier.minimum);
  return matched ? matched.label : PROBABILITY_CLASSIFICATION.VERY_RISKY;
}

export function isCalibratedModel(modelValidationStatus) {
  return CALIBRATED_MODEL_VALIDATION_STATUSES.includes(modelValidationStatus);
}
