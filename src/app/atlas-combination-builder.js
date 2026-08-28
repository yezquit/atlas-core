"use client";

import { useMemo, useRef, useState } from "react";
import {
  COMBINATION_LIMITS,
  COMBINATION_MODE,
  COMBINATION_PRODUCT,
  addCombinationSelection,
  buildAtlasCombination,
  combinationSelectionKey,
  inspectCombinationCandidate,
  normalizeCombinationTarget,
  removeCombinationSelection,
  updateCombinationSelection,
} from "@/core/intelligence/atlasCombinationEngine";
import { findFixtureQuoteEntry } from "@/core/intelligence/fixtureQuoteLedger";
import { createManualOdds } from "@/core/intelligence/oddsIntelligence";
import {
  displayCorrelationLabel,
  displayMarketLabel,
  displaySelectionLabel,
  displayStatusLabel,
} from "./presentation-labels";

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function percent(value) {
  return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : "No disponible";
}

const UNIVERSE_REASON_MESSAGES = Object.freeze({
  no_fixtures: "No se encontraron partidos para el universo seleccionado.",
  no_sports_candidates: "No se encontraron candidatos con respaldo deportivo suficiente.",
  provider_unavailable: "El proveedor deportivo no está disponible en este momento.",
  unsupported_competition: "Una competición seleccionada no está soportada.",
  insufficient_coverage: "La cobertura disponible no alcanza para preparar candidatos.",
  timeout: "La búsqueda superó el tiempo seguro de espera.",
  provider_quota_or_budget: "El proveedor alcanzó su cuota o presupuesto operativo.",
  internal_safe_error: "No fue posible preparar el universo seleccionado.",
});

export function classifyUniverseReason(result = {}, responseStatus = null) {
  if (UNIVERSE_REASON_MESSAGES[result.reason]) return result.reason;
  if (result.errorCode === "invalid_competition") return "unsupported_competition";
  if (result.errorCode === "request_budget_exhausted" || responseStatus === 429) return "provider_quota_or_budget";
  if (/timeout/i.test(result.errorCode || "")) return "timeout";
  if (responseStatus === 502 || result.status === "provider_error") return "provider_unavailable";
  if (result.errorCode === "invalid_market") return "insufficient_coverage";
  return "internal_safe_error";
}

function statusMessage(status, reason = null) {
  if (status === "loading") return "Atlas está reuniendo y validando candidatos…";
  if (status === "success") return "Universo de candidatos preparado.";
  if (status === "error") return UNIVERSE_REASON_MESSAGES[reason] || UNIVERSE_REASON_MESSAGES.internal_safe_error;
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

function fixtureTeams(fixture) {
  const teams = String(fixture || "").split(/\s+vs\s+/i);
  return teams.length === 2
    ? { homeTeam: teams[0], awayTeam: teams[1] }
    : { homeTeam: null, awayTeam: null };
}

function combinationLegSnapshot(candidate) {
  const teams = fixtureTeams(candidate.fixture);
  return {
    fixture_id: candidate.fixture_id,
    competition: candidate.competition ?? null,
    home_team: candidate.home_team ?? candidate.homeTeam ?? teams.homeTeam,
    away_team: candidate.away_team ?? candidate.awayTeam ?? teams.awayTeam,
    fixture: candidate.fixture ?? null,
    kickoff_utc: candidate.kickoff_utc ?? candidate.kickoff ?? null,
    market_family: candidate.market_family,
    selection: candidate.selection ?? null,
    direction: candidate.direction ?? null,
    line: candidate.line ?? null,
    sports_score: candidate.sports_score ?? null,
    preliminary_probability:
      candidate.preliminary_probability ?? candidate.probability ?? null,
    decimal_odds: candidate.price_usable ? candidate.decimal_odds : null,
    economic_status:
      candidate.economic_price_status ?? candidate.price_status ?? null,
  };
}

function combinationIsTrackable(combination) {
  const limits = COMBINATION_LIMITS[combination?.product];
  const count = combination?.selections?.length || 0;
  return Boolean(
    combination?.combination_id &&
    ["ready", "editing"].includes(combination?.status) &&
    limits &&
    count >= limits.minimum &&
    count <= limits.maximum
  );
}

function CombinationBetRegistration({ combination }) {
  const [bookmaker, setBookmaker] = useState("");
  const [stakeAmount, setStakeAmount] = useState("");
  const [decimalOdds, setDecimalOdds] = useState("");
  const [currency, setCurrency] = useState("COP");
  const [stakeUnits, setStakeUnits] = useState("");
  const [registration, setRegistration] = useState({ status: "idle", message: "" });
  const submissionRef = useRef(false);

  function updateTotalOdds(value) {
    setDecimalOdds(value);
    if (!["idle", "success"].includes(registration.status)) {
      setRegistration({ status: "idle", message: "" });
    }
  }

  async function registerCombinationBet(event) {
    event.preventDefault();
    if (submissionRef.current || registration.status === "loading" || registration.status === "success") return;

    const totalOdds = Number(String(decimalOdds).replace(",", "."));
    const amount = Number(String(stakeAmount).replace(",", "."));
    const units = stakeUnits === "" ? null : Number(String(stakeUnits).replace(",", "."));

    if (!bookmaker.trim() || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(totalOdds) || totalOdds <= 1) {
      setRegistration({ status: "error", message: "Completa casa, valor apostado y cuota combinada real." });
      return;
    }
    if (units !== null && (!Number.isFinite(units) || units <= 0)) {
      setRegistration({ status: "error", message: "Las unidades deben ser mayores que cero." });
      return;
    }

    submissionRef.current = true;
    setRegistration({ status: "loading", message: "Registrando combinación…" });
    try {
      const response = await fetch("/api/bets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          betType: "combination",
          combinationId: combination.combination_id,
          product: combination.product,
          mode: combination.mode,
          legs: combination.selections.map(combinationLegSnapshot),
          bookmaker: bookmaker.trim(),
          decimalOdds: totalOdds,
          oddsSource: "manual_user_input",
          priceCoverageStatus: combination.price_coverage?.status || null,
          atlasCombinedOdds: null,
          stakeAmount: amount,
          stakeUnits: units,
          currency: currency.trim() || "COP",
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        submissionRef.current = false;
        setRegistration({ status: "error", message: result?.message || "No fue posible registrar la combinación." });
        return;
      }
      setRegistration({
        status: "success",
        message: `${productName(combination.product)} registrada como una apuesta @${result.bet.decimal_odds}.`,
      });
    } catch {
      submissionRef.current = false;
      setRegistration({ status: "error", message: "No fue posible conectar con el registro de apuestas." });
    }
  }

  return (
    <form className="p2-entry-panel p2-combination-bet-form" onSubmit={registerCombinationBet}>
      <p className="eyebrow">BET TRACKER</p>
      <h4>Registrar apuesta</h4>
      <p>Confirma la cuota total realmente aceptada por la casa. Atlas no recalcula ni inventa este precio.</p>
      <div className="p2-combination-settings">
        <label><span>Casa de apuestas</span><input required value={bookmaker} onChange={(event) => setBookmaker(event.target.value)} placeholder="Ej. Betano" /></label>
        <label><span>Valor apostado</span><input required inputMode="decimal" value={stakeAmount} onChange={(event) => setStakeAmount(event.target.value)} placeholder="Ej. 10000" /></label>
        <label><span>Cuota combinada real</span><input required inputMode="decimal" value={decimalOdds} onChange={(event) => updateTotalOdds(event.target.value)} placeholder="Ej. 4.25" /><small>Cuota total informada por el usuario; no se multiplican automáticamente las cuotas de las patas.</small></label>
        <label><span>Moneda</span><input required value={currency} onChange={(event) => setCurrency(event.target.value)} /></label>
        <label><span>Unidades opcionales</span><input inputMode="decimal" value={stakeUnits} onChange={(event) => setStakeUnits(event.target.value)} placeholder="Ej. 1" /></label>
      </div>
      <button type="submit" className="primary-button" disabled={registration.status === "loading" || registration.status === "success"}>
        {registration.status === "loading" ? "Registrando…" : registration.status === "success" ? "Apuesta registrada" : "Registrar apuesta"}
      </button>
      {registration.message ? <p role={registration.status === "error" ? "alert" : "status"}>{registration.message}</p> : null}
    </form>
  );
}

function enrichCandidate(candidate, ledger, manualQuote = null) {
  const operation = findFixtureQuoteEntry(ledger, candidate);
  const quote = manualQuote || candidate.activeQuote || candidate.active_quote || operation?.active_quote || operation?.latest_known_quote || null;
  return {
    ...candidate,
    fixture_id: candidate.fixtureId,
    candidate_id: candidate.transferredCandidate?.candidate_id || combinationSelectionKey(candidate),
    ranking_version: candidate.methodologyVersion || "journey-scan",
    market_family: candidate.marketId,
    sports_score: candidate.sportsScore ?? candidate.technicalSupport,
    preliminary_probability: candidate.probability,
    ranking_eligible: candidate.rankingEligible === true,
    estimated_probability: candidate.estimatedProbability,
    probability_percent: candidate.probabilityPercent,
    probability_classification: candidate.probabilityClassification,
    uncertainty_low: candidate.uncertaintyLow,
    uncertainty_high: candidate.uncertaintyHigh,
    sample_size_effective: candidate.sampleSize,
    overall_rank: candidate.generalRank,
    family_rank: candidate.familyRank,
    overall_status: candidate.status,
    technical_support_score: candidate.technicalSupport,
    line_stability_score: candidate.lineStabilityScore,
    limitations: candidate.limitations || [],
    active_quote: quote,
    decimal_odds: quote?.decimal_odds ?? null,
    freshness: quote?.freshness || "unavailable",
    odds_source_status: quote?.verification_status || "unavailable",
    price_status: quote ? candidate.priceStatus || operation?.price_status || "unavailable" : "unavailable",
    price_gap: operation?.price_gap ?? null,
  };
}

function CandidateCard({ candidate, selected, selectable, onToggle }) {
  const inspection = inspectCombinationCandidate(candidate);
  const normalized = inspection.candidate;
  const label = displaySelectionLabel(candidate.selection || `${candidate.direction === "under" ? "Under" : "Over"} ${candidate.line}`);
  const priceLabel = normalized.price_usable
    ? `${normalized.active_quote.bookmaker_name || "Proveedor"} @${normalized.decimal_odds}`
    : displayStatusLabel(normalized.economic_price_status);
  return (
    <article className={`p2-combination-candidate ${inspection.sports_eligible ? "is-eligible" : "is-pending"}`}>
      <div>
        <p className="eyebrow">{candidate.competition}</p>
        <h4>{candidate.fixture}</h4>
        <p><strong>{label}</strong> · {displayMarketLabel(candidate.marketId || candidate.market)}</p>
        <small><strong>Soporte Atlas:</strong> {normalized.sports_score}/100 <em>(métrica interna, no es probabilidad)</em></small>
        <small><strong>Probabilidad estimada Atlas:</strong> {Number.isFinite(normalized.probability_percent) ? `${normalized.probability_percent}%` : "No disponible"}{normalized.probability_classification ? ` (${normalized.probability_classification})` : ""}</small>
        <small>Probabilidad preliminar {percent(candidate.probability)}</small>
        <small><strong>Estado deportivo:</strong> {inspection.sports_eligible ? "Elegible deportivamente" : "Soporte deportivo insuficiente"}</small>
        <small><strong>Información económica:</strong> {priceLabel}{normalized.price_usable ? "" : " · no se utiliza para calcular la cuota combinada"}</small>
      </div>
      {selectable ? (
        <label className="p2-combination-toggle">
          <input type="checkbox" checked={selected} disabled={!inspection.sports_eligible} onChange={() => onToggle(candidate.selection_key)} />
          <span>{selected ? "Quitar selección" : inspection.sports_eligible ? "Añadir selección" : "No elegible deportivamente"}</span>
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
  const [targetCounts, setTargetCounts] = useState({ [COMBINATION_PRODUCT.PARLAY]: 2, [COMBINATION_PRODUCT.DREAM]: 5 });
  const [selectionCountDraft, setSelectionCountDraft] = useState("2");
  const [journey, setJourney] = useState(null);
  const [ledgers, setLedgers] = useState({});
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [combination, setCombination] = useState(null);
  const [loadState, setLoadState] = useState("idle");
  const [loadReason, setLoadReason] = useState(null);
  const [manualQuotes, setManualQuotes] = useState({});
  const [manualDrafts, setManualDrafts] = useState({});
  const [manualErrors, setManualErrors] = useState({});
  const requestRef = useRef(null);

  const selectionCount = targetCounts[product];

  const candidates = useMemo(() => (journey?.combinationCandidates || journey?.candidates || []).map((candidate) => {
    const identity = combinationSelectionKey(candidate);
    const enriched = enrichCandidate(candidate, ledgers[String(candidate.fixtureId)], manualQuotes[identity]);
    return { ...enriched, selection_key: combinationSelectionKey(enriched) };
  }), [journey, ledgers, manualQuotes]);

  const eligibleCount = candidates.filter((candidate) => inspectCombinationCandidate(candidate).sports_eligible).length;
  const limits = COMBINATION_LIMITS[product];

  function invalidate() {
    setCombination(null);
  }

  function changeProduct(nextProduct) {
    setProduct(nextProduct);
    setSelectionCountDraft(String(targetCounts[nextProduct]));
    setSelectedKeys([]);
    setCombination(null);
  }

  function updateSelectionCount(value) {
    setSelectionCountDraft(value);
    const normalized = normalizeCombinationTarget(value, product, null);
    if (String(normalized) === String(value)) {
      setTargetCounts((current) => ({ ...current, [product]: normalized }));
      setCombination(null);
    }
  }

  function commitSelectionCount() {
    const normalized = normalizeCombinationTarget(selectionCountDraft, product, selectionCount);
    setTargetCounts((current) => ({ ...current, [product]: normalized }));
    setSelectionCountDraft(String(normalized));
    setCombination(null);
    return normalized;
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

  async function findCandidates() {
    requestRef.current?.abort();
    const requestedDates = unique(dates);
    if (!requestedDates.length || !competitionKeys.length || !marketIds.length) {
      setLoadState("error");
      setLoadReason("insufficient_coverage");
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setLoadState("loading");
    setLoadReason(null);
    setJourney(null);
    setLedgers({});
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
      const resultCandidates = result.combinationCandidates || result.candidates || [];
      const fixtureIds = unique(resultCandidates.map((candidate) => String(candidate.fixtureId)));
      const ledgerEntries = await Promise.all(fixtureIds.map(loadLedger));
      if (controller.signal.aborted) return;
      setLedgers(Object.fromEntries(ledgerEntries.filter(([, ledger]) => ledger)));
      const prepared = response.ok && resultCandidates.length > 0;
      setLoadState(prepared ? "success" : "error");
      setLoadReason(prepared ? null : classifyUniverseReason(result, response.status));
    } catch (error) {
      if (error?.name !== "AbortError") {
        setLoadState("error");
        setLoadReason(error?.name === "TimeoutError" ? "timeout" : "internal_safe_error");
      }
    }
  }

  function toggleCandidate(key) {
    if (combination?.editing) {
      const alreadySelected = combination.selections.some((item) => item.selection_key === key);
      const updated = alreadySelected
        ? removeCombinationSelection(combination, key)
        : addCombinationSelection(combination, candidates.find((item) => item.selection_key === key));
      setCombination(updated);
      setSelectedKeys((updated?.selections || []).map((item) => item.selection_key));
      return;
    }
    setSelectedKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
    setCombination(null);
  }

  function generateCombination() {
    const target = commitSelectionCount();
    const prepared = buildAtlasCombination({ candidates, product, mode, selections: target, selectedKeys });
    setCombination(prepared.status === "ready"
      ? { ...prepared, combination_id: globalThis.crypto.randomUUID() }
      : prepared);
  }

  function addManualQuote(candidate) {
    const key = candidate.selection_key;
    const now = new Date().toISOString();
    const quote = createManualOdds({
      fixtureId: candidate.fixture_id,
      bookmaker: "Ingresada manualmente",
      marketFamily: candidate.market_family,
      marketName: candidate.market,
      selection: candidate.selection,
      direction: candidate.direction,
      line: candidate.line,
      decimalOdds: manualDrafts[key],
      receivedAt: now,
      analyzedAt: now,
      kickoff: candidate.kickoff,
      timezone: candidate.timezone || defaultTimezone,
      analysisVersion: "atlas-combination-manual-v1",
    });
    if (!quote) {
      setManualErrors((current) => ({ ...current, [key]: "Ingresa una cuota decimal válida mayor que 1." }));
      return;
    }
    const updatedCandidates = candidates.map((item) => item.selection_key === key ? { ...item, active_quote: quote } : item);
    setManualQuotes((current) => ({ ...current, [key]: quote }));
    setManualErrors((current) => ({ ...current, [key]: null }));
    const selectedCandidate = updatedCandidates.find((item) => item.selection_key === key);
    setCombination(combination?.selections?.some((item) => item.selection_key === key)
      ? updateCombinationSelection(combination, selectedCandidate)
      : buildAtlasCombination({ candidates: updatedCandidates, product, mode, selections: selectionCount, selectedKeys }));
  }

  function removePreparedSelection(key) {
    const updated = removeCombinationSelection(combination, key);
    setSelectedKeys((updated?.selections || []).map((item) => item.selection_key));
    setCombination(updated);
  }

  const editableSelectionKeys = combination?.editing
    ? combination.selections.map((item) => item.selection_key)
    : selectedKeys;
  const showsPreparedCombination = combination && ["ready", "editing"].includes(combination.status);

  return (
    <section className="p2-mode p2-combination-builder" aria-labelledby="combination-title">
      <div className="p2-mode-heading">
        <p className="eyebrow">Combinaciones Atlas</p>
        <h2 id="combination-title">Parlay Atlas y Soñadora Atlas</h2>
        <p>Atlas compara primero el soporte deportivo de todo el universo del Journey Scan. Las cuotas disponibles complementan la propuesta, pero no determinan su elegibilidad deportiva.</p>
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
        <label><span>5 · Número de selecciones</span><input type="number" min={limits.minimum} max={limits.maximum} value={selectionCountDraft} onChange={(event) => updateSelectionCount(event.target.value)} onBlur={commitSelectionCount} /></label>
        <fieldset><legend>6 · Construcción</legend>
          {Object.values(COMBINATION_MODE).map((value) => <label key={value}><input type="radio" name="combination-mode" checked={mode === value} onChange={() => { setMode(value); setSelectedKeys([]); setCombination(null); }} />{modeName(value)}</label>)}
        </fieldset>
      </section>

      <button type="button" className="primary-button p2-primary" onClick={findCandidates} disabled={loadState === "loading"}>{loadState === "loading" ? "Buscando candidatos…" : "Buscar candidatos"}</button>
      <p className={`p2-status p2-status-${loadState}`}>{statusMessage(loadState, loadReason)}{loadReason ? <small> Motivo: {loadReason}.</small> : null}</p>

      {journey ? <section className="p2-combination-universe">
        <div className="p2-combination-summary"><h3>Universo disponible</h3><p>{candidates.length} candidatos deportivos · {eligibleCount} elegibles deportivamente.</p><p>La falta de cuota no elimina una selección con soporte suficiente. Atlas muestra la cobertura económica por separado y nunca inventa precios.</p></div>
        <div className="p2-combination-candidate-grid">{candidates.map((candidate) => <CandidateCard key={candidate.selection_key} candidate={candidate} selectable={mode !== COMBINATION_MODE.AUTOMATIC || combination?.editing === true} selected={editableSelectionKeys.includes(candidate.selection_key)} onToggle={toggleCandidate} />)}</div>
        <button type="button" className="primary-button p2-primary" onClick={generateCombination}>Generar {productName(product)}</button>
      </section> : null}

      {combination ? <section className={`p2-combination-result p2-combination-result-${combination.status}`} aria-live="polite">
        <p className="eyebrow">DirectorAtlas</p>
        <h3>{combination.status === "ready" ? `${productName(product)} preparada` : combination.status === "editing" ? `${productName(product)} en edición` : "No se pudo construir la combinación"}</h3>
        <p>{combination.director_message || combination.message}</p>
        {showsPreparedCombination ? <>
          <div className="p2-combination-metrics"><span><small>Selecciones</small><strong>{combination.selections.length}/{combination.requested_selections}</strong></span><span><small>Cuota combinada</small><strong>{combination.combined_decimal_odds ?? "Completa no disponible"}</strong></span><span><small>Cobertura de precios</small><strong>{combination.price_coverage.available} de {combination.price_coverage.total}</strong></span><span><small>Riesgo</small><strong>{combination.risk.level === "high" ? "Alto" : combination.risk.level === "medium" ? "Medio" : "Bajo"}</strong></span><span><small>Perfil</small><strong>{combination.combination_profile === "very_conservative" ? "Muy conservador" : combination.combination_profile === "conservative" ? "Conservador" : "Equilibrado"}</strong></span><span><small>Modo</small><strong>{modeName(combination.mode)}</strong></span></div>
          {combination.editing && !combination.target_complete ? <p className="p2-combination-warning">Estado actual: {combination.selections.length}/{combination.requested_selections}. {combination.can_confirm ? "La combinación reducida conserva el mínimo del producto." : "Faltan selecciones para alcanzar el mínimo válido del producto."}</p> : null}
          {product === COMBINATION_PRODUCT.DREAM ? <p className="p2-combination-warning">Alto riesgo: el resultado depende de que todas las selecciones se cumplan.</p> : null}
          {combination.price_coverage.status !== "complete" ? <p>Cuota combinada completa no disponible: {combination.price_coverage.available} de {combination.price_coverage.total} selecciones tienen precio compatible y vigente.</p> : null}
          <ol className="p2-combination-legs">{combination.selections.map((candidate) => <li key={candidate.selection_key}><div><strong>{candidate.fixture}</strong><span>{displaySelectionLabel(candidate.selection)} · {displayMarketLabel(candidate.marketId || candidate.market)} · {candidate.price_usable ? `@${candidate.decimal_odds}` : "Cuota no disponible"}</span><small><strong>Probabilidad estimada Atlas:</strong> {Number.isFinite(candidate.probability_percent) ? `${candidate.probability_percent}%` : "No disponible"}{candidate.probability_classification ? ` (${candidate.probability_classification})` : ""}</small><small><strong>Soporte Atlas:</strong> {candidate.sports_score}/100 (métrica interna) · Perfil: {candidate.combination_profile === "very_conservative" ? "Muy conservador" : candidate.combination_profile === "conservative" ? "Conservador" : "Equilibrado"} · Muestra efectiva: {candidate.sample_size_effective ?? "No disponible"}</small>{!candidate.price_usable ? <div className="p2-inline-actions"><label><span>Ingresar cuota</span><input inputMode="decimal" placeholder="Ej. 1.43" value={manualDrafts[candidate.selection_key] || ""} onChange={(event) => setManualDrafts((current) => ({ ...current, [candidate.selection_key]: event.target.value }))} /></label><button type="button" className="secondary-button" onClick={() => addManualQuote(candidate)}>Ingresar cuota</button>{manualErrors[candidate.selection_key] ? <small>{manualErrors[candidate.selection_key]}</small> : null}</div> : null}</div><button type="button" className="secondary-button" onClick={() => removePreparedSelection(candidate.selection_key)}>Quitar</button></li>)}</ol>
          {combination.correlation.warnings.length ? <p>Correlación advertida: {combination.correlation.warnings.map(displayCorrelationLabel).join(", ")}.</p> : <p>La propuesta evita repetir selecciones altamente correlacionadas del mismo partido y mercado.</p>}
          {combinationIsTrackable(combination)
            ? <CombinationBetRegistration key={`${combination.combination_id}:${combination.selections.map((item) => item.selection_key).join("|")}:${combination.combined_decimal_odds ?? "unpriced"}`} combination={combination} />
            : <p className="p2-combination-warning">La combinación no alcanza el mínimo necesario para registrarse como apuesta.</p>}
        </> : null}
      </section> : null}
    </section>
  );
}
