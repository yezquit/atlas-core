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
    lineOrigin: input.lineOrigin,
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
    return {
      contract: "AnalysisVersionDiff",
      version: 1,
      comparable: false,
      previous_analysis_id: previous?.analysis_id || null,
      current_analysis_id: current?.analysis_id || null,
      fixture_id: current?.fixture_id || null,
      engine_version: current?.engine_version || null,
      explanation: "No hay una versión anterior comparable.",
    };
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
  const previousMissing = new Set(previous.director?.missing_data || []);
  const currentMissing = new Set(current.director?.missing_data || []);
  const previousGemini = new Set((previous.gemini_context?.selected_items || []).map(signature));
  const currentGeminiItems = current.gemini_context?.selected_items || [];
  const incorporatedGeminiItems = currentGeminiItems.filter((item) => !previousGemini.has(signature(item)));
  const pair = (previousValue, currentValue) => ({ previous: previousValue ?? null, current: currentValue ?? null });
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
    analysis_id: pair(previous.analysis_id, current.analysis_id),
    analyzed_at: pair(previous.created_at, current.created_at),
    phase: pair(previous.phase, current.phase),
    preliminary_probability: pair(previous.preliminary_probability?.point_estimate, current.preliminary_probability?.point_estimate),
    uncertainty_interval: {
      previous: { low: previous.preliminary_probability?.uncertainty_low ?? null, high: previous.preliminary_probability?.uncertainty_high ?? null },
      current: { low: current.preliminary_probability?.uncertainty_low ?? null, high: current.preliminary_probability?.uncertainty_high ?? null },
    },
    analysis_confidence: pair(previous.analysis_confidence?.analysis_confidence_score, current.analysis_confidence?.analysis_confidence_score),
    market: pair(previousDirector.market_evaluated?.label, currentDirector.market_evaluated?.label),
    direction: pair(previousDirector.sports_verdict?.direction, currentDirector.sports_verdict?.direction),
    suitability: pair(previous.director?.market_suitability, current.director?.market_suitability),
    price_evaluation: pair(previousDirector.price_assessment?.status, currentDirector.price_assessment?.status),
    individual_eligibility: pair(previousDirector.individual_eligibility, currentDirector.individual_eligibility),
    parlay_eligibility: pair(previousDirector.parlay_eligibility, currentDirector.parlay_eligibility),
    verdict: pair(previous.director?.verdict, current.director?.verdict),
    line: pair(previous.director?.line, current.director?.line),
    bookmaker: pair(previousActiveQuote?.bookmaker_name || previousDirector.bookmaker, currentActiveQuote?.bookmaker_name || currentDirector.bookmaker),
    odds: pair(previousOdds, currentOdds),
    implied_probability: pair(previousActiveQuote?.implied_probability ?? previousDirector.implied_probability, currentActiveQuote?.implied_probability ?? currentDirector.implied_probability),
    active_quote: pair(previousActiveQuote, currentActiveQuote),
    gemini_items_incorporated: incorporatedGeminiItems,
    new_risks: [...currentRisks].filter((item) => !previousRisks.has(item)),
    resolved_risks: [...previousRisks].filter((item) => !currentRisks.has(item)),
    added_missing_data: [...currentMissing].filter((item) => !previousMissing.has(item)),
    resolved_missing_data: [...previousMissing].filter((item) => !currentMissing.has(item)),
    missing_data: [...currentMissing],
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
  const unchangedAfterContext = changes.gemini_change && !changes.probability_change && !changes.uncertainty_change && changes.confidence_change === 0 &&
    !changes.line_change && !changes.odds_change && !changes.price_evaluation_change && !changes.individual_eligibility_change &&
    !changes.parlay_eligibility_change && !changes.suitability_change && !changes.verdict_change;
  if (unchangedAfterContext) explanations.push("El contexto fue incorporado, pero no aportó evidencia suficiente para modificar la probabilidad, la evaluación económica ni el dictamen. La evidencia no fue suficiente para modificar el dictamen ni la evaluación económica y no aporta evidencia suficiente para modificar el resultado.");
  if (!explanations.length) explanations.push("No hubo cambios materiales; el dictamen se mantiene.");
  return { contract: "AnalysisVersionDiff", version: 1, comparable: true, previous_analysis_id: previous.analysis_id, current_analysis_id: current.analysis_id, fixture_id: current.fixture_id, engine_version: current.engine_version, changes, explanation: explanations.join(" ") };
}
