"use client";

import { useMemo, useRef, useState } from "react";
import {
  COMBINATION_LIMITS,
  COMBINATION_MODE,
  COMBINATION_PRODUCT,
  buildAtlasCombination,
  combinationSelectionKey,
  inspectCombinationCandidate,
} from "@/core/intelligence/atlasCombinationEngine";
import { findFixtureQuoteEntry } from "@/core/intelligence/fixtureQuoteLedger";

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function percent(value) {
  return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : "No disponible";
}

function statusMessage(status) {
  if (status === "loading") return "Atlas está reuniendo y validando candidatos…";
  if (status === "success") return "Universo de candidatos preparado.";
  if (status === "error") return "No fue posible preparar el universo seleccionado.";
  return "Selecciona el universo y pulsa “Buscar candidatos”.";
}

function productName(product) {
  return product === COMBINATION_PRODUCT.DREAM ? "Soñadora Atlas" : "Parlay Atlas";
}

function modeName(mode) {
  if (mode === COMBINATION_MODE.MANUAL) return "Manual";
  if (mode === COMBINATION_MODE.MIXED) return "Mixto";
  return "Automático";
}

function enrichCandidate(candidate, ledger, officialPredictions = []) {
  const operation = findFixtureQuoteEntry(ledger, candidate);
  const officialPrediction = officialPredictions.find((prediction) => prediction.source_analysis_id === operation?.source_analysis_id) || null;
  return {
    ...candidate,
    fixture_id: candidate.fixtureId,
    candidate_id: candidate.transferredCandidate?.candidate_id || combinationSelectionKey(candidate),
    ranking_version: candidate.methodologyVersion || "journey-scan",
    market_family: candidate.marketId,
    sports_score: candidate.sportsScore ?? candidate.technicalSupport,
    active_quote: operation?.active_quote || null,
    decimal_odds: operation?.active_quote?.decimal_odds ?? null,
    freshness: operation?.active_quote?.freshness || "unavailable",
    odds_source_status: operation?.active_quote?.verification_status || "unavailable",
    price_status: operation?.price_status || "unavailable",
    price_gap: operation?.price_gap ?? null,
    operational_decision: operation?.operational_decision || "Pendiente de precio",
    market_suitability: operation?.market_suitability || null,
    parlay_eligibility: operation?.parlay_eligibility || null,
    director_decision: operation?.director_decision || null,
    official_prediction_id: officialPrediction?.prediction_id || null,
  };
}

function CandidateCard({ candidate, selected, selectable, onToggle }) {
  const inspection = inspectCombinationCandidate(candidate);
  const label = candidate.selection || `${candidate.direction === "under" ? "Menos de" : "Más de"} ${candidate.line}`;
  return (
    <article className={`p2-combination-candidate ${inspection.eligible ? "is-eligible" : "is-pending"}`}>
      <div>
        <p className="eyebrow">{candidate.competition}</p>
        <h4>{candidate.fixture}</h4>
        <p><strong>{label}</strong> · {candidate.market}</p>
        <small>{candidate.localCalendarDate} · Respaldo deportivo {candidate.sports_score}/100 · Probabilidad preliminar {percent(candidate.probability)}</small>
        <small>{candidate.active_quote
          ? `Precio vigente: ${candidate.active_quote.bookmaker_name} @${candidate.active_quote.decimal_odds}`
          : "Precio actual pendiente: no entra en la combinación."}</small>
        <small>DirectorAtlas: {candidate.operational_decision}</small>
      </div>
      {selectable ? (
        <label className="p2-combination-toggle">
          <input type="checkbox" checked={selected} disabled={!inspection.eligible} onChange={() => onToggle(candidate.selection_key)} />
          <span>{selected ? "Quitar selección" : inspection.eligible ? "Añadir selección" : "No elegible ahora"}</span>
        </label>
      ) : null}
    </article>
  );
}

export default function AtlasCombinationBuilder({ competitionGroups, markets, defaultTimezone }) {
  const competitions = useMemo(() => competitionGroups.flatMap((group) => group.competitions), [competitionGroups]);
  const [dates, setDates] = useState([""]);
  const [competitionKeys, setCompetitionKeys] = useState(competitions[0] ? [competitions[0].key] : []);
  const [marketIds, setMarketIds] = useState(markets.map((market) => market.id));
  const [product, setProduct] = useState(COMBINATION_PRODUCT.PARLAY);
  const [mode, setMode] = useState(COMBINATION_MODE.AUTOMATIC);
  const [selectionCount, setSelectionCount] = useState(2);
  const [journey, setJourney] = useState(null);
  const [ledgers, setLedgers] = useState({});
  const [officialPredictions, setOfficialPredictions] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [combination, setCombination] = useState(null);
  const [loadState, setLoadState] = useState("idle");
  const requestRef = useRef(null);

  const candidates = useMemo(() => (journey?.candidates || []).map((candidate) => {
    const enriched = enrichCandidate(candidate, ledgers[String(candidate.fixtureId)], officialPredictions);
    return { ...enriched, selection_key: combinationSelectionKey(enriched) };
  }), [journey, ledgers, officialPredictions]);

  const eligibleCount = candidates.filter((candidate) => inspectCombinationCandidate(candidate).eligible).length;
  const limits = COMBINATION_LIMITS[product];

  function invalidate() {
    setCombination(null);
  }

  function changeProduct(nextProduct) {
    setProduct(nextProduct);
    setSelectionCount(COMBINATION_LIMITS[nextProduct].minimum);
    setSelectedKeys([]);
    setCombination(null);
  }

  function updateDate(index, value) {
    setDates((current) => current.map((item, currentIndex) => currentIndex === index ? value : item));
    setJourney(null);
    setCombination(null);
  }

  function toggleCompetition(key) {
    setCompetitionKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
    setJourney(null);
    setCombination(null);
  }

  function toggleMarket(id) {
    setMarketIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setJourney(null);
    setCombination(null);
  }

  async function loadLedger(fixtureId) {
    const params = new URLSearchParams({ view: "fixture_quotes", fixtureId: String(fixtureId) });
    const response = await fetch(`/api/operational-history?${params}`);
    if (!response.ok) return [String(fixtureId), null];
    const result = await response.json();
    return [String(fixtureId), result.ledger || null];
  }

  async function loadOfficialPredictions() {
    try {
      const response = await fetch("/api/predictions");
      if (!response.ok) return [];
      const result = await response.json();
      return result.predictions || [];
    } catch {
      return [];
    }
  }

  async function findCandidates() {
    requestRef.current?.abort();
    const requestedDates = unique(dates);
    if (!requestedDates.length || !competitionKeys.length || !marketIds.length) {
      setLoadState("error");
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setLoadState("loading");
    setJourney(null);
    setLedgers({});
    setOfficialPredictions([]);
    setSelectedKeys([]);
    setCombination(null);
    try {
      const response = await fetch("/api/football/journey-scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          dates: requestedDates,
          timezone: defaultTimezone,
          competitionKeys,
          marketIds,
          maximumFixtures: 50,
          maximumCandidates: 50,
          analysisMode: marketIds.length === 1 ? "specific" : "general",
        }),
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      setJourney(result);
      const fixtureIds = unique((result.candidates || []).map((candidate) => String(candidate.fixtureId)));
      const [ledgerEntries, predictions] = await Promise.all([
        Promise.all(fixtureIds.map(loadLedger)),
        loadOfficialPredictions(),
      ]);
      if (controller.signal.aborted) return;
      setLedgers(Object.fromEntries(ledgerEntries.filter(([, ledger]) => ledger)));
      setOfficialPredictions(predictions);
      setLoadState(response.ok ? "success" : "error");
    } catch (error) {
      if (error?.name !== "AbortError") setLoadState("error");
    }
  }

  function toggleCandidate(key) {
    setSelectedKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
    setCombination(null);
  }

  function generateCombination() {
    setCombination(buildAtlasCombination({ candidates, product, mode, selections: selectionCount, selectedKeys }));
  }

  function removePreparedSelection(key) {
    const remaining = (combination?.selections || []).map((item) => item.selection_key).filter((item) => item !== key);
    setMode(COMBINATION_MODE.MIXED);
    setSelectedKeys(remaining);
    setCombination(null);
  }

  return (
    <section className="p2-mode p2-combination-builder" aria-labelledby="combination-title">
      <div className="p2-mode-heading">
        <p className="eyebrow">Combinaciones Atlas</p>
        <h2 id="combination-title">Parlay Atlas y Soñadora Atlas</h2>
        <p>Atlas reúne candidatos del Journey Scan y solo combina opciones que ya tienen precio vigente y autorización operativa individual.</p>
      </div>

      <fieldset className="p2-combination-product">
        <legend>1 · Elige el producto</legend>
        <label><input type="radio" name="combination-product" checked={product === COMBINATION_PRODUCT.PARLAY} onChange={() => changeProduct(COMBINATION_PRODUCT.PARLAY)} /><span><strong>Parlay Atlas</strong><small>Entre 2 y 4 selecciones.</small></span></label>
        <label><input type="radio" name="combination-product" checked={product === COMBINATION_PRODUCT.DREAM} onChange={() => changeProduct(COMBINATION_PRODUCT.DREAM)} /><span><strong>Soñadora Atlas</strong><small>Entre 5 y 15 selecciones. Siempre de alto riesgo.</small></span></label>
      </fieldset>

      <section className="p2-combination-dates">
        <h3>2 · Fechas</h3>
        {dates.map((value, index) => (
          <div key={`date-${index}`} className="p2-inline-actions">
            <label><span>Fecha {index + 1}</span><input type="date" value={value} onChange={(event) => updateDate(index, event.target.value)} /></label>
            {dates.length > 1 ? <button type="button" className="secondary-button" onClick={() => { setDates((current) => current.filter((_, currentIndex) => currentIndex !== index)); invalidate(); }}>Quitar fecha</button> : null}
          </div>
        ))}
        <button type="button" className="secondary-button" disabled={dates.length >= 14} onClick={() => setDates((current) => [...current, ""])}>Añadir otra fecha</button>
      </section>

      <section className="p2-combination-filters">
        <div>
          <h3>3 · Competiciones</h3>
          {competitionGroups.map((group) => <fieldset key={group.id}><legend>{group.label}</legend>{group.competitions.map((competition) => <label key={competition.key}><input type="checkbox" checked={competitionKeys.includes(competition.key)} onChange={() => toggleCompetition(competition.key)} />{competition.localName}</label>)}</fieldset>)}
        </div>
        <fieldset><legend>4 · Mercados</legend>{markets.map((market) => <label key={market.id}><input type="checkbox" checked={marketIds.includes(market.id)} onChange={() => toggleMarket(market.id)} />{market.label}</label>)}</fieldset>
      </section>

      <section className="p2-combination-settings">
        <label><span>5 · Número de selecciones</span><input type="number" min={limits.minimum} max={limits.maximum} value={selectionCount} onChange={(event) => { setSelectionCount(Math.max(limits.minimum, Math.min(limits.maximum, Number(event.target.value) || limits.minimum))); setCombination(null); }} /></label>
        <fieldset><legend>6 · Construcción</legend>
          {Object.values(COMBINATION_MODE).map((value) => <label key={value}><input type="radio" name="combination-mode" checked={mode === value} onChange={() => { setMode(value); setSelectedKeys([]); setCombination(null); }} />{modeName(value)}</label>)}
        </fieldset>
      </section>

      <button type="button" className="primary-button p2-primary" onClick={findCandidates} disabled={loadState === "loading"}>{loadState === "loading" ? "Buscando candidatos…" : "Buscar candidatos"}</button>
      <p className={`p2-status p2-status-${loadState}`}>{statusMessage(loadState)}</p>

      {journey ? <section className="p2-combination-universe">
        <div className="p2-combination-summary"><h3>Universo disponible</h3><p>{journey.candidates?.length || 0} candidatos deportivos · {eligibleCount} elegibles con precio y decisión vigentes.</p><p>Los pendientes permanecen visibles para que puedas analizarlos individualmente; Atlas no inventa su cuota ni los incluye.</p></div>
        <div className="p2-combination-candidate-grid">{candidates.map((candidate) => <CandidateCard key={candidate.selection_key} candidate={candidate} selectable={mode !== COMBINATION_MODE.AUTOMATIC} selected={selectedKeys.includes(candidate.selection_key)} onToggle={toggleCandidate} />)}</div>
        <button type="button" className="primary-button p2-primary" onClick={generateCombination}>Generar {productName(product)}</button>
      </section> : null}

      {combination ? <section className={`p2-combination-result p2-combination-result-${combination.status}`} aria-live="polite">
        <p className="eyebrow">DirectorAtlas</p>
        <h3>{combination.status === "ready" ? `${productName(product)} preparada` : "No se pudo construir la combinación"}</h3>
        <p>{combination.director_message || combination.message}</p>
        {combination.status === "ready" ? <>
          <div className="p2-combination-metrics"><span><small>Cuota combinada</small><strong>{combination.combined_decimal_odds}</strong></span><span><small>Riesgo</small><strong>{combination.risk.level === "high" ? "Alto" : combination.risk.level === "medium" ? "Medio" : "Bajo"}</strong></span><span><small>Modo</small><strong>{modeName(combination.mode)}</strong></span></div>
          {product === COMBINATION_PRODUCT.DREAM ? <p className="p2-combination-warning">Alto riesgo: el resultado depende de que todas las selecciones se cumplan.</p> : null}
          <ol className="p2-combination-legs">{combination.selections.map((candidate) => <li key={candidate.selection_key}><div><strong>{candidate.fixture}</strong><span>{candidate.selection} · {candidate.market} · @{candidate.decimal_odds}</span></div><button type="button" className="secondary-button" onClick={() => removePreparedSelection(candidate.selection_key)}>Quitar</button></li>)}</ol>
          {combination.correlation.warnings.length ? <p>Correlación advertida: {combination.correlation.warnings.join(", ")}.</p> : <p>La propuesta evita repetir selecciones altamente correlacionadas del mismo fixture y mercado.</p>}
        </> : null}
      </section> : null}
    </section>
  );
}
