import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  analyzeLiveMatch,
  buildLiveDirectorVerdict,
  buildLiveMarketAssessments,
} from "../intelligence/liveMatchAnalysisEngine.js";
import { listLiveFixtures, selectLatestPrematchAnalysis } from "../services/liveAnalysisService.js";

const clientPath = new URL("../../app/atlas-live.js", import.meta.url);
const routePath = new URL("../../app/api/football/live/route.js", import.meta.url);
const NOW = "2026-08-23T11:10:10.000Z";
const FETCHED = "2026-08-23T11:10:00.000Z";

function fixture(overrides = {}) {
  return {
    fixtureId: 7_001,
    competition: { id: 239, name: "Primera A", season: 2026, round: "Clausura" },
    date: { kickoff_utc: "2026-08-23T10:00:00.000Z" },
    status: { short: "2H", long: "Second Half", elapsed: 70, isLive: true, isFinished: false, isScheduled: false },
    teams: { home: { id: 1, name: "Atlas Norte" }, away: { id: 2, name: "Atlas Sur" } },
    score: { goals: { home: 2, away: 1 } },
    ...overrides,
  };
}

function statistics() {
  const values = (id, name, totalShots, shots, corners, cards, possession) => ({
    team: { id, name },
    statistics: { total_shots: { value: totalShots }, shots_on_goal: { value: shots }, corner_kicks: { value: corners }, yellow_cards: { value: cards }, red_cards: { value: 0 }, fouls: { value: 10 }, ball_possession: { value: possession } },
  });
  return { availableStats: ["total_shots", "shots_on_goal", "corner_kicks", "yellow_cards", "red_cards", "fouls", "ball_possession"], teams: [values(1, "Atlas Norte", 18, 8, 7, 3, 55), values(2, "Atlas Sur", 12, 5, 5, 2, 45)] };
}

function prematchAnalysisVersion(overrides = {}) {
  return {
    analysis_id: "prematch-1",
    fixture_id: 7_001,
    created_at: "2026-08-23T08:00:00.000Z",
    phase: "hours_before",
    kickoff_distance_minutes: 120,
    director: {
      selection: "Over 2.5",
      market_evaluated: { family: "goals", label: "Goles" },
      estimated_probability: 0.85,
    },
    ...overrides,
  };
}

test("1. listLiveFixtures carga múltiples competiciones y etiqueta cada fixture con su competitionKey real", async () => {
  const gateway = {
    loadLiveFixtures: async () => ({
      status: "success",
      fixtures: [
        fixture({ fixtureId: 7_001, competition: { id: 239, name: "Primera A", season: 2026 } }),
        fixture({ fixtureId: 8_001, competition: { id: 71, name: "Serie A", season: 2026 } }),
      ],
      requestMeta: { fetchedAt: FETCHED },
    }),
  };
  const result = await listLiveFixtures(gateway, { competitions: [{ id: 239, key: "colombiaPrimeraA" }, { id: 71, key: "brasilSerieA" }] });
  assert.equal(result.status, "success");
  const byId = Object.fromEntries(result.fixtures.map((item) => [item.fixtureId, item.competitionKey]));
  assert.equal(byId[7_001], "colombiaPrimeraA");
  assert.equal(byId[8_001], "brasilSerieA");
});

test("2. selectLatestPrematchAnalysis rechaza registros hechos en o después del kickoff", () => {
  const postKickoff = prematchAnalysisVersion({ analysis_id: "post-kickoff", phase: "pre_match_closed", kickoff_distance_minutes: -5, created_at: "2026-08-23T10:30:00.000Z" });
  assert.equal(selectLatestPrematchAnalysis([postKickoff]), null);
});

test("3. selectLatestPrematchAnalysis rechaza kickoff_distance_minutes <= 0 aunque la fase no diga pre_match_closed", () => {
  const zeroDistance = prematchAnalysisVersion({ analysis_id: "zero-distance", kickoff_distance_minutes: 0 });
  assert.equal(selectLatestPrematchAnalysis([zeroDistance]), null);
});

test("4. selectLatestPrematchAnalysis elige la versión prematch genuina más reciente entre varias", () => {
  const older = prematchAnalysisVersion({ analysis_id: "older", created_at: "2026-08-22T08:00:00.000Z" });
  const invalid = prematchAnalysisVersion({ analysis_id: "invalid", phase: "pre_match_closed", kickoff_distance_minutes: -10, created_at: "2026-08-23T09:50:00.000Z" });
  const newer = prematchAnalysisVersion({ analysis_id: "newer", created_at: "2026-08-23T08:30:00.000Z" });
  const selected = selectLatestPrematchAnalysis([older, invalid, newer]);
  assert.equal(selected.analysis_id, "newer");
});

test("5. analyzeLiveMatch adjunta prematch_context sin modificarlo y sin que afecte el cálculo LIVE", () => {
  const prematch = prematchAnalysisVersion();
  const withPrematch = analyzeLiveMatch({ analysisId: "id", competitionKey: "colombiaPrimeraA", fixture: fixture(), statistics: statistics(), fixtureFetchedAt: FETCHED, statisticsFetchedAt: FETCHED, analyzedAt: NOW, prematchContext: prematch });
  assert.deepEqual(withPrematch.prematch_context, prematch);
  assert.equal(withPrematch.director.estimated_probability, null);
  assert.equal(withPrematch.director.probability_status, "unavailable");

  const withoutPrematch = analyzeLiveMatch({ analysisId: "id", competitionKey: "colombiaPrimeraA", fixture: fixture(), statistics: statistics(), fixtureFetchedAt: FETCHED, statisticsFetchedAt: FETCHED, analyzedAt: NOW });
  assert.equal(withoutPrematch.prematch_context, null);
});

test("6. mercados LIVE soportados siguen siendo exactamente goals, corners, cards, total_shots, shots_on_goal", () => {
  const snapshot = { fixture_id: 7_001, minute: 70, status: { short: "2H" }, statistics: { available_stats: ["total_shots", "shots_on_goal", "corner_kicks", "yellow_cards"] }, totals: { goals: 3, corners: 12, cards: 5, total_shots: 30, shots_on_goal: 13 }, sources: { coherence_status: "coherent" } };
  const assessments = buildLiveMarketAssessments(snapshot, []);
  assert.deepEqual(new Set(assessments.map((item) => item.market_family)), new Set(["goals", "corners", "cards", "total_shots", "shots_on_goal"]));
});

test("7. sin candidatos deportivos suficientes, el Director LIVE concluye NO sin fabricar una recomendación", () => {
  const snapshot = { fixture_id: 7_001, home_team: "A", away_team: "B", competition: "X", season: 2026, kickoff_utc: null, minute: 5, status: { short: "1H" }, score: { home: 0, away: 0 }, captured_at: NOW, snapshot_id: "s1" };
  const insufficientAssessments = [
    { market_family: "goals", status: "insufficient_information", projection: { status: "insufficient_information" }, candidate: null, sports_reading: null, operational_candidates: [], reasons: [], risks: ["live_sample_too_early"] },
  ];
  const director = buildLiveDirectorVerdict(snapshot, insufficientAssessments);
  assert.equal(director.decision_code, "no");
  assert.equal(director.selection, null);
  assert.equal(director.analysis_decision.label, "NO ME GUSTA ESTA OPCIÓN");
});

test("8. la UI permite seleccionar competiciones LIVE y no envía competitionKeys vacío como \"todas\"", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.ok(source.includes("selectedLiveCompetitionKeys"));
  assert.ok(source.includes('<fieldset className="p2-live-competitions">'));
  assert.ok(source.includes("Selecciona al menos una competición para buscar partidos en vivo."));
  assert.ok(source.includes("if (!selectedLiveCompetitionKeys.length)"));
});

test("9. la UI separa CONTEXTO PREMATCH de AHORA EN VIVO y solo llama probabilidad prematch a la del contexto guardado", async () => {
  const source = await readFile(clientPath, "utf8");
  assert.ok(source.includes("CONTEXTO PREMATCH"));
  assert.ok(source.includes("AHORA EN VIVO"));
  assert.ok(source.includes("Probabilidad estimada prematch"));
  assert.equal(source.includes("Probabilidad LIVE"), false);
});

test("10. actualizar el catálogo LIVE no borra el fixture ni el análisis ya seleccionado", async () => {
  const source = await readFile(clientPath, "utf8");
  const refreshBlock = source.slice(source.indexOf("const refresh = useCallback"), source.indexOf("useEffect(() => { refresh(); }"));
  assert.equal(refreshBlock.includes("setAnalysis("), false);
  assert.equal(refreshBlock.includes("setManual("), false);
});

test("11. la ruta LIVE acepta un filtro opcional de competencias sin romper el comportamiento por defecto", async () => {
  const source = await readFile(routePath, "utf8");
  assert.ok(source.includes('url.searchParams.get("competitionKeys")'));
  assert.ok(source.includes("requestedKeys.length"));
});

test("12. listLiveFixtures excluye fixtures programados y finalizados aunque vengan mezclados con uno realmente LIVE", async () => {
  const gateway = {
    loadLiveFixtures: async () => ({
      status: "success",
      fixtures: [
        fixture({ fixtureId: 7_001 }),
        fixture({ fixtureId: 7_002, status: { short: "NS", isScheduled: true } }),
        fixture({ fixtureId: 7_003, status: { short: "FT", isFinished: true } }),
      ],
      requestMeta: { fetchedAt: FETCHED },
    }),
  };
  const result = await listLiveFixtures(gateway, { competitions: [{ id: 239, key: "colombiaPrimeraA" }] });
  assert.deepEqual(result.fixtures.map((item) => item.fixtureId), [7_001]);
});

test("13. una línea LIVE de goles no hereda estimated_probability, línea ni sports_score de una selección PREMATCH distinta", () => {
  const prematch = {
    analysis_id: "prematch-goals",
    fixture_id: 7_001,
    created_at: "2026-08-23T08:00:00.000Z",
    phase: "hours_before",
    kickoff_distance_minutes: 120,
    director: {
      market_evaluated: { family: "goals", label: "Goles" },
      selection: "Over 2.5",
      line: 2.5,
      estimated_probability: 0.85,
      // Centinela deliberadamente fuera del rango real de sports_score LIVE
      // (siempre queda clamped en [42, 84]): si el LIVE lo copiara, este
      // valor sería imposible de alcanzar por el propio cálculo LIVE.
      sports_verdict: { sports_score: 999, direction: "over" },
    },
  };
  // Fixture LIVE con 3 goles acumulados (home 2 - away 1): la línea LIVE
  // natural es current_total + 0.5 = 3.5, distinta de la línea prematch (2.5).
  const result = analyzeLiveMatch({
    analysisId: "id",
    competitionKey: "colombiaPrimeraA",
    fixture: fixture(),
    statistics: statistics(),
    fixtureFetchedAt: FETCHED,
    statisticsFetchedAt: FETCHED,
    analyzedAt: NOW,
    prematchContext: prematch,
  });
  const goalsAssessment = result.market_assessments.find((item) => item.market_family === "goals");
  const liveCandidate = goalsAssessment.candidate;

  // 1. Usa su propia línea LIVE exacta, no la línea prematch.
  assert.ok(liveCandidate);
  assert.equal(liveCandidate.line, 3.5);
  assert.notEqual(liveCandidate.line, prematch.director.line);

  // 2. No hereda la probabilidad prematch (0.85) de ninguna forma.
  assert.notEqual(liveCandidate.estimated_probability, prematch.director.estimated_probability);

  // 3. No copia el sports_score/soporte prematch (imposible por rango, ver centinela).
  assert.notEqual(liveCandidate.sports_score, prematch.director.sports_verdict.sports_score);

  // 4. El pipeline LIVE no tiene modelo propio de probabilidad: queda null/unavailable,
  //    nunca "0.85" ni ningún otro valor fabricado.
  assert.equal(liveCandidate.estimated_probability, null);
  assert.equal(result.director.estimated_probability, null);
  assert.equal(result.director.probability_status, "unavailable");

  // 5. El candidato se construyó realmente desde evidencia LIVE (minuto/acumulado),
  //    no desde una copia prematch.
  assert.ok(liveCandidate.reasons.some((text) => /Minuto 70/.test(text)));
});

test("14. selectLatestPrematchAnalysis rechaza kickoff_distance_minutes ausente, null, NaN o no numérico", () => {
  const missing = prematchAnalysisVersion({ analysis_id: "missing" });
  delete missing.kickoff_distance_minutes;
  const nullValue = prematchAnalysisVersion({ analysis_id: "null", kickoff_distance_minutes: null });
  const notANumber = prematchAnalysisVersion({ analysis_id: "nan", kickoff_distance_minutes: NaN });
  const nonNumeric = prematchAnalysisVersion({ analysis_id: "string", kickoff_distance_minutes: "pronto" });
  for (const record of [missing, nullValue, notANumber, nonNumeric]) {
    assert.equal(selectLatestPrematchAnalysis([record]), null, `debería rechazar ${record.analysis_id}`);
  }
});
