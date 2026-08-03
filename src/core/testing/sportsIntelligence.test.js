import test from "node:test";
import assert from "node:assert/strict";

import { QUALITY_STATUS, WEATHER_STATUS } from "../contracts/sportsIntelligenceContracts.js";
import { buildLeagueIntelligence } from "../intelligence/leagueIntelligence.js";
import { buildRefereeIntelligence } from "../intelligence/refereeIntelligence.js";
import { buildTeamRecentIntelligence } from "../intelligence/teamRecentIntelligence.js";
import { buildVenueWeatherContext } from "../intelligence/venueWeatherContext.js";

const competition = {
  id: 239,
  name: "Primera A",
  localName: "Colombia Primera A",
};

function fixture(index, overrides = {}) {
  const home = index % 2 === 0 ? 10 : 20;
  const away = home === 10 ? 20 : 10;
  return {
    fixtureId: 1_000 + index,
    competition: {
      id: overrides.competitionId ?? 239,
      name: "Primera A",
      country: "Colombia",
      season: overrides.season ?? 2026,
    },
    date: {
      utc: overrides.date || `2026-07-${String(index + 1).padStart(2, "0")}T20:00:00Z`,
    },
    status: { isFinished: overrides.finished ?? true },
    teams: {
      home: { id: home, name: home === 10 ? "Local" : "Visitante" },
      away: { id: away, name: away === 10 ? "Local" : "Visitante" },
    },
    score: {
      goals: {
        home: overrides.homeGoals ?? (index % 3) + 1,
        away: overrides.awayGoals ?? index % 2,
      },
    },
    referee: {
      name: overrides.referee === undefined ? "Ana Ruiz" : overrides.referee,
      confirmed: overrides.referee !== null,
    },
    venue: { name: "Estadio Central", city: "Bogotá" },
  };
}

function statistics(item) {
  return {
    teams: [
      {
        team: { id: item.teams.home.id, name: item.teams.home.name },
        statistics: {
          yellow_cards: { value: 2 },
          red_cards: { value: 0 },
          fouls: { value: 11 },
          corner_kicks: { value: 5 },
          total_shots: { value: 13 },
          shots_on_goal: { value: 5 },
          ball_possession: { value: 54 },
        },
      },
      {
        team: { id: item.teams.away.id, name: item.teams.away.name },
        statistics: {
          yellow_cards: { value: 3 },
          red_cards: { value: 0 },
          fouls: { value: 13 },
          corner_kicks: { value: 4 },
          total_shots: { value: 10 },
          shots_on_goal: { value: 4 },
          ball_possession: { value: 46 },
        },
      },
    ],
  };
}

const fixtures = Array.from({ length: 10 }, (_, index) => fixture(index));
const statisticsByFixture = new Map(
  fixtures.map((item) => [item.fixtureId, statistics(item)])
);

test("perfil de liga con muestra suficiente", () => {
  const profile = buildLeagueIntelligence({
    competition,
    season: 2026,
    windowStart: "2026-07-01",
    windowEnd: "2026-07-31",
    fixtures,
    statisticsByFixture,
  });

  assert.equal(profile.sample_size, 10);
  assert.notEqual(profile.quality_status, QUALITY_STATUS.INSUFFICIENT_SAMPLE);
  assert.equal(profile.metrics.goals_per_match.sample_size, 10);
  assert.equal(profile.metrics.yellow_cards_per_match.value, 5);
});

test("perfil de liga con muestra insuficiente no redacta etiquetas deportivas", () => {
  const profile = buildLeagueIntelligence({
    competition,
    season: 2026,
    windowStart: "2026-07-01",
    windowEnd: "2026-07-03",
    fixtures: fixtures.slice(0, 3),
    statisticsByFixture,
  });

  assert.equal(profile.quality_status, QUALITY_STATUS.INSUFFICIENT_SAMPLE);
  assert.deepEqual(profile.labels, ["insufficient_sample"]);
});

test("métricas sin estadísticas quedan unavailable", () => {
  const profile = buildLeagueIntelligence({
    competition,
    season: 2026,
    fixtures,
    statisticsByFixture: new Map(),
  });

  assert.equal(
    profile.metrics.total_shots_per_match.coverage_status,
    QUALITY_STATUS.UNAVAILABLE
  );
  assert.ok(profile.unavailable_metrics.includes("total_shots_per_match"));
});

test("forma reciente expone exactamente los últimos 5", () => {
  const profile = buildTeamRecentIntelligence({
    teamId: 10,
    teamName: "Local",
    season: 2026,
    targetDate: "2026-08-01T00:00:00Z",
    fixtures,
    statisticsByFixture,
  });

  assert.equal(profile.last_5.sample_size, 5);
  assert.equal(profile.last_5.fixture_ids.length, 5);
});

test("forma reciente expone los últimos 10", () => {
  const profile = buildTeamRecentIntelligence({
    teamId: 10,
    teamName: "Local",
    season: 2026,
    targetDate: "2026-08-01T00:00:00Z",
    fixtures,
    statisticsByFixture,
  });

  assert.equal(profile.last_10.sample_size, 10);
  assert.equal(profile.fixture_ids.length, 10);
});

test("forma reciente separa local y visitante", () => {
  const profile = buildTeamRecentIntelligence({
    teamId: 10,
    season: 2026,
    targetDate: "2026-08-01T00:00:00Z",
    fixtures,
    statisticsByFixture,
  });

  assert.equal(profile.as_home.sample_size, 5);
  assert.equal(profile.as_away.sample_size, 5);
});

test("forma reciente excluye partidos futuros", () => {
  const future = fixture(20, { date: "2026-08-02T20:00:00Z" });
  const profile = buildTeamRecentIntelligence({
    teamId: 10,
    season: 2026,
    targetDate: "2026-08-01T00:00:00Z",
    fixtures: [future, ...fixtures],
    statisticsByFixture,
  });

  assert.equal(profile.fixture_ids.includes(future.fixtureId), false);
});

test("forma reciente no mezcla temporadas silenciosamente", () => {
  const previous = fixture(21, { season: 2025, date: "2026-07-30T20:00:00Z" });
  const profile = buildTeamRecentIntelligence({
    teamId: 10,
    season: 2026,
    targetDate: "2026-08-01T00:00:00Z",
    fixtures: [previous, ...fixtures],
    statisticsByFixture,
  });

  assert.equal(profile.fixture_ids.includes(previous.fixtureId), false);
  assert.equal(profile.season, 2026);
});

test("árbitro confirmado con muestra suficiente", () => {
  const profile = buildRefereeIntelligence({
    fixture: fixtures[0],
    historicalFixtures: fixtures,
    statisticsByFixture,
  });

  assert.equal(profile.status, "confirmed");
  assert.equal(profile.quality_status, QUALITY_STATUS.VERIFIED);
  assert.equal(profile.yellow_cards_per_match, 5);
});

test("árbitro no confirmado queda missing", () => {
  const profile = buildRefereeIntelligence({
    fixture: fixture(30, { referee: null }),
  });

  assert.equal(profile.status, "missing");
  assert.equal(profile.quality_status, QUALITY_STATUS.UNAVAILABLE);
});

test("árbitro con muestra corta queda insufficient_sample", () => {
  const profile = buildRefereeIntelligence({
    fixture: fixtures[0],
    historicalFixtures: fixtures.slice(0, 2),
    statisticsByFixture,
  });

  assert.equal(profile.sample_size, 2);
  assert.equal(profile.quality_status, QUALITY_STATUS.INSUFFICIENT_SAMPLE);
});

test("comparación árbitro liga exige muestras compatibles", () => {
  const leagueProfile = buildLeagueIntelligence({
    competition,
    season: 2026,
    fixtures,
    statisticsByFixture,
  });
  const profile = buildRefereeIntelligence({
    fixture: fixtures[0],
    historicalFixtures: fixtures,
    statisticsByFixture,
    leagueProfile,
  });

  assert.equal(profile.league_comparison.compatible, true);
  assert.equal(profile.league_comparison.difference, 0);
});

test("clima queda unavailable sin fuente y no inventa valores", () => {
  const context = buildVenueWeatherContext({ fixture: fixtures[0] });

  assert.equal(context.weather_status, WEATHER_STATUS.UNAVAILABLE);
  assert.equal(context.temperature, null);
  assert.deepEqual(context.risk_flags, []);
});

test("lluvia intensa genera risk flag", () => {
  const context = buildVenueWeatherContext({
    fixture: fixtures[0],
    weather: {
      status: WEATHER_STATUS.FORECAST,
      rainIntensity: 8,
      fetchedAt: "2026-07-01T19:00:00Z",
      source: "test-verified-source",
    },
    now: Date.parse("2026-07-01T20:00:00Z"),
  });

  assert.ok(context.risk_flags.includes("heavy_rain"));
});

test("pronóstico vencido queda stale", () => {
  const context = buildVenueWeatherContext({
    fixture: fixtures[0],
    weather: {
      status: WEATHER_STATUS.FORECAST,
      fetchedAt: "2026-06-30T10:00:00Z",
    },
    now: Date.parse("2026-07-01T20:00:00Z"),
  });

  assert.equal(context.weather_status, WEATHER_STATUS.STALE);
});

test("sede y altitud conservan procedencia", () => {
  const context = buildVenueWeatherContext({
    fixture: fixtures[0],
    venueDetails: {
      altitude: 2_600,
      surface: "grass",
      sourceRef: "venue:verified:1",
    },
  });

  assert.equal(context.altitude, 2_600);
  assert.ok(context.risk_flags.includes("high_altitude"));
  assert.ok(context.source_refs.includes("venue:verified:1"));
});
