import {
  QUALITY_STATUS,
  createRefereeProfile,
} from "../contracts/sportsIntelligenceContracts.js";
import {
  average,
  fixtureStatTotal,
  round,
  statisticsForFixture,
  teamStatistics,
  numericStat,
} from "./intelligenceUtils.js";

export function normalizeRefereeName(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function refereeWindow(fixtures, statisticsByFixture, size) {
  const sample = fixtures.slice(0, size);
  const aggregate = (key) =>
    round(
      average(
        sample.map((fixture) =>
          fixtureStatTotal(
            statisticsForFixture(statisticsByFixture, fixture.fixtureId),
            key
          )
        )
      )
    );
  return {
    sample_size: sample.length,
    fixture_ids: sample.map((fixture) => fixture.fixtureId),
    yellow_cards_per_match: aggregate("yellow_cards"),
    red_cards_per_match: aggregate("red_cards"),
    fouls_per_match: aggregate("fouls"),
  };
}

export function buildRefereeIntelligence({
  fixture,
  historicalFixtures = [],
  statisticsByFixture = new Map(),
  leagueProfile = null,
  minimumSample = 5,
}) {
  const refereeName = fixture?.referee?.name || null;
  const normalizedName = normalizeRefereeName(refereeName || "");
  if (!refereeName) {
    return createRefereeProfile({
      status: "missing",
      qualityStatus: QUALITY_STATUS.UNAVAILABLE,
      warnings: ["El árbitro no está confirmado para el fixture."],
    });
  }

  const matching = historicalFixtures
    .filter(
      (item) =>
        item?.status?.isFinished &&
        normalizeRefereeName(item?.referee?.name || "") === normalizedName
    )
    .sort((left, right) => Date.parse(right.date.utc) - Date.parse(left.date.utc))
    .slice(0, 20);
  const withStatistics = matching.filter((item) =>
    statisticsForFixture(statisticsByFixture, item.fixtureId)
  );
  const values = (key) =>
    withStatistics
      .map((item) =>
        fixtureStatTotal(
          statisticsForFixture(statisticsByFixture, item.fixtureId),
          key
        )
      )
      .filter(Number.isFinite);
  const homeYellow = [];
  const awayYellow = [];
  for (const item of withStatistics) {
    const statistics = statisticsForFixture(statisticsByFixture, item.fixtureId);
    const home = teamStatistics(statistics, item.teams.home.id);
    const away = teamStatistics(statistics, item.teams.away.id);
    const homeValue = numericStat(home, "yellow_cards");
    const awayValue = numericStat(away, "yellow_cards");
    if (Number.isFinite(homeValue)) homeYellow.push(homeValue);
    if (Number.isFinite(awayValue)) awayYellow.push(awayValue);
  }
  const yellow = round(average(values("yellow_cards")));
  const cardSamples = values("yellow_cards");
  const leagueYellow = leagueProfile?.metrics?.yellow_cards_per_match;
  const comparable =
    leagueYellow?.coverage_status === QUALITY_STATUS.VERIFIED &&
    withStatistics.length >= minimumSample;

  return createRefereeProfile({
    refereeName,
    normalizedName,
    status: fixture?.referee?.confirmed ? "confirmed" : "probable",
    matchesInSample: withStatistics.length,
    windowStart: matching.at(-1)?.date?.utc || null,
    windowEnd: matching[0]?.date?.utc || null,
    competitionsIncluded: [
      ...new Set(matching.map((item) => item.competition.id).filter(Boolean)),
    ],
    yellowCardsPerMatch: yellow,
    redCardsPerMatch: round(average(values("red_cards"))),
    foulsPerMatch: round(average(values("fouls"))),
    penaltiesPerMatch: round(average(values("penalties"))),
    homeAwayDistribution: {
      home_yellow_cards_per_match: round(average(homeYellow)),
      away_yellow_cards_per_match: round(average(awayYellow)),
    },
    last5: refereeWindow(withStatistics, statisticsByFixture, 5),
    last10: refereeWindow(withStatistics, statisticsByFixture, 10),
    last20: refereeWindow(withStatistics, statisticsByFixture, 20),
    leagueComparison: comparable
      ? {
          compatible: true,
          referee_yellow_cards_per_match: yellow,
          league_yellow_cards_per_match: leagueYellow.value,
          difference: round(yellow - leagueYellow.value),
        }
      : { compatible: false, reason: "Muestras o cobertura no compatibles." },
    sampleSize: withStatistics.length,
    freshness: matching[0]?.date?.utc || null,
    qualityStatus:
      withStatistics.length === 0
        ? QUALITY_STATUS.UNAVAILABLE
        : withStatistics.length < minimumSample
          ? QUALITY_STATUS.INSUFFICIENT_SAMPLE
          : QUALITY_STATUS.VERIFIED,
    sourceRefs: withStatistics.map(
      (item) => `fixture-statistics:${item.fixtureId}`
    ),
    warnings: [
      ...(withStatistics.length < minimumSample
        ? [`Histórico arbitral insuficiente: ${withStatistics.length}/${minimumSample}.`]
        : []),
      ...(!comparable
        ? ["No se compara contra la liga con coberturas incompatibles."]
        : []),
    ],
    eventSamples: { cards: { match_totals: cardSamples } },
  });
}
