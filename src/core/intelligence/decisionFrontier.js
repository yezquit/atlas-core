// Decision Frontier V3 is a selection layer, not a predictive model. It
// keeps the complete sports catalogue intact and explains why one supported
// line is more useful operationally than another line from the same family.

const CURRENT_PRICE_STATUSES = new Set(["verified_current", "user_reported_current"]);

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value, decimals = 1) {
  return Number(Number(value).toFixed(decimals));
}

function directionOf(candidate = {}) {
  const value = String(candidate.direction ?? candidate.selection ?? "").trim().toLowerCase();
  if (/^(over|mas|más)/.test(value)) return "over";
  if (/^(under|menos)/.test(value)) return "under";
  return null;
}

function candidateKey(candidate = {}) {
  return String(candidate.candidate_id ?? candidate.selection_key ?? `${candidate.fixture_id ?? candidate.fixtureId ?? "analysis"}:${candidate.market_family}:${directionOf(candidate)}:${candidate.line}`);
}

function sameExactQuote(candidate, quote) {
  if (!quote) return false;
  return String(quote.market_family ?? quote.marketFamily) === String(candidate.market_family ?? candidate.marketId)
    && directionOf(quote) === directionOf(candidate)
    && number(quote.line) === number(candidate.line);
}

export function calculateDecisionEconomics(candidate = {}) {
  const quote = candidate.price_quote ?? candidate.active_quote ?? candidate.activeQuote ?? null;
  const probability = number(candidate.estimated_probability ?? candidate.preliminary_probability);
  const odds = number(quote?.decimal_odds ?? quote?.decimalOdds ?? candidate.decimal_odds);
  const current = CURRENT_PRICE_STATUSES.has(candidate.price_status ?? candidate.priceStatus)
    || candidate.price_usable === true;
  if (!current || !sameExactQuote(candidate, quote) || probability === null || odds === null || odds <= 1) {
    return { status: "unavailable", implied_probability: null, edge: null, expected_value: null, quote_exact: false };
  }
  const implied = 1 / odds;
  return {
    status: "available",
    implied_probability: round(implied, 4),
    edge: round(probability - implied, 4),
    expected_value: round(probability * odds - 1, 4),
    quote_exact: true,
  };
}

function sportsQuality(candidate = {}) {
  const width = Math.max(0, (number(candidate.uncertainty_high ?? candidate.uncertaintyHigh) ?? 1) - (number(candidate.uncertainty_low ?? candidate.uncertaintyLow) ?? 0));
  const uncertainty = clamp(100 - width * 125);
  const sample = clamp(((number(candidate.sample_size_effective ?? candidate.sampleSize) ?? 0) / 20) * 100);
  const technical = clamp(number(candidate.technical_support_score ?? candidate.technicalSupport) ?? number(candidate.sports_score ?? candidate.sportsScore) ?? 0);
  const stability = clamp(number(candidate.line_stability_score ?? candidate.lineStabilityScore) ?? 50);
  const sport = clamp(number(candidate.sports_score ?? candidate.sportsScore) ?? 0);
  // A component/distribution mismatch is not a change to the sports model.
  // It only makes the line less suitable for recommendation until explained.
  const coherencePenalty = candidate.model_coherence_warning === true ? 12 : 0;
  return round(Math.max(0, sport * 0.35 + stability * 0.25 + uncertainty * 0.2 + sample * 0.1 + technical * 0.1 - coherencePenalty));
}

function profileFor(product) {
  if (product === "dream") return { ambition: 22, economics: 16, frontierGap: 16 };
  if (product === "parlay") return { ambition: 11, economics: 8, frontierGap: 10 };
  return { ambition: 16, economics: 14, frontierGap: 12 };
}

function groupKey(candidate) {
  return `${candidate.fixture_id ?? candidate.fixtureId ?? "analysis"}:${candidate.market_family ?? candidate.marketId}:${directionOf(candidate) ?? "unknown"}`;
}

function lineOrder(left, right, direction) {
  const leftLine = number(left.line) ?? 0;
  const rightLine = number(right.line) ?? 0;
  return direction === "under" ? rightLine - leftLine : leftLine - rightLine;
}

export function buildDecisionFrontier(candidates = [], { product = "individual" } = {}) {
  const profile = profileFor(product);
  const grouped = new Map();
  for (const candidate of candidates) {
    const key = groupKey(candidate);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(candidate);
  }
  const enriched = [];
  const groups = [];
  for (const [key, group] of grouped) {
    const direction = directionOf(group[0]);
    const ordered = [...group].sort((left, right) => lineOrder(left, right, direction));
    const qualities = ordered.map(sportsQuality);
    const strongestQuality = Math.max(...qualities, 0);
    const frontierFloor = Math.max(0, strongestQuality - profile.frontierGap);
    const evaluated = ordered.map((candidate, index) => {
      const quality = qualities[index];
      const ambition = ordered.length <= 1 ? 0 : round((index / (ordered.length - 1)) * 100);
      const economics = calculateDecisionEconomics(candidate);
      // A price can refine the order only after sports support has passed the
      // same frontier. It is intentionally capped and never changes sports data.
      const economicContribution = economics.status === "available"
        ? clamp(economics.edge * 100, -profile.economics, profile.economics)
        : 0;
      const frontierEligible = candidate.ranking_eligible !== false && quality >= frontierFloor;
      const usefulLineScore = round(quality + (ambition * profile.ambition) / 100);
      const selectionQuality = round(quality + (ambition * profile.ambition) / 100 + economicContribution);
      return {
        ...candidate,
        selection_quality: selectionQuality,
        useful_line_score: usefulLineScore,
        decision_economics: economics,
        decision_frontier: {
          status: frontierEligible ? "eligible" : "outside_sports_frontier",
          group: key,
          product,
          sports_quality: quality,
          frontier_floor: frontierFloor,
          line_ambition: ambition,
          model_coherence_warning: candidate.model_coherence_warning === true,
          economic_contribution: round(economicContribution),
          reason: frontierEligible
            ? candidate.model_coherence_warning === true
              ? "La línea conserva respaldo, pero una discrepancia entre componentes y distribución exige cautela."
              : "La línea conserva respaldo deportivo comparable y mejora la utilidad de la decisión."
            : "La línea más exigente pierde respaldo deportivo material; se conserva en catálogo, pero no se recomienda.",
        },
      };
    });
    const viable = evaluated.filter((candidate) => candidate.decision_frontier.status === "eligible");
    const sorted = [...(viable.length ? viable : evaluated)].sort((left, right) =>
      right.selection_quality - left.selection_quality
      || right.useful_line_score - left.useful_line_score
      || String(left.candidate_id).localeCompare(String(right.candidate_id))
    );
    const recommendedId = sorted[0]?.candidate_id ?? null;
    for (const candidate of evaluated) {
      enriched.push({ ...candidate, decision_frontier: { ...candidate.decision_frontier, recommended: candidate.candidate_id === recommendedId } });
    }
    groups.push({ key, recommended_candidate_id: recommendedId, candidate_count: evaluated.length, frontier_floor: frontierFloor });
  }
  const byKey = new Map(enriched.map((candidate) => [candidateKey(candidate), candidate]));
  const ranked = candidates.map((candidate) => byKey.get(candidateKey(candidate)) || candidate);
  const recommended = ranked.filter((candidate) => candidate.decision_frontier?.recommended)
    .sort((left, right) => right.selection_quality - left.selection_quality || right.useful_line_score - left.useful_line_score);
  return { contract: "DecisionFrontier", version: 1, product, candidates: ranked, groups, primary: recommended[0] || ranked[0] || null };
}
