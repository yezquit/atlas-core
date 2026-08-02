export const API_FOOTBALL_LEAGUES = {
  colombia: {
    country: "Colombia",
    code: "CO",
    leagues: {
      primeraA: {
        key: "primeraA",
        id: 239,
        name: "Primera A",
        localName: "Liga BetPlay Dimayor",
        type: "League",
        currentSeason: 2026,
        developmentSeason: 2024,
        seasonFormat: "calendar_year",
      },
      primeraB: {
        key: "primeraB",
        id: 240,
        name: "Primera B",
        localName: "Torneo BetPlay Dimayor",
        type: "League",
        currentSeason: 2026,
        developmentSeason: 2024,
        seasonFormat: "calendar_year",
      },
      copaColombia: {
        key: "copaColombia",
        id: 241,
        name: "Copa Colombia",
        localName: "Copa Colombia",
        type: "Cup",
        currentSeason: 2026,
        developmentSeason: 2024,
        seasonFormat: "calendar_year",
      },
      ligaFemenina: {
        key: "ligaFemenina",
        id: 712,
        name: "Liga Femenina",
        localName: "Liga Femenina Colombia",
        type: "League",
        currentSeason: 2026,
        developmentSeason: 2024,
        seasonFormat: "calendar_year",
      },
      superliga: {
        key: "superliga",
        id: 713,
        name: "Superliga",
        localName: "Superliga Colombia",
        type: "Cup",
        currentSeason: 2026,
        developmentSeason: 2024,
        seasonFormat: "calendar_year",
      },
    },
  },
};

export function getApiFootballLeagueByKey(countryKey, leagueKey) {
  return API_FOOTBALL_LEAGUES?.[countryKey]?.leagues?.[leagueKey] || null;
}

export function listApiFootballLeagues(countryKey = "colombia") {
  const country = API_FOOTBALL_LEAGUES?.[countryKey];
  if (!country) return [];

  return Object.values(country.leagues).map((league) => ({
    key: league.key,
    id: league.id,
    name: league.name,
    localName: league.localName,
    type: league.type,
    country: country.country,
    countryCode: country.code,
    currentSeason: league.currentSeason,
    seasonFormat: league.seasonFormat,
  }));
}
