function normalized(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function classifyCompetition(competition = {}) {
  const name = normalized(competition.name || competition.localName);
  const country = normalized(competition.country);
  const international = country === "world" || /libertadores|sudamericana|champions|europa|conference|international/.test(name);
  if (international) return "international";
  if (/copa|cup|supercopa|super cup/.test(name)) return "domestic_cup";
  if (name) return "domestic_league";
  return "unknown";
}

export function classifyLeg(round = "") {
  const value = normalized(round);
  if (/1st leg|first leg|ida/.test(value)) return "first_leg";
  if (/2nd leg|second leg|vuelta/.test(value)) return "second_leg";
  if (/final|round|jornada|matchday|group|grupo|regular season/.test(value)) return "single_or_group_match";
  return "unknown";
}

function sampleOrigins(profile = {}) {
  return Array.isArray(profile?.sample_origins) ? profile.sample_origins : [];
}

export function buildCompetitiveContext({
  fixture,
  competition = fixture?.competition || {},
  homeTeamProfile = null,
  awayTeamProfile = null,
  schedule = null,
} = {}) {
  const type = classifyCompetition(competition);
  const leg = classifyLeg(competition.round);
  const homeOrigins = sampleOrigins(homeTeamProfile);
  const awayOrigins = sampleOrigins(awayTeamProfile);
  const currentCompetitionId = Number(competition.id);
  const comparable = (items) => Number.isFinite(currentCompetitionId)
    ? items.filter((item) => Number(item.competition_id) === currentCompetitionId).length
    : 0;
  const comparableHome = comparable(homeOrigins);
  const comparableAway = comparable(awayOrigins);
  const aggregate = fixture?.score?.aggregate || competition.aggregate || null;
  const nextFixture = schedule?.next_fixture || null;
  const previousFixture = schedule?.previous_fixture || null;
  const rest = {
    home_days: homeTeamProfile?.general?.average_rest_days ?? null,
    away_days: awayTeamProfile?.general?.average_rest_days ?? null,
  };
  const warnings = [];
  if (comparableHome === 0 || comparableAway === 0) {
    warnings.push("No existe una muestra comparable suficiente para ambos equipos en esta competición.");
  }
  if (nextFixture && !nextFixture.verified) {
    warnings.push("El próximo partido no está verificado y no se interpreta como hecho.");
  }
  return {
    contract: "CompetitiveFixtureContext",
    version: 1,
    competition: {
      id: competition.id ?? null,
      name: competition.name || competition.localName || null,
      country: competition.country || null,
      season: competition.season ?? null,
      round: competition.round || null,
      type,
    },
    fixture_role: { home_team: fixture?.teams?.home?.name || null, away_team: fixture?.teams?.away?.name || null },
    leg,
    aggregate,
    previous_fixture: previousFixture,
    next_fixture: nextFixture,
    next_competition: nextFixture?.competition || null,
    rest_days: rest,
    sample_context: {
      home: { total: homeOrigins.length, comparable: comparableHome, origins: homeOrigins },
      away: { total: awayOrigins.length, comparable: comparableAway, origins: awayOrigins },
    },
    rotation: {
      status: schedule?.rotation_confirmed ? "confirmed" : schedule?.rotation_reported ? "reported_risk" : "not_reported",
      message: schedule?.rotation_confirmed
        ? "Rotación confirmada por el contexto disponible."
        : schedule?.rotation_reported
          ? "Posible rotación reportada; se conserva como riesgo, no como hecho."
          : "No hay rotación verificada en los datos disponibles.",
    },
    mathematical_probability_adjustment: null,
    warnings,
  };
}
