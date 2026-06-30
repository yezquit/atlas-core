export function normalizeFootballFixture(item) {
  const statusShort = item?.fixture?.status?.short || null;
  const referee = item?.fixture?.referee || null;

  return {
    fixtureId: item?.fixture?.id || null,

    source: {
      provider: "API-FOOTBALL",
      verified: true,
    },

    competition: {
      id: item?.league?.id || null,
      name: item?.league?.name || null,
      country: item?.league?.country || null,
      season: item?.league?.season || null,
      round: item?.league?.round || null,
    },

    date: {
      utc: item?.fixture?.date || null,
      timezone: item?.fixture?.timezone || "UTC",
    },

    status: {
      long: item?.fixture?.status?.long || null,
      short: statusShort,
      elapsed: item?.fixture?.status?.elapsed || null,
      isFinished: statusShort === "FT",
      isLive: ["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT"].includes(statusShort),
      isScheduled: ["TBD", "NS"].includes(statusShort),
    },

    teams: {
      home: {
        id: item?.teams?.home?.id || null,
        name: item?.teams?.home?.name || null,
        logo: item?.teams?.home?.logo || null,
        winner: item?.teams?.home?.winner ?? null,
      },
      away: {
        id: item?.teams?.away?.id || null,
        name: item?.teams?.away?.name || null,
        logo: item?.teams?.away?.logo || null,
        winner: item?.teams?.away?.winner ?? null,
      },
    },

    score: {
      goals: {
        home: item?.goals?.home ?? null,
        away: item?.goals?.away ?? null,
      },
      halftime: {
        home: item?.score?.halftime?.home ?? null,
        away: item?.score?.halftime?.away ?? null,
      },
      fulltime: {
        home: item?.score?.fulltime?.home ?? null,
        away: item?.score?.fulltime?.away ?? null,
      },
    },

    referee: {
      name: referee,
      confirmed: Boolean(referee),
    },

    venue: {
      id: item?.fixture?.venue?.id || null,
      name: item?.fixture?.venue?.name || null,
      city: item?.fixture?.venue?.city || null,
    },

    qualityFlags: {
      hasFixtureId: Boolean(item?.fixture?.id),
      hasTeams: Boolean(item?.teams?.home?.name && item?.teams?.away?.name),
      hasScore: item?.goals?.home !== null && item?.goals?.away !== null,
      hasReferee: Boolean(referee),
      hasVenue: Boolean(item?.fixture?.venue?.name),
    },
  };
}

export function normalizeFootballFixtures(items = []) {
  return items.map(normalizeFootballFixture);
}
