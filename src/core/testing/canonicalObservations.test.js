import test from "node:test";
import assert from "node:assert/strict";

import { buildCanonicalObservations } from "../intelligence/canonicalObservations.js";
import { buildMarketComponents } from "../intelligence/marketComponentAdapter.js";
import { buildMarketDistribution, generateCandidateLines } from "../intelligence/candidateLineGenerator.js";
import { buildDecisionFrontier } from "../intelligence/decisionFrontier.js";
import { estimatePreliminaryMarketProbability } from "../intelligence/preliminaryMarketModel.js";
import { buildSimpleSportsReasons, rankMarketCandidates } from "../intelligence/marketCandidateRanker.js";

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

function profilesForFamily(marketFamily, values) {
  const observations = values.map((value, index) => ({ fixture_id: index + 1, value }));
  const role = observations.slice(0, 5);
  const profile = {
    quality_status: "verified",
    last_5: { event_samples: { [marketFamily]: sample(role) } },
    last_10: { event_samples: { [marketFamily]: sample(observations) } },
    as_home: { event_samples: { [marketFamily]: sample(role) } },
    as_away: { event_samples: { [marketFamily]: sample(role) } },
  };
  return {
    leagueProfile: { quality_status: "verified", event_samples: { [marketFamily]: sample(observations) } },
    homeTeamProfile: structuredClone(profile),
    awayTeamProfile: structuredClone(profile),
  };
}

function canonicalWithSourceMemberships({ values, sourceMemberships }) {
  const sourceNames = ["league", "home_last_5", "home_last_10", "away_last_5", "away_last_10", "home_role", "away_role"];
  return {
    observations: values.map((value, index) => ({
      fixture_id: index + 1,
      value,
      effective_weight: 1 / values.length,
      memberships: (sourceMemberships[index] || []).map((source_name) => ({ source_name })),
    })),
    sources: sourceNames.map((name) => ({
      name,
      effective_weight: 1 / sourceNames.length,
      unique_fixture_count: values.filter((_, index) => (sourceMemberships[index] || []).includes(name)).length,
      raw_fixture_ids: values.flatMap((_, index) => (sourceMemberships[index] || []).includes(name) ? [index + 1] : []),
    })),
    fixture_ids: values.map((_, index) => index + 1),
    effective_sample_size: values.length,
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

test("canonical source evidence counts home-role Over hits without collapsing equal fixture values", () => {
  const canonical = canonicalWithSourceMemberships({
    values: [1, 2, 3, 2, 2, 2, 2, 2],
    sourceMemberships: [
      ["league", "home_last_5", "home_last_10", "away_last_5", "away_last_10", "home_role", "away_role"],
      ["league", "home_last_5", "home_last_10", "away_last_5", "away_last_10", "home_role", "away_role"],
      ["league", "home_last_5", "home_last_10", "away_last_5", "away_last_10", "home_role", "away_role"],
      ["league", "home_last_5", "home_last_10", "away_last_5", "away_last_10", "away_role"],
      ["league", "home_last_5", "home_last_10", "away_last_5", "away_last_10", "away_role"],
      ["league", "home_last_10", "away_last_10"],
      ["league", "home_last_10", "away_last_10"],
      ["league", "home_last_10", "away_last_10"],
    ],
  });
  const input = { marketFamily: "goals", ...profilesForFamily("goals", [2, 2, 2, 2, 2, 2, 2, 2]) };
  const probability = estimatePreliminaryMarketProbability({ ...input, selection: "Over 1.5", line: 1.5, canonicalObservations: canonical });
  const homeRole = probability.inputs_used.find((source) => source.source === "home_role");
  assert.deepEqual(homeRole, {
    source: "home_role", weight: 0.1429, sample_size: 3, hits: 2, observed_rate: 0.6667, raw_fixture_ids: [1, 2, 3],
  });
  const reasons = buildSimpleSportsReasons({
    market_family: "goals", selection: "Over 1.5", input_sources: probability.inputs_used,
  }, { homeTeamProfile: { team_name: "Local", as_home: { sample_size: 3 } } });
  assert.match(reasons.join(" "), /2 de 3 partidos \(66\.7%\)/);
});

test("equal numeric values from distinct canonical fixtures remain separate observations", () => {
  const canonical = canonicalWithSourceMemberships({
    values: [2, 2, 1, 2, 2, 2, 2, 2],
    sourceMemberships: Array.from({ length: 8 }, (_, index) => ["league", "away_last_10", ...(index < 3 ? ["home_role"] : [])]),
  });
  const input = { marketFamily: "goals", ...profilesForFamily("goals", Array(8).fill(2)) };
  const probability = estimatePreliminaryMarketProbability({ ...input, selection: "Over 1.5", line: 1.5, canonicalObservations: canonical });
  const homeRole = probability.inputs_used.find((source) => source.source === "home_role");
  assert.deepEqual([homeRole.hits, homeRole.sample_size, homeRole.observed_rate], [2, 3, 0.6667]);
});

test("a source without evaluable canonical observations stays unavailable descriptively", () => {
  const canonical = canonicalWithSourceMemberships({
    values: Array(8).fill(2),
    sourceMemberships: Array.from({ length: 8 }, () => ["league", "home_last_10", "away_last_10"]),
  });
  const input = { marketFamily: "goals", ...profilesForFamily("goals", Array(8).fill(2)) };
  const probability = estimatePreliminaryMarketProbability({ ...input, selection: "Over 1.5", line: 1.5, canonicalObservations: canonical });
  const homeRole = probability.inputs_used.find((source) => source.source === "home_role");
  assert.deepEqual([homeRole.hits, homeRole.observed_rate], [null, null]);
  const reasons = buildSimpleSportsReasons({ market_family: "goals", selection: "Over 1.5", input_sources: probability.inputs_used }, { homeTeamProfile: { team_name: "Local", as_home: { sample_size: 0 } } });
  assert.doesNotMatch(reasons.join(" "), /null de|0%|se dio en/i);
});

test("a canonical fixture counts once for each source it belongs to, including Under", () => {
  const canonical = canonicalWithSourceMemberships({
    values: [1, 2, 3, 2, 2, 2, 2, 2],
    sourceMemberships: [
      ["league", "home_last_5", "home_last_10", "home_role", "away_last_5", "away_last_10", "away_role"],
      ["league", "home_last_5", "home_last_10", "home_role", "away_last_5", "away_last_10", "away_role"],
      ["league", "home_last_5", "home_last_10", "home_role", "away_last_5", "away_last_10", "away_role"],
      ["league", "home_last_5", "home_last_10", "away_last_5", "away_last_10", "away_role"],
      ["league", "home_last_5", "home_last_10", "away_last_5", "away_last_10", "away_role"],
      ["league", "home_last_10", "away_last_10"],
      ["league", "home_last_10", "away_last_10"],
      ["league", "home_last_10", "away_last_10"],
    ],
  });
  const input = { marketFamily: "goals", ...profilesForFamily("goals", Array(8).fill(2)) };
  const probability = estimatePreliminaryMarketProbability({ ...input, selection: "Under 2.5", line: 2.5, canonicalObservations: canonical });
  const expected = {
    home_last_5: { sample_size: 5, hits: 4 },
    home_last_10: { sample_size: 8, hits: 7 },
    home_role: { sample_size: 3, hits: 2 },
  };
  for (const sourceName of Object.keys(expected)) {
    const source = probability.inputs_used.find((item) => item.source === sourceName);
    assert.equal(source.sample_size, expected[sourceName].sample_size);
    assert.equal(source.hits, expected[sourceName].hits);
  }
});

test("canonical descriptive counts use each market family's actual values, including yellow cards", () => {
  const cases = [
    ["goals", 1.5, [1, 2, 2, 1, 2, 2, 1, 2]],
    ["corners", 8.5, [8, 9, 9, 8, 9, 9, 8, 9]],
    ["total_shots", 24.5, [24, 25, 25, 24, 25, 25, 24, 25]],
    ["shots_on_goal", 7.5, [7, 8, 8, 7, 8, 8, 7, 8]],
    ["cards", 3.5, [3, 4, 4, 3, 4, 4, 3, 4]],
  ];
  for (const [marketFamily, line, values] of cases) {
    const input = { marketFamily, ...profilesForFamily(marketFamily, values) };
    const probability = estimatePreliminaryMarketProbability({
      ...input,
      selection: `Over ${line}`,
      line,
      allowLimitedReferee: marketFamily === "cards",
      canonicalObservations: buildCanonicalObservations(input),
    });
    const league = probability.inputs_used.find((source) => source.source === "league");
    assert.deepEqual([league.hits, league.sample_size, league.observed_rate], [5, 8, 0.625]);
  }
});

test("descriptive source counts do not change the established model or ranking output", () => {
  const input = { marketFamily: "goals", ...profiles() };
  const probability = estimatePreliminaryMarketProbability({ ...input, selection: "Over 2.5", line: 2.5 });
  assert.deepEqual(
    {
      point_estimate: probability.point_estimate,
      uncertainty_low: probability.uncertainty_low,
      uncertainty_high: probability.uncertainty_high,
      sample_size_effective: probability.sample_size_effective,
      distribution: probability.canonical_threshold_distribution,
    },
    {
      point_estimate: 0.445,
      uncertainty_low: 0.2052,
      uncertainty_high: 0.7134,
      sample_size_effective: 7.6775,
      distribution: {
        market_family: "goals", line: 2.5, over_probability: 0.445, under_probability: 0.555,
        effective_sample_size: 7.6775,
        source_sample_sizes: [
          { source: "league", sample_size: 10 }, { source: "home_last_5", sample_size: 5 }, { source: "home_last_10", sample_size: 10 },
          { source: "away_last_5", sample_size: 5 }, { source: "away_last_10", sample_size: 10 }, { source: "home_role", sample_size: 5 }, { source: "away_role", sample_size: 5 },
        ],
        fixture_ids: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      },
    }
  );
  const candidate = generateCandidateLines(input).candidates.find((item) => item.direction === "over" && item.line === 2.5);
  const ranked = rankMarketCandidates([candidate])[0];
  assert.deepEqual(
    { probability: candidate.preliminary_probability, direction: candidate.direction, line: candidate.line, mean: candidate.projected_mean, dispersion: candidate.dispersion, sports_score: ranked.sports_score, rank: ranked.rank, overall_rank: ranked.overall_rank },
    { probability: 0.445, direction: "over", line: 2.5, mean: 2.44, dispersion: 0.75, sports_score: 58.6, rank: 1, overall_rank: 1 }
  );
});
