"use client";

import { useCallback, useEffect, useState } from "react";

const MARKET_LABELS = { goals: "Goles", corners: "Córners", cards: "Tarjetas", total_shots: "Remates totales", shots_on_goal: "Remates a puerta" };

function LiveAnalysis({ analysis, onSave, saveState }) {
  const { snapshot, director } = analysis;
  const markets = (analysis.market_assessments || []).filter((item) => item.candidate);
  return <section className="p2-live-analysis" aria-labelledby="live-result-title">
    <header><p className="eyebrow">Snapshot LIVE · minuto {snapshot.minute}</p><h2 id="live-result-title">{snapshot.home_team} {snapshot.score.home} - {snapshot.score.away} {snapshot.away_team}</h2><p>Actualizado {new Date(snapshot.captured_at).toLocaleTimeString("es-CO")} · {snapshot.status.long || snapshot.status.short}</p></header>
    <section className={`p2-live-director p2-live-director-${director.analysis_decision.status}`}><p className="eyebrow">DirectorAtlas</p><h3>{director.analysis_decision.label}</h3><p>{director.analysis_decision.explanation}</p>{director.selection ? <p><strong>{MARKET_LABELS[director.market_evaluated?.family] || director.market_evaluated?.family}: {director.selection}</strong> · respaldo {director.sports_verdict.sports_score}/100 · confianza {director.analysis_confidence_score}/100</p> : null}<p>{director.price_assessment.message}</p>{director.analysis_decision.status === "yes" ? <button type="button" className="secondary-button" onClick={onSave} disabled={saveState.kind === "loading"}>{saveState.kind === "loading" ? "Guardando…" : "Guardar pronóstico LIVE"}</button> : null}{saveState.message ? <small role="status">{saveState.message}</small> : null}</section>
    <div className="p2-live-stats">{Object.entries(snapshot.totals || {}).map(([key, value]) => <span key={key}><small>{MARKET_LABELS[key] || key}</small><strong>{value ?? "No disponible"}</strong></span>)}</div>
    <section><h3>Mercados evaluados</h3><div className="p2-live-markets">{markets.map((item) => <article key={item.market_family}><h4>{MARKET_LABELS[item.market_family] || item.market_family}</h4><p><strong>{item.candidate.selection}</strong></p><p>Acumulado {item.projection.current_total} · proyección acotada {item.projection.projected_total}</p><p>Respaldo {item.candidate.sports_score}/100 · confianza {item.candidate.confidence_score}/100</p>{item.candidate.active_quote ? <p>Cuota LIVE: {item.candidate.active_quote.bookmaker_name || "Proveedor"} @{item.candidate.active_quote.decimal_odds}</p> : <p>Sin cuota LIVE exacta y vigente.</p>}</article>)}</div></section>
    <details><summary>Ver snapshot y trazabilidad técnica</summary><pre>{JSON.stringify(analysis, null, 2)}</pre></details>
  </section>;
}

export default function AtlasLive({ competitions, defaultTimezone = "America/Bogota" }) {
  const [catalog, setCatalog] = useState({ fixtures: [], status: "loading", message: "Consultando partidos en vivo…" });
  const [analysis, setAnalysis] = useState(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState({ fixtureId: "", competitionKey: competitions[0]?.key || "" });
  const [saveState, setSaveState] = useState({ kind: "idle", message: "" });

  const refresh = useCallback(async () => {
    setCatalog((current) => ({ ...current, status: "loading", message: "Consultando partidos en vivo…" }));
    try { const response = await fetch(`/api/football/live?timezone=${encodeURIComponent(defaultTimezone)}`, { cache: "no-store" }); const body = await response.json(); setCatalog(response.ok ? body : { ...body, fixtures: [] }); }
    catch { setCatalog({ status: "provider_error", fixtures: [], message: "No fue posible conectar con el proveedor LIVE." }); }
  }, [defaultTimezone]);

  useEffect(() => { refresh(); }, [refresh]);

  async function analyze(fixtureId, competitionKey) {
    if (!Number.isInteger(Number(fixtureId)) || Number(fixtureId) <= 0 || !competitionKey) return;
    setBusy(true); setAnalysis(null); setSaveState({ kind: "idle", message: "" });
    try { const response = await fetch("/api/football/live", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fixtureId: Number(fixtureId), competitionKey, timezone: defaultTimezone }) }); const body = await response.json(); if (!response.ok) throw new Error(body.message || "El fixture no puede analizarse en LIVE."); setAnalysis(body); }
    catch (error) { setCatalog((current) => ({ ...current, message: error.message, status: "unavailable" })); }
    finally { setBusy(false); }
  }

  async function save() {
    setSaveState({ kind: "loading", message: "Guardando snapshot…" });
    try { const response = await fetch("/api/predictions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "live", liveAnalysisId: analysis.analysis_id }) }); const body = await response.json(); setSaveState({ kind: response.ok ? "success" : "error", message: body.message || "No fue posible guardar el pronóstico LIVE." }); }
    catch { setSaveState({ kind: "error", message: "No fue posible conectar con Memoria Atlas." }); }
  }

  return <section className="p2-mode p2-live" aria-labelledby="atlas-live-title">
    <div className="p2-mode-heading"><p className="eyebrow">Lectura durante el partido</p><h2 id="atlas-live-title">Atlas LIVE</h2><p>Usa snapshots actuales del marcador y estadísticas disponibles. No reutiliza cuotas prepartido ni inventa datos ausentes.</p></div>
    <div className="p2-live-toolbar"><button type="button" className="primary-button p2-primary" onClick={refresh} disabled={catalog.status === "loading"}>{catalog.status === "loading" ? "Actualizando…" : "Actualizar LIVE"}</button><p role="status">{catalog.message}</p></div>
    <div className="p2-live-fixtures">{(catalog.fixtures || []).map((fixture) => <article key={fixture.fixtureId} className="p2-live-fixture"><p className="eyebrow">{fixture.competition?.name}</p><h3>{fixture.teams?.home?.name} vs {fixture.teams?.away?.name}</h3><strong className="p2-live-score">{fixture.score?.goals?.home ?? "–"} - {fixture.score?.goals?.away ?? "–"}</strong><p>Minuto {fixture.status?.elapsed} · {fixture.status?.long || fixture.status?.short}</p><small>Fixture ID {fixture.fixtureId}</small><button type="button" className="primary-button p2-primary" disabled={busy} onClick={() => analyze(fixture.fixtureId, fixture.competitionKey)}>{busy ? "Analizando…" : "Analizar en vivo"}</button></article>)}</div>
    {catalog.status === "empty" ? <p className="p2-live-empty">No hay partidos en vivo ahora mismo en las competiciones configuradas.</p> : null}
    <details className="p2-live-manual"><summary>Analizar un fixture LIVE conocido</summary><div className="p2-live-manual-grid"><label><span>Competición</span><select value={manual.competitionKey} onChange={(event) => setManual({ ...manual, competitionKey: event.target.value })}>{competitions.map((item) => <option key={item.key} value={item.key}>{item.localName}</option>)}</select></label><label><span>Fixture ID</span><input inputMode="numeric" value={manual.fixtureId} onChange={(event) => setManual({ ...manual, fixtureId: event.target.value })} placeholder="ID exacto" /></label><button type="button" className="secondary-button" disabled={busy || !manual.fixtureId} onClick={() => analyze(manual.fixtureId, manual.competitionKey)}>Analizar fixture</button></div></details>
    {analysis ? <LiveAnalysis analysis={analysis} onSave={save} saveState={saveState} /> : null}
  </section>;
}
