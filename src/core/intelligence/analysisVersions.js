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
    geminiContext: input.geminiContext,
    analysisConfidence: input.analysisConfidence,
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
  const changes = {
    new_evidence: newEvidence,
    removed_or_stale_evidence: removedEvidence,
    lineup_change: previous.inputs?.lineup_status !== current.inputs?.lineup_status,
    referee_change: previous.inputs?.referee_status !== current.inputs?.referee_status,
    injury_change: previous.inputs?.injury_status !== current.inputs?.injury_status,
    weather_change: previous.inputs?.weather_status !== current.inputs?.weather_status,
    line_change: previous.director?.line !== current.director?.line,
    odds_change: previousOdds !== currentOdds,
    confidence_change: (current.analysis_confidence?.analysis_confidence_score || 0) - (previous.analysis_confidence?.analysis_confidence_score || 0),
    suitability_change: previous.director?.market_suitability !== current.director?.market_suitability,
    verdict_change: previous.director?.verdict !== current.director?.verdict,
  };
  const explanations = [];
  if (newEvidence.length) explanations.push(`Se incorporaron ${newEvidence.length} elementos de evidencia.`);
  if (removedEvidence.length) explanations.push(`Se retiraron o vencieron ${removedEvidence.length} elementos.`);
  if (changes.lineup_change) explanations.push("Cambió el estado de las alineaciones.");
  if (changes.injury_change) explanations.push("Cambió el reporte de bajas.");
  if (changes.line_change || changes.odds_change) explanations.push("Cambió la línea o la cuota del mercado.");
  if (changes.suitability_change || changes.verdict_change) explanations.push("DirectorAtlas actualizó el dictamen según los cambios observados.");
  if (!explanations.length) explanations.push("No hubo cambios materiales; el dictamen se mantiene.");
  return { contract: "AnalysisVersionDiff", version: 1, comparable: true, previous_analysis_id: previous.analysis_id, current_analysis_id: current.analysis_id, changes, explanation: explanations.join(" ") };
}
