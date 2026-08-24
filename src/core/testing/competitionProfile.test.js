import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPETITION_PROFILE_VERSION,
  buildCompetitionProfileContext,
  createNeutralCompetitionProfile,
  deriveCompetitionProfile,
  deriveCompetitionProfiles,
} from "../intelligence/competitionProfile.js";
import { attachCompetitionProfile } from "../services/sportsIntelligenceService.js";

const identity = { competition: "Liga de prueba", competition_key: "test-league", season: 2026 };

function prediction(id, status, overrides = {}) {
  return {
    prediction_id: id,
    owner_id: "personal",
    ...identity,
    market_family: "goals",
    sports_score: 72,
    estimated_probability: 0.7,
    resolution: { status },
    ...overrides,
  };
}

test("1. el perfil por defecto es neutral", () => {
  assert.equal(createNeutralCompetitionProfile(identity).status, "neutral");
});

test("2. un perfil sin muestra es insufficient_sample", () => {
  assert.equal(deriveCompetitionProfile([], identity).status, "insufficient_sample");
});

test("3. pending no cuenta como evaluado", () => {
  assert.equal(deriveCompetitionProfile([prediction("p", "pending")], identity).observed_performance.evaluated_count, 0);
});

test("4. not_evaluable no cuenta como fallo", () => {
  assert.equal(deriveCompetitionProfile([prediction("n", "not_evaluable")], identity).observed_performance.misses, 0);
});

test("5. void no cuenta como fallo", () => {
  assert.equal(deriveCompetitionProfile([prediction("v", "void")], identity).observed_performance.misses, 0);
});

test("6. cuenta aciertos y fallos resueltos", () => {
  const profile = deriveCompetitionProfile([prediction("h", "hit"), prediction("m", "miss")], identity, { minimumEvaluated: 2 });
  const metrics = profile.observed_performance;
  assert.deepEqual([metrics.hits, metrics.misses], [1, 1]);
  assert.equal(profile.status, "sufficient_sample");
  assert.deepEqual(profile.supported_adjustments, []);
});

test("7. calcula hit_rate sobre evaluables", () => {
  const metrics = deriveCompetitionProfile([prediction("h", "hit"), prediction("m", "miss")], identity, { minimumEvaluated: 2 }).observed_performance;
  assert.equal(metrics.hit_rate, 0.5);
});

test("8. agrupa perfiles por competición", () => {
  const profiles = deriveCompetitionProfiles([prediction("a", "hit"), prediction("b", "miss", { competition: "Otra liga", competition_key: "other" })]);
  assert.equal(profiles.length, 2);
});

test("9. agrupa métricas por market_family", () => {
  const profile = deriveCompetitionProfile([prediction("a", "hit"), prediction("b", "miss", { market_family: "corners" })], identity);
  assert.deepEqual(Object.keys(profile.market_reliability).sort(), ["corners", "goals"]);
});

test("10. Brier usa únicamente probabilidades válidas", () => {
  const profile = deriveCompetitionProfile([prediction("a", "hit", { estimated_probability: 0.8 }), prediction("b", "miss", { estimated_probability: null }), prediction("c", "hit", { estimated_probability: 80 })], identity);
  assert.equal(profile.observed_performance.brier_evaluated_count, 1);
  assert.equal(profile.observed_performance.brier_score, 0.04);
});

test("11. conserva profile_version", () => {
  assert.equal(deriveCompetitionProfile([], identity).profile_version, COMPETITION_PROFILE_VERSION);
});

test("12. adjuntar perfil no cambia sports_score", () => {
  const candidate = { competition: identity.competition, competitionKey: identity.competition_key, season: 2026, sportsScore: 77, probability: 0.64 };
  assert.equal(attachCompetitionProfile(candidate, [createNeutralCompetitionProfile(identity)]).sportsScore, 77);
});

test("13. adjuntar perfil no cambia preliminary_probability", () => {
  const candidate = { competition: identity.competition, competitionKey: identity.competition_key, season: 2026, sportsScore: 77, probability: 0.64 };
  assert.equal(attachCompetitionProfile(candidate, [createNeutralCompetitionProfile(identity)]).probability, 0.64);
});

test("14. Journey puede operar sin perfil", () => {
  const candidate = { competition: identity.competition, competitionKey: identity.competition_key, season: 2026, sportsScore: 77 };
  assert.deepEqual(attachCompetitionProfile(candidate), candidate);
});

test("15. Journey expone un perfil neutral sin alterar ranking", () => {
  const candidate = { competition: identity.competition, competitionKey: identity.competition_key, season: 2026, sportsScore: 77, generalRank: 2 };
  const attached = attachCompetitionProfile(candidate, [createNeutralCompetitionProfile(identity)]);
  assert.equal(attached.generalRank, 2);
  assert.equal(attached.competitionProfile.status, "neutral");
});

test("16. el perfil no inventa etiquetas deportivas", () => {
  const serialized = JSON.stringify(createNeutralCompetitionProfile(identity));
  assert.doesNotMatch(serialized, /muchas tarjetas|pocos goles|rendimiento fuerte/i);
});

test("17. el contexto Gemini solo expone métricas presentes", () => {
  const context = buildCompetitionProfileContext(createNeutralCompetitionProfile(identity));
  assert.match(context, /Contexto observacional/);
  assert.doesNotMatch(context, /buena calibración|liga defensiva|liga ofensiva/i);
});

test("18. perfiles de competiciones distintas no se mezclan", () => {
  const profiles = deriveCompetitionProfiles([prediction("a", "hit"), prediction("b", "miss", { competition: "Otra liga", competition_key: "other" })]);
  assert.equal(profiles.find((item) => item.competition_key === "test-league").observed_performance.misses, 0);
});

test("19. la temporada queda trazable", () => {
  assert.equal(deriveCompetitionProfile([prediction("a", "hit")], identity).season, 2026);
});

test("20. los owners personales permanecen aislados", () => {
  const profile = deriveCompetitionProfile([prediction("a", "hit"), prediction("b", "miss", { owner_id: "other" })], identity);
  assert.deepEqual([profile.observed_performance.hits, profile.observed_performance.misses], [1, 0]);
});
