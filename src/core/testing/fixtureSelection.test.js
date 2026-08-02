import test from "node:test";
import assert from "node:assert/strict";

import { FIXTURE_STATUS } from "../contracts/atlasContracts.js";
import { matchFixturesByTeams } from "../modules/fixtureMatcher.js";
import {
  inferApiLeagueKey,
  selectBestFixture,
} from "../modules/realFixtureLookup.js";

function fixture(id, date, season, referee = null) {
  return {
    fixtureId: id,
    date: { utc: `${date}T20:00:00Z` },
    competition: { season },
    status: { isFinished: Boolean(referee) },
    referee: { confirmed: Boolean(referee), name: referee },
    teams: {
      home: { name: "Patriotas" },
      away: { name: "Jaguares" },
    },
  };
}

test("varias coincidencias se declaran ambiguas y no se confirman", () => {
  const result = selectBestFixture([
    fixture(1, "2026-08-01", 2026, "Árbitro A"),
    fixture(2, "2026-08-08", 2026),
  ]);

  assert.equal(result.status, FIXTURE_STATUS.AMBIGUOUS);
  assert.equal(result.selectedFixture, null);
});

test("un fixture terminado con árbitro no desplaza una ambigüedad", () => {
  const result = selectBestFixture([
    fixture(10, "2024-01-01", 2024, "Árbitro histórico"),
    fixture(11, "2026-08-01", 2026),
  ]);

  assert.equal(result.status, FIXTURE_STATUS.AMBIGUOUS);
  assert.equal(result.selectedFixture, null);
});

test("fecha y temporada suministradas resuelven la coincidencia exacta", () => {
  const fixtures = [
    fixture(20, "2024-08-01", 2024, "Árbitro histórico"),
    fixture(21, "2026-08-01", 2026),
    fixture(22, "2026-08-08", 2026),
  ];
  const matches = matchFixturesByTeams(fixtures, {
    home: "Patriotas",
    away: "Jaguares",
    date: "2026-08-01",
    season: "2026",
  });
  const result = selectBestFixture(matches);

  assert.equal(matches.length, 1);
  assert.equal(result.status, FIXTURE_STATUS.CONFIRMED);
  assert.equal(result.selectedFixture.fixtureId, 21);
});

test("competitionName participa en la resolución de liga", () => {
  const leagueKey = inferApiLeagueKey({
    resolvedCompetition: { competitionName: "Torneo BetPlay Primera B" },
  });

  assert.equal(leagueKey, "primeraB");
});
