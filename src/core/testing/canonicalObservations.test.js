import test from "node:test";
import assert from "node:assert/strict";

import { buildCanonicalObservations } from "../intelligence/canonicalObservations.js";
import { buildMarketComponents } from "../intelligence/marketComponentAdapter.js";
import { buildMarketDistribution, generateCandidateLines } from "../intelligence/candidateLineGenerator.js";
import { buildDecisionFrontier } from "../intelligence/decisionFrontier.js";
import { estimatePreliminaryMarketProbability } from "../intelligence/preliminaryMarketModel.js";

function sample(values) {
  return {
    match_totals: values.map((value) => value.value),
    observations: values,
    for: values.map((value) => value.value / 2),
    conceded: values.map((value) => value.value / 2),
  };
}

function profiles() {
  const observations = Array.from({ length: 10 }, (_, index) => ({ fixture_id: index + 1, value: index % 2 ? 3 : 2 }));
  const role = observations.slice(0, 5);
  const profile = {
    quality_status: "verified",
    last_5: { event_samples: { goals: sample(role) } },
    last_10: { event_samples: { goals: sample(observations) } },
    as_home: { event_samples: { goals: sample(role) } },
    as_away: { event_samples: { goals: sample(role) } },
  };
  return {
    leagueProfile: { quality_status: "verified", event_samples: { goals: sample(observations) } },
    homeTeamProfile: structuredClone(profile),
    awayTeamProfile: structuredClone(profile),
  };
}

test("canonical observations keep one physical record per overlapping fixture", () => {
  const input = { marketFamily: "goals", ...profiles() };
  const canonical = buildCanonicalObservations(input);
  assert.equal(canonical.observations.length, 10);
  assert.ok(canonical.effective_sample_size <= canonical.observations.length);
  assert.ok(canonical.observations.find((item) => item.fixture_id === 1).memberships.length > 1);
  assert.equal(new Set(canonical.fixture_ids).size, canonical.fixture_ids.length);
  assert.ok(canonical.sources.every((source) => source.raw_fixture_ids.length === source.raw_sample_size));
});

test("distribution and exact-line probability share canonical fixture identifiers", () => {
  const input = { marketFamily: "goals", ...profiles() };
  const distribution = buildMarketDistribution(input);
  const probability = estimatePreliminaryMarketProbability({
    ...input,
    selection: "Over 2.5",
    line: 2.5,
    canonicalObservations: distribution.canonical_observations,
  });
  assert.equal(probability.probability_status, "preliminary");
  assert.deepEqual(probability.canonical_fixture_ids, distribution.canonical_observations.fixture_ids);
  assert.equal(probability.canonical_threshold_distribution.fixture_ids.length, distribution.pooled_sample_size);
});

test("market components combine paired production and allowance without treating cards as provoked", () => {
  const { homeTeamProfile, awayTeamProfile } = profiles();
  const components = buildMarketComponents({ marketFamily: "goals", homeTeamProfile, awayTeamProfile });
  assert.ok(Number.isFinite(components.home_component.expected));
  assert.ok(Number.isFinite(components.away_component.expected));
  assert.equal(components.component_total, components.home_component.expected + components.away_component.expected);
  const cards = buildMarketComponents({ marketFamily: "cards", homeTeamProfile, awayTeamProfile });
  assert.equal(cards.component_total, null);
  assert.match(cards.adapter.note, /no se interpretan/i);
});

test("coherence warning is auditable and makes the decision frontier cautious without changing probability", () => {
  const input = { marketFamily: "goals", ...profiles() };
  const coherent = generateCandidateLines(input).candidates[0];
  assert.equal(coherent.model_coherence_warning, false);
  for (const scope of ["as_home"]) input.homeTeamProfile[scope].event_samples.goals.for = [20, 20, 20, 20, 20];
  const divergent = generateCandidateLines(input).candidates[0];
  assert.equal(divergent.model_coherence_warning, true);
  assert.ok(divergent.market_model_audit.coherence_ratio > 1);
  const frontier = buildDecisionFrontier([{ ...coherent, candidate_id: "coherent", line: 2.5 }, { ...divergent, candidate_id: "divergent", line: 3.5 }]);
  assert.equal(frontier.candidates.find((item) => item.candidate_id === "divergent").decision_frontier.model_coherence_warning, true);
});
