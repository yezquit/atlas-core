import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createMemoryPredictionLedger } from "../infrastructure/predictionLedger.js";
import { createProviderRuntime } from "../infrastructure/providerRuntime.js";
import { createSportsDataGateway } from "../services/sportsDataGateway.js";
import { analyzeLiveFixture, listLiveFixtures } from "../services/liveAnalysisService.js";
import { createPredictionMemoryService } from "../services/predictionMemoryService.js";
import { createOfficialPredictionSnapshot, calculateOfficialPredictionMetrics, resolveOfficialPrediction } from "../intelligence/officialPrediction.js";
import { predictionApiPost } from "../services/predictionMemoryApi.js";
import { analyzeLiveMatch, assessLiveFixture, createLiveMatchSnapshot, normalizeLiveOdds, projectLiveTotal } from "../intelligence/liveMatchAnalysisEngine.js";

const testingDirectory = path.dirname(fileURLToPath(import.meta.url));
const NOW = "2026-08-23T11:10:10.000Z";
const FETCHED = "2026-08-23T11:10:00.000Z";

function fixture(overrides = {}) {
  return { fixtureId: 7001, competition: { id: 239, name: "Primera A", season: 2026, round: "Clausura" }, date: { kickoff_utc: "2026-08-23T10:00:00.000Z" }, status: { short: "2H", long: "Second Half", elapsed: 70, isLive: true, isFinished: false, isScheduled: false }, teams: { home: { id: 1, name: "Atlas Norte" }, away: { id: 2, name: "Atlas Sur" } }, score: { goals: { home: 2, away: 1 } }, ...overrides };
}

function statistics() {
  const values = (id, name, totalShots, shots, corners, cards, possession) => ({ team: { id, name }, statistics: { total_shots: { value: totalShots }, shots_on_goal: { value: shots }, corner_kicks: { value: corners }, yellow_cards: { value: cards }, red_cards: { value: 0 }, fouls: { value: 10 }, ball_possession: { value: possession } } });
  return { availableStats: ["total_shots", "shots_on_goal", "corner_kicks", "yellow_cards", "red_cards", "fouls", "ball_possession"], teams: [values(1, "Atlas Norte", 18, 8, 7, 3, 55), values(2, "Atlas Sur", 12, 5, 5, 2, 45)] };
}

function oddsPayload({ stopped = false, fixtureId = 7001, main = true } = {}) {
  return [{ fixture: { id: fixtureId }, status: { stopped }, update: FETCHED, bookmakers: [{ id: 9, name: "Casa LIVE", bets: [{ id: 5, name: "Total Corners Over Under", values: [{ value: "Over 12.5", odd: "1.91", main }] }] }] }];
}

function analysis(overrides = {}) {
  return { ...analyzeLiveMatch({ analysisId: "live-analysis-1", competitionKey: "colombiaPrimeraA", fixture: fixture(), statistics: statistics(), liveOddsPayload: oddsPayload(), fixtureFetchedAt: FETCHED, statisticsFetchedAt: FETCHED, oddsFetchedAt: FETCHED, analyzedAt: NOW }), ...overrides };
}

test("LIVE 1. reconoce un fixture activo", () => assert.equal(assessLiveFixture(fixture()).status, "active"));
test("LIVE 2. rechaza un fixture no iniciado", () => assert.equal(assessLiveFixture(fixture({ status: { short: "NS", isScheduled: true } })).status, "not_started"));
test("LIVE 3. rechaza un fixture finalizado", () => assert.equal(assessLiveFixture(fixture({ status: { short: "FT", isFinished: true } })).status, "finished"));
test("LIVE 4. rechaza un fixture suspendido", () => assert.equal(assessLiveFixture(fixture({ status: { short: "SUSP", elapsed: 55, isLive: true } })).status, "inactive"));
test("LIVE 5. exige minuto y marcador reales", () => assert.equal(assessLiveFixture(fixture({ status: { short: "2H", elapsed: null }, score: { goals: { home: null, away: 1 } } })).status, "invalid"));

test("LIVE 6. snapshot conserva marcador, minuto y estadísticas", () => {
  const result = createLiveMatchSnapshot({ fixture: fixture(), statistics: statistics(), fixtureFetchedAt: FETCHED, statisticsFetchedAt: FETCHED, snapshotAt: NOW });
  assert.equal(result.snapshot.minute, 70); assert.deepEqual(result.snapshot.score, { home: 2, away: 1 }); assert.equal(result.snapshot.totals.corners, 12);
});
test("LIVE 7. snapshot queda inmutable", () => assert.equal(Object.isFrozen(createLiveMatchSnapshot({ fixture: fixture(), fixtureFetchedAt: FETCHED, snapshotAt: NOW }).snapshot), true));
test("LIVE 8. snapshot stale queda unavailable", () => assert.equal(createLiveMatchSnapshot({ fixture: fixture(), fixtureFetchedAt: "2026-08-23T11:00:00.000Z", snapshotAt: NOW }).status, "unavailable"));
test("LIVE 9. un cambio de minuto genera otro snapshot", () => {
  const first = createLiveMatchSnapshot({ fixture: fixture(), fixtureFetchedAt: FETCHED, snapshotAt: NOW }).snapshot.snapshot_id;
  const second = createLiveMatchSnapshot({ fixture: fixture({ status: { ...fixture().status, elapsed: 71 } }), fixtureFetchedAt: FETCHED, snapshotAt: NOW }).snapshot.snapshot_id;
  assert.notEqual(first, second);
});
test("LIVE 9b. un cambio material de estadísticas genera otro snapshot", () => { const firstStats = statistics(); const secondStats = statistics(); secondStats.teams[0].statistics.ball_possession.value = 57; const first = createLiveMatchSnapshot({ fixture: fixture(), statistics: firstStats, fixtureFetchedAt: FETCHED, statisticsFetchedAt: FETCHED, snapshotAt: NOW }).snapshot.snapshot_id; const second = createLiveMatchSnapshot({ fixture: fixture(), statistics: secondStats, fixtureFetchedAt: FETCHED, statisticsFetchedAt: FETCHED, snapshotAt: NOW }).snapshot.snapshot_id; assert.notEqual(first, second); });

test("LIVE 10. proyección temprana queda insuficiente", () => assert.equal(projectLiveTotal({ marketFamily: "goals", currentTotal: 1, minute: 5, statusShort: "1H" }).status, "insufficient_information"));
test("LIVE 11. proyección no usa la extrapolación lineal como salida final", () => assert.equal(projectLiveTotal({ marketFamily: "corners", currentTotal: 8, minute: 20, statusShort: "1H" }).controls.linear_projection_used_as_final, false));
test("LIVE 12. proyección extrema se acota", () => {
  const result = projectLiveTotal({ marketFamily: "total_shots", currentTotal: 50, minute: 10, statusShort: "1H" });
  assert.equal(result.controls.rate_clamped, true); assert.ok(result.projected_additional <= result.controls.time_scaled_additional_cap);
});

test("LIVE 13. acepta cuota live exacta, principal y fresca", () => assert.equal(normalizeLiveOdds(oddsPayload(), { fixtureId: 7001, fetchedAt: FETCHED, now: NOW }).length, 1));
test("LIVE 14. rechaza cuota de otro fixture", () => assert.equal(normalizeLiveOdds(oddsPayload({ fixtureId: 999 }), { fixtureId: 7001, fetchedAt: FETCHED, now: NOW }).length, 0));
test("LIVE 15. rechaza mercado live detenido", () => assert.equal(normalizeLiveOdds(oddsPayload({ stopped: true }), { fixtureId: 7001, fetchedAt: FETCHED, now: NOW }).length, 0));
test("LIVE 16. rechaza precio no principal", () => assert.equal(normalizeLiveOdds(oddsPayload({ main: false }), { fixtureId: 7001, fetchedAt: FETCHED, now: NOW }).length, 0));
test("LIVE 17. rechaza cuota live vencida", () => assert.equal(normalizeLiveOdds(oddsPayload(), { fixtureId: 7001, fetchedAt: "2026-08-23T11:00:00.000Z", now: NOW }).length, 0));
test("LIVE 17b. payload prematch no se trata como cuota live", () => { const payload = oddsPayload().map(({ status: _status, ...item }) => item); assert.equal(normalizeLiveOdds(payload, { fixtureId: 7001, fetchedAt: FETCHED, now: NOW }).length, 0); });
test("LIVE 17c. una línea de primer tiempo no se trata como total del partido", () => { const payload = oddsPayload(); payload[0].bookmakers[0].bets[0].name = "Over/Under Line (1st Half)"; assert.equal(normalizeLiveOdds(payload, { fixtureId: 7001, fetchedAt: FETCHED, now: NOW }).length, 0); });
test("LIVE 17d. una cotización sin timestamp live verificable se rechaza", () => { const payload = oddsPayload(); delete payload[0].update; assert.equal(normalizeLiveOdds(payload, { fixtureId: 7001, fetchedAt: FETCHED, now: NOW }).length, 0); });

test("LIVE 18. análisis mantiene probabilidad unavailable", () => { const result = analysis(); assert.equal(result.director.estimated_probability, null); assert.equal(result.director.probability_status, "unavailable"); });
test("LIVE 19. DirectorAtlas es la voz pública", () => assert.equal(analysis().director.voice, "DirectorAtlas"));
test("LIVE 20. Director puede decir sí solo con umbrales satisfechos", () => { const result = analysis(); assert.equal(result.director.analysis_decision.status, "yes"); assert.ok(result.director.sports_verdict.sports_score >= 68); assert.ok(result.director.analysis_confidence_score >= 58); });
test("LIVE 21. falta de estadísticas no inventa totales", () => { const result = analyzeLiveMatch({ analysisId: "partial", competitionKey: "colombiaPrimeraA", fixture: fixture(), fixtureFetchedAt: FETCHED, analyzedAt: NOW }); assert.equal(result.snapshot.totals.corners, null); assert.equal(result.market_assessments.find((item) => item.market_family === "corners").status, "insufficient_information"); });
test("LIVE 22. cuota observada no se presenta como valor esperado", () => { const result = analysis(); assert.match(result.director.price_assessment.message, /no estima valor/i); });
test("LIVE 22b. una línea live incompatible no se activa", () => { const payload = oddsPayload(); payload[0].bookmakers[0].bets[0].values[0].value = "Over 13.5"; const result = analyzeLiveMatch({ analysisId: "line", competitionKey: "colombiaPrimeraA", fixture: fixture(), statistics: statistics(), liveOddsPayload: payload, fixtureFetchedAt: FETCHED, statisticsFetchedAt: FETCHED, oddsFetchedAt: FETCHED, analyzedAt: NOW }); assert.equal(result.active_quote, null); });
test("LIVE 22c. análisis deportivo funciona sin cuota", () => { const result = analyzeLiveMatch({ analysisId: "no-price", competitionKey: "colombiaPrimeraA", fixture: fixture(), statistics: statistics(), fixtureFetchedAt: FETCHED, statisticsFetchedAt: FETCHED, analyzedAt: NOW }); assert.equal(result.status, "success"); assert.equal(result.director.price_assessment.status, "unavailable"); });

test("LIVE 23. catálogo oculta finalizados y suspendidos", async () => {
  const gateway = { loadLiveFixtures: async () => ({ status: "success", fixtures: [fixture(), fixture({ fixtureId: 2, status: { short: "FT", isFinished: true } }), fixture({ fixtureId: 3, status: { short: "SUSP", elapsed: 50 } })], requestMeta: { fetchedAt: FETCHED } }) };
  const result = await listLiveFixtures(gateway); assert.deepEqual(result.fixtures.map((item) => item.fixtureId), [7001]);
});
test("LIVE 24. catálogo vacío comunica que no hay partidos", async () => { const result = await listLiveFixtures({ loadLiveFixtures: async () => ({ status: "empty", fixtures: [] }) }); assert.equal(result.status, "empty"); assert.match(result.message, /No hay partidos en vivo/i); });
test("LIVE 25. servicio rechaza fixture terminado antes de pedir estadísticas", async () => {
  let called = false; const gateway = { loadLiveFixtureById: async () => ({ status: "success", fixture: fixture({ status: { short: "FT", isFinished: true } }), requestMeta: { fetchedAt: FETCHED } }), loadFixtureStatistics: async () => { called = true; }, loadLiveFixtureOdds: async () => { called = true; } };
  const result = await analyzeLiveFixture({ fixtureId: 7001, competitionKey: "colombiaPrimeraA" }, gateway, { idFactory: () => "id", now: () => NOW }); assert.equal(result.fixture_state, "finished"); assert.equal(called, false);
});
test("LIVE 26. servicio degrada errores de estadísticas y odds sin fabricar", async () => {
  const gateway = { loadLiveFixtureById: async () => ({ status: "success", fixture: fixture(), requestMeta: { fetchedAt: FETCHED } }), loadFixtureStatistics: async () => { throw new Error("secret"); }, loadLiveFixtureOdds: async () => { throw new Error("secret"); } };
  const result = await analyzeLiveFixture({ fixtureId: 7001, competitionKey: "colombiaPrimeraA" }, gateway, { idFactory: () => "id", now: () => NOW }); assert.equal(result.status, "success"); assert.equal(result.provider_status.statistics, "provider_error"); assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("LIVE 27. gateway usa endpoints LIVE separados de odds prepartido", async () => {
  const calls = []; const runtime = { request: async (input) => { calls.push(input); return { status: "success", response: [], requestMeta: { fetchedAt: FETCHED } }; } }; const gateway = createSportsDataGateway(runtime);
  await gateway.loadLiveFixtures({ competitions: [{ id: 239 }], timezone: "America/Bogota" }); await gateway.loadLiveFixtureStatistics(7001); await gateway.loadLiveFixtureOdds(7001);
  assert.deepEqual(calls.map((item) => item.pathname), ["/fixtures", "/fixtures/statistics", "/odds/live"]); assert.equal(calls[0].query.live, "239"); assert.equal(calls[1].cacheScope, "live"); assert.equal(calls[1].ttlSeconds, 60);
});
test("LIVE 27b. caché de estadísticas live no reutiliza el scope prematch", async () => { let calls = 0; const runtime = createProviderRuntime({ apiKey: "test", baseUrl: "https://v3.football.api-sports.io", budget: 3, fetchImpl: async () => { calls += 1; return new Response(JSON.stringify({ response: [] }), { status: 200, headers: { "content-type": "application/json" } }); } }); await runtime.request({ pathname: "/fixtures/statistics", query: { fixture: 7001 }, ttlSeconds: 1800 }); await runtime.request({ pathname: "/fixtures/statistics", query: { fixture: 7001 }, ttlSeconds: 60, cacheScope: "live" }); assert.equal(calls, 2); });

test("LIVE 28. snapshot oficial conserva contexto live y probabilidad null", () => { const prediction = createOfficialPredictionSnapshot(analysis(), { predictionId: "p-live", registeredAt: NOW }); assert.equal(prediction.mode, "live"); assert.equal(prediction.estimated_probability, null); assert.equal(prediction.live_context.minute, 70); });
test("LIVE 29. reintento del mismo snapshot se deduplica", async () => { const ledger = createMemoryPredictionLedger(); const first = createOfficialPredictionSnapshot(analysis(), { predictionId: "p1", registeredAt: NOW }); const second = createOfficialPredictionSnapshot(analysis({ analysis_id: "retry-id" }), { predictionId: "p2", registeredAt: NOW }); await ledger.appendPrediction(first); assert.equal((await ledger.appendPrediction(second)).deduplicated, true); });
test("LIVE 30. un snapshot posterior permite otro pronóstico", () => { const base = analysis(); const first = createOfficialPredictionSnapshot(base, { predictionId: "p1" }); const later = { ...base, snapshot: { ...base.snapshot, snapshot_id: `${base.snapshot.snapshot_id}-71`, minute: 71 } }; const second = createOfficialPredictionSnapshot(later, { predictionId: "p2" }); assert.notEqual(first.fingerprint, second.fingerprint); });
test("LIVE 31. métricas separan prematch, live y tramo de minuto", () => { const live = createOfficialPredictionSnapshot(analysis(), { predictionId: "p1" }); const prematch = { ...live, prediction_id: "p2", fingerprint: "other", mode: "prematch", live_context: undefined }; const metrics = calculateOfficialPredictionMetrics([live, prematch]); assert.equal(metrics.by_mode.live.total, 1); assert.equal(metrics.by_mode.prematch.total, 1); assert.equal(metrics.by_live_minute_bucket["61-75"].total, 1); });
test("LIVE 32. memoria registra desde un análisis live confiable", async () => { const ledger = createMemoryPredictionLedger(); const service = createPredictionMemoryService({ predictionRepositoryFactory: async () => ledger, analysisRepositoryFactory: async () => ({ list: async () => [] }), idFactory: () => "saved", liveAnalysisFinder: () => analysis(), now: () => NOW }); const result = await service.registerLive({ liveAnalysisId: "live-analysis-1" }); assert.equal(result.prediction.mode, "live"); });

test("LIVE 32b. resolución live reutiliza hit, miss, void y not_evaluable", () => { const prediction = createOfficialPredictionSnapshot(analysis(), { predictionId: "settle" }); assert.equal(resolveOfficialPrediction(prediction, { actualTotal: 13, source: "test" }).resolution.status, "hit"); assert.equal(resolveOfficialPrediction(prediction, { actualTotal: 12, source: "test" }).resolution.status, "miss"); assert.equal(resolveOfficialPrediction(prediction, { actualTotal: 12.5, source: "test" }).resolution.status, "void"); assert.equal(resolveOfficialPrediction(prediction, { source: "test", notEvaluableReason: "missing_final_stat" }).resolution.status, "not_evaluable"); });
test("LIVE 32c. filtrar live no contamina métricas prematch", () => { const live = createOfficialPredictionSnapshot(analysis(), { predictionId: "live" }); const resolvedLive = resolveOfficialPrediction(live, { actualTotal: 12, source: "test" }); const prematch = resolveOfficialPrediction({ ...live, prediction_id: "pre", fingerprint: "pre", mode: "prematch" }, { actualTotal: 13, source: "test" }); const metrics = calculateOfficialPredictionMetrics([resolvedLive, prematch], { mode: "prematch" }); assert.equal(metrics.total, 1); assert.equal(metrics.hit_rate, 1); });
test("LIVE 32d. API registra un pronóstico live", async () => { const service = { registerLive: async ({ liveAnalysisId }) => ({ prediction: { prediction_id: liveAnalysisId, mode: "live" }, deduplicated: false }) }; const response = await predictionApiPost(new Request("http://localhost/api/predictions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "live", liveAnalysisId: "live-analysis-1" }) }), service); assert.equal(response.status, 201); assert.equal((await response.json()).prediction.mode, "live"); });

test("LIVE 33. UI visible ofrece actualización, fixture manual y guardado", async () => { const source = await readFile(path.resolve(testingDirectory, "../../app/atlas-live.js"), "utf8"); assert.match(source, /Actualizar LIVE/); assert.match(source, /fixture LIVE conocido/); assert.match(source, /Guardar pronóstico LIVE/); });
test("LIVE 34. navegación separa Atlas LIVE del modo prepartido", async () => { const source = await readFile(path.resolve(testingDirectory, "../../app/atlas-functional-client.js"), "utf8"); assert.match(source, /mainMode === "live"/); assert.match(source, />Atlas LIVE</); });
test("LIVE 35. API LIVE exige sesión personal y expone GET y POST", async () => { const source = await readFile(path.resolve(testingDirectory, "../../app/api/football/live/route.js"), "utf8"); assert.match(source, /requirePersonalSession/); assert.match(source, /export async function GET/); assert.match(source, /export async function POST/); });
