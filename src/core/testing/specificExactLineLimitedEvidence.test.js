import test from "node:test";
import assert from "node:assert/strict";

import { buildCanonicalObservations } from "../intelligence/canonicalObservations.js";
import { evaluateExactMarketLine, generateCandidateLines } from "../intelligence/candidateLineGenerator.js";
import { rankMarketCandidates } from "../intelligence/marketCandidateRanker.js";

const family = "total_shots";
const sample = (observations) => ({ [family]: { observations, match_totals: observations.map((item) => item.value) } });
const scope = (observations) => ({ event_samples: sample(observations) });

function limitedContext() {
  const league = [{ fixture_id: 1, value: 20 }, { fixture_id: 2, value: 24 }];
  const home = [{ fixture_id: 1, value: 20 }, { fixture_id: 3, value: 25 }];
  const away = [{ fixture_id: 2, value: 24 }, { fixture_id: 4, value: 23 }];
  return {
    leagueProfile: { quality_status: "insufficient_sample", event_samples: sample(league) },
    homeTeamProfile: {
      quality_status: "insufficient_sample",
      last_5: scope(home), last_10: scope(home), as_home: scope([{ fixture_id: 1, value: 20 }]),
    },
    awayTeamProfile: {
      quality_status: "insufficient_sample",
      last_5: scope(away), last_10: scope(away), as_away: scope([{ fixture_id: 2, value: 24 }]),
    },
    refereeProfile: { quality_status: "unavailable" },
  };
}

test("specific calcula total_shots over 21.5 con fuentes sub-threshold", () => {
  const exact = evaluateExactMarketLine({
    marketFamily: family, direction: "over", line: 21.5,
    ...limitedContext(), allowSpecificLimitedSample: true,
  });
  const ranked = rankMarketCandidates([exact.candidate]);
  assert.equal(exact.status, "ready_for_pricing");
  assert.equal(ranked[0].market_family, family);
  assert.equal(ranked[0].direction, "over");
  assert.equal(ranked[0].line, 21.5);
  assert.ok(Number.isFinite(ranked[0].estimated_probability));
  assert.ok(Number.isFinite(ranked[0].sports_score));
});

test("specific deduplica fixture físico sin eliminar fixtures con el mismo valor", () => {
  const canonical = buildCanonicalObservations(
    { marketFamily: family, ...limitedContext() },
    { allowSubthresholdSources: true },
  );
  assert.deepEqual(new Set(canonical.fixture_ids), new Set([1, 2, 3, 4]));
  assert.equal(canonical.observations.length, 4);
  assert.equal(canonical.observations.find((item) => item.fixture_id === 1).memberships.filter((item) => item.source_name === "home_last_5").length, 1);
});

test("general conserva los mínimos canónicos y no amplía elegibilidad", () => {
  const generated = generateCandidateLines({ marketFamily: family, ...limitedContext() });
  assert.equal(generated.distribution, null);
  assert.deepEqual(generated.candidates, []);
  assert.equal(generated.reason, "insufficient_distribution_data");
});
