import {
  QUALITY_STATUS,
  createLeagueProfile,
  createMetric,
} from "../contracts/sportsIntelligenceContracts.js";
import {
  average,
  buildMetric,
  deviation,
  fixtureStatTotal,
  rateMetric,
  round,
  statisticsForFixture,
} from "./intelligenceUtils.js";

export const LEAGUE_PROFILE_THRESHOLDS = Object.freeze({
  version: "league-v1",
  minimumSample: 8,
  highScoring: 2.8,
  lowScoring: 2.1,
  highDrawRate: 0.3,
  strongHomeAdvantageGap: 0.15,
  highDisciplineYellowCards: 5,
  highShotVolume: 24,
  volatileGoalsDeviation: 1.8,
  closeScoreMargin: 1,
});

function scoreValues(fixtures) {
  return fixtures.map((fixture) => ({
    fixture,
    home: fixture?.score?.goals?.home,
    away: fixture?.score?.goals?.away,
  })).filter(({ home, away }) => Number.isFinite(home) && Number.isFinite(away));
}

function scoreAverageMetric(scores, selector, minimumSample) {
  return buildMetric(
    scores.map(selector),
    scores.map(({ fixture }) => `fixture:${fixture.fixtureId}`),
    minimumSample
  );
}

function detailedMetric(fixtures, statisticsByFixture, key, minimumSample) {
  const values = [];
  const refs = [];
  for (const fixture of fixtures) {
    const value = fixtureStatTotal(
      statisticsForFixture(statisticsByFixture, fixture.fixtureId),
      key
    );
    if (Number.isFinite(value)) {
      values.push(value);
      refs.push(`fixture-statistics:${fixture.fixtureId}`);
    }
  }
  return buildMetric(values, refs, minimumSample);
}

export function buildLeagueIntelligence({
  competition,
  season,
  windowStart,
  windowEnd,
  fixtures = [],
  statisticsByFixture = new Map(),
  coverage = null,
  minimumSample = LEAGUE_PROFILE_THRESHOLDS.minimumSample,
  generatedAt,
}) {
  const included = fixtures
    .filter(
      (fixture) =>
        fixture?.status?.isFinished &&
        Number(fixture?.competition?.id) === Number(competition?.id) &&
        Number(fixture?.competition?.season) === Number(season)
    )
    .sort((left, right) => Date.parse(left.date.utc) - Date.parse(right.date.utc));
  const scores = scoreValues(included);
  const scoreFixtures = scores.map(({ fixture }) => fixture);
  const scoreRefs = scores.map(({ fixture }) => `fixture:${fixture.fixtureId}`);
  const goalsPerMatch = scoreAverageMetric(scores, ({ home, away }) => home + away, minimumSample);
  const homeWinRate = rateMetric(scoreFixtures, (fixture) => fixture.score.goals.home > fixture.score.goals.away, minimumSample);
  const awayWinRate = rateMetric(scoreFixtures, (fixture) => fixture.score.goals.away > fixture.score.goals.home, minimumSample);

  const metrics = {
    matches_included: createMetric({
      value: included.length,
      sampleSize: included.length,
      coverageStatus:
        included.length >= minimumSample
          ? QUALITY_STATUS.VERIFIED
          : included.length > 0
            ? QUALITY_STATUS.INSUFFICIENT_SAMPLE
            : QUALITY_STATUS.UNAVAILABLE,
      sourceRefs: included.map((fixture) => `fixture:${fixture.fixtureId}`),
      warning:
        included.length > 0 && included.length < minimumSample
          ? `No se redactan conclusiones: se requieren al menos ${minimumSample} partidos.`
          : null,
    }),
    goals_per_match: goalsPerMatch,
    home_goals_per_match: scoreAverageMetric(scores, ({ home }) => home, minimumSample),
    away_goals_per_match: scoreAverageMetric(scores, ({ away }) => away, minimumSample),
    over_1_5: rateMetric(scoreFixtures, (fixture) => fixture.score.goals.home + fixture.score.goals.away > 1.5, minimumSample),
    over_2_5: rateMetric(scoreFixtures, (fixture) => fixture.score.goals.home + fixture.score.goals.away > 2.5, minimumSample),
    over_3_5: rateMetric(scoreFixtures, (fixture) => fixture.score.goals.home + fixture.score.goals.away > 3.5, minimumSample),
    under_2_5: rateMetric(scoreFixtures, (fixture) => fixture.score.goals.home + fixture.score.goals.away < 2.5, minimumSample),
    both_teams_score: rateMetric(scoreFixtures, (fixture) => fixture.score.goals.home > 0 && fixture.score.goals.away > 0, minimumSample),
    home_wins: homeWinRate,
    draws: rateMetric(scoreFixtures, (fixture) => fixture.score.goals.home === fixture.score.goals.away, minimumSample),
    away_wins: awayWinRate,
    yellow_cards_per_match: detailedMetric(included, statisticsByFixture, "yellow_cards", minimumSample),
    red_cards_per_match: detailedMetric(included, statisticsByFixture, "red_cards", minimumSample),
    fouls_per_match: detailedMetric(included, statisticsByFixture, "fouls", minimumSample),
    corners_per_match: detailedMetric(included, statisticsByFixture, "corner_kicks", minimumSample),
    total_shots_per_match: detailedMetric(included, statisticsByFixture, "total_shots", minimumSample),
    shots_on_goal_per_match: detailedMetric(included, statisticsByFixture, "shots_on_goal", minimumSample),
    possession_home_share: buildMetric(
      included.map((fixture) => {
        const statistics = statisticsForFixture(statisticsByFixture, fixture.fixtureId);
        const home = statistics?.teams?.find(
          (item) => Number(item.team.id) === Number(fixture.teams.home.id)
        );
        const value = home?.statistics?.ball_possession?.value;
        return Number.isFinite(value) ? value : null;
      }),
      included.map((fixture) => `fixture-statistics:${fixture.fixtureId}`),
      minimumSample,
      "La posesión representa el promedio del equipo local, no una comparación entre ligas."
    ),
    result_volatility: createMetric({
      value: round(deviation(scores.map(({ home, away }) => home + away))),
      sampleSize: scores.length,
      coverageStatus:
        scores.length >= minimumSample
          ? QUALITY_STATUS.VERIFIED
          : scores.length > 0
            ? QUALITY_STATUS.INSUFFICIENT_SAMPLE
            : QUALITY_STATUS.UNAVAILABLE,
      sourceRefs: scoreRefs,
      warning:
        scores.length > 0 && scores.length < minimumSample
          ? `Muestra inferior al mínimo documentado de ${minimumSample}.`
          : null,
    }),
    close_scores: rateMetric(
      scoreFixtures,
      (fixture) =>
        Math.abs(fixture.score.goals.home - fixture.score.goals.away) <=
        LEAGUE_PROFILE_THRESHOLDS.closeScoreMargin,
      minimumSample
    ),
  };

  const sufficient = included.length >= minimumSample;
  const labels = [];
  if (!sufficient) {
    labels.push("insufficient_sample");
  } else {
    if (goalsPerMatch.value >= LEAGUE_PROFILE_THRESHOLDS.highScoring) labels.push("high_scoring");
    if (goalsPerMatch.value <= LEAGUE_PROFILE_THRESHOLDS.lowScoring) labels.push("low_scoring");
    if (metrics.draws.value >= LEAGUE_PROFILE_THRESHOLDS.highDrawRate) labels.push("high_draw_rate");
    if (
      homeWinRate.value - awayWinRate.value >=
      LEAGUE_PROFILE_THRESHOLDS.strongHomeAdvantageGap
    ) labels.push("strong_home_advantage");
    if (
      metrics.yellow_cards_per_match.coverage_status === QUALITY_STATUS.VERIFIED &&
      metrics.yellow_cards_per_match.value >=
        LEAGUE_PROFILE_THRESHOLDS.highDisciplineYellowCards
    ) labels.push("high_discipline_activity");
    if (
      metrics.total_shots_per_match.coverage_status === QUALITY_STATUS.VERIFIED &&
      metrics.total_shots_per_match.value >= LEAGUE_PROFILE_THRESHOLDS.highShotVolume
    ) labels.push("high_shot_volume");
    if (
      metrics.result_volatility.value >=
      LEAGUE_PROFILE_THRESHOLDS.volatileGoalsDeviation
    ) labels.push("volatile");
  }

  const unavailableMetrics = Object.entries(metrics)
    .filter(([, metric]) => metric.coverage_status === QUALITY_STATUS.UNAVAILABLE)
    .map(([key]) => key);
  const detailedCovered = Object.values(metrics).filter(
    (metric) => metric.coverage_status === QUALITY_STATUS.VERIFIED
  ).length;
  const eventSamples = {
    goals: {
      match_totals: scores.map(({ home, away }) => home + away),
    },
    total_shots: {
      match_totals: included.map((fixture) => fixtureStatTotal(statisticsForFixture(statisticsByFixture, fixture.fixtureId), "total_shots")).filter(Number.isFinite),
    },
    shots_on_goal: {
      match_totals: included.map((fixture) => fixtureStatTotal(statisticsForFixture(statisticsByFixture, fixture.fixtureId), "shots_on_goal")).filter(Number.isFinite),
    },
    cards: {
      match_totals: included.map((fixture) => fixtureStatTotal(statisticsForFixture(statisticsByFixture, fixture.fixtureId), "yellow_cards")).filter(Number.isFinite),
    },
    corners: {
      match_totals: included.map((fixture) => fixtureStatTotal(statisticsForFixture(statisticsByFixture, fixture.fixtureId), "corner_kicks")).filter(Number.isFinite),
    },
  };

  return createLeagueProfile({
    competitionId: competition?.id,
    competitionName: competition?.localName || competition?.name,
    season,
    windowStart,
    windowEnd,
    sampleSize: included.length,
    generatedAt,
    coverage,
    metrics,
    unavailableMetrics,
    qualityStatus:
      included.length === 0
        ? QUALITY_STATUS.UNAVAILABLE
        : !sufficient
          ? QUALITY_STATUS.INSUFFICIENT_SAMPLE
          : detailedCovered < Object.keys(metrics).length
            ? QUALITY_STATUS.PARTIAL
            : QUALITY_STATUS.VERIFIED,
    labels,
    warnings: [
      ...(!sufficient
        ? [`Muestra insuficiente: ${included.length}/${minimumSample} partidos.`]
        : []),
      ...(unavailableMetrics.length > 0
        ? ["Las métricas sin cobertura no se imputan ni se comparan."]
        : []),
    ],
    sourceRefs: included.map((fixture) => `fixture:${fixture.fixtureId}`),
    thresholdsVersion: LEAGUE_PROFILE_THRESHOLDS.version,
    eventSamples,
  });
}
