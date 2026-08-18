import { QUALITY_STATUS, createMetric } from "../contracts/sportsIntelligenceContracts.js";

export function round(value, precision = 3) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function average(values = []) {
  const numeric = values.filter(Number.isFinite);
  if (numeric.length === 0) return null;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

export function deviation(values = []) {
  const mean = average(values);
  if (mean === null) return null;
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

export function statisticsForFixture(statisticsByFixture, fixtureId) {
  if (!statisticsByFixture) return null;
  return statisticsByFixture instanceof Map
    ? statisticsByFixture.get(fixtureId) || null
    : statisticsByFixture[fixtureId] || null;
}

export function numericStat(teamStatistics, key) {
  const value = teamStatistics?.statistics?.[key]?.value;
  return Number.isFinite(value) ? value : null;
}

export function fixtureStatTotal(statistics, key) {
  if (!statistics?.teams?.length) return null;
  const values = statistics.teams.map((team) => numericStat(team, key));
  if (values.some((value) => value === null)) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

export function teamStatistics(statistics, teamId) {
  return (
    statistics?.teams?.find((item) => Number(item?.team?.id) === Number(teamId)) ||
    null
  );
}

export function buildMetric(values, sourceRefs, minimumSample, warning = null) {
  const numeric = values.filter(Number.isFinite);
  const coverageStatus =
    numeric.length === 0
      ? QUALITY_STATUS.UNAVAILABLE
      : numeric.length < minimumSample
        ? QUALITY_STATUS.INSUFFICIENT_SAMPLE
        : numeric.length === values.length
          ? QUALITY_STATUS.VERIFIED
          : QUALITY_STATUS.PARTIAL;
  return createMetric({
    value: average(numeric) === null ? null : round(average(numeric)),
    sampleSize: numeric.length,
    coverageStatus,
    sourceRefs: sourceRefs.slice(0, numeric.length),
    warning:
      warning ||
      (numeric.length > 0 && numeric.length < minimumSample
        ? `Muestra inferior al mínimo documentado de ${minimumSample}.`
        : null),
  });
}

export function rateMetric(fixtures, predicate, minimumSample) {
  const sampleSize = fixtures.length;
  const refs = fixtures.map((fixture) => `fixture:${fixture.fixtureId}`);
  return createMetric({
    value:
      sampleSize > 0
        ? round(fixtures.filter(predicate).length / sampleSize)
        : null,
    sampleSize,
    coverageStatus:
      sampleSize === 0
        ? QUALITY_STATUS.UNAVAILABLE
        : sampleSize < minimumSample
          ? QUALITY_STATUS.INSUFFICIENT_SAMPLE
          : QUALITY_STATUS.VERIFIED,
    sourceRefs: refs,
    warning:
      sampleSize > 0 && sampleSize < minimumSample
        ? `Muestra inferior al mínimo documentado de ${minimumSample}.`
        : null,
  });
}

export function finishedBefore(fixtures, targetDate, season = null) {
  const targetTime = Date.parse(targetDate);
  return fixtures
    .filter((fixture) => {
      const fixtureTime = Date.parse(fixture?.date?.utc);
      const seasonMatches =
        season === null ||
        season === undefined ||
        Number(fixture?.competition?.season) === Number(season);

      return (
        fixture?.status?.isFinished &&
        seasonMatches &&
        Number.isFinite(fixtureTime) &&
        fixtureTime < targetTime
      );
    })
    .sort((left, right) => Date.parse(right.date.utc) - Date.parse(left.date.utc));
}
