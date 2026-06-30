export const API_FOOTBALL_LEAGUES = {
  colombia: {
    country: "Colombia",
    code: "CO",
    leagues: {
      primeraA: {
        id: 239,
        name: "Primera A",
        localName: "Liga BetPlay Dimayor",
        type: "League",
        currentSeason: 2026,
        developmentSeason: 2024,
      },
      primeraB: {
        id: 240,
        name: "Primera B",
        localName: "Torneo BetPlay Dimayor",
        type: "League",
        currentSeason: 2026,
        developmentSeason: 2024,
      },
      copaColombia: {
        id: 241,
        name: "Copa Colombia",
        localName: "Copa Colombia",
        type: "Cup",
        currentSeason: 2026,
        developmentSeason: 2024,
      },
      ligaFemenina: {
        id: 712,
        name: "Liga Femenina",
        localName: "Liga Femenina Colombia",
        type: "League",
        currentSeason: 2026,
        developmentSeason: 2024,
      },
      superliga: {
        id: 713,
        name: "Superliga",
        localName: "Superliga Colombia",
        type: "Cup",
        currentSeason: 2026,
        developmentSeason: 2024,
      },
    },
  },
};

export function getApiFootballLeagueByKey(countryKey, leagueKey) {
  return API_FOOTBALL_LEAGUES?.[countryKey]?.leagues?.[leagueKey] || null;
}
