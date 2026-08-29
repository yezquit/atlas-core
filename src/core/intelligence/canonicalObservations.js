const SOURCES = Object.freeze([
  ["league", 0.25, (i) => i.leagueProfile?.event_samples],
  ["home_last_5", 0.1, (i) => i.homeTeamProfile?.last_5?.event_samples],
  ["home_last_10", 0.1, (i) => i.homeTeamProfile?.last_10?.event_samples],
  ["away_last_5", 0.1, (i) => i.awayTeamProfile?.last_5?.event_samples],
  ["away_last_10", 0.1, (i) => i.awayTeamProfile?.last_10?.event_samples],
  ["home_role", 0.175, (i) => i.homeTeamProfile?.as_home?.event_samples],
  ["away_role", 0.175, (i) => i.awayTeamProfile?.as_away?.event_samples],
]);
const minimum = (name) => name === "league" ? 8 : name.endsWith("last_5") ? 3 : name.endsWith("last_10") ? 5 : 2;
const numeric = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
const mean = (xs) => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
export function buildCanonicalObservations(input = {}) {
  const family = input.marketFamily; const byFixture = new Map(); const sources = [];
  for (const [name, requested_weight, pick] of SOURCES) {
    const sample = pick(input)?.[family] || {}; const observations = (sample.observations || sample.match_totals?.map((value, index) => ({ fixture_id: `${name}:legacy:${index}`, value })) || [])
      .map((o) => ({ fixture_id: o.fixture_id ?? o.fixtureId, value: numeric(o.value) })).filter((o) => o.fixture_id !== null && o.fixture_id !== undefined && o.value !== null);
    if (observations.length < minimum(name)) continue;
    sources.push({ name, requested_weight, raw_fixture_ids: observations.map((o) => o.fixture_id), raw_sample_size: observations.length, raw_center: mean(observations.map((o) => o.value)) });
    for (const observation of observations) {
      const current = byFixture.get(String(observation.fixture_id)) || { fixture_id: observation.fixture_id, value: observation.value, memberships: [] };
      current.memberships.push({ source_name: name, requested_weight, contribution: requested_weight / observations.length }); byFixture.set(String(observation.fixture_id), current);
    }
  }
  const observations = [...byFixture.values()]; const total = observations.reduce((sum, o) => sum + o.memberships.reduce((s,m)=>s+m.contribution,0), 0) || 1;
  for (const o of observations) o.effective_weight = o.memberships.reduce((s,m)=>s+m.contribution,0) / total;
  const center = observations.reduce((s,o)=>s+o.value*o.effective_weight,0);
  const variance = observations.reduce((s,o)=>s+o.effective_weight*((o.value-center)**2),0);
  const effective_sample_size = 1 / (observations.reduce((s,o)=>s+(o.effective_weight**2),0) || 1);
  return { contract: "CanonicalObservations", version: 1, market_family: family, observations, fixture_ids: observations.map((o)=>o.fixture_id), sources: sources.map((s)=>({ ...s, unique_fixture_count: new Set(s.raw_fixture_ids).size, effective_weight: s.requested_weight / (sources.reduce((n,x)=>n+x.requested_weight,0)||1), weighted_contribution: s.raw_center === null ? null : s.raw_center * s.requested_weight / (sources.reduce((n,x)=>n+x.requested_weight,0)||1) })), distribution_center: center, distribution_dispersion: Math.sqrt(variance), effective_sample_size };
}
