"use client";

import { useCallback, useEffect, useState } from "react";
import { displayProviderStatus, displaySelectionLabel } from "./presentation-labels";

const MARKET_LABELS = { goals: "Goles", corners: "Córners", cards: "Tarjetas", total_shots: "Remates totales", shots_on_goal: "Remates a puerta" };
const VIABILITY_LABELS = {
  pending: "Línea vigente y pendiente",
  already_crossed: "Línea ya cruzada",
  already_reached: "Línea ya alcanzada",
  line_not_live: "Línea exacta no disponible",
  quote_unavailable: "Cuota no disponible",
  stale: "Cotización vencida",
  blocked: "Mercado bloqueado",
  provider_unavailable: "Proveedor no disponible",
  current_line_unknown: "Línea actual desconocida",
  unsupported: "Mercado no soportado",
};

function viabilityLabel(value) {
  return VIABILITY_LABELS[value] || "No accionable actualmente";
}

// El contexto prematch guardado puede venir de cualquier familia de mercado,
// incluidas asian_total_goals/team_asian_handicap (settlement de 5 estados).
// Para esas familias, director.estimated_probability es Favorabilidad Atlas
// (media ponderada del settlement), NUNCA una probabilidad literal de ganar
// — mismo predicado que ya usa el resto de Atlas (isSettlementFavorabilitySource
// en atlas-functional-client.js), aquí adaptado al director prematch guardado,
// que no siempre trae probability_semantics explícito.
function isSettlementFavorabilitySource(director) {
  const family = director?.market_evaluated?.family || director?.sports_verdict?.market_family;
  return family === "asian_total_goals" || family === "team_asian_handicap";
}

function prematchProbabilityLabel(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : "No disponible";
}

function prematchFavorabilityLabel(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}/100` : "No disponible";
}

function LivePrematchContext({ prematchContext }) {
  if (!prematchContext) {
    return <section className="p2-live-prematch p2-live-prematch-empty" aria-labelledby="live-prematch-title">
      <p className="eyebrow">CONTEXTO PREMATCH</p>
      <h3 id="live-prematch-title">Sin contexto prematch</h3>
      <p>No hay un análisis prepartido guardado para este partido; solo se muestra la lectura EN VIVO.</p>
    </section>;
  }
  const prematchDirector = prematchContext.director || {};
  const isFavorability = isSettlementFavorabilitySource(prematchDirector);
  return <section className="p2-live-prematch" aria-labelledby="live-prematch-title">
    <p className="eyebrow">CONTEXTO PREMATCH</p>
    <h3 id="live-prematch-title">Lo que Atlas ya sabía antes del partido</h3>
    <p><strong>{displaySelectionLabel(prematchDirector.selection || prematchDirector.market_evaluated?.label)}</strong></p>
    <p><small>{isFavorability ? "Favorabilidad Atlas prematch" : "Probabilidad estimada prematch"}</small> <strong>{isFavorability ? prematchFavorabilityLabel(prematchDirector.estimated_probability) : prematchProbabilityLabel(prematchDirector.estimated_probability)}</strong></p>
  </section>;
}

function LiveAnalysis({ analysis, onSave, saveState }) {
  const { snapshot, director } = analysis;
  const markets = (analysis.market_assessments || []).filter((item) => item.candidate);
  const originalReading = director.original_sports_reading || director.sports_verdict;
  const liveMarketVerdict = director.live_market_verdict;
  return <section className="p2-live-analysis" aria-labelledby="live-result-title">
    <header><p className="eyebrow">Captura EN VIVO · minuto {snapshot.minute}</p><h2 id="live-result-title">{snapshot.home_team} {snapshot.score.home} - {snapshot.score.away} {snapshot.away_team}</h2><p>Actualizado {new Date(snapshot.captured_at).toLocaleTimeString("es-CO")} · {displayProviderStatus(snapshot.status.long || snapshot.status.short)}</p></header>
    <LivePrematchContext prematchContext={analysis.prematch_context} />
    <p className="eyebrow p2-live-now-heading">AHORA EN VIVO</p>
    <section className={`p2-live-director p2-live-director-${director.analysis_decision.status}`}>
      <p className="eyebrow">DirectorAtlas</p>
      <h3>{director.analysis_decision.label}</h3>
      <p>{director.analysis_decision.explanation}</p>
      {director.selection ? <p><strong>{MARKET_LABELS[director.market_evaluated?.family] || director.market_evaluated?.family}: {displaySelectionLabel(director.selection)}</strong></p> : null}
      <div className="p2-live-decision-grid" aria-label="Lectura y viabilidad de la selección">
        <span><small>Lectura deportiva original</small><strong>{originalReading?.sports_score ?? 0}/100</strong></span>
        <span><small>Mercado LIVE evaluado</small><strong>{liveMarketVerdict?.sports_score ?? "No disponible"}{Number.isFinite(Number(liveMarketVerdict?.sports_score)) ? "/100" : ""}</strong></span>
        <span><small>Confianza</small><strong>{director.analysis_confidence_score}/100</strong></span>
        <span><small>Viabilidad LIVE</small><strong>{viabilityLabel(director.market_viability?.status)}</strong></span>
        <span><small>Precio</small><strong>{director.price_assessment?.decimal_odds ? `@${director.price_assessment.decimal_odds}` : "No utilizable"}</strong></span>
      </div>
      <p>{director.price_assessment.message}</p>
      {director.analysis_decision.status === "yes" ? <button type="button" className="secondary-button" onClick={onSave} disabled={saveState.kind === "loading"}>{saveState.kind === "loading" ? "Guardando…" : "Guardar pronóstico EN VIVO"}</button> : null}
      {saveState.message ? <small role="status">{saveState.message}</small> : null}
    </section>
    <div className="p2-live-stats">{Object.entries(snapshot.totals || {}).map(([key, value]) => <span key={key}><small>{MARKET_LABELS[key] || key}</small><strong>{value ?? "No disponible"}</strong></span>)}</div>
    <section><h3>Mercados evaluados</h3><div className="p2-live-markets">{markets.map((item) => {
      const currentLine = item.operational_candidate;
      const lineChanged = currentLine && Number(currentLine.line) !== Number(item.candidate.line);
      return <article key={item.market_family}>
        <h4>{MARKET_LABELS[item.market_family] || item.market_family}</h4>
        <p><strong>Lectura deportiva: {displaySelectionLabel(item.candidate.selection)}</strong></p>
        <p>Acumulado {item.projection.current_total} · proyección acotada {item.projection.projected_total}</p>
        <p>Respaldo {item.candidate.sports_score}/100 · confianza {item.candidate.confidence_score}/100</p>
        <p className={`p2-live-viability p2-live-viability-${item.candidate.live_viability?.viable ? "pending" : "unavailable"}`}>{viabilityLabel(item.candidate.live_viability?.status)}</p>
        {lineChanged ? <div className="p2-live-current-line"><small>Línea LIVE actual evaluada como candidato independiente</small><strong>{displaySelectionLabel(currentLine.selection)}</strong><span>Respaldo propio {currentLine.sports_score}/100</span>{currentLine.active_quote ? <span>{currentLine.active_quote.bookmaker_name || "Proveedor"} @{currentLine.active_quote.decimal_odds}</span> : null}</div> : item.candidate.active_quote ? <p>Cuota EN VIVO: {item.candidate.active_quote.bookmaker_name || "Proveedor"} @{item.candidate.active_quote.decimal_odds}</p> : null}
      </article>;
    })}</div></section>
    <details><summary>Ver captura y trazabilidad técnica</summary><pre>{JSON.stringify(analysis, null, 2)}</pre></details>
  </section>;
}

export default function AtlasLive({ competitions, defaultTimezone = "America/Bogota" }) {
  const [catalog, setCatalog] = useState({ fixtures: [], status: "loading", message: "Consultando partidos en vivo…" });
  const [analysis, setAnalysis] = useState(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState({ fixtureId: "", competitionKey: competitions[0]?.key || "" });
  const [saveState, setSaveState] = useState({ kind: "idle", message: "" });
  const [selectedLiveCompetitionKeys, setSelectedLiveCompetitionKeys] = useState(() => competitions.map((item) => item.key));

  function toggleLiveCompetition(key) {
    setSelectedLiveCompetitionKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  const refresh = useCallback(async () => {
    if (!selectedLiveCompetitionKeys.length) {
      setCatalog({ fixtures: [], status: "empty", message: "Selecciona al menos una competición para buscar partidos en vivo." });
      return;
    }
    setCatalog((current) => ({ ...current, status: "loading", message: "Consultando partidos en vivo…" }));
    try {
      const params = new URLSearchParams({ timezone: defaultTimezone, competitionKeys: selectedLiveCompetitionKeys.join(",") });
      const response = await fetch(`/api/football/live?${params}`, { cache: "no-store" });
      const body = await response.json();
      setCatalog(response.ok ? body : { ...body, fixtures: [] });
    }
    catch { setCatalog({ status: "provider_error", fixtures: [], message: "No fue posible conectar con el proveedor EN VIVO." }); }
  }, [defaultTimezone, selectedLiveCompetitionKeys]);

  useEffect(() => { refresh(); }, [refresh]);

  async function analyze(fixtureId, competitionKey) {
    if (!Number.isInteger(Number(fixtureId)) || Number(fixtureId) <= 0 || !competitionKey) return;
    setBusy(true); setAnalysis(null); setSaveState({ kind: "idle", message: "" });
    try { const response = await fetch("/api/football/live", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fixtureId: Number(fixtureId), competitionKey, timezone: defaultTimezone }) }); const body = await response.json(); if (!response.ok) throw new Error(body.message || "El partido no puede analizarse EN VIVO."); setAnalysis(body); }
    catch (error) { setCatalog((current) => ({ ...current, message: error.message, status: "unavailable" })); }
    finally { setBusy(false); }
  }

  async function save() {
    setSaveState({ kind: "loading", message: "Guardando captura…" });
    try { const response = await fetch("/api/predictions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "live", liveAnalysisId: analysis.analysis_id }) }); const body = await response.json(); setSaveState({ kind: response.ok ? "success" : "error", message: body.message || "No fue posible guardar el pronóstico EN VIVO." }); }
    catch { setSaveState({ kind: "error", message: "No fue posible conectar con Memoria Atlas." }); }
  }

  return <section className="p2-mode p2-live" aria-labelledby="atlas-live-title">
    <div className="p2-mode-heading"><p className="eyebrow">Lectura durante el partido</p><h2 id="atlas-live-title">Atlas EN VIVO</h2><p>Usa capturas actuales del marcador y estadísticas disponibles. No reutiliza cuotas prepartido ni inventa datos ausentes.</p></div>
    <fieldset className="p2-live-competitions"><legend>Competiciones a consultar EN VIVO</legend>{competitions.map((item) => <label key={item.key}><input type="checkbox" checked={selectedLiveCompetitionKeys.includes(item.key)} onChange={() => toggleLiveCompetition(item.key)} />{item.localName}</label>)}</fieldset>
    <div className="p2-live-toolbar"><button type="button" className="primary-button p2-primary" onClick={refresh} disabled={catalog.status === "loading"}>{catalog.status === "loading" ? "Actualizando…" : "Actualizar EN VIVO"}</button><p role="status">{catalog.message}</p></div>
    <div className="p2-live-fixtures">{(catalog.fixtures || []).map((fixture) => <article key={fixture.fixtureId} className="p2-live-fixture"><p className="eyebrow">{fixture.competition?.name}</p><h3>{fixture.teams?.home?.name} vs {fixture.teams?.away?.name}</h3><strong className="p2-live-score">{fixture.score?.goals?.home ?? "–"} - {fixture.score?.goals?.away ?? "–"}</strong><p>Minuto {fixture.status?.elapsed} · {displayProviderStatus(fixture.status?.long || fixture.status?.short)}</p><small>ID del partido {fixture.fixtureId}</small><button type="button" className="primary-button p2-primary" disabled={busy} onClick={() => analyze(fixture.fixtureId, fixture.competitionKey)}>{busy ? "Analizando…" : "Analizar en vivo"}</button></article>)}</div>
    {catalog.status === "empty" ? <p className="p2-live-empty">{catalog.message || "No hay partidos en vivo ahora mismo en las competiciones seleccionadas."}</p> : null}
    <details className="p2-live-manual"><summary>Analizar un partido EN VIVO conocido</summary><div className="p2-live-manual-grid"><label><span>Competición</span><select value={manual.competitionKey} onChange={(event) => setManual({ ...manual, competitionKey: event.target.value })}>{competitions.map((item) => <option key={item.key} value={item.key}>{item.localName}</option>)}</select></label><label><span>ID del partido</span><input inputMode="numeric" value={manual.fixtureId} onChange={(event) => setManual({ ...manual, fixtureId: event.target.value })} placeholder="ID exacto" /></label><button type="button" className="secondary-button" disabled={busy || !manual.fixtureId} onClick={() => analyze(manual.fixtureId, manual.competitionKey)}>Analizar partido</button></div></details>
    {analysis ? <LiveAnalysis analysis={analysis} onSave={save} saveState={saveState} /> : null}
  </section>;
}
