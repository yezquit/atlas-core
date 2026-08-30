import assert from "node:assert/strict";
import test from "node:test";

import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { analyzeSportsFixture, scanSportsJourney, rankJourneyCandidatesByDecision } from "../services/sportsIntelligenceService.js";
import { buildRankedMarketSelection } from "../intelligence/marketCandidateRanker.js";

// ---------------------------------------------------------------------------
// Mismo patrón de gateway que operationalAnalysisRadarIntegration.test.js
// (Fase 3B): liga/local/visitante en rangos de fixture_id DISJUNTOS, para que
// la exclusión leave-one-out del Radar tenga muestra real que excluir.
// ---------------------------------------------------------------------------

const HOME_TEAM_ID = 10;
const AWAY_TEAM_ID = 20;
const TARGET_FIXTURE_ID = 9_300;
const COMPETITION_KEY = "colombiaPrimeraA";
const SEASON = 2026;
const ANALYZED_AT = "2026-08-01T12:00:00.000Z";

function finishedFixture({ id, homeId, awayId, homeGoals, awayGoals, dayOffset }) {
  return {
    fixtureId: id,
    competition: { id: 239, name: "Primera A", country: "Colombia", season: SEASON },
    date: { utc: `2026-07-${String((dayOffset % 27) + 1).padStart(2, "0")}T20:00:00.000Z` },
    status: { isScheduled: false, isFinished: true, long: "Finalizado" },
    teams: { home: { id: homeId, name: `Equipo ${homeId}` }, away: { id: awayId, name: `Equipo ${awayId}` } },
    score: { goals: { home: homeGoals, away: awayGoals }, aggregate: null },
    referee: { name: "Ana Ruiz", confirmed: true },
    venue: { name: "Estadio Central", city: "Bogotá" },
  };
}

function scheduledFixture(id) {
  return {
    fixtureId: id,
    competition: { id: 239, name: "Primera A", country: "Colombia", season: SEASON },
    date: { utc: "2026-08-10T23:00:00.000Z" },
    status: { isScheduled: true, isFinished: false, long: "Programado" },
    teams: { home: { id: HOME_TEAM_ID, name: "Local Betano" }, away: { id: AWAY_TEAM_ID, name: "Visitante Betano" } },
    score: { goals: { home: null, away: null }, aggregate: null },
    referee: { name: "Ana Ruiz", confirmed: true },
    venue: { name: "Estadio Central", city: "Bogotá" },
  };
}

function fixtureStatistics(fixture) {
  return {
    teams: [
      { team: fixture.teams.home, statistics: { total_shots: { value: 12 }, shots_on_goal: { value: 5 }, yellow_cards: { value: 2 }, red_cards: { value: 0 }, fouls: { value: 12 }, corner_kicks: { value: 5 }, ball_possession: { value: 50 } } },
      { team: fixture.teams.away, statistics: { total_shots: { value: 12 }, shots_on_goal: { value: 5 }, yellow_cards: { value: 2 }, red_cards: { value: 0 }, fouls: { value: 12 }, corner_kicks: { value: 5 }, ball_possession: { value: 50 } } },
    ],
  };
}

function buildJourneyRadarGateway({ scheduled, leaguePairs, homePairs, awayPairs }) {
  const leagueFixtures = leaguePairs.map((pair, i) => finishedFixture({ id: 9_000 + i, homeId: 800 + i, awayId: 850 + i, homeGoals: pair.home, awayGoals: pair.away, dayOffset: i }));
  const homeFixtures = homePairs.map((pair, i) => finishedFixture({ id: 9_100 + i, homeId: HOME_TEAM_ID, awayId: 750 + i, homeGoals: pair.home, awayGoals: pair.away, dayOffset: i }));
  const awayFixtures = awayPairs.map((pair, i) => finishedFixture({ id: 9_200 + i, homeId: 700 + i, awayId: AWAY_TEAM_ID, homeGoals: pair.home, awayGoals: pair.away, dayOffset: i }));
  const allHistorical = [...leagueFixtures, ...homeFixtures, ...awayFixtures];
  const statsById = new Map(allHistorical.map((fixture) => [fixture.fixtureId, fixtureStatistics(fixture)]));
  return {
    runtime: { snapshot: () => ({ requestsUsed: 5, cacheHits: 0, cacheMisses: 5, deduplicated: 0, configuredBudget: 2500, configuredBudgetRemaining: 2495, budgetExhausted: false, quotaStatus: "available" }) },
    loadCompetitionMetadata: async () => ({
      status: DATA_LOAD_STATUS.SUCCESS,
      seasonMetadata: { year: SEASON, coverage: { odds: true, fixtures: { statistics_fixtures: true, lineups: false }, injuries: false, standings: false } },
      availableSeasons: [SEASON],
      verificationStatus: "verified",
    }),
    loadFixtureById: async ({ fixtureId }) => ({ status: DATA_LOAD_STATUS.SUCCESS, selectedFixtureId: fixtureId, fixture: scheduledFixture(fixtureId) }),
    loadLeagueWindow: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, fixtures: leagueFixtures }),
    loadTeamRecent: async ({ teamId }) => ({
      status: DATA_LOAD_STATUS.SUCCESS,
      fixtures: Number(teamId) === HOME_TEAM_ID ? homeFixtures : Number(teamId) === AWAY_TEAM_ID ? awayFixtures : [],
    }),
    loadFixtureStatistics: async (fixtureId) => {
      const fixture = allHistorical.find((item) => item.fixtureId === fixtureId);
      return { status: DATA_LOAD_STATUS.SUCCESS, fixtureId, statistics: fixture ? statsById.get(fixtureId) : fixtureStatistics(scheduledFixture(fixtureId)) };
    },
    loadFixturesForDate: async () => ({ status: scheduled.length ? DATA_LOAD_STATUS.SUCCESS : DATA_LOAD_STATUS.EMPTY, fixtures: scheduled, message: "ok" }),
    loadFixtureOdds: async () => ({ status: DATA_LOAD_STATUS.SUCCESS, response: [] }),
  };
}

const LOW_20 = Array.from({ length: 20 }, () => ({ home: 1, away: 1 }));
const HIGH_10 = Array.from({ length: 10 }, () => ({ home: 3, away: 2 }));
const LOW_10 = Array.from({ length: 10 }, () => ({ home: 0, away: 1 }));

const journeyBase = { date: "2026-08-01", competitionKeys: [COMPETITION_KEY], timezone: "America/Bogota", marketIds: ["goals"] };

test("1. el Radar corre dentro de scanSportsJourney: los candidatos de Jornada llevan radarContext poblado", async () => {
  const gateway = buildJourneyRadarGateway({ scheduled: [scheduledFixture(TARGET_FIXTURE_ID)], leaguePairs: LOW_20, homePairs: HIGH_10, awayPairs: HIGH_10 });
  const result = await scanSportsJourney({ ...journeyBase }, gateway);
  assert.ok(result.candidates.length > 0);
  const goalsCandidate = result.candidates.find((candidate) => candidate.marketId === "goals");
  assert.ok(goalsCandidate, "debe existir un candidato de goals");
  assert.ok(goalsCandidate.radarContext, "el candidato de Jornada debe llevar radarContext");
  assert.equal(goalsCandidate.radarContext.radar_direction, "high");
  assert.equal(goalsCandidate.radarContext.opportunity_detected, true);
});

test("2. convergencia LOW real se refleja en radarContext dentro de Jornada", async () => {
  const gateway = buildJourneyRadarGateway({
    scheduled: [scheduledFixture(TARGET_FIXTURE_ID)],
    leaguePairs: Array.from({ length: 20 }, () => ({ home: 3, away: 2 })),
    homePairs: LOW_10,
    awayPairs: LOW_10,
  });
  const result = await scanSportsJourney({ ...journeyBase }, gateway);
  const goalsCandidate = result.candidates.find((candidate) => candidate.marketId === "goals");
  assert.ok(goalsCandidate);
  assert.equal(goalsCandidate.radarContext.radar_direction, "low");
});

// NOTA DE ALCANCE: toJourneyCandidate() (sportsIntelligenceService.js) no
// expone ningún candidateId/candidate_id hoy (confirmado leyendo su cuerpo
// completo, incluido transferredCandidate) — no se modifica producción para
// agregarlo solo para este test. Por eso la identidad del candidato se
// verifica por market_family+direction+line, que es exactamente de lo que
// candidateLineGenerator.js deriva candidate_id
// (`${marketFamily}:${direction}:${line}`), pero se documenta aquí como una
// identidad INFERIDA, no como una comparación directa de candidate_id.
test("3. el cableado del Radar no altera la identidad (family+direction+line), estimated_probability, sports_score, ni el universo de candidatos elegibles de goals", async () => {
  const gateway = buildJourneyRadarGateway({ scheduled: [scheduledFixture(TARGET_FIXTURE_ID)], leaguePairs: LOW_20, homePairs: HIGH_10, awayPairs: HIGH_10 });
  const result = await scanSportsJourney({ ...journeyBase }, gateway);

  // Referencia REAL sin Radar: se reconstruyen los mismos datos deportivos
  // subyacentes (analyzeSportsFixture, el mismo flujo inferior que
  // scanSportsJourney ya usa para este fixture) y se llama a
  // buildRankedMarketSelection directamente, sin pasar nunca por el Radar.
  const baseAnalysis = await analyzeSportsFixture(
    {
      date: journeyBase.date,
      competitionKey: COMPETITION_KEY,
      season: SEASON,
      fixtureId: TARGET_FIXTURE_ID,
      marketId: "goals",
      marketIds: ["goals"],
      timezone: journeyBase.timezone,
      prematchOnly: true,
      analyzedAt: ANALYZED_AT,
    },
    gateway
  );
  assert.equal(baseAnalysis.status, DATA_LOAD_STATUS.SUCCESS);

  const reference = buildRankedMarketSelection({
    analysisMode: "specific",
    requestedMarketId: "goals",
    marketAssessments: baseAnalysis.marketAssessments,
    leagueProfile: baseAnalysis.leagueProfile,
    homeTeamProfile: baseAnalysis.homeTeamProfile,
    awayTeamProfile: baseAnalysis.awayTeamProfile,
    refereeProfile: baseAnalysis.refereeProfile,
  });
  const referenceCandidate = reference.primary;
  assert.ok(referenceCandidate, "la referencia sin Radar debe producir un candidato primario");

  // Identidad inequívoca (family+direction+line), nunca posición: puede haber
  // más de una línea elegible de goals a la vez (el universo exhaustivo de
  // Jornada), y el orden de Jornada (estimated_probability DESC) no tiene por
  // qué coincidir con la línea que buildRankedMarketSelection elige como
  // .primary (que usa su propia frontera de calidad, no solo probabilidad).
  const goalsCandidate = result.candidates.find((candidate) =>
    candidate.marketId === "goals"
    && candidate.direction === referenceCandidate.direction
    && candidate.line === referenceCandidate.line
  );
  assert.ok(goalsCandidate, "debe existir en Jornada la misma línea de goals que la referencia sin Radar");

  assert.equal(goalsCandidate.marketId, referenceCandidate.market_family);
  assert.equal(goalsCandidate.direction, referenceCandidate.direction);
  assert.equal(goalsCandidate.line, referenceCandidate.line);
  assert.equal(goalsCandidate.estimatedProbability, referenceCandidate.estimated_probability);
  assert.equal(goalsCandidate.sportsScore, referenceCandidate.sports_score);

  // Universo comparable: ni result.candidates ni result.combinationCandidates
  // son el catálogo SIN filtrar (ambos aplican ranking_eligible===true —
  // confirmado leyendo selectCombinationJourneyCandidates). La comparación
  // honesta es contra reference.ranked_candidates filtrado exactamente igual,
  // no contra el catálogo completo sin filtrar.
  const signatureFromRaw = (candidate) => `${candidate.market_family}:${candidate.direction}:${candidate.line}`;
  const signatureFromJourney = (candidate) => `${candidate.marketId}:${candidate.direction}:${candidate.line}`;
  const referenceEligibleSignatures = reference.ranked_candidates
    .filter((candidate) => candidate.ranking_eligible === true)
    .map(signatureFromRaw)
    .sort();
  const journeyGoalsSignatures = result.combinationCandidates
    .filter((candidate) => candidate.marketId === "goals")
    .map(signatureFromJourney)
    .sort();
  assert.deepEqual(
    journeyGoalsSignatures,
    referenceEligibleSignatures,
    "el Radar no debe agregar, eliminar ni cambiar líneas/direcciones de los candidatos elegibles de goals"
  );
});

test("4. dos familias del mismo fixture reciben radarContext propio e independiente, sin compartir estado entre sí", async () => {
  const gateway = buildJourneyRadarGateway({
    scheduled: [scheduledFixture(TARGET_FIXTURE_ID)],
    leaguePairs: LOW_20,
    homePairs: HIGH_10,
    awayPairs: HIGH_10,
  });
  const result = await scanSportsJourney({ ...journeyBase, marketIds: ["goals", "corners"] }, gateway);
  const goalsCandidate = result.candidates.find((candidate) => candidate.marketId === "goals");
  const cornersCandidate = result.candidates.find((candidate) => candidate.marketId === "corners");
  assert.ok(goalsCandidate, "debe existir candidato de goals");
  assert.ok(goalsCandidate.radarContext, "goals debe tener su propio radarContext");
  assert.ok(cornersCandidate, "debe existir candidato de corners");
  assert.ok(cornersCandidate.radarContext, "corners debe tener su propio radarContext");
  assert.notEqual(goalsCandidate.radarContext, cornersCandidate.radarContext, "no deben compartir la misma instancia de radarContext");
  // goals: liga LOW_20 (total 2/partido) vs equipos HIGH_10 (total 5/partido)
  // => divergencia real, debe leerse como HIGH.
  assert.equal(goalsCandidate.radarContext.radar_direction, "high");
  assert.equal(goalsCandidate.radarContext.opportunity_detected, true);
  // corners: fixtureStatistics() da corner_kicks:5 fijo para TODOS los
  // fixtures (liga, local y visitante, sin distinción) => total 10 por
  // partido en los tres grupos, sin divergencia real entre señal y
  // referencia de liga. El resultado esperado es NEUTRAL por construcción
  // de los datos, no por un fallo del Radar.
  assert.equal(cornersCandidate.radarContext.radar_direction, "neutral");
  assert.equal(cornersCandidate.radarContext.opportunity_detected, false);
});

test("5. sin convergencia (liga y equipos parejos) Jornada sigue mostrando el candidato con radarContext neutral, sin ocultarlo", async () => {
  const flat10 = Array.from({ length: 10 }, () => ({ home: 1, away: 1 }));
  const gateway = buildJourneyRadarGateway({ scheduled: [scheduledFixture(TARGET_FIXTURE_ID)], leaguePairs: LOW_20, homePairs: flat10, awayPairs: flat10 });
  const result = await scanSportsJourney({ ...journeyBase }, gateway);
  const goalsCandidate = result.candidates.find((candidate) => candidate.marketId === "goals");
  assert.ok(goalsCandidate, "el candidato debe seguir apareciendo en Jornada aunque el radar sea neutral");
  assert.equal(goalsCandidate.radarContext.radar_direction, "neutral");
  assert.equal(goalsCandidate.radarContext.opportunity_detected, false);
});

test("6. radarAnalysis expone el resultado completo del Radar por market_family en Jornada, sin alterar identidad, probabilidad, sports_score ni universo/orden final de candidatos", async () => {
  const gateway = buildJourneyRadarGateway({
    scheduled: [scheduledFixture(TARGET_FIXTURE_ID)],
    leaguePairs: LOW_20,
    homePairs: HIGH_10,
    awayPairs: HIGH_10,
  });
  const journeyInput = { ...journeyBase, marketIds: ["goals", "corners"] };
  const result = await scanSportsJourney(journeyInput, gateway);
  const goalsCandidate = result.candidates.find((candidate) => candidate.marketId === "goals");
  const cornersCandidate = result.candidates.find((candidate) => candidate.marketId === "corners");
  assert.ok(goalsCandidate, "debe existir candidato de goals");
  assert.ok(cornersCandidate, "debe existir candidato de corners");

  // radarAnalysis debe existir y corresponder a SU PROPIA market_family,
  // asociado por candidate.marketId, nunca por posición ni por texto.
  assert.ok(goalsCandidate.radarAnalysis, "goals debe tener radarAnalysis");
  assert.ok(cornersCandidate.radarAnalysis, "corners debe tener radarAnalysis");
  assert.equal(goalsCandidate.radarAnalysis.market_family, "goals");
  assert.equal(cornersCandidate.radarAnalysis.market_family, "corners");

  // No contaminación entre familias: instancias y contenido distintos.
  assert.notEqual(goalsCandidate.radarAnalysis, cornersCandidate.radarAnalysis, "no deben compartir la misma instancia de radarAnalysis");
  assert.notEqual(goalsCandidate.radarAnalysis.market_family, cornersCandidate.radarAnalysis.market_family);

  // radarAnalysis es el resultado COMPLETO (superconjunto de radarContext),
  // consistente con el estado ya verificado en radarContext (test 4): goals
  // HIGH con oportunidad detectada, corners neutral por datos planos.
  assert.equal(goalsCandidate.radarAnalysis.radar_direction, "high");
  assert.equal(goalsCandidate.radarAnalysis.opportunity_detected, true);
  assert.equal(cornersCandidate.radarAnalysis.radar_direction, "neutral");
  assert.equal(cornersCandidate.radarAnalysis.opportunity_detected, false);

  // radarContext sigue intacto y sin alterarse por la nueva asociación.
  assert.ok(goalsCandidate.radarContext, "radarContext de goals debe seguir existiendo");
  assert.equal(goalsCandidate.radarContext.radar_direction, "high");
  assert.equal(goalsCandidate.radarContext.opportunity_detected, true);
  assert.ok(cornersCandidate.radarContext, "radarContext de corners debe seguir existiendo");
  assert.equal(cornersCandidate.radarContext.radar_direction, "neutral");
  assert.equal(cornersCandidate.radarContext.opportunity_detected, false);

  // Referencia REAL sin radarAnalysis: mismos datos deportivos subyacentes
  // (analyzeSportsFixture + buildRankedMarketSelection directo, sin Radar),
  // reproduciendo el MISMO reordenamiento Y el MISMO límite final que produce
  // result.candidates (rankJourneyCandidatesByDecision + slice(0, maximumCandidates),
  // sportsIntelligenceService.js:796-798), en vez de asumir que el orden o el
  // tope se conservan.
  const baseAnalysis = await analyzeSportsFixture(
    {
      date: journeyBase.date,
      competitionKey: COMPETITION_KEY,
      season: SEASON,
      fixtureId: TARGET_FIXTURE_ID,
      marketId: "goals",
      marketIds: ["goals", "corners"],
      timezone: journeyBase.timezone,
      prematchOnly: true,
      analyzedAt: ANALYZED_AT,
    },
    gateway
  );
  assert.equal(baseAnalysis.status, DATA_LOAD_STATUS.SUCCESS);

  const reference = buildRankedMarketSelection({
    analysisMode: "general",
    requestedMarketId: null,
    marketAssessments: baseAnalysis.marketAssessments,
    leagueProfile: baseAnalysis.leagueProfile,
    homeTeamProfile: baseAnalysis.homeTeamProfile,
    awayTeamProfile: baseAnalysis.awayTeamProfile,
    refereeProfile: baseAnalysis.refereeProfile,
  });
  const referenceEntries = reference.ranked_candidates
    .filter((candidate) => candidate.ranking_eligible === true)
    .map((candidate) => ({ analysis: baseAnalysis, candidate }));

  // Mismo cálculo de maximumCandidates efectivo que scanSportsJourney
  // (sportsIntelligenceService.js:791-794): journeyInput no fija
  // maximumCandidates, así que el valor efectivo es +Infinity — no se
  // inventa un tope distinto al que realmente usa esta llamada.
  const requestedMaximumCandidates = Number(journeyInput.maximumCandidates);
  const maximumCandidates = Number.isInteger(requestedMaximumCandidates) && requestedMaximumCandidates > 0
    ? requestedMaximumCandidates
    : Number.POSITIVE_INFINITY;
  const referenceHighlighted = rankJourneyCandidatesByDecision(referenceEntries).slice(0, maximumCandidates);

  const signatureFromRaw = (candidate) => `${candidate.market_family}:${candidate.direction}:${candidate.line}`;
  const signatureFromJourney = (candidate) => `${candidate.marketId}:${candidate.direction}:${candidate.line}`;
  const referenceSignatures = referenceHighlighted.map((entry) => signatureFromRaw(entry.candidate));
  const journeySignatures = result.candidates.map(signatureFromJourney);
  assert.deepEqual(
    journeySignatures,
    referenceSignatures,
    "la asociación de radarAnalysis no debe agregar, eliminar, reordenar ni cambiar líneas/direcciones/familias del universo final de candidatos"
  );

  // Con firmas y orden ya demostrados idénticos, se verifica candidato por
  // candidato (no solo goals) que radarAnalysis es puramente presentacional:
  // identidad, probabilidad estimada y sports_score no cambian para NINGÚN
  // candidato del conjunto final.
  assert.equal(result.candidates.length, referenceHighlighted.length);
  result.candidates.forEach((candidate, index) => {
    const referenceCandidate = referenceHighlighted[index].candidate;
    assert.equal(candidate.marketId, referenceCandidate.market_family, `familia distinta en la posición ${index}`);
    assert.equal(candidate.direction, referenceCandidate.direction, `dirección distinta en la posición ${index}`);
    assert.equal(candidate.line, referenceCandidate.line, `línea distinta en la posición ${index}`);
    assert.equal(candidate.estimatedProbability, referenceCandidate.estimated_probability, `estimatedProbability distinta en la posición ${index}`);
    assert.equal(candidate.sportsScore, referenceCandidate.sports_score, `sportsScore distinto en la posición ${index}`);
  });
});
