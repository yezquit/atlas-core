import {
  QUALITY_STATUS,
  createTeamRecentProfile,
} from "../contracts/sportsIntelligenceContracts.js";
import {
  average,
  finishedBefore,
  numericStat,
  round,
  statisticsForFixture,
  teamStatistics,
} from "./intelligenceUtils.js";

function summarize(teamId, fixtures, statisticsByFixture) {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  const goalsFor = [];
  const goalsAgainst = [];
  const detailed = {
    total_shots: [],
    shots_on_goal: [],
    yellow_cards: [],
    red_cards: [],
    fouls: [],
    corner_kicks: [],
    ball_possession: [],
  };
  const form = [];

  for (const fixture of fixtures) {
    const isHome = Number(fixture.teams.home.id) === Number(teamId);
    const own = isHome ? fixture.score.goals.home : fixture.score.goals.away;
    const opponent = isHome ? fixture.score.goals.away : fixture.score.goals.home;
    if (!Number.isFinite(own) || !Number.isFinite(opponent)) continue;
    goalsFor.push(own);
    goalsAgainst.push(opponent);
    if (own > opponent) {
      wins += 1;
      form.push("W");
    } else if (own === opponent) {
      draws += 1;
      form.push("D");
    } else {
      losses += 1;
      form.push("L");
    }
    const team = teamStatistics(
      statisticsForFixture(statisticsByFixture, fixture.fixtureId),
      teamId
    );
    for (const key of Object.keys(detailed)) {
      const value = numericStat(team, key);
      if (Number.isFinite(value)) detailed[key].push(value);
    }
  }

  const sampleSize = goalsFor.length;
  const fixtureTimes = fixtures
    .map((fixture) => Date.parse(fixture.date.utc))
    .filter(Number.isFinite)
    .sort((left, right) => right - left);
  const restIntervals = fixtureTimes
    .slice(0, -1)
    .map((time, index) => (time - fixtureTimes[index + 1]) / 86_400_000)
    .filter((days) => days >= 0);
  const rate = (predicate) =>
    sampleSize > 0
      ? round(
          fixtures.filter((fixture) => {
            const total = fixture.score.goals.home + fixture.score.goals.away;
            return Number.isFinite(total) && predicate(fixture, total);
          }).length / sampleSize
        )
      : null;

  return {
    sample_size: sampleSize,
    fixture_ids: fixtures.map((fixture) => fixture.fixtureId),
    wins,
    draws,
    losses,
    goals_for_per_match: round(average(goalsFor)),
    goals_against_per_match: round(average(goalsAgainst)),
    over_1_5: rate((_fixture, total) => total > 1.5),
    over_2_5: rate((_fixture, total) => total > 2.5),
    under_2_5: rate((_fixture, total) => total < 2.5),
    both_teams_score: rate(
      (fixture) => fixture.score.goals.home > 0 && fixture.score.goals.away > 0
    ),
    total_shots_per_match: round(average(detailed.total_shots)),
    shots_on_goal_per_match: round(average(detailed.shots_on_goal)),
    yellow_cards_per_match: round(average(detailed.yellow_cards)),
    red_cards_per_match: round(average(detailed.red_cards)),
    fouls_per_match: round(average(detailed.fouls)),
    corners_per_match: round(average(detailed.corner_kicks)),
    possession_average: round(average(detailed.ball_possession)),
    detailed_sample_size: Math.max(...Object.values(detailed).map((values) => values.length), 0),
    average_rest_days: round(average(restIntervals), 1),
    streak: form.join(""),
  };
}

export function buildTeamRecentIntelligence({
  teamId,
  teamName,
  season,
  targetDate,
  fixtures = [],
  statisticsByFixture = new Map(),
  minimumSample = 5,
}) {
  const recent = finishedBefore(fixtures, targetDate, season).filter(
    (fixture) =>
      Number(fixture?.teams?.home?.id) === Number(teamId) ||
      Number(fixture?.teams?.away?.id) === Number(teamId)
  ).slice(0, 10);
  const asHome = recent.filter(
    (fixture) => Number(fixture.teams.home.id) === Number(teamId)
  );
  const asAway = recent.filter(
    (fixture) => Number(fixture.teams.away.id) === Number(teamId)
  );
  const general = summarize(teamId, recent, statisticsByFixture);
  const last5 = summarize(teamId, recent.slice(0, 5), statisticsByFixture);
  const last10 = summarize(teamId, recent.slice(0, 10), statisticsByFixture);
  const warnings = [];
  if (recent.length < minimumSample) {
    warnings.push(`Muestra reciente insuficiente: ${recent.length}/${minimumSample}.`);
  }
  if (general.detailed_sample_size === 0 && recent.length > 0) {
    warnings.push(
      "Se conservan resultados básicos; las estadísticas detalladas están unavailable."
    );
  }

  return createTeamRecentProfile({
    teamId,
    teamName,
    season,
    windowStart: recent.at(-1)?.date?.utc || null,
    windowEnd: recent[0]?.date?.utc || null,
    fixtureIds: recent.map((fixture) => fixture.fixtureId),
    sampleSize: recent.length,
    last5,
    last10,
    general,
    asHome: summarize(teamId, asHome, statisticsByFixture),
    asAway: summarize(teamId, asAway, statisticsByFixture),
    qualityStatus:
      recent.length === 0
        ? QUALITY_STATUS.UNAVAILABLE
        : recent.length < minimumSample
          ? QUALITY_STATUS.INSUFFICIENT_SAMPLE
          : general.detailed_sample_size === 0
            ? QUALITY_STATUS.PARTIAL
            : QUALITY_STATUS.VERIFIED,
    sourceRefs: recent.map((fixture) => `fixture:${fixture.fixtureId}`),
    warnings,
  });
}
