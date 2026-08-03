const COMPETITIONS = [
  {
    key: "colombiaPrimeraA",
    legacyKeys: ["primeraA"],
    id: 239,
    name: "Primera A",
    localName: "Colombia Primera A",
    country: "Colombia",
    countryCode: "CO",
    region: "south_america",
    regionLabel: "Sudamérica",
    type: "League",
    currentSeason: 2026,
    seasonFormat: "calendar_year",
    verificationStatus: "verified",
    verificationNote:
      "ID confirmado por la integración real de Colombia Primera A indicada al iniciar la Fase 2.",
  },
  {
    key: "colombiaPrimeraB",
    legacyKeys: ["primeraB"],
    id: 240,
    name: "Primera B",
    localName: "Colombia Primera B",
    country: "Colombia",
    countryCode: "CO",
    region: "south_america",
    regionLabel: "Sudamérica",
    type: "League",
    currentSeason: 2026,
    seasonFormat: "calendar_year",
  },
  {
    key: "brasilSerieA",
    id: 71,
    name: "Serie A",
    localName: "Brasil Serie A",
    country: "Brazil",
    countryCode: "BR",
    region: "south_america",
    regionLabel: "Sudamérica",
    type: "League",
    currentSeason: 2026,
    seasonFormat: "calendar_year",
  },
  {
    key: "brasilSerieB",
    id: 72,
    name: "Serie B",
    localName: "Brasil Serie B",
    country: "Brazil",
    countryCode: "BR",
    region: "south_america",
    regionLabel: "Sudamérica",
    type: "League",
    currentSeason: 2026,
    seasonFormat: "calendar_year",
  },
  {
    key: "argentinaPrimeraDivision",
    id: 128,
    name: "Liga Profesional Argentina",
    localName: "Argentina Primera División",
    country: "Argentina",
    countryCode: "AR",
    region: "south_america",
    regionLabel: "Sudamérica",
    type: "League",
    currentSeason: 2026,
    seasonFormat: "calendar_year",
  },
  {
    key: "argentinaPrimeraNacional",
    id: 129,
    name: "Primera Nacional",
    localName: "Argentina Primera Nacional",
    country: "Argentina",
    countryCode: "AR",
    region: "south_america",
    regionLabel: "Sudamérica",
    type: "League",
    currentSeason: 2026,
    seasonFormat: "calendar_year",
  },
  {
    key: "copaLibertadores",
    id: 13,
    name: "CONMEBOL Libertadores",
    localName: "Copa Libertadores",
    country: "World",
    countryCode: null,
    region: "south_america",
    regionLabel: "Sudamérica",
    type: "Cup",
    currentSeason: 2026,
    seasonFormat: "calendar_year",
  },
  {
    key: "copaSudamericana",
    id: 11,
    name: "CONMEBOL Sudamericana",
    localName: "Copa Sudamericana",
    country: "World",
    countryCode: null,
    region: "south_america",
    regionLabel: "Sudamérica",
    type: "Cup",
    currentSeason: 2026,
    seasonFormat: "calendar_year",
  },
  {
    key: "ligaMx",
    id: 262,
    name: "Liga MX",
    localName: "Liga MX",
    country: "Mexico",
    countryCode: "MX",
    region: "mexico",
    regionLabel: "México",
    type: "League",
    currentSeason: 2026,
    seasonFormat: "split_year",
    seasonStartMonth: 7,
  },
  {
    key: "ligaExpansionMx",
    id: 263,
    name: "Liga de Expansión MX",
    localName: "Liga de Expansión MX",
    country: "Mexico",
    countryCode: "MX",
    region: "mexico",
    regionLabel: "México",
    type: "League",
    currentSeason: 2026,
    seasonFormat: "split_year",
    seasonStartMonth: 7,
  },
  {
    key: "premierLeague",
    id: 39,
    name: "Premier League",
    localName: "Premier League",
    country: "England",
    countryCode: "GB",
    region: "europe",
    regionLabel: "Europa",
    type: "League",
    currentSeason: 2026,
    seasonFormat: "split_year",
    seasonStartMonth: 7,
  },
  {
    key: "laLiga",
    id: 140,
    name: "La Liga",
    localName: "LaLiga",
    country: "Spain",
    countryCode: "ES",
    region: "europe",
    regionLabel: "Europa",
    type: "League",
    currentSeason: 2026,
    seasonFormat: "split_year",
    seasonStartMonth: 7,
  },
  {
    key: "bundesliga",
    id: 78,
    name: "Bundesliga",
    localName: "Bundesliga",
    country: "Germany",
    countryCode: "DE",
    region: "europe",
    regionLabel: "Europa",
    type: "League",
    currentSeason: 2026,
    seasonFormat: "split_year",
    seasonStartMonth: 7,
  },
  {
    key: "ligue1",
    id: 61,
    name: "Ligue 1",
    localName: "Ligue 1",
    country: "France",
    countryCode: "FR",
    region: "europe",
    regionLabel: "Europa",
    type: "League",
    currentSeason: 2026,
    seasonFormat: "split_year",
    seasonStartMonth: 7,
  },
  {
    key: "italySerieA",
    id: 135,
    name: "Serie A",
    localName: "Serie A de Italia",
    country: "Italy",
    countryCode: "IT",
    region: "europe",
    regionLabel: "Europa",
    type: "League",
    currentSeason: 2026,
    seasonFormat: "split_year",
    seasonStartMonth: 7,
  },
  {
    key: "championsLeague",
    id: 2,
    name: "UEFA Champions League",
    localName: "UEFA Champions League",
    country: "World",
    countryCode: null,
    region: "europe",
    regionLabel: "Europa",
    type: "Cup",
    currentSeason: 2026,
    seasonFormat: "split_year",
    seasonStartMonth: 7,
  },
  {
    key: "europaLeague",
    id: 3,
    name: "UEFA Europa League",
    localName: "UEFA Europa League",
    country: "World",
    countryCode: null,
    region: "europe",
    regionLabel: "Europa",
    type: "Cup",
    currentSeason: 2026,
    seasonFormat: "split_year",
    seasonStartMonth: 7,
  },
];

const PHASE_TWO_VERIFIED_IDS = new Set([
  2, 3, 11, 13, 39, 61, 71, 72, 78, 128, 129, 135, 140, 239, 240, 262,
  263,
]);

function withDefaults(competition) {
  const phaseTwoVerified = PHASE_TWO_VERIFIED_IDS.has(competition.id);
  return Object.freeze({
    verificationStatus: phaseTwoVerified ? "verified" : "experimental",
    verificationNote: phaseTwoVerified
      ? "ID y temporada 2026 verificados mediante metadatos de API-FOOTBALL el 2026-08-02; la cobertura se valida por temporada en tiempo de ejecución."
      : "El ID configurado debe coincidir con los metadatos reales del proveedor antes de usarse.",
    verifiedAt: phaseTwoVerified ? "2026-08-02" : null,
    verificationSource: phaseTwoVerified ? "api-football:/leagues?id" : null,
    ...competition,
    legacyKeys: competition.legacyKeys || [],
  });
}

export const API_FOOTBALL_COMPETITIONS = Object.freeze(
  COMPETITIONS.map(withDefaults)
);

export const API_FOOTBALL_LEAGUES = Object.freeze({
  colombia: {
    country: "Colombia",
    code: "CO",
    leagues: Object.fromEntries(
      API_FOOTBALL_COMPETITIONS.filter(
        (competition) => competition.country === "Colombia"
      ).flatMap((competition) => [
        [competition.key, competition],
        ...competition.legacyKeys.map((key) => [key, competition]),
      ])
    ),
  },
});

export function getApiFootballLeagueByKey(_countryKey, leagueKey) {
  return getApiFootballCompetitionByKey(leagueKey);
}

export function getApiFootballCompetitionByKey(competitionKey) {
  return (
    API_FOOTBALL_COMPETITIONS.find(
      (competition) =>
        competition.key === competitionKey ||
        competition.legacyKeys.includes(competitionKey)
    ) || null
  );
}

export function listApiFootballLeagues() {
  return API_FOOTBALL_COMPETITIONS.map((competition) => ({ ...competition }));
}

export function groupApiFootballCompetitions() {
  const groups = [];
  for (const competition of API_FOOTBALL_COMPETITIONS) {
    let group = groups.find((item) => item.id === competition.region);
    if (!group) {
      group = {
        id: competition.region,
        label: competition.regionLabel,
        competitions: [],
      };
      groups.push(group);
    }
    group.competitions.push({ ...competition });
  }
  return groups;
}

export function expectedSeasonForDate(competition, date) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(date || ""));
  if (!match || !competition) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (competition.seasonFormat === "calendar_year") return year;
  const startMonth = competition.seasonStartMonth || 7;
  return month >= startMonth ? year : year - 1;
}
