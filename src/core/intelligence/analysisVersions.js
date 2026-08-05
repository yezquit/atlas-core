import { createOperationalAnalysisVersion, phaseForKickoff } from "../contracts/operationalContracts.js";

export function buildAnalysisVersion(input, { idFactory, now = () => new Date().toISOString() } = {}) {
  const createdAt = now();
  const timing = phaseForKickoff(input.fixture?.date?.utc, createdAt);
  return createOperationalAnalysisVersion({
    analysisId: idFactory ? idFactory() : `analysis-${Date.parse(createdAt)}-${input.fixture?.fixtureId}`,
    fixtureId: input.fixture?.fixtureId,
    createdAt,
    kickoffDistanceMinutes: timing.kickoffDistanceMinutes,
    phase: input.phase || timing.phase,
    inputs: input.inputs,
    evidence: input.evidence,
    odds: input.odds,
    activeQuote: input.activeQuote,
    geminiContext: input.geminiContext,
    analysisConfidence: input.analysisConfidence,
    preliminaryProbability: input.preliminaryProbability,
    parlayCandidate: input.parlayCandidate,
    director: input.director,
    parlay: input.parlay,
    engineVersion: input.engineVersion,
  });
}

function signature(item) {
  return item?.id || item?.quote_id || item?.source_ref || JSON.stringify(item);
}

export function compareAnalysisVersions(previous, current) {
  if (!previous || !current || Number(previous.fixture_id) !== Number(current.fixture_id)) {
    return { comparable: false, explanation: "Las versiones no pertenecen al mismo fixture." };
  }
  const previousEvidence = new Map((previous.evidence || []).map((item) => [signature(item), item]));
  const currentEvidence = new Map((current.evidence || []).map((item) => [signature(item), item]));
  const newEvidence = [...currentEvidence.keys()].filter((key) => !previousEvidence.has(key));
  const removedEvidence = [...previousEvidence.keys()].filter((key) => !currentEvidence.has(key));
  const previousOdds = previous.director?.odds ?? null;
  const currentOdds = current.director?.odds ?? null;
  const previousActiveQuote = previous.active_quote || null;
  const currentActiveQuote = current.active_quote || null;
  const previousDirector = previous.director || {};
  const currentDirector = current.director || {};
  const previousRisks = new Set(previous.director?.risks || []);
  const currentRisks = new Set(current.director?.risks || []);
  const changes = {
    new_evidence: newEvidence,
    removed_or_stale_evidence: removedEvidence,
    lineup_change: previous.inputs?.lineup_status !== current.inputs?.lineup_status,
    referee_change: previous.inputs?.referee_status !== current.inputs?.referee_status,
    injury_change: previous.inputs?.injury_status !== current.inputs?.injury_status,
    weather_change: previous.inputs?.weather_status !== current.inputs?.weather_status,
    line_change: previous.director?.line !== current.director?.line,
    odds_change: previousOdds !== currentOdds,
    active_quote_change: previousActiveQuote?.quote_id !== currentActiveQuote?.quote_id,
    confidence_change: (current.analysis_confidence?.analysis_confidence_score || 0) - (previous.analysis_confidence?.analysis_confidence_score || 0),
    probability_change: (current.preliminary_probability?.point_estimate ?? null) !== (previous.preliminary_probability?.point_estimate ?? null),
    probability_status_change: current.preliminary_probability?.probability_status !== previous.preliminary_probability?.probability_status,
    uncertainty_change: previous.preliminary_probability?.uncertainty_low !== current.preliminary_probability?.uncertainty_low || previous.preliminary_probability?.uncertainty_high !== current.preliminary_probability?.uncertainty_high,
    price_evaluation_change: previousDirector.price_assessment?.status !== currentDirector.price_assessment?.status,
    individual_eligibility_change: previousDirector.individual_eligibility !== currentDirector.individual_eligibility,
    parlay_eligibility_change: previousDirector.parlay_eligibility !== currentDirector.parlay_eligibility,
    gemini_change: JSON.stringify(previous.gemini_context?.selected_items || []) !== JSON.stringify(current.gemini_context?.selected_items || []),
    risk_change: JSON.stringify(previous.director?.risks || []) !== JSON.stringify(current.director?.risks || []),
    suitability_change: previous.director?.market_suitability !== current.director?.market_suitability,
    verdict_change: previous.director?.verdict !== current.director?.verdict,
    preliminary_probability: { previous: previous.preliminary_probability?.point_estimate ?? null, current: current.preliminary_probability?.point_estimate ?? null },
    uncertainty_interval: {
      previous: { low: previous.preliminary_probability?.uncertainty_low ?? null, high: previous.preliminary_probability?.uncertainty_high ?? null },
      current: { low: current.preliminary_probability?.uncertainty_low ?? null, high: current.preliminary_probability?.uncertainty_high ?? null },
    },
    analysis_confidence: { previous: previous.analysis_confidence?.analysis_confidence_score ?? null, current: current.analysis_confidence?.analysis_confidence_score ?? null },
    suitability: { previous: previous.director?.market_suitability || null, current: current.director?.market_suitability || null },
    price_evaluation: { previous: previousDirector.price_assessment?.status || null, current: currentDirector.price_assessment?.status || null },
    individual_eligibility: { previous: previousDirector.individual_eligibility || null, current: currentDirector.individual_eligibility || null },
    parlay_eligibility: { previous: previousDirector.parlay_eligibility || null, current: currentDirector.parlay_eligibility || null },
    verdict: { previous: previous.director?.verdict || null, current: current.director?.verdict || null },
    line: { previous: previous.director?.line ?? null, current: current.director?.line ?? null },
    odds: { previous: previousOdds, current: currentOdds },
    active_quote: { previous: previousActiveQuote, current: currentActiveQuote },
    gemini_items_incorporated: current.gemini_context?.selected_items || [],
    new_risks: [...currentRisks].filter((item) => !previousRisks.has(item)),
    resolved_risks: [...previousRisks].filter((item) => !currentRisks.has(item)),
    missing_data: current.director?.missing_data || [],
  };
  const explanations = [];
  if (newEvidence.length) explanations.push(`Se incorporaron ${newEvidence.length} elementos de evidencia.`);
  if (removedEvidence.length) explanations.push(`Se retiraron o vencieron ${removedEvidence.length} elementos.`);
  if (changes.lineup_change) explanations.push("Cambió el estado de las alineaciones.");
  if (changes.injury_change) explanations.push("Cambió el reporte de bajas.");
  if (changes.line_change || changes.odds_change) explanations.push("Cambió la línea o la cuota del mercado.");
  if (changes.probability_change || changes.probability_status_change) explanations.push("Cambió la estimación deportiva preliminar o su disponibilidad.");
  if (changes.uncertainty_change) explanations.push("Cambió el intervalo de incertidumbre.");
  if (changes.price_evaluation_change || changes.individual_eligibility_change || changes.parlay_eligibility_change) explanations.push("Se recalcularon la evaluación de precio, la aptitud individual y la elegibilidad para parlay.");
  if (changes.gemini_change) explanations.push(`Se incorporaron ${changes.gemini_items_incorporated.length} elementos seleccionados del contexto manual de Gemini.`);
  if (changes.risk_change) explanations.push("Cambió el inventario de riesgos considerado.");
  if (changes.suitability_change || changes.verdict_change) explanations.push("DirectorAtlas actualizó el dictamen según los cambios observados.");
  if (changes.gemini_change && !changes.price_evaluation_change && !changes.individual_eligibility_change && !changes.parlay_eligibility_change && !changes.verdict_change) explanations.push("El contexto complementario no fue suficiente para modificar el dictamen; no aporta evidencia suficiente para modificar la evaluación económica.");
  if (!explanations.length) explanations.push("No hubo cambios materiales; el dictamen se mantiene.");
  return { contract: "AnalysisVersionDiff", version: 1, comparable: true, previous_analysis_id: previous.analysis_id, current_analysis_id: current.analysis_id, changes, explanation: explanations.join(" ") };
}
