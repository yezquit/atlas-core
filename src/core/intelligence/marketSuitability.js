import {
  MARKET_SUITABILITY,
  ODDS_VERIFICATION_STATUS,
} from "../contracts/operationalContracts.js";

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
} = {}) {
  const conditions = [];
  let status;
  if (blocked || contextBlocked || !fixtureVerified) {
    status = MARKET_SUITABILITY.BLOCKED;
    conditions.push(!fixtureVerified ? "Verificar el fixture exacto." : "Resolver el bloqueo operativo informado.");
  } else if (!marketCandidate && !sampleSufficient) {
    status = MARKET_SUITABILITY.INSUFFICIENT_DATA;
    conditions.push("Completar una muestra deportiva suficiente.");
  } else if (!marketCandidate || !requiredEvidenceAvailable || criticalContradictions > 0) {
    status = MARKET_SUITABILITY.NOT_VIABLE;
    if (!requiredEvidenceAvailable) conditions.push("Completar la evidencia requerida por el mercado.");
    if (criticalContradictions > 0) conditions.push("Resolver las contradicciones críticas.");
  } else if (!line || !oddsQuote) {
    status = MARKET_SUITABILITY.REVIEW_ONLY;
    conditions.push("Añadir línea y cuota comparables.");
  } else if (
    oddsQuote.verification_status === ODDS_VERIFICATION_STATUS.STALE ||
    oddsQuote.freshness === "stale"
  ) {
    status = MARKET_SUITABILITY.BLOCKED;
    conditions.push("Actualizar la cuota vencida antes de considerar el mercado.");
  } else if (confidenceScore < threshold) {
    status = MARKET_SUITABILITY.VIABLE_WITH_CAUTION;
    conditions.push(`Elevar la confianza informativa al umbral configurado de ${threshold}.`);
  } else if (oddsQuote.verification_status !== ODDS_VERIFICATION_STATUS.VERIFIED_PROVIDER) {
    status = MARKET_SUITABILITY.VIABLE_WITH_CAUTION;
    conditions.push("Verificar la cuota reportada manualmente con el bookmaker.");
  } else {
    status = MARKET_SUITABILITY.SUITABLE_UNDER_CONDITIONS;
    conditions.push("Revisar nuevamente contexto, alineaciones y cuota antes del inicio.");
  }
  return {
    contract: "MarketSuitability",
    version: 1,
    status,
    apt_for_consideration: status === MARKET_SUITABILITY.SUITABLE_UNDER_CONDITIONS,
    conditions: [...new Set(conditions)],
    estimated_probability: null,
    probability_status: "unavailable",
  };
}
