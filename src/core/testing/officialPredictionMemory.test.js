import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createMemoryBetLedger } from "../infrastructure/betLedger.js";
import { createMemoryPredictionLedger } from "../infrastructure/predictionLedger.js";
import { createFilePredictionLedger } from "../infrastructure/predictionLedgerFile.js";
import {
  calculateOfficialPredictionCalibration,
  calculateOfficialPredictionMetrics,
  createOfficialPredictionSnapshot,
  officialPredictionEligibility,
  resolveOfficialPrediction,
} from "../intelligence/officialPrediction.js";
import { buildAtlasCombination, COMBINATION_MODE, COMBINATION_PRODUCT } from "../intelligence/atlasCombinationEngine.js";
import { predictionApiGet, predictionApiPatch, predictionApiPost } from "../services/predictionMemoryApi.js";
import { createPredictionMemoryService } from "../services/predictionMemoryService.js";

const ISSUED_AT = "2026-08-14T16:00:00.000Z";

function analysis(overrides = {}) {
  const base = {
    contract: "OperationalAnalysisVersion",
    analysis_id: "analysis-001",
    fixture_id: 1520819,
    created_at: ISSUED_AT,
    phase: "day_before",
    engine_version: "atlas-operational-v2",
    inputs: { reanalysis: true, competitionKey: "brasilSerieB", season: 2026, date: "2026-08-16", timezone: "America/Bogota" },
    evidence: [{ source_ref: "fixture:1520819" }],
    active_quote: { quote_id: "q-1", fixture_id: 1520819, market_family: "goals", selection: "Under 2.5", direction: "under", line: 2.5, bookmaker_name: "Betano", decimal_odds: 1.83, freshness: "fresh", verification_status: "user_reported", consulted_at: ISSUED_AT },
    analysis_confidence: { analysis_confidence_score: 74 },
    preliminary_probability: { point_estimate: 0.7, uncertainty_low: 0.61, uncertainty_high: 0.78, methodology_version: "distribution-v1" },
    gemini_context: { context_id: "gemini-1", selected_items: [] },
    parlay_candidate: { candidate_id: "goals:under:2.5", ranking_version: "ranker-v1" },
    director: {
      contract: "DirectorVerdict",
      version: 3,
      decision_code: "yes",
      display_status: "SÍ — CON CONDICIONES",
      fixture: { fixture_id: 1520819, home_team: "Sport Recife", away_team: "Londrina", competition: "Brasil Serie B", season: 2026, kickoff_utc: "2026-08-16T22:00:00.000Z", timezone: "America/Bogota" },
      analysis_phase: "day_before",
      market_evaluated: { family: "goals", label: "Goles" },
      selection: "Under 2.5",
      line: 2.5,
      analysis_confidence_score: 74,
      estimated_probability: 0.7,
      probability_status: "preliminary",
      probability_uncertainty_low: 0.61,
      probability_uncertainty_high: 0.78,
      probability_methodology: "distribution-v1",
      sports_verdict: { status: "sports_candidate", selection: "Under 2.5", direction: "under", line: 2.5, sports_score: 78, estimated_probability: 0.7, message: "Atlas respalda deportivamente Under 2.5." },
      price_assessment: { status: "favorable_preliminary", freshness: "fresh", source_status: "user_reported_current", bookmaker: "Betano", decimal_odds: 1.83 },
      market_suitability: "suitable_under_conditions",
      simple_reasons: ["Distribución reciente compatible."],
      reasons: ["Muestra verificada."],
      primary_supporting_evidence: "Distribución reciente compatible.",
      scout: { primary_candidate_id: "goals:under:2.5" },
    },
  };
  return {
    ...base,
    ...overrides,
    inputs: { ...base.inputs, ...(overrides.inputs || {}) },
    director: { ...base.director, ...(overrides.director || {}) },
  };
}

function snapshot(overrides = {}, source = analysis()) {
  return createOfficialPredictionSnapshot(source, {
    predictionId: overrides.predictionId || "prediction-001",
    registeredAt: overrides.registeredAt || ISSUED_AT,
  });
}

function settled(status, overrides = {}) {
  const voidAnalysis = analysis({ director: { selection: "Under 3", line: 3, sports_verdict: { status: "sports_candidate", selection: "Under 3", direction: "under", line: 3, sports_score: 78 } } });
  const pending = snapshot({ predictionId: overrides.predictionId || `prediction-${status}-${Math.random()}` }, overrides.analysis || (status === "void" ? voidAnalysis : analysis()));
  if (status === "pending") return pending;
  if (status === "not_evaluable") return resolveOfficialPrediction(pending, { source: "api_football", resolvedAt: ISSUED_AT, notEvaluableReason: "missing_statistics" });
  const actual = status === "hit" ? 1 : status === "miss" ? 4 : 3;
  return resolveOfficialPrediction(pending, { source: "api_football", resolvedAt: ISSUED_AT, actualTotal: actual });
}

test("1. crea el contrato inmutable de official_prediction", () => {
  const item = snapshot();
  assert.equal(item.contract, "OfficialPrediction");
  assert.equal(item.owner_id, "personal");
  assert.equal(item.resolution.status, "pending");
  assert.equal(Object.isFrozen(item), true);
  assert.equal(Object.isFrozen(item.resolution), true);
  assert.throws(() => { item.line = 9.5; }, TypeError);
});

test("2. el snapshot conserva identidad, mercado, probabilidad, cuota y versiones", () => {
  const item = snapshot();
  assert.equal(item.source_analysis_id, "analysis-001");
  assert.equal(item.fixture_id, 1520819);
  assert.equal(item.direction, "under");
  assert.equal(item.estimated_probability, 0.7);
  assert.equal(item.active_quote.decimal_odds, 1.83);
  assert.equal(item.versions.operational_engine, "atlas-operational-v2");
});

test("3. un candidato Scout sin reanálisis completo no es pronóstico oficial", () => {
  const result = officialPredictionEligibility(analysis({ inputs: { reanalysis: false } }));
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("completed_reanalysis_required"));
});

test("4. DirectorAtlas sin respaldo deportivo no emite pronóstico oficial", () => {
  const source = analysis({ director: { sports_verdict: { status: "review_only", selection: "Under 2.5", direction: "under", line: 2.5 } } });
  assert.equal(officialPredictionEligibility(source).eligible, false);
});

test("5. deduplica el mismo snapshot por fingerprint", async () => {
  const ledger = createMemoryPredictionLedger();
  const first = await ledger.appendPrediction(snapshot());
  const retry = await ledger.appendPrediction(snapshot({ predictionId: "prediction-retry" }));
  assert.equal(first.deduplicated, false);
  assert.equal(retry.deduplicated, true);
  assert.equal((await ledger.list()).length, 1);
});

test("6. conserva dos análisis legítimos del mismo fixture", async () => {
  const ledger = createMemoryPredictionLedger();
  await ledger.appendPrediction(snapshot());
  await ledger.appendPrediction(snapshot({ predictionId: "prediction-002" }, analysis({ analysis_id: "analysis-002", created_at: "2026-08-14T18:00:00.000Z" })));
  assert.equal((await ledger.list()).length, 2);
});

test("7. resuelve hit", () => assert.equal(resolveOfficialPrediction(snapshot(), { actualTotal: 1, source: "manual_user_input" }).resolution.status, "hit"));
test("8. resuelve miss", () => assert.equal(resolveOfficialPrediction(snapshot(), { actualTotal: 4, source: "manual_user_input" }).resolution.status, "miss"));
test("9. resuelve void en una línea entera/push", () => {
  const source = analysis({ director: { selection: "Under 3", line: 3, sports_verdict: { status: "sports_candidate", selection: "Under 3", direction: "under", line: 3, sports_score: 78 } } });
  assert.equal(resolveOfficialPrediction(snapshot({}, source), { actualTotal: 3, source: "manual_user_input" }).resolution.status, "void");
});
test("10. resuelve not_evaluable sin inventar un resultado", () => assert.equal(resolveOfficialPrediction(snapshot(), { source: "api_football", notEvaluableReason: "finished_fixture_statistics_missing" }).resolution.status, "not_evaluable"));

test("11. la resolución es idempotente", () => {
  const first = resolveOfficialPrediction(snapshot(), { actualTotal: 1, source: "manual_user_input", resolvedAt: ISSUED_AT });
  assert.equal(resolveOfficialPrediction(first, { actualTotal: 4, source: "manual_user_input" }), first);
});

test("12. una segunda escritura de resolución no añade otro evento", async () => {
  const ledger = createMemoryPredictionLedger();
  await ledger.appendPrediction(snapshot());
  const resolved = resolveOfficialPrediction(snapshot(), { actualTotal: 1, source: "manual_user_input" });
  await ledger.appendResolution(resolved);
  const retry = await ledger.appendResolution(resolveOfficialPrediction(snapshot(), { actualTotal: 4, source: "manual_user_input" }));
  assert.equal(retry.deduplicated, true);
  assert.equal(ledger.events.length, 2);
});

test("13. el hit rate usa únicamente hit y miss", () => {
  const metrics = calculateOfficialPredictionMetrics([settled("hit"), settled("hit"), settled("miss"), settled("void"), settled("not_evaluable"), settled("pending")]);
  assert.equal(metrics.resolved, 5);
  assert.equal(metrics.evaluated, 3);
  assert.equal(metrics.evaluable_decisions, 3);
  assert.equal(metrics.hit_rate, 0.6667);
});

test("14. void no cuenta como miss ni entra al denominador", () => {
  const metrics = calculateOfficialPredictionMetrics([settled("hit"), settled("void")]);
  assert.equal(metrics.hit_rate, 1);
  assert.equal(metrics.misses, 0);
});

test("15. not_evaluable no cuenta como miss ni entra al denominador", () => {
  const metrics = calculateOfficialPredictionMetrics([settled("miss"), settled("not_evaluable")]);
  assert.equal(metrics.hit_rate, 0);
  assert.equal(metrics.misses, 1);
});

test("16. desglosa métricas por familia y competición", () => {
  const metrics = calculateOfficialPredictionMetrics([settled("hit"), settled("miss")]);
  assert.equal(metrics.by_market_family.goals.total, 2);
  assert.equal(metrics.by_competition["Brasil Serie B"].evaluable_decisions, 2);
});

test("17. desglosa confidence y sports score en buckets estables", () => {
  const metrics = calculateOfficialPredictionMetrics([settled("hit")]);
  assert.equal(metrics.by_confidence_bucket["70-79"].total, 1);
  assert.equal(metrics.by_sports_score_bucket["70-79"].total, 1);
});

test("18. calibración reutiliza el motor preliminar y detecta sobreconfianza", () => {
  const predictions = [settled("hit"), settled("miss"), settled("miss"), settled("miss")];
  const calibration = calculateOfficialPredictionCalibration(predictions);
  const band = calibration.bands.find((item) => item.label === "70–79%");
  assert.equal(calibration.source, "official_predictions_only");
  assert.equal(calibration.automatic_learning, false);
  assert.equal(band.calibration_label, "overconfident");
});

test("19. el ledger de archivo persiste tras recarga", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "atlas-predictions-"));
  try {
    const firstStore = createFilePredictionLedger({ directory });
    await (await firstStore.repository()).appendPrediction(snapshot());
    const reloaded = createFilePredictionLedger({ directory });
    const items = await (await reloaded.repository()).list();
    assert.equal(items.length, 1);
    assert.equal(items[0].prediction_id, "prediction-001");
    const ndjson = await readFile(path.join(directory, "prediction-ledger.ndjson"), "utf8");
    assert.match(ndjson, /official_prediction_registered/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("20. una línea NDJSON corrupta se denuncia y no se ignora", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "atlas-predictions-corrupt-"));
  try {
    const file = path.join(directory, "prediction-ledger.ndjson");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(file, "{not-json}\n", "utf8");
    await assert.rejects(() => createFilePredictionLedger({ directory }).repository(), /prediction_ledger_corrupt_line_1/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function serviceHarness({ sourceAnalysis = analysis(), gateway = null } = {}) {
  const ledger = createMemoryPredictionLedger();
  const analyses = { list: async () => [sourceAnalysis] };
  let id = 0;
  const service = createPredictionMemoryService({
    predictionRepositoryFactory: async () => ledger,
    analysisRepositoryFactory: async () => analyses,
    gatewayFactory: gateway ? () => gateway : undefined,
    idFactory: () => `prediction-${++id}`,
    now: () => ISSUED_AT,
  });
  return { ledger, service };
}

test("21. la API registra, lista y devuelve métricas", async () => {
  const { service } = serviceHarness();
  const post = await predictionApiPost(new Request("http://localhost/api/predictions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ analysisId: "analysis-001" }) }), service);
  assert.equal(post.status, 201);
  const get = await predictionApiGet(new Request("http://localhost/api/predictions"), service);
  const body = await get.json();
  assert.equal(body.predictions.length, 1);
  assert.equal(body.metrics.source, "official_predictions_only");
});

test("22. la API resuelve manualmente y deriva el outcome", async () => {
  const { service } = serviceHarness();
  const registered = await service.register({ analysisId: "analysis-001" });
  const response = await predictionApiPatch(new Request("http://localhost/api/predictions", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ predictionId: registered.prediction.prediction_id, source: "manual_user_input", actualTotal: 1 }) }), service);
  const body = await response.json();
  assert.equal(body.update.prediction.resolution.status, "hit");
});

test("23. estadísticas faltantes de un fixture terminado quedan not_evaluable, nunca miss", async () => {
  const gateway = {
    loadFixtureById: async () => ({ fixture: { status: { isFinished: true }, score: { goals: { home: 1, away: 0 } } } }),
    loadFixtureStatistics: async () => ({ status: "empty", statistics: null }),
  };
  const source = analysis({ director: { market_evaluated: { family: "corners", label: "Córners" }, selection: "Under 10.5", line: 10.5, sports_verdict: { status: "sports_candidate", selection: "Under 10.5", direction: "under", line: 10.5, sports_score: 78 } } });
  const { service } = serviceHarness({ sourceAnalysis: source, gateway });
  const registered = await service.register({ analysisId: "analysis-001" });
  const result = await service.resolveOne({ predictionId: registered.prediction.prediction_id, source: "api_football" });
  assert.equal(result.prediction.resolution.status, "not_evaluable");
  assert.notEqual(result.prediction.resolution.status, "miss");
});

test("24. un fixture no terminado permanece pending", async () => {
  const gateway = { loadFixtureById: async () => ({ fixture: { status: { isFinished: false } } }) };
  const { service } = serviceHarness({ gateway });
  const registered = await service.register({ analysisId: "analysis-001" });
  const result = await service.resolveOne({ predictionId: registered.prediction.prediction_id, source: "api_football" });
  assert.equal(result.update_status, "pending");
  assert.equal(result.prediction.resolution.status, "pending");
});

test("25. prediction ledger y bet ledger permanecen independientes", async () => {
  const predictions = createMemoryPredictionLedger();
  const bets = createMemoryBetLedger();
  await predictions.appendPrediction(snapshot());
  assert.equal((await predictions.list()).length, 1);
  assert.equal((await bets.list()).length, 0);
  assert.equal(bets.events.length, 0);
});

function combinationCandidate(fixtureId, officialPredictionId) {
  return {
    fixture_id: fixtureId,
    market_family: "goals",
    direction: "under",
    line: 2.5,
    selection: "Under 2.5",
    official_prediction_id: officialPredictionId,
    sports_score: 80,
    ranking_eligible: true,
    estimated_probability: 0.6,
    price_status: "favorable_preliminary",
    price_gap: 0.04,
    parlay_eligibility: "eligible",
    market_suitability: "suitable_under_conditions",
    active_quote: { fixture_id: fixtureId, market_family: "goals", direction: "under", line: 2.5, decimal_odds: 1.8, verification_status: "user_reported", freshness: "fresh" },
  };
}

test("26. Parlay conserva official_prediction_id cuando existe", () => {
  const result = buildAtlasCombination({ candidates: [combinationCandidate(1, "prediction-1"), combinationCandidate(2, "prediction-2")], product: COMBINATION_PRODUCT.PARLAY, mode: COMBINATION_MODE.AUTOMATIC, selections: 2 });
  assert.equal(result.status, "ready");
  assert.deepEqual(result.selections.map((item) => item.official_prediction_id), ["prediction-1", "prediction-2"]);
});

test("27. Soñadora conserva el contrato de 5 a 15 selecciones", () => {
  const candidates = Array.from({ length: 5 }, (_, index) => combinationCandidate(index + 1, `prediction-${index + 1}`));
  const result = buildAtlasCombination({ candidates, product: COMBINATION_PRODUCT.DREAM, mode: COMBINATION_MODE.AUTOMATIC, selections: 5 });
  assert.equal(result.status, "ready");
  assert.equal(result.selections.length, 5);
});

test("28. dos registros concurrentes del mismo análisis se deduplican en archivo", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "atlas-predictions-concurrent-"));
  try {
    const fileStore = createFilePredictionLedger({ directory });
    const analyses = { list: async () => [analysis()] };
    let id = 0;
    const service = createPredictionMemoryService({
      predictionRepositoryFactory: async () => fileStore.repository(),
      analysisRepositoryFactory: async () => analyses,
      idFactory: () => `concurrent-${++id}`,
      now: () => ISSUED_AT,
    });
    const results = await Promise.all([service.register({ analysisId: "analysis-001" }), service.register({ analysisId: "analysis-001" })]);
    assert.deepEqual(results.map((item) => item.deduplicated), [false, true]);
    assert.equal((await (await fileStore.repository()).list()).length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("29. Memoria Atlas es visible y permite guardar y actualizar resultados", async () => {
  const testingDirectory = path.dirname(fileURLToPath(import.meta.url));
  const appDirectory = path.resolve(testingDirectory, "../../app");
  const [client, memory] = await Promise.all([
    readFile(path.join(appDirectory, "atlas-functional-client.js"), "utf8"),
    readFile(path.join(appDirectory, "atlas-prediction-memory.js"), "utf8"),
  ]);
  assert.match(client, />Memoria Atlas · rendimiento</);
  assert.match(client, /OfficialPredictionRegistration/);
  assert.match(memory, /Guardar pronóstico oficial/);
  assert.match(memory, /Actualizar resultados/);
  assert.match(memory, /Asertividad por mercado/);
  assert.match(memory, /Calibración preliminar/);
});

test("30. la ruta autenticada expone listar, registrar y resolver", async () => {
  const testingDirectory = path.dirname(fileURLToPath(import.meta.url));
  const route = await readFile(path.resolve(testingDirectory, "../../app/api/predictions/route.js"), "utf8");
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /requirePersonalSession/);
});

function v3SportsVerdict(overrides = {}) {
  return {
    status: "sports_candidate",
    selection: "Under 2.5",
    direction: "under",
    line: 2.5,
    sports_score: 78,
    estimated_probability: 0.73,
    preliminary_probability: 0.61,
    probability_percent: 70,
    probability_classification: "BUENA",
    sample_size_effective: 24,
    technical_support_score: 65,
    ranking_eligible: true,
    message: "Atlas respalda deportivamente Under 2.5.",
    ...overrides,
  };
}

test("31. los 5 campos V3 quedan congelados en el snapshot con su valor exacto", () => {
  const source = analysis({ director: { sports_verdict: v3SportsVerdict() } });
  const result = snapshot({}, source);
  assert.equal(result.probability_percent, 70);
  assert.equal(result.probability_classification, "BUENA");
  assert.equal(result.sample_size_effective, 24);
  assert.equal(result.technical_support_score, 65);
  assert.equal(result.ranking_eligible, true);
  assert.ok(Object.isFrozen(result));
});

test("32. estimated_probability se copia de sports_verdict.estimated_probability, nunca de preliminary_probability", () => {
  const source = analysis({ director: { sports_verdict: v3SportsVerdict({ estimated_probability: 0.73, preliminary_probability: 0.61 }) } });
  const result = snapshot({}, source);
  assert.equal(result.estimated_probability, 0.73);
  assert.notEqual(result.estimated_probability, 0.61);
});

test("33. preliminary_probability no sustituye datos V3 ausentes en el snapshot", () => {
  const result = snapshot();
  assert.equal(result.probability_percent, null);
  assert.equal(result.probability_classification, null);
  assert.equal(result.sample_size_effective, null);
  assert.equal(result.technical_support_score, null);
  assert.equal(result.ranking_eligible, false);
});

test("34. resolver una predicción no modifica los campos V3 originales", () => {
  const source = analysis({ director: { sports_verdict: v3SportsVerdict() } });
  const before = snapshot({}, source);
  const after = resolveOfficialPrediction(before, { actualTotal: 2, source: "manual_user_input" });
  assert.equal(after.probability_percent, before.probability_percent);
  assert.equal(after.probability_classification, before.probability_classification);
  assert.equal(after.sample_size_effective, before.sample_size_effective);
  assert.equal(after.technical_support_score, before.technical_support_score);
  assert.equal(after.ranking_eligible, before.ranking_eligible);
});

function asianPrediction(overrides = {}) {
  const source = analysis({
    director: {
      market_evaluated: { family: "asian_total_goals", label: "Asiático (Más/Menos) — Total de goles" },
      selection: overrides.selection || "Over 2.75",
      line: overrides.line ?? 2.75,
      sports_verdict: {
        status: "sports_candidate",
        selection: overrides.selection || "Over 2.75",
        direction: overrides.direction || "over",
        line: overrides.line ?? 2.75,
        sports_score: 78,
        estimated_probability: 0.6,
      },
    },
  });
  return snapshot({ predictionId: `asian-${Math.random()}` }, source);
}

test("35. Asian Total Goals con línea de cuarto liquida half_win explícito, no un hit binario silencioso", () => {
  // Over 2.75 = 50% Over 2.5 + 50% Over 3. Con 3 goles: la mitad de 2.5 gana, la mitad de 3 empata -> half_win.
  const pending = asianPrediction({ direction: "over", line: 2.75 });
  const resolved = resolveOfficialPrediction(pending, { actualTotal: 3, source: "manual_user_input" });
  assert.equal(resolved.resolution.status, "hit");
  assert.equal(resolved.resolution.asian_settlement.status, "half_win");
  assert.equal(resolved.resolution.asian_settlement.parts.length, 2);
});

test("36. Asian Total Goals con línea de cuarto liquida half_loss explícito, no un miss binario silencioso", () => {
  // Over 2.75 con 2 goles: la mitad de 2.5 pierde, la mitad de 3 pierde -> full_loss (no half). Usamos Over 2.25 con 2 goles para half_loss real.
  const pending = asianPrediction({ direction: "over", line: 2.25 });
  const resolved = resolveOfficialPrediction(pending, { actualTotal: 2, source: "manual_user_input" });
  assert.equal(resolved.resolution.status, "miss");
  assert.equal(resolved.resolution.asian_settlement.status, "half_loss");
});

test("37. Asian Total Goals con línea de cuarto también liquida full_win/full_loss explícitos cuando ambas mitades coinciden", () => {
  const fullWinCase = resolveOfficialPrediction(asianPrediction({ direction: "over", line: 2.25 }), { actualTotal: 3, source: "manual_user_input" });
  assert.equal(fullWinCase.resolution.status, "hit");
  assert.equal(fullWinCase.resolution.asian_settlement.status, "full_win");

  const fullLossCase = resolveOfficialPrediction(asianPrediction({ direction: "over", line: 2.75 }), { actualTotal: 1, source: "manual_user_input" });
  assert.equal(fullLossCase.resolution.status, "miss");
  assert.equal(fullLossCase.resolution.asian_settlement.status, "full_loss");
});

test("38. Asian Total Goals con línea entera/media no lleva asian_settlement de cuarto (whole/half quedan en un único tramo)", () => {
  const wholeLine = resolveOfficialPrediction(asianPrediction({ direction: "over", line: 3 }), { actualTotal: 3, source: "manual_user_input" });
  assert.equal(wholeLine.resolution.status, "void");
  assert.equal(wholeLine.resolution.asian_settlement.status, "push");
  assert.equal(wholeLine.resolution.asian_settlement.parts.length, 1);
});

test("39. familias no asiáticas nunca llevan asian_settlement", () => {
  const resolved = resolveOfficialPrediction(snapshot(), { actualTotal: 1, source: "manual_user_input" });
  assert.equal(resolved.market_family, "goals");
  assert.equal(resolved.resolution.asian_settlement, null);
});

test("40. resolución automática por api_football también liquida cuartos asiáticos correctamente", async () => {
  const gateway = {
    loadFixtureById: async () => ({ fixture: { status: { isFinished: true }, score: { goals: { home: 2, away: 1 } } } }),
  };
  const source = analysis({
    director: {
      market_evaluated: { family: "asian_total_goals", label: "Asiático (Más/Menos) — Total de goles" },
      selection: "Over 2.75", line: 2.75,
      sports_verdict: { status: "sports_candidate", selection: "Over 2.75", direction: "over", line: 2.75, sports_score: 78 },
    },
  });
  const { service } = serviceHarness({ sourceAnalysis: source, gateway });
  const registered = await service.register({ analysisId: "analysis-001" });
  const result = await service.resolveOne({ predictionId: registered.prediction.prediction_id, source: "api_football" });
  assert.equal(result.prediction.resolution.status, "hit");
  assert.equal(result.prediction.resolution.asian_settlement.status, "half_win");
  assert.equal(result.prediction.resolution.actual_total, 3);
});

test("41. el snapshot pendiente ya incluye asian_settlement:null antes de resolver (forma estable del contrato)", () => {
  const item = snapshot();
  assert.equal(item.resolution.asian_settlement, null);
});
