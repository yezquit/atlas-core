// Intenta refutar una tesis HIGH/LOW ya formulada por marketOpportunityRadar.js
// usando exclusivamente señales reales ya disponibles (Fase 2): componentes
// contrarios fuertes, reciente contrario, cobertura/coherencia insuficiente y
// evidencia Gemini directamente compatible con la familia de mercado. No
// inventa argumentos: cada elemento de critical_contradictions corresponde a
// una condición verificable en las señales recibidas.

export const ADVERSARIAL_THRESHOLDS = Object.freeze({
  // Gate de muestra sobre unique_fixture_count (fixtures físicos únicos,
  // deduplicados por fixture_id), NO sobre independent_signal_count: ese
  // último puede ser honestamente 0 aunque haya muchos fixtures, si todos se
  // solapan entre perspectivas, y eso no significa "muestra insuficiente".
  MIN_UNIQUE_FIXTURES: 5,
  MIN_SAMPLE_QUALITY: 40,
  STRONG_OPPOSITION_MAGNITUDE: 0.35,
});

export function runAdversarialMarketCheck({
  direction,
  directionalSignals = [],
  audit = null,
  uniqueFixtureCount = 0,
  sampleQuality = 0,
  contextItems = [],
  contextImpacts = [],
  marketFamily = null,
} = {}) {
  if (direction === "neutral" || !direction) {
    return { adversarial_passed: false, critical_contradictions: ["no_thesis_to_defend"], opposing_strength: 0 };
  }

  const criticalContradictions = [];
  if (uniqueFixtureCount < ADVERSARIAL_THRESHOLDS.MIN_UNIQUE_FIXTURES) {
    criticalContradictions.push("insufficient_unique_fixture_sample");
  }
  if (sampleQuality < ADVERSARIAL_THRESHOLDS.MIN_SAMPLE_QUALITY) {
    criticalContradictions.push("insufficient_sample_quality");
  }
  if (audit?.model_coherence_warning) {
    criticalContradictions.push("model_coherence_warning");
  }

  const opposite = direction === "high" ? "low" : "high";
  const strongOpposing = directionalSignals.filter((signal) =>
    signal.direction === opposite && Math.abs(signal.magnitude ?? 0) >= ADVERSARIAL_THRESHOLDS.STRONG_OPPOSITION_MAGNITUDE
  );
  criticalContradictions.push(...strongOpposing.map((signal) => `strong_opposing_signal:${signal.name}`));

  const recentOpposing = directionalSignals.filter((signal) =>
    ["recent_home", "recent_away"].includes(signal.name) && signal.direction === opposite
  );
  criticalContradictions.push(...recentOpposing.map((signal) => `recent_contrario:${signal.name}`));

  // Evidencia Gemini: solo cuenta si el impacto mapeado declara explícitamente
  // esta market_family entre sus affected_markets (mismo gate que
  // isDirectMarketEvidence en marketComponentAdapter.js).
  const compatibleImpacts = (contextImpacts || []).filter((item) => item?.affected_markets?.includes(marketFamily));
  const geminiOpposing = compatibleImpacts.filter((item) =>
    (direction === "high" && item.direction === "decrease") || (direction === "low" && item.direction === "increase")
  );
  criticalContradictions.push(...geminiOpposing.map((item) => `gemini_contrario:${item.explanation || item.id || "evidencia"}`));

  // Una contradicción de Gemini solo puede bloquear ESTA tesis si el propio
  // ítem de contradicción se mapea (vía mapGeminiImpacts) a un impacto
  // compatible con marketFamily. Una contradicción sobre otra familia (p.ej.
  // shots_on_goal) nunca bloquea una tesis de corners.
  const contradictionItemIds = new Set(
    (contextItems || []).filter((item) => item?.kind === "contradiction").map((item) => item.id)
  );
  const compatibleContradictions = (contextImpacts || []).filter((impact) =>
    contradictionItemIds.has(impact.source_item_id) && impact.affected_markets?.includes(marketFamily)
  );
  if (compatibleContradictions.length) criticalContradictions.push("gemini_critical_contradiction");

  return {
    adversarial_passed: criticalContradictions.length === 0,
    critical_contradictions: criticalContradictions,
    opposing_strength: criticalContradictions.length,
  };
}
