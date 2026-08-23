"use client";

import { useEffect, useState } from "react";

const STATUS_LABELS = Object.freeze({ pending: "Pendiente", hit: "Acierto", miss: "Fallo", void: "Nulo", not_evaluable: "No evaluable" });

function percentage(value) {
  return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : "No disponible";
}

function dateTime(value) {
  if (!value) return "No disponible";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function updateFromResponse(body, setData) {
  if (body?.predictions && body?.metrics && body?.calibration) setData({ predictions: body.predictions, metrics: body.metrics, calibration: body.calibration });
}

export function OfficialPredictionRegistration({ analysisId }) {
  const [status, setStatus] = useState({ kind: "idle", message: "" });
  async function savePrediction() {
    if (!analysisId || status.kind === "loading") return;
    setStatus({ kind: "loading", message: "Guardando snapshot inmutable…" });
    try {
      const response = await fetch("/api/predictions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ analysisId }) });
      const body = await response.json();
      setStatus({ kind: response.ok ? "success" : "error", message: body.message || "No fue posible guardar el pronóstico." });
    } catch {
      setStatus({ kind: "error", message: "No fue posible conectar con la memoria local de Atlas." });
    }
  }
  return <section className="p2-prediction-registration" aria-label="Guardar pronóstico oficial">
    <p>Este dictamen deportivo puede guardarse en Memoria Atlas sin registrar una apuesta.</p>
    <button type="button" className="secondary-button" onClick={savePrediction} disabled={!analysisId || status.kind === "loading"}>{status.kind === "loading" ? "Guardando…" : "Guardar pronóstico oficial"}</button>
    {status.message ? <small className={`p2-memory-notice p2-memory-notice-${status.kind}`} role="status">{status.message}</small> : null}
  </section>;
}

function MetricCard({ label, value }) {
  return <span><small>{label}</small><strong>{value}</strong></span>;
}

function MarketMetrics({ groups = {} }) {
  const rows = Object.entries(groups);
  if (!rows.length) return <p>Aún no hay muestra por mercado.</p>;
  return <div className="p2-memory-table-wrap"><table className="p2-memory-table"><thead><tr><th>Mercado</th><th>Total</th><th>Aciertos</th><th>Fallos</th><th>Tasa</th></tr></thead><tbody>{rows.map(([name, metrics]) => <tr key={name}><td>{name}</td><td>{metrics.total}</td><td>{metrics.hits}</td><td>{metrics.misses}</td><td>{percentage(metrics.hit_rate)}</td></tr>)}</tbody></table></div>;
}

function Calibration({ calibration }) {
  const populated = (calibration?.bands || []).filter((band) => band.prediction_count > 0);
  const labels = { overconfident: "Sobreconfianza observada", underconfident: "Subconfianza observada", well_calibrated: "Buena calibración", insufficient_data: "Muestra insuficiente" };
  return <section className="p2-memory-section" aria-labelledby="memory-calibration-title">
    <h3 id="memory-calibration-title">Calibración preliminar</h3>
    <p>Compara la probabilidad que Atlas emitió con la frecuencia observada. Solo mide; no cambia fórmulas ni se autoentrena.</p>
    {populated.length ? <div className="p2-memory-table-wrap"><table className="p2-memory-table"><thead><tr><th>Banda</th><th>N</th><th>Estimada media</th><th>Observada</th><th>Lectura</th></tr></thead><tbody>{populated.map((band) => <tr key={band.label}><td>{band.label}</td><td>{band.prediction_count}</td><td>{percentage(band.average_predicted_probability)}</td><td>{percentage(band.hit_rate)}</td><td>{labels[band.calibration_label] || band.calibration_label}</td></tr>)}</tbody></table></div> : <p>No hay pronósticos resueltos con probabilidad estimada suficiente para calibrar.</p>}
  </section>;
}

function PredictionCard({ prediction, onUpdate, busy }) {
  const [actualTotal, setActualTotal] = useState("");
  const resolution = prediction.resolution || {};
  return <article className={`p2-memory-entry p2-memory-entry-${resolution.status}`}>
    <header><div><p className="eyebrow">{prediction.competition}</p><h3>{prediction.home_team} vs {prediction.away_team}</h3></div><span className="p2-memory-status">{STATUS_LABELS[resolution.status] || resolution.status}</span></header>
    <div className="p2-memory-entry-grid">
      <span><small>Pronóstico</small><strong>{prediction.selection}</strong></span><span><small>Mercado / línea</small><strong>{prediction.market_family} · {prediction.line}</strong></span><span><small>Confianza</small><strong>{prediction.confidence_score === null ? "No disponible" : `${prediction.confidence_score}/100`}</strong></span><span><small>Emitido</small><strong>{dateTime(prediction.issued_at)}</strong></span><span><small>Inicio</small><strong>{dateTime(prediction.kickoff_utc)}</strong></span><span><small>Resultado total</small><strong>{resolution.actual_total ?? "Pendiente"}</strong></span>
    </div>
    {resolution.status === "pending" ? <div className="p2-memory-resolution-actions">
      <button type="button" className="secondary-button" disabled={busy} onClick={() => onUpdate({ predictionId: prediction.prediction_id, source: "api_football" })}>Verificar con datos deportivos</button>
      <label><span>Total real verificado</span><input inputMode="decimal" value={actualTotal} onChange={(event) => setActualTotal(event.target.value)} placeholder="Ej. 9" /></label>
      <button type="button" className="secondary-button" disabled={busy || !actualTotal.trim()} onClick={() => onUpdate({ predictionId: prediction.prediction_id, source: "manual_user_input", actualTotal })}>Resolver manualmente</button>
    </div> : <p className="p2-memory-result-source">Fuente: {resolution.source} · resuelto {dateTime(resolution.resolved_at)}{resolution.reason ? ` · ${resolution.reason}` : ""}</p>}
    <details><summary>Ver snapshot y trazabilidad</summary><pre>{JSON.stringify(prediction, null, 2)}</pre></details>
  </article>;
}

export default function AtlasPredictionMemory() {
  const [data, setData] = useState({ predictions: [], metrics: null, calibration: null });
  const [status, setStatus] = useState({ kind: "loading", message: "Cargando memoria…" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/predictions")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message);
        if (cancelled) return;
        updateFromResponse(body, setData);
        setStatus({ kind: "success", message: body.predictions.length ? `${body.predictions.length} pronóstico(s) oficial(es).` : "Todavía no hay pronósticos oficiales guardados." });
      })
      .catch((error) => {
        if (!cancelled) setStatus({ kind: "error", message: error?.message || "No fue posible leer la memoria local." });
      });
    return () => { cancelled = true; };
  }, []);
  async function updateResults(input = { scope: "pending" }) {
    setBusy(true);
    setStatus({ kind: "loading", message: "Verificando resultados sin inventar datos…" });
    try {
      const response = await fetch("/api/predictions", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      updateFromResponse(body, setData);
      const update = body.update || {};
      setStatus({ kind: "success", message: input.scope === "pending" ? `${update.checked || 0} pendiente(s) verificado(s); ${update.resolved || 0} resuelto(s).` : "Pronóstico actualizado." });
    } catch (error) {
      setStatus({ kind: "error", message: error?.message || "No fue posible actualizar los resultados." });
    } finally {
      setBusy(false);
    }
  }
  const metrics = data.metrics || { total: 0, pending: 0, resolved: 0, evaluated: 0, hits: 0, misses: 0, voids: 0, not_evaluable: 0, hit_rate: null, by_market_family: {} };
  return <section className="p2-mode p2-memory" aria-labelledby="memory-title">
    <div className="p2-mode-heading"><p className="eyebrow">Memoria predictiva</p><h2 id="memory-title">Rendimiento Atlas</h2><p>Lo que Atlas pronosticó antes del partido. Esta memoria es independiente de las apuestas reales del usuario.</p></div>
    <div className="p2-memory-toolbar"><button type="button" className="primary-button p2-primary" disabled={busy || metrics.pending === 0} onClick={() => updateResults({ scope: "pending" })}>{busy ? "Verificando…" : "Actualizar resultados"}</button><p className={`p2-memory-notice p2-memory-notice-${status.kind}`} role="status">{status.message}</p></div>
    <section className="p2-memory-metrics" aria-label="Métricas de asertividad"><MetricCard label="Oficiales" value={metrics.total} /><MetricCard label="Pendientes" value={metrics.pending} /><MetricCard label="Resueltos" value={metrics.resolved} /><MetricCard label="Evaluables" value={metrics.evaluated} /><MetricCard label="Aciertos" value={metrics.hits} /><MetricCard label="Fallos" value={metrics.misses} /><MetricCard label="Nulos" value={metrics.voids} /><MetricCard label="No evaluables" value={metrics.not_evaluable} /><MetricCard label="Tasa de acierto" value={percentage(metrics.hit_rate)} /></section>
    <section className="p2-memory-section" aria-labelledby="memory-market-title"><h3 id="memory-market-title">Asertividad por mercado</h3><p>La tasa usa únicamente aciertos y fallos; nulos y no evaluables no alteran el denominador.</p><MarketMetrics groups={metrics.by_market_family} /></section>
    <Calibration calibration={data.calibration} />
    <section className="p2-memory-section" aria-labelledby="memory-recent-title"><h3 id="memory-recent-title">Pronósticos recientes</h3><div className="p2-memory-list">{data.predictions.map((prediction) => <PredictionCard key={prediction.prediction_id} prediction={prediction} onUpdate={updateResults} busy={busy} />)}{!data.predictions.length ? <p>Guarda un dictamen respaldado desde “Analizar partido” para iniciar la memoria.</p> : null}</div></section>
  </section>;
}
