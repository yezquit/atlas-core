export const CONTRACT_VERSION = 1;

export const FIXTURE_STATUS = Object.freeze({
  NOT_REQUESTED: "not_requested",
  NOT_FOUND: "not_found",
  CONFIRMED: "confirmed",
  AMBIGUOUS: "ambiguous",
  ERROR: "error",
});

export const FIXTURE_STATISTICS_STATUS = Object.freeze({
  NOT_REQUESTED: "not_requested",
  UNAVAILABLE: "unavailable",
  AVAILABLE: "available",
  ERROR: "error",
});

export const EVIDENCE_STATUS = Object.freeze({
  MISSING: "missing",
  USER_REPORTED: "user_reported",
  FETCHED: "fetched",
  VERIFIED: "verified",
  CONTRADICTED: "contradicted",
  STALE: "stale",
});

export const MARKET_STATUS = Object.freeze({
  BLOCKED: "blocked",
  LIMITED: "limited",
  PRELIMINARY: "preliminary",
  READY: "ready",
  UNCLASSIFIED: "unclassified",
});

export const POLICY_STATUS = Object.freeze({
  BLOCKED: "blocked",
  LIMITED: "limited",
  PRELIMINARY: "preliminary",
  READY: "ready",
  EXPLORATORY: "exploratory",
});

export const PARLAY_STATUS = Object.freeze({
  UNSUPPORTED: "unsupported",
});

export const PROBABILITY_STATUS = Object.freeze({
  UNAVAILABLE: "unavailable",
  MODELED: "modeled",
});

export const DATA_LOAD_STATUS = Object.freeze({
  LOADING: "loading",
  SUCCESS: "success",
  EMPTY: "empty",
  AMBIGUOUS: "ambiguous",
  PROVIDER_ERROR: "provider_error",
  UNAVAILABLE: "unavailable",
});

export const DIRECTOR_STATUS = Object.freeze({
  UNAVAILABLE: "unavailable",
  INSUFFICIENT_DATA: "insufficient_data",
  ANALYZABLE_NOT_ACTIONABLE: "analyzable_not_actionable",
  VIABLE_WITH_CAUTION: "viable_with_caution",
  BLOCKED: "blocked",
});

function optionalText(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function assertStatus(status, statuses, contractName) {
  if (!Object.values(statuses).includes(status)) {
    throw new TypeError(`${contractName} recibió un estado inválido: ${status}`);
  }
}

/**
 * @typedef {object} AnalysisRequest
 * @property {"AnalysisRequest"} contract
 * @property {number} version
 * @property {string} mode
 * @property {string} partido
 * @property {string} competicion
 * @property {string} mercado
 * @property {string|null} lineaMercado
 * @property {string|null} cuotaMercado
 * @property {string|null} fecha
 * @property {string|null} temporada
 * @property {string} uso
 */
export function createAnalysisRequest(input = {}) {
  return {
    contract: "AnalysisRequest",
    version: CONTRACT_VERSION,
    mode: optionalText(input.mode) || "partido",
    partido: optionalText(input.partido) || "",
    competicion: optionalText(input.competicion) || "",
    mercado: optionalText(input.mercado) || "",
    lineaMercado: optionalText(input.lineaMercado),
    cuotaMercado: optionalText(input.cuotaMercado),
    fecha: optionalText(input.fecha ?? input.date),
    temporada: optionalText(input.temporada ?? input.season),
    uso: optionalText(input.uso) || "analisis",
  };
}

/** @returns {object} FixtureCatalogResult */
export function createFixtureCatalogResult({
  status,
  query = null,
  fixtures = [],
  evidence = [],
  message = "",
  errorCode = null,
  ...details
}) {
  assertStatus(status, DATA_LOAD_STATUS, "FixtureCatalogResult");

  const safeFixtures = Array.isArray(fixtures) ? fixtures : [];

  return {
    contract: "FixtureCatalogResult",
    version: CONTRACT_VERSION,
    status,
    query,
    count: safeFixtures.length,
    fixtures: safeFixtures,
    evidence,
    message,
    errorCode,
    ...details,
  };
}

/** @returns {object} FixtureResult */
export function createFixtureResult({
  status,
  attempted = false,
  connected = false,
  matches = [],
  selectedFixture = null,
  reason = "",
  ...details
}) {
  assertStatus(status, FIXTURE_STATUS, "FixtureResult");

  if (status === FIXTURE_STATUS.CONFIRMED && !selectedFixture) {
    throw new TypeError("FixtureResult confirmed requiere selectedFixture.");
  }

  const safeSelectedFixture =
    status === FIXTURE_STATUS.CONFIRMED ? selectedFixture : null;

  return {
    contract: "FixtureResult",
    version: CONTRACT_VERSION,
    status,
    attempted,
    connected,
    matches,
    selectedFixture: safeSelectedFixture,
    ambiguous: status === FIXTURE_STATUS.AMBIGUOUS,
    reason,
    ...details,
  };
}

/** @returns {object} FixtureStatisticsResult */
export function createFixtureStatisticsResult({
  status,
  statistics = null,
  attempted = false,
  connected = false,
  reason = "",
  ...details
}) {
  assertStatus(status, FIXTURE_STATISTICS_STATUS, "FixtureStatisticsResult");

  return {
    contract: "FixtureStatisticsResult",
    version: CONTRACT_VERSION,
    status,
    attempted,
    connected,
    statistics,
    reason,
    ...details,
  };
}

/** @returns {object} EvidenceItem */
export function createEvidenceItem({
  id,
  type,
  status,
  source = null,
  value = null,
  observedAt = null,
  fetchedAt = null,
  quality = null,
}) {
  assertStatus(status, EVIDENCE_STATUS, "EvidenceItem");

  return {
    contract: "EvidenceItem",
    version: CONTRACT_VERSION,
    id: optionalText(id),
    type: optionalText(type) || "unknown",
    status,
    source,
    value,
    observedAt: optionalText(observedAt),
    fetchedAt: optionalText(fetchedAt),
    quality,
  };
}

/** @returns {object} MarketAssessment */
export function createMarketAssessment({
  status,
  market = "",
  line = null,
  odds = null,
  coverage = null,
  technicalSupport = null,
  estimatedProbability = null,
  probabilityStatus = PROBABILITY_STATUS.UNAVAILABLE,
  missingData = [],
  ...details
}) {
  assertStatus(status, MARKET_STATUS, "MarketAssessment");
  assertStatus(probabilityStatus, PROBABILITY_STATUS, "MarketAssessment");

  if (probabilityStatus === PROBABILITY_STATUS.UNAVAILABLE) {
    estimatedProbability = null;
  }

  return {
    contract: "MarketAssessment",
    version: CONTRACT_VERSION,
    status,
    market,
    line: optionalText(line),
    odds: optionalText(odds),
    coverage,
    technicalSupport,
    estimatedProbability,
    probabilityStatus,
    missingData,
    ...details,
  };
}

/** @returns {object} PolicyDecision */
export function createPolicyDecision({
  status,
  canAnalyze = false,
  canRecommend = false,
  reason = "",
  requiredAction = "",
  parlayStatus = PARLAY_STATUS.UNSUPPORTED,
  ...details
}) {
  assertStatus(status, POLICY_STATUS, "PolicyDecision");
  assertStatus(parlayStatus, PARLAY_STATUS, "PolicyDecision");

  const blocked = status === POLICY_STATUS.BLOCKED;

  return {
    contract: "PolicyDecision",
    version: CONTRACT_VERSION,
    status,
    canAnalyze: blocked ? false : canAnalyze,
    canRecommend: blocked ? false : canRecommend,
    canUseInParlay: false,
    parlayStatus,
    reason,
    requiredAction,
    ...details,
  };
}

/** @returns {object} DirectorVerdict */
export function createDirectorVerdict({
  status = DIRECTOR_STATUS.INSUFFICIENT_DATA,
  verdict,
  market,
  technicalSupport = null,
  estimatedProbability = null,
  probabilityStatus = PROBABILITY_STATUS.UNAVAILABLE,
  policyStatus,
  canRecommend = false,
  parlayStatus = PARLAY_STATUS.UNSUPPORTED,
  reasons = [],
  risks = [],
  missingData = [],
  avoid = [],
  nextAction = "",
  ...details
}) {
  assertStatus(status, DIRECTOR_STATUS, "DirectorVerdict");
  assertStatus(policyStatus, POLICY_STATUS, "DirectorVerdict");
  assertStatus(probabilityStatus, PROBABILITY_STATUS, "DirectorVerdict");
  assertStatus(parlayStatus, PARLAY_STATUS, "DirectorVerdict");

  if (probabilityStatus === PROBABILITY_STATUS.UNAVAILABLE) {
    estimatedProbability = null;
  }

  return {
    contract: "DirectorVerdict",
    version: CONTRACT_VERSION,
    status,
    verdict,
    market,
    technicalSupport,
    estimatedProbability,
    probabilityStatus,
    policyStatus,
    canRecommend:
      policyStatus === POLICY_STATUS.BLOCKED ? false : canRecommend,
    canUseInParlay: false,
    parlayStatus,
    reasons,
    risks,
    missingData,
    avoid,
    nextAction,
    ...details,
  };
}
