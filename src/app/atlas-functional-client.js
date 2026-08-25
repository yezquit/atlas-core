"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { buildConservativeParlays } from "@/core/intelligence/parlayPolicy";
import { localDateTimeToUtcIso, utcIsoToLocalDateTimeInput } from "@/core/intelligence/dateTimeContext";
import { manualOddsCopyWarning } from "@/core/intelligence/oddsIntelligence";
import { buildJourneyOperationalRanking, findFixtureQuoteEntry, summarizeJourneyQuoteCoverage } from "@/core/intelligence/fixtureQuoteLedger";
import { buildSimpleDirectorPresentation } from "@/core/modules/directorAtlas";
import AtlasCombinationBuilder from "./atlas-combination-builder";
import AtlasPredictionMemory, { OfficialPredictionRegistration } from "./atlas-prediction-memory";
import AtlasLive from "./atlas-live";
import {
  displayMarketLabel,
  displayProviderStatus,
  displaySelectionLabel,
  displayStatusLabel,
} from "./presentation-labels";

const LOAD_STATES = new Set([
  "loading",
  "success",
  "empty",
  "ambiguous",
  "unavailable",
  "insufficient_data",
  "provider_error",
  "blocked",
  "transferred_ready",
]);

const ComparisonVisibilityContext = createContext(true);

const STATUS_LABELS = Object.freeze({
  loading: "Cargando datos verificables",
  success: "Datos cargados",
  empty: "Sin partidos disponibles",
  ambiguous: "Coincidencia ambigua",
  unavailable: "Datos no disponibles",
  insufficient_data: "Información insuficiente",
  provider_error: "Proveedor temporalmente no disponible",
  analyzable_not_actionable: "Analizable, pero aún no accionable",
  candidate_for_market_review: "Candidato para revisar línea y cuota",
  viable_with_caution: "Viable con cautela",
  blocked: "Análisis bloqueado",
  transferred_ready: "Candidato listo para analizar",
  warning: "Evaluación pendiente",
  neutral: "Sin candidatos",
  verified: "Verificado",
  partial: "Cobertura parcial",
  insufficient_sample: "Muestra insuficiente",
  experimental: "Experimental hasta verificar",
  confirmed: "Confirmado",
  probable: "Probable",
  missing: "No informado",
  unsupported: "No soportado",
  insufficient_candidates: "Candidatos insuficientes",
  not_viable: "No viable",
  review_only: "Solo revisión",
  suitable_under_conditions: "Apto bajo condiciones",
  user_reported: "Reportado por el usuario",
  stale: "Desactualizada",
  verified_provider: "Verificado por proveedor",
  endpoint_unavailable: "Endpoint no disponible",
  no_reports: "Sin reportes disponibles",
  observe_only: "Solo observar",
  analysis_only: "Solo análisis",
  market_review_only: "Solo revisar mercado",
  early_review: "Revisión inicial",
  day_before: "Un día antes",
  three_hours_before: "Tres horas antes",
  one_hour_before: "Una hora antes",
  thirty_minutes_before: "Treinta minutos antes",
  final_pre_match: "Revisión final prepartido",
  preliminary: "Preliminar",
  eligible: "Elegible",
  eligible_under_conditions: "Apto bajo condiciones",
  not_eligible: "No elegible",
  limiting: "Limitante",
  favorable: "Favorable",
  unfavorable: "Desfavorable",
  neutral: "Neutral",
  unverified: "Sin verificar",
  hit: "Acierto",
  miss: "Fallo",
  void: "Nulo",
  unresolved: "Sin resolver",
  preliminary_insufficient_history: "Historial aún insuficiente",
  eligible_for_manual_validation_review: "Elegible para revisión manual de validación",
  manual_gemini_paste: "Respuesta de Gemini pegada manualmente",
  manual_user_input: "Dato informado manualmente",
  odds_stale: "La cuota está vencida",
  odds_unavailable: "La cuota no está disponible",
  odds_not_covered: "La competición no ofrece cobertura de cuotas",
  manual_odds_unverified: "La cuota manual aún no está verificada externamente",
  referee_sample_insufficient: "La muestra del árbitro es insuficiente",
  lineups_not_published: "Las alineaciones todavía no se publican",
  lineups_not_covered: "La competición no ofrece cobertura de alineaciones",
  injuries_not_covered: "La competición no ofrece cobertura de lesiones",
  standings_not_covered: "La tabla no está disponible para esta consulta",
  post_kickoff_data_rejected: "El análisis prepartido está cerrado",
  response_without_sources: "La respuesta no incluye fuentes",
  rumors_present: "La respuesta contiene información clasificada como rumor.",
  line_not_confirmed: "La línea no fue confirmada por una fuente externa.",
  odds_not_confirmed: "La cuota no fue confirmada por una fuente externa.",
  fixture_mismatch: "La respuesta hace referencia a otro partido.",
  team_context_ambiguous: "La respuesta no identifica con claridad a ambos equipos.",
  date_mismatch: "La respuesta contiene una fecha de partido incompatible.",
  not_found: "Dato no encontrado",
  very_high: "Muy alta",
  muy_alta: "Muy alta",
  preliminary_unvalidated: "Modelo preliminar aún no validado",
  sports_candidate_pending_price: "Candidato deportivo pendiente de cuota",
  suitable_for_consideration: "Apto para consideración",
  insufficient_information: "Información insuficiente",
  verified_current: "Vigente y verificada",
  user_reported_current: "Vigente, reportada por el usuario",
  pending_price: "Pendiente de precio",
  stale_price: "Precio vencido",
  price_evaluated: "Precio evaluado",
  operational_partial: "Evaluación operativa parcial",
  operational_available: "Evaluación operativa disponible",
  favorable_preliminary: "Favorable preliminar",
  marginal: "Marginal",
  unfavorable: "Desfavorable",
  not_viable_at_this_price: "No viable a esta cuota",
  eligible_with_caution: "Elegible con cautela",
  incompatible_line: "Línea incompatible",
  incompatible_selection: "Selección incompatible",
  early_forecast: "Pronóstico temprano",
  provisional_forecast: "Pronóstico provisional",
  updated_forecast: "Pronóstico actualizado",
  final_pre_match_forecast: "Pronóstico final prepartido",
  hours_before: "Horas antes del partido",
  pre_match_closed: "Análisis prepartido cerrado",
  provider_odd_invalid: "La cotización del proveedor presentó datos inválidos.",
  contradiction: "Contradicción",
  usable_as_context: "Utilizable como contexto",
  official_competition: "Competición oficial",
  official_club: "Club oficial",
  federation: "Federación",
  recognized_media: "Medio reconocido",
  journalist: "Periodista",
  aggregator: "Agregador",
  unknown: "Fuente no clasificada",
  atlas_selected: "Seleccionada por Atlas",
  user_selected: "Elegida por el usuario",
  provider_quote: "Procedente de la cotización del proveedor",
  transferred_candidate: "Candidato transferido de Atlas",
  domestic_league: "Liga doméstica",
  domestic_cup: "Copa doméstica",
  international: "Competición internacional",
  first_leg: "Partido de ida",
  second_leg: "Partido de vuelta",
  single_or_group_match: "Partido único o de grupo",
  over: "Más de",
  under: "Menos de",
  pending_price: "Pendiente de precio",
});

const METRIC_LABELS = Object.freeze({
  matches_included: "Partidos incluidos",
  goals_per_match: "Goles por partido",
  home_goals_per_match: "Goles del local",
  away_goals_per_match: "Goles del visitante",
  over_1_5: "Más de 1,5 goles",
  over_2_5: "Más de 2,5 goles",
  over_3_5: "Más de 3,5 goles",
  under_2_5: "Menos de 2,5 goles",
  both_teams_score: "Ambos equipos marcan",
  home_wins: "Victorias locales",
  draws: "Empates",
  away_wins: "Victorias visitantes",
  yellow_cards_per_match: "Tarjetas amarillas por partido",
  red_cards_per_match: "Tarjetas rojas por partido",
  fouls_per_match: "Faltas por partido",
  corners_per_match: "Córners por partido",
  total_shots_per_match: "Remates por partido",
  shots_on_goal_per_match: "Remates a puerta por partido",
  possession_home_share: "Posesión local promedio",
  result_volatility: "Volatilidad del resultado",
  close_scores: "Marcadores cerrados",
});

function state(message, status = "unavailable", errorCode = null) {
  return { status, message, errorCode };
}

function safeStatus(value) {
  return LOAD_STATES.has(value) ? value : "provider_error";
}

function displayStatus(value) {
  return STATUS_LABELS[value] || displayStatusLabel(value);
}

function displaySelection(value) {
  return displaySelectionLabel(value);
}
function displayMarket(value) {
  return displayMarketLabel(value);
}
function formatDate(value, timezone = "America/Bogota") {
  if (!value) return "Fecha no disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

function percentage(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1).replace(".0", "")}%` : "No disponible";
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "No disponible";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(value);
  return displayStatus(value);
}

function formatEffectiveSample(value, maximumFractionDigits = 1) {
  if (!Number.isFinite(Number(value))) return "No disponible";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits }).format(Number(value));
}

function seasonFor(competition, date) {
  const year = Number(date?.slice(0, 4));
  if (!Number.isInteger(year)) return competition?.currentSeason || "";
  if (competition?.seasonFormat === "split_year") {
    return Number(date.slice(5, 7)) < (competition.seasonStartMonth || 7)
      ? year - 1
      : year;
  }
  return year;
}

function StatusNotice({ value }) {
  if (!value?.message) return null;
  const visualStatus = value.tone || safeStatus(value.status);
  return (
    <div className={`p2-status p2-status-${visualStatus}`} role="status">
      <strong>{displayStatus(visualStatus)}</strong>
      <span>{value.message}</span>
      {value.errorCode ? <small>Referencia: {value.errorCode}</small> : null}
    </div>
  );
}

function ListBlock({ title, items, empty = "Ninguno reportado." }) {
  const values = (items || []).filter(Boolean);
  return (
    <div className="p2-list-block">
      <h4>{title}</h4>
      {values.length ? (
        <ul>{values.map((item) => <li key={item}>{displayStatus(item)}</li>)}</ul>
      ) : (
        <p>{empty}</p>
      )}
    </div>
  );
}

function DefinitionGrid({ entries }) {
  return (
    <dl className="p2-definition-grid">
      {entries.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{formatValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function HelpTerm({ label, definition }) {
  return (
    <details className="p2-help-term">
      <summary aria-label={`Ayuda: ${label}`} title={definition}>?</summary>
      <p><strong>{label}.</strong> {definition}</p>
    </details>
  );
}

const ATLAS_GLOSSARY = Object.freeze([
  ["Veredicto deportivo", "Lo que Atlas piensa de la selección basándose en el partido y los datos deportivos, sin utilizar la cuota."],
  ["Decisión operativa", "Indica si la selección merece consideración con la cuota actual disponible."],
  ["Limitaciones del modelo", "Advertencias sobre la metodología de Atlas; no son riesgos específicos del partido."],
  ["Probabilidad preliminar", "Estimación actual de Atlas sobre la posibilidad de que ocurra la selección. No es una garantía."],
  ["Intervalo de incertidumbre", "Rango alrededor de la estimación. Un intervalo más amplio significa mayor incertidumbre."],
  ["Confianza del análisis", "Mide calidad, cobertura y coherencia de la información. No es la probabilidad de acertar."],
  ["Respaldo deportivo", "Puntuación comparativa de la fortaleza de la tesis deportiva sin utilizar la cuota."],
  ["Línea", "Umbral exacto evaluado."],
  ["Cuota decimal", "Retorno total ofrecido por cada unidad apostada, incluyendo la unidad inicial."],
  ["Probabilidad implícita", "Conversión matemática 1 / cuota. Por ejemplo, 1 / 1,34 = 74,63 %."],
  ["Evaluación de precio", "Compara la probabilidad preliminar de Atlas con lo que exige la cuota disponible."],
  ["Marginal", "La diferencia es pequeña o la incertidumbre impide una conclusión fuerte."],
  ["Aptitud individual", "Indica si la selección es viable de forma individual bajo las reglas actuales."],
  ["Elegibilidad para parlay", "Evalúa si la selección puede formar parte de una combinada según los controles existentes."],
  ["Muestra efectiva ponderada", "Cantidad equivalente de información al combinar muestras ponderadas; no equivale necesariamente a partidos independientes."],
  ["Procedencia de línea", "Indica si la línea fue elegida por Atlas, por el usuario, por el proveedor o transferida desde Scout."],
]);

function AtlasGlossary() {
  return (
    <details className="p2-glossary">
      <summary>¿Cómo leer Atlas?</summary>
      <div className="p2-glossary-grid">
        {ATLAS_GLOSSARY.map(([label, definition]) => <article key={label}><h3>{label}</h3><p>{definition}</p></article>)}
      </div>
    </details>
  );
}

function Accordion({ id, title, summary, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`p2-accordion ${open ? "open" : ""}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-content`}
        id={`${id}-trigger`}
        onClick={() => setOpen((current) => !current)}
      >
        <span>
          <strong>{title}</strong>
          {summary ? <small>{summary}</small> : null}
        </span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      <div
        id={`${id}-content`}
        role="region"
        aria-labelledby={`${id}-trigger`}
        hidden={!open}
      >
        {children}
      </div>
    </section>
  );
}

function MetricTable({ metrics = {} }) {
  const entries = Object.entries(metrics);
  if (!entries.length) return <p>No hay métricas disponibles.</p>;
  return (
    <div className="p2-table-wrap">
      <table className="p2-table">
        <thead><tr><th>Métrica</th><th>Valor</th><th>Muestra</th><th>Cobertura</th><th>Advertencia</th></tr></thead>
        <tbody>
          {entries.map(([key, metric]) => (
            <tr key={key}>
              <th scope="row">{METRIC_LABELS[key] || displayStatus(key)}</th>
              <td>{formatValue(metric?.value)}</td>
              <td>{formatValue(metric?.sample_size)}</td>
              <td>{displayStatus(metric?.coverage_status)}</td>
              <td>{metric?.warning || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamProfile({ profile, role }) {
  if (!profile) return <p>Perfil no disponible.</p>;
  const roleProfile = role === "home" ? profile.as_home : profile.as_away;
  return (
    <>
      <DefinitionGrid entries={[
        ["Equipo", profile.team_name],
        ["Temporada", profile.season],
        ["Calidad", displayStatus(profile.quality_status)],
        ["Muestra general", profile.sample_size],
        [role === "home" ? "Muestra como local" : "Muestra como visitante", roleProfile?.sample_size],
        ["Periodo inicial", profile.window_start],
        ["Periodo final", profile.window_end],
        ["Racha", profile.general?.streak],
        ["Días de descanso promedio", profile.general?.average_rest_days],
      ]} />
      <div className="p2-split">
        <DefinitionGrid entries={[
          ["Victorias · últimos 5", profile.last_5?.wins],
          ["Empates · últimos 5", profile.last_5?.draws],
          ["Derrotas · últimos 5", profile.last_5?.losses],
          ["Goles a favor", profile.general?.goals_for_per_match],
          ["Goles en contra", profile.general?.goals_against_per_match],
        ]} />
        <DefinitionGrid entries={[
          ["Remates", profile.general?.total_shots_per_match],
          ["Remates a puerta", profile.general?.shots_on_goal_per_match],
          ["Tarjetas amarillas", profile.general?.yellow_cards_per_match],
          ["Faltas", profile.general?.fouls_per_match],
          ["Córners", profile.general?.corners_per_match],
        ]} />
      </div>
      <ListBlock title="Advertencias" items={profile.warnings} />
      <details className="p2-source-details">
        <summary>Ver partidos usados ({profile.fixture_ids?.length || 0})</summary>
        <p>{profile.fixture_ids?.join(", ") || "Ninguno"}</p>
      </details>
    </>
  );
}

function VersionComparison({ analysis, expert = false, active }) {
  const comparisonVisible = useContext(ComparisonVisibilityContext);
  if (active === false || (active === undefined && !comparisonVisible)) return null;
  const comparison = analysis?.changesSincePrevious;
  const reanalysis = Boolean(analysis?.analysisVersion?.inputs?.reanalysis);
  if (!comparison && !reanalysis) return null;
  const changes = comparison?.changes;
  const timezone = analysis?.director?.fixture?.timezone || "America/Bogota";
  const rows = changes ? [
    ["Fecha y hora", formatDate(changes.analyzed_at?.previous, timezone), formatDate(changes.analyzed_at?.current, timezone)],
    ["Fase temporal", displayStatus(changes.phase?.previous), displayStatus(changes.phase?.current)],
    ["Probabilidad preliminar", percentage(changes.preliminary_probability?.previous), percentage(changes.preliminary_probability?.current)],
    ["Intervalo", `${percentage(changes.uncertainty_interval?.previous?.low)}–${percentage(changes.uncertainty_interval?.previous?.high)}`, `${percentage(changes.uncertainty_interval?.current?.low)}–${percentage(changes.uncertainty_interval?.current?.high)}`],
    ["Confianza", changes.analysis_confidence?.previous === null ? "No disponible" : `${changes.analysis_confidence?.previous}%`, changes.analysis_confidence?.current === null ? "No disponible" : `${changes.analysis_confidence?.current}%`],
    ["Mercado", formatValue(changes.market?.previous), formatValue(changes.market?.current)],
    ["Dirección", displayStatus(changes.direction?.previous), displayStatus(changes.direction?.current)],
    ["Línea", formatValue(changes.line?.previous), formatValue(changes.line?.current)],
    ["Casa", formatValue(changes.bookmaker?.previous), formatValue(changes.bookmaker?.current)],
    ["Cuota", formatValue(changes.odds?.previous), formatValue(changes.odds?.current)],
    ["Probabilidad implícita", percentage(changes.implied_probability?.previous), percentage(changes.implied_probability?.current)],
    ["Evaluación de precio", displayStatus(changes.price_evaluation?.previous), displayStatus(changes.price_evaluation?.current)],
    ["Aptitud individual", displayStatus(changes.individual_eligibility?.previous), displayStatus(changes.individual_eligibility?.current)],
    ["Elegibilidad para parlay", displayStatus(changes.parlay_eligibility?.previous), displayStatus(changes.parlay_eligibility?.current)],
  ] : [];
  return (
    <section className="p2-history-compare" aria-labelledby={expert ? "expert-version-comparison-title" : "version-comparison-title"}>
      <h3 id={expert ? "expert-version-comparison-title" : "version-comparison-title"}>Qué cambió desde el análisis anterior</h3>
      <DefinitionGrid entries={[
        ["Analysis ID anterior", comparison?.previous_analysis_id],
        ["Analysis ID actual", comparison?.current_analysis_id || analysis?.analysisVersion?.analysis_id],
        ["ID del partido", comparison?.fixture_id || analysis?.analysisVersion?.fixture_id],
        ["Versión del motor", comparison?.engine_version || analysis?.analysisVersion?.engine_version],
      ]} />
      {!comparison?.comparable ? <p>No hay una versión anterior comparable.</p> : (
        <>
          <div className="p2-table-wrap">
            <table className="p2-table">
              <thead><tr><th>Campo</th><th>Anterior</th><th>Actual</th></tr></thead>
              <tbody>{rows.map(([label, previous, current]) => <tr key={label}><th scope="row">{label}</th><td>{previous}</td><td>{current}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="p2-four-columns">
            <ListBlock title="Riesgos añadidos" items={changes?.new_risks} />
            <ListBlock title="Riesgos resueltos" items={changes?.resolved_risks} />
            <ListBlock title="Datos faltantes añadidos" items={changes?.added_missing_data} />
            <ListBlock title="Datos faltantes resueltos" items={changes?.resolved_missing_data} />
          </div>
          <ListBlock title="Elementos Gemini incorporados" items={(changes?.gemini_items_incorporated || []).map((item) => item.summary || item.text)} />
          <p><strong>{comparison.explanation}</strong></p>
          {expert ? <details className="p2-source-details"><summary>Ver comparación técnica completa</summary><pre>{JSON.stringify(changes, null, 2)}</pre></details> : null}
        </>
      )}
    </section>
  );
}

function GeminiContextSummary({ analysis, onShowExpert }) {
  const items = analysis?.gemini?.applied_items || [];
  if (!items.length) return null;
  const summary = analysis.gemini?.summary || analysis.director?.context_summary || {};
  return (
    <section className="p2-history-compare" aria-labelledby="context-summary-title">
      <h3 id="context-summary-title">Resumen del contexto incorporado</h3>
      <div className="p2-four-columns">
        <ListBlock title="Elementos favorables" items={(summary.favorable || []).slice(0, 3)} />
        <ListBlock title="Elementos contrarios" items={(summary.unfavorable || []).slice(0, 3)} />
        <ListBlock title="Limitaciones" items={(summary.limitations || []).slice(0, 3)} />
      </div>
      <button type="button" className="secondary-button" onClick={onShowExpert}>Ver contexto completo</button>
    </section>
  );
}

const SCOUT_LABELS = Object.freeze({
  best_sports_support: "Mejor opción deportiva",
  highest_probability: "Mayor probabilidad",
  relevant_alternative: "Alternativa relevante",
});

function operationalDecisionLabel(status) {
  if (status === "favorable_preliminary") return "Sí";
  if (status === "marginal") return "Sí, pero con cautela";
  if (status === "unfavorable") return "No";
  return "Pendiente de precio";
}

function CompetitiveContextResult({ context }) {
  if (!context) return null;
  const entries = [
    ["Competición", context.competition?.name],
    ["Tipo", context.competition?.type && context.competition.type !== "unknown" ? displayStatus(context.competition.type) : null],
    ["Fase o ronda", context.competition?.round],
    ["Formato", context.leg && context.leg !== "unknown" ? displayStatus(context.leg) : null],
    ["Marcador agregado", context.aggregate ? `${context.aggregate.home}–${context.aggregate.away}` : null],
    ["Local", context.fixture_role?.home_team],
    ["Visitante", context.fixture_role?.away_team],
    ["Descanso del local", Number.isFinite(Number(context.rest_days?.home_days)) ? `${context.rest_days.home_days} días` : null],
    ["Descanso del visitante", Number.isFinite(Number(context.rest_days?.away_days)) ? `${context.rest_days.away_days} días` : null],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
  const contextItems = [
    ["confirmed", "reported_risk"].includes(context.rotation?.status) ? context.rotation.message : null,
    ...(context.warnings || []),
  ].filter(Boolean).slice(0, 3);
  return (
    <section className="p2-stage-card" aria-labelledby="competitive-context-title">
      <p className="eyebrow">1 · Partido</p>
      <h3 id="competitive-context-title">Contexto del partido</h3>
      <DefinitionGrid entries={entries} />
      {context.competition?.type === "international" ? <p>Es una competición internacional; el contexto se utiliza como señal de riesgo, no como ajuste automático de probabilidad.</p> : null}
      <ListBlock title="Lectura contextual" items={contextItems} empty="Sin alertas contextuales materiales." />
    </section>
  );
}

function ScoutResult({ analysis, candidateQuotes, onQuoteChange, onEvaluatePrices }) {
  const candidates = analysis?.scout?.candidates || [];
  if (!candidates.length) return null;
  const completeQuotes = candidates.filter((candidate) => {
    const value = candidateQuotes[candidate.candidate_id] || {};
    return value.bookmaker?.trim() && Number(String(value.decimalOdds || "").replace(",", ".")) > 1 && value.consultedAt;
  }).length;
  return (
    <section className="p2-stage-card" aria-labelledby="scout-atlas-title">
      <p className="eyebrow">2 · Scout Atlas · sin cuotas</p>
      <h3 id="scout-atlas-title">Opciones con mayor respaldo deportivo</h3>
      <p>{analysis.scout.explanation}</p>
      <div className="p2-candidate-grid">
        {candidates.map((candidate) => {
          const quote = candidateQuotes[candidate.candidate_id] || {};
          const operation = analysis.operationalRanking?.candidates?.find((item) => item.candidate.candidate_id === candidate.candidate_id) || null;
          const quoteWarning = manualOddsCopyWarning({ line: candidate.line, decimalOdds: quote.decimalOdds });
          return (
            <article key={candidate.candidate_id} className="p2-candidate-card">
              <div className="p2-chip-row">{candidate.labels.map((label) => <span className="p2-chip" key={label}>{SCOUT_LABELS[label]}</span>)}</div>
              <h4>{displaySelection(candidate.selection)}</h4>
              <DefinitionGrid entries={[
                ["Probabilidad preliminar", percentage(candidate.preliminary_probability)],
                ["Intervalo", `${percentage(candidate.uncertainty_low)}–${percentage(candidate.uncertainty_high)}`],
                ["Respaldo deportivo", `${candidate.sports_support}/100`],
                ["Calidad informativa", displayStatus(candidate.confidence_quality)],
                ["Estado de cuota", operation?.quote ? `${operation.quote.bookmaker_name} @${operation.quote.decimal_odds}` : "Pendiente de precio"],
                ["Decisión operativa", operation?.quote ? operationalDecisionLabel(operation.price?.status) : "Pendiente de precio"],
              ]} />
              <p>{candidate.signals.summary}</p>
              <ListBlock title="Señales favorables" items={candidate.signals.favorable.slice(0, 3)} />
              <ListBlock title="Señales contrarias" items={candidate.signals.contrary.slice(0, 2)} />
              <div className="p2-candidate-quote">
                <strong>Reportar precio para esta línea</strong>
                <label><span>Casa</span><input value={quote.bookmaker || ""} onChange={(event) => onQuoteChange(candidate, "bookmaker", event.target.value)} /></label>
                <label><span>Cuota</span><input inputMode="decimal" value={quote.decimalOdds || ""} onChange={(event) => onQuoteChange(candidate, "decimalOdds", event.target.value)} /></label>
                <label><span>Hora de consulta</span><input type="datetime-local" value={quote.consultedAt || ""} onChange={(event) => onQuoteChange(candidate, "consultedAt", event.target.value)} /></label>
                {quoteWarning ? <small className="p2-quote-warning">{quoteWarning}</small> : null}
              </div>
            </article>
          );
        })}
      </div>
      <button type="button" className="primary-button p2-primary" onClick={onEvaluatePrices} disabled={completeQuotes === 0}>Evaluar precios reportados ({completeQuotes})</button>
    </section>
  );
}

function OperationalRankingResult({ ranking }) {
  if (!ranking?.candidates?.length) return null;
  return (
    <section className="p2-stage-card" aria-labelledby="operational-ranking-title">
      <p className="eyebrow">Mejor opción con las cuotas reportadas</p>
      <h3 id="operational-ranking-title">Clasificación operativa</h3>
      <p>{ranking.explanation}</p>
      <ol className="p2-operational-ranking">{ranking.candidates.map((item) => (
        <li key={item.candidate.candidate_id}>
          <strong>#{item.operational_rank} · {displaySelection(item.candidate.selection)}</strong>
          <DefinitionGrid entries={[
            ["Línea", item.candidate.line],
            ["Casa", item.quote.bookmaker_name],
            ["Cuota", item.quote.decimal_odds],
            ["Decisión", operationalDecisionLabel(item.price.status)],
            ["Evaluación", displayStatus(item.price.status)],
          ]} />
          <p>{item.price.message}</p>
        </li>
      ))}</ol>
      {ranking.differs_from_sports_ranking ? <p><strong>La opción mejor posicionada por precio difiere de la de mayor respaldo deportivo; el ranking deportivo no cambió.</strong></p> : null}
    </section>
  );
}

function RedTeamResult({ redTeam }) {
  if (!redTeam) return null;
  return (
    <section className="p2-stage-card" aria-labelledby="red-team-title">
      <p className="eyebrow">3 · Red Team</p>
      <h3 id="red-team-title">Qué podría hacer fallar esta opción</h3>
      {(redTeam.items || []).length ? <ul>{redTeam.items.slice(0, 3).map((item) => <li key={item.text}><strong>{item.status === "neutral" ? "Neutral / no concluyente" : "Riesgo"}:</strong> {displayStatus(item.text)}</li>)}</ul> : <p>No se identificó un riesgo específico del partido con los datos disponibles.</p>}
      {(redTeam.model_limitations || []).length ? <details className="p2-source-details"><summary>Limitaciones del modelo</summary><ul>{redTeam.model_limitations.map((item) => <li key={item}>{item}</li>)}</ul></details> : null}
    </section>
  );
}

function PreflightResult({ preflight }) {
  if (!preflight) return null;
  const symbols = { confirmed: "✓", pending: "⚠", blocking: "✕" };
  return (
    <section className="p2-stage-card p2-preflight" aria-labelledby="preflight-title">
      <h3 id="preflight-title">Estado del análisis</h3>
      <ul>{preflight.entries.map((item) => <li key={item.key} data-state={item.state}><span aria-hidden="true">{symbols[item.state]}</span> {item.label}</li>)}</ul>
    </section>
  );
}

function DirectorResult({ analysis, headingRef, onShowExpert }) {
  const director = analysis?.director;
  if (!director) return null;
  const price = director.price_assessment;
  const geminiItems = analysis.gemini?.applied_items || [];
  const presentation = buildSimpleDirectorPresentation(director, { geminiItems, historicalQuote: analysis.historicalQuote });
  const analysisDecision = presentation.analysis_decision;
  const priceDecision = presentation.price_decision;
  const simplePriceMessage = presentation.stale_quote
    ? "Cuota vencida — actualízala para tomar una decisión."
    : priceDecision?.status === "yes"
      ? price?.status === "favorable_preliminary"
        ? "La cuota actual acompaña bien la lectura de Atlas."
        : "La cuota actual es suficiente para esta opción según el análisis de Atlas."
      : priceDecision?.status === "no"
        ? analysisDecision.status === "yes"
          ? "Me gusta el mercado, pero no lo jugaría a esta cuota."
          : "Atlas no recomienda esta opción a la cuota actual."
        : priceDecision?.status === "wait"
          ? priceDecision.explanation
          : "Introduce una cuota actual después de completar la tesis.";
  const contextSummary = analysis.gemini?.summary || director.context_summary || {};
  const baseReasons = (director.simple_reasons || director.reasons || []).slice(0, 3);
  const decisionReasons = analysisDecision.status === "no"
    ? [...(contextSummary.unfavorable || []), ...baseReasons].slice(0, 3)
    : [...(contextSummary.favorable || []), ...baseReasons].slice(0, 3);
  const fixtureRisks = (director.red_team?.items || []).filter((item) => item.status === "risk").map((item) => item.text).slice(0, 3);
  const simpleRisks = [...new Set([...(contextSummary.unfavorable || []), ...fixtureRisks])].slice(0, 2);
  const fixture = director.fixture || {};

  return (
    <section className={`director-atlas-panel functional-director p2-director p2-simple-director p2-simple-director-${analysisDecision.status}`} aria-label="Dictamen del Director Atlas" aria-labelledby="director-atlas-title">
      <p className="p2-director-kicker">ANÁLISIS COMPLETO</p>
      <header className="p2-simple-fixture">
        <p>{fixture.competition}</p>
        <h2 id="director-atlas-title" ref={headingRef} tabIndex="-1">{fixture.home_team} vs {fixture.away_team}</h2>
        <strong>{displaySelection(director.selection || director.market_evaluated?.label)}</strong>
      </header>
      <section className={`p2-simple-decision p2-simple-decision-${analysisDecision.status}`} aria-label="Resultado de Atlas">
        <span aria-hidden="true">{analysisDecision.icon}</span>
        <div><small>RESULTADO DE ATLAS</small><h3>{analysisDecision.label}</h3><p>{analysisDecision.explanation}</p></div>
      </section>
      <div className="p2-director-metrics" aria-label="Resumen del dictamen">
        <span><small>Soporte</small><strong>{director.sports_verdict?.sports_score ?? "No disponible"}{Number.isFinite(Number(director.sports_verdict?.sports_score)) ? "/100" : ""}</strong></span>
        <span><small>Precio</small><strong>{presentation.has_current_price ? `${price.bookmaker} @${price.decimal_odds}` : "Pendiente"}</strong></span>
        <span><small>Confianza</small><strong>{director.analysis_confidence_score || 0}/100</strong></span>
        <span><small>Riesgo</small><strong>{simpleRisks.length ? "Con alertas" : "Sin alerta específica"}</strong></span>
      </div>
      <div className="p2-simple-evidence-grid">
        <ListBlock title="¿Por qué?" items={decisionReasons} empty="Atlas no encontró razones suficientes para sostener esta opción." />
        <ListBlock title="¿Qué podría hacerla fallar?" items={simpleRisks} empty="No se identificó un riesgo específico del partido con los datos disponibles." />
      </div>
      <section className="p2-simple-gemini-evidence" aria-labelledby="simple-gemini-evidence-title">
        <h3 id="simple-gemini-evidence-title">Evidencia Gemini relevante</h3>
        {geminiItems.length
          ? <ul>{geminiItems.slice(0, 3).map((item) => <li key={item.id}>{item.summary || item.text}</li>)}</ul>
          : <p>La respuesta fue validada, pero ningún elemento superó el filtro para modificar el análisis.</p>}
      </section>
      <section className="p2-simple-price" aria-labelledby="simple-price-title">
        <p className="eyebrow">CUOTA</p>
        <h3 id="simple-price-title">{presentation.has_current_price ? `${price.bookmaker} @${price.decimal_odds}` : presentation.stale_quote ? `${presentation.stale_quote.bookmaker_name} @${presentation.stale_quote.decimal_odds}` : "Todavía no informada"}</h3>
        <p>{simplePriceMessage}</p>
      </section>
      {priceDecision ? <section className={`p2-simple-final p2-simple-decision-${priceDecision.status}`} aria-label="Decisión final"><small>DECISIÓN FINAL</small><h3><span aria-hidden="true">{priceDecision.icon}</span> {priceDecision.label}</h3><p>{simplePriceMessage}</p></section> : null}
      {priceDecision?.status === "yes" ? (
        <BetRegistrationButton analysisId={analysis?.analysisVersion?.analysis_id} />
      ) : null}
      {analysisDecision.status === "yes" ? <OfficialPredictionRegistration analysisId={analysis?.analysisVersion?.analysis_id} /> : null}
      <button type="button" className="secondary-button" onClick={() => onShowExpert(displayStatus(director.parlay_eligibility))}>Ver análisis completo</button>
    </section>
  );
}

function MarketAssessment({ market }) {
  return (
    <article className="p2-market-card">
      <div>
        <h4>{market.market_label}</h4>
        <span className={`p2-chip ${market.candidate ? "p2-chip-candidate" : ""}`}>
          {market.candidate ? "Candidato para revisión" : displayStatus(market.quality_status)}
        </span>
      </div>
      <DefinitionGrid entries={[
        ["Respaldo técnico", `${market.technical_support_score}/100`],
        ["Muestra", market.sample_size],
        ["Probabilidad", "No disponible"],
        ["Línea ingresada", market.line],
        ["Cuota ingresada", market.odds],
      ]} />
      <p>{market.explanation}</p>
      <ListBlock title="Evidencia faltante" items={market.missing_evidence} />
      <ListBlock title="Riesgos" items={market.risk_flags} />
    </article>
  );
}


function BetRegistrationButton({ analysisId }) {
  const [betRegistration, setBetRegistration] = useState({ status: "idle", message: "" });

  async function registerBet() {
    if (!analysisId) {
      setBetRegistration({ status: "error", message: "No se encontró la versión persistida del análisis." });
      return;
    }

    const rawStake = window.prompt("Monto apostado en COP (ej. 10000):");
    if (rawStake === null) return;

    const stakeAmount = Number(String(rawStake).trim());
    if (!Number.isFinite(stakeAmount) || stakeAmount <= 0) {
      setBetRegistration({ status: "error", message: "Introduce un monto válido mayor que cero." });
      return;
    }

    setBetRegistration({ status: "loading", message: "Registrando apuesta…" });

    try {
      const response = await fetch("/api/bets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          analysisId,
          stakeAmount,
          currency: "COP",
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setBetRegistration({
          status: "error",
          message: result?.message || "No fue posible registrar la apuesta.",
        });
        return;
      }

      setBetRegistration({
        status: "success",
        message: `Apuesta registrada: ${result.bet?.bookmaker || "casa"} @${result.bet?.decimal_odds || ""}`,
      });
    } catch {
      setBetRegistration({
        status: "error",
        message: "No fue posible conectar con el registro de apuestas.",
      });
    }
  }

  return (
    <div className="p2-bet-registration">
      <button
        type="button"
        className="primary-button"
        onClick={registerBet}
        disabled={betRegistration.status === "loading" || betRegistration.status === "success"}
      >
        {betRegistration.status === "loading"
          ? "Registrando…"
          : betRegistration.status === "success"
            ? "Apuesta registrada"
            : "Registrar apuesta"}
      </button>
      {betRegistration.message ? (
        <p role={betRegistration.status === "error" ? "alert" : "status"}>
          {betRegistration.message}
        </p>
      ) : null}
    </div>
  );
}

function ExpertResult({ analysis }) {
  const [candidateSaved, setCandidateSaved] = useState(false);
  const director = analysis.director;
  const fixture = analysis.fixture;
  const metadata = analysis.competitionMetadata;
  const league = analysis.leagueProfile;
  const referee = analysis.refereeProfile;
  const venue = analysis.venueWeatherContext;
  const telemetry = analysis.telemetry;
  return (
    <div className="p2-expert" data-result-mode="expert">
      <Accordion id="expert-identity" title="Identidad del partido" summary="ID, fecha, liga y temporada">
        <DefinitionGrid entries={[
          ["ID del partido", fixture?.fixtureId],
          ["Partido", fixture ? `${fixture.teams.home.name} vs ${fixture.teams.away.name}` : null],
          ["Inicio", formatDate(fixture?.date?.utc)],
          ["Competición", analysis.competition?.localName],
          ["Temporada", fixture?.competition?.season],
          ["Estado", displayProviderStatus(fixture?.status?.long || fixture?.status?.short)],
        ]} />
      </Accordion>

      <Accordion id="expert-competitive-context" title="Contexto competitivo" summary={analysis.competitiveContext?.competition?.name || "No disponible"}>
        <pre>{JSON.stringify(analysis.competitiveContext || null, null, 2)}</pre>
      </Accordion>

      <Accordion id="expert-scout" title="Scout deportivo" summary={`${analysis.scout?.candidates?.length || 0} candidatos sin cuota`}>
        <pre>{JSON.stringify(analysis.scout || null, null, 2)}</pre>
      </Accordion>

      <Accordion id="expert-red-team" title="Red Team y pre-vuelo" summary={`${analysis.redTeam?.items?.length || 0} riesgos simples`}>
        <pre>{JSON.stringify({ red_team: analysis.redTeam, preflight: analysis.preflight }, null, 2)}</pre>
      </Accordion>

      <Accordion id="expert-operational-ranking" title="Clasificación operativa" summary={`${analysis.operationalRanking?.candidates?.length || 0} opciones con precio actual`}>
        <pre>{JSON.stringify(analysis.operationalRanking || null, null, 2)}</pre>
      </Accordion>

      <Accordion id="expert-director" title="Director Atlas y contratos internos" summary={displayStatus(director?.market_suitability)}>
        <DefinitionGrid entries={[
          ["Selección", displaySelection(director?.selection)],
          ["Probabilidad", percentage(director.estimated_probability)],
          ["Intervalo", director.probability_status === "preliminary" ? `${percentage(director.probability_uncertainty_low)}–${percentage(director.probability_uncertainty_high)}` : "No disponible"],
          ["Aptitud individual", displayStatus(director?.individual_eligibility)],
          ["Elegibilidad para parlay", displayStatus(director?.parlay_eligibility)],
        ]} />
        {director?.user_requested_option ? <p><strong>Opción evaluada por solicitud del usuario.</strong></p> : null}
        <ListBlock title="Estados internos históricos" items={["SÍ — APTO PARA CONSIDERACIÓN", "NO — MERCADO NO VIABLE", "TODAVÍA NO — FALTA EVALUAR LA CUOTA"]} />
        {analysis.parlayCandidate ? <button type="button" className="secondary-button" onClick={() => setCandidateSaved(true)}>{candidateSaved ? "Candidato guardado en esta versión" : "Agregar como candidato a parlay"}</button> : null}
        <details className="p2-source-details"><summary>Ver contrato DirectorVerdict</summary><pre>{JSON.stringify(director || null, null, 2)}</pre></details>
      </Accordion>

      <Accordion id="expert-quality" title="Calidad y procedencia de datos" summary="Temporadas, cobertura y referencias">
        <DefinitionGrid entries={[
          ["Estado del proveedor", metadata?.status],
          ["Verificación del catálogo", analysis.competition?.verificationStatus],
          ["Temporadas disponibles", metadata?.availableSeasons?.join(", ")],
          ["Temporada usada", metadata?.seasonMetadata?.year],
          ["Cobertura conocida", metadata?.seasonMetadata?.coverage ? "Sí" : "No"],
          ["Referencias de evidencia", analysis.evidenceRefs?.length],
        ]} />
        <details className="p2-source-details">
          <summary>Ver coverage real del proveedor</summary>
          <pre>{JSON.stringify(metadata?.seasonMetadata?.coverage || null, null, 2)}</pre>
        </details>
        <details className="p2-source-details">
          <summary>Ver referencias</summary>
          <p>{analysis.evidenceRefs?.join(", ") || "Ninguna"}</p>
        </details>
      </Accordion>

      <Accordion id="expert-league" title="Perfil de liga" summary={`${league?.sample_size || 0} partidos en la muestra`}>
        <DefinitionGrid entries={[
          ["Competición", league?.competition_name],
          ["Temporada", league?.season],
          ["Ventana", league ? `${league.window_start} a ${league.window_end}` : null],
          ["Calidad", displayStatus(league?.quality_status)],
          ["Versión de umbrales", league?.thresholds_version],
          ["Etiquetas calculadas", league?.labels?.map(displayStatus).join(", ")],
        ]} />
        <MetricTable metrics={league?.metrics} />
        <ListBlock title="Advertencias" items={league?.warnings} />
      </Accordion>

      <Accordion id="expert-home" title="Forma del equipo local" summary={analysis.homeTeamProfile?.team_name}>
        <TeamProfile profile={analysis.homeTeamProfile} role="home" />
      </Accordion>

      <Accordion id="expert-away" title="Forma del equipo visitante" summary={analysis.awayTeamProfile?.team_name}>
        <TeamProfile profile={analysis.awayTeamProfile} role="away" />
      </Accordion>

      <Accordion id="expert-referee" title="Árbitro" summary={referee?.referee_name || "No confirmado"}>
        <DefinitionGrid entries={[
          ["Nombre", referee?.referee_name],
          ["Estado", displayStatus(referee?.status)],
          ["Calidad", displayStatus(referee?.quality_status)],
          ["Muestra", referee?.sample_size],
          ["Amarillas por partido", referee?.yellow_cards_per_match],
          ["Rojas por partido", referee?.red_cards_per_match],
          ["Faltas por partido", referee?.fouls_per_match],
          ["Comparación compatible con liga", referee?.league_comparison?.compatible],
        ]} />
        <ListBlock title="Advertencias" items={referee?.warnings} />
      </Accordion>

      <Accordion id="expert-venue" title="Sede y contexto ambiental" summary={venue?.venue || "Sede no informada"}>
        <DefinitionGrid entries={[
          ["Sede", venue?.venue],
          ["Ciudad", venue?.city],
          ["País", venue?.country],
          ["Altitud", venue?.altitude],
          ["Superficie", venue?.surface],
          ["Estado del clima", displayStatus(venue?.weather_status)],
          ["Fuente", venue?.source],
        ]} />
        <ListBlock title="Riesgos condicionales" items={venue?.risk_flags} />
        <ListBlock title="Advertencias" items={venue?.warnings} />
      </Accordion>

      <Accordion id="expert-markets" title="Evaluación por mercado" summary="Cinco familias con metodología preliminar controlada">
        <div className="p2-market-grid">
          {(analysis.marketAssessments || []).map((market) => (
            <MarketAssessment key={market.market_family} market={market} />
          ))}
        </div>
      </Accordion>

      <Accordion id="expert-odds" title="Líneas, cuotas y bookmakers" summary={`${analysis.odds?.quotes?.length || 0} cotizaciones disponibles`}>
        <DefinitionGrid entries={[
          ["Casa activa", analysis.selectedOdds?.bookmaker_name],
          ["Cuota activa", analysis.selectedOdds?.decimal_odds],
          ["Mercado", analysis.selectedOdds?.market_name],
          ["Mejor cuota comparable (referencia)", analysis.bestComparableOdds?.decimal_odds],
          ["Selección", displaySelection(analysis.selectedOdds?.selection)],
          ["Línea", analysis.selectedOdds?.line],
          ["Estado", displayStatus(analysis.selectedOdds?.verification_status)],
          ["Origen", analysis.selectedOdds?.source],
          ["Actualizada", formatDate(analysis.selectedOdds?.updated_at, fixture?.date?.timezone)],
          ["Consultada", formatDate(analysis.selectedOdds?.consulted_at, fixture?.date?.timezone)],
          ["Antigüedad en minutos", analysis.selectedOdds?.age_minutes],
          ["Límite de frescura en minutos", analysis.selectedOdds?.freshness_limit_minutes],
          ["Motivo del vencimiento", analysis.selectedOdds?.stale_reason],
        ]} />
        <details className="p2-source-details"><summary>Ver cuotas normalizadas</summary><pre>{JSON.stringify(analysis.odds?.quotes || [], null, 2)}</pre></details>
        <ListBlock title="Advertencias de normalización" items={analysis.odds?.warnings} />
        <details className="p2-source-details"><summary>Ver objetos descartados y motivo</summary><pre>{JSON.stringify(analysis.odds?.discarded || [], null, 2)}</pre></details>
      </Accordion>

      <Accordion id="expert-context" title="Alineaciones, lesiones y contexto" summary="Cobertura prepartido trazable">
        <DefinitionGrid entries={[
          ["Alineaciones", displayStatus(analysis.preMatchContext?.lineups?.status)],
          ["Lesiones", displayStatus(analysis.preMatchContext?.injuries?.status)],
          ["Sidelined", displayStatus(analysis.preMatchContext?.sidelined?.status)],
          ["Tabla", displayStatus(analysis.preMatchContext?.standings?.status)],
          ["Corte prepartido respetado", analysis.preMatchContext?.pre_match_cutoff_respected],
        ]} />
      </Accordion>

      <Accordion id="expert-gemini" title="Contexto Gemini manual" summary={`${analysis.gemini?.applied_items?.length || 0} elementos aplicados`}>
        <DefinitionGrid entries={[
          ["Procedencia", analysis.gemini?.context?.source],
          ["Verificación", displayStatus(analysis.gemini?.context?.verification_status)],
          ["Válido para reanálisis", analysis.gemini?.context?.valid_for_reanalysis],
          ["URLs", analysis.gemini?.context?.urls?.length],
        ]} />
        <ListBlock title="Contradicciones" items={analysis.director?.contradictions} />
        <details className="p2-source-details"><summary>Ver elementos completos</summary><pre>{JSON.stringify(analysis.gemini?.context?.items || [], null, 2)}</pre></details>
        <details className="p2-source-details"><summary>Ver texto original completo</summary><pre>{analysis.gemini?.context?.original_text || "No disponible"}</pre></details>
      </Accordion>

      <Accordion id="expert-probability" title="Probabilidad estimada preliminar" summary={analysis.preliminaryProbability?.probability_status === "preliminary" ? percentage(analysis.preliminaryProbability.point_estimate) : "No disponible"}>
        <DefinitionGrid entries={[
          ["Estado", displayStatus(analysis.preliminaryProbability?.probability_status)],
          ["Estimación", percentage(analysis.preliminaryProbability?.point_estimate)],
          ["Límite inferior", percentage(analysis.preliminaryProbability?.uncertainty_low)],
          ["Límite superior", percentage(analysis.preliminaryProbability?.uncertainty_high)],
          ["Muestra efectiva ponderada (valor técnico)", formatEffectiveSample(analysis.preliminaryProbability?.sample_size_effective, 3)],
          ["Metodología", analysis.preliminaryProbability?.methodology_version],
          ["Validación", "Modelo preliminar, aún no validado con suficiente historial"],
        ]} />
        <p className="p2-sample-note">Las submuestras pueden solaparse y no equivalen a partidos independientes. El valor original se conserva en la versión técnica.</p>
        <ListBlock title="Limitaciones" items={analysis.preliminaryProbability?.limitations} />
        <details className="p2-source-details"><summary>Ver fórmula, pesos y submuestras</summary><pre>{JSON.stringify({ weights: analysis.preliminaryProbability?.weights, inputs_used: analysis.preliminaryProbability?.inputs_used, shrinkage_strength: analysis.preliminaryProbability?.shrinkage_strength }, null, 2)}</pre></details>
      </Accordion>

      <Accordion id="expert-confidence" title="Fórmula de confianza" summary={`${analysis.confidence?.analysis_confidence_score || 0}% · no es probabilidad`}>
        <p>{analysis.confidence?.formula}</p>
        <p>Este porcentaje mide calidad y coherencia de la evidencia; no es una probabilidad de acierto. La decisión final corresponde al usuario.</p>
        <details className="p2-source-details"><summary>Ver componentes</summary><pre>{JSON.stringify(analysis.confidence?.components || [], null, 2)}</pre></details>
      </Accordion>

      <Accordion id="expert-version-diff" title="Versión temporal y cambios" summary={analysis.analysisVersion?.phase || "Sin versión"}>
        <VersionComparison analysis={analysis} expert />
        {!analysis.changesSincePrevious && !analysis.analysisVersion?.inputs?.reanalysis ? <p>Esta es la primera versión conservada para el partido.</p> : null}
      </Accordion>

      <Accordion id="expert-telemetry" title="Consumo de API y caché" summary={`${telemetry?.requestsUsed || 0} solicitudes utilizadas`}>
        <DefinitionGrid entries={[
          ["Solicitudes utilizadas", telemetry?.requestsUsed],
          ["Aciertos de caché", telemetry?.cacheHits],
          ["Fallos de caché", telemetry?.cacheMisses],
          ["Consultas deduplicadas", telemetry?.deduplicated],
          ["Reintentos transitorios", telemetry?.retries],
          ["Presupuesto configurado", telemetry?.configuredBudget],
          ["Presupuesto restante", telemetry?.configuredBudgetRemaining],
          ["Cuota diaria conocida", telemetry?.providerDailyLimit],
          ["Cuota diaria restante conocida", telemetry?.providerDailyRemaining],
        ]} />
      </Accordion>

      <Accordion id="expert-rules" title="Reglas que limitaron el análisis" summary="Bloqueos, faltantes y prudencia">
        <DefinitionGrid entries={[
          ["Estado de datos", analysis.director?.data_status],
          ["Regla crítica", analysis.director?.data_error_code],
          ["Motor", analysis.director?.engine_version],
          ["Puede recomendar", analysis.director?.can_recommend],
        ]} />
        <ListBlock title="Datos faltantes" items={analysis.director?.missing_data} />
        <ListBlock title="Riesgos" items={analysis.director?.risks} />
      </Accordion>
    </div>
  );
}

function GeminiWorkflow({ analysis, text, setText, context, selectedIds, toggleItem, onValidate, onReanalyze, onNewResearch, status }) {
  if (!analysis?.gemini?.prompt) return null;
  async function copyPrompt() {
    await navigator.clipboard.writeText(analysis.gemini.prompt);
  }
  return (
    <section className="p2-gemini-flow" aria-labelledby="gemini-title">
      <p className="eyebrow">INVESTIGACIÓN COMPLEMENTARIA</p>
      <h3 id="gemini-title">Completar análisis</h3>
      <p>Atlas ya revisó los datos deportivos. Copia esta solicitud, consulta Gemini Pro externamente y pega aquí la respuesta para validar lo que la API puede no conocer.</p>
      <div className="p2-inline-actions">
        <button type="button" className="secondary-button" onClick={onNewResearch}>Nueva investigación complementaria</button>
        <button type="button" className="secondary-button" onClick={copyPrompt}>Copiar solicitud para Gemini</button>
      </div>
      <details className="p2-source-details"><summary>Revisar solicitud completa</summary><pre>{analysis.gemini.prompt}</pre></details>
      <label className="p2-textarea-label">
        <span>Pegar respuesta de Gemini</span>
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows="12" placeholder="Pega aquí la respuesta obtenida manualmente…" />
      </label>
      <div className="p2-inline-actions">
        <button type="button" className="secondary-button" onClick={onValidate} disabled={!text.trim() || status.status === "loading"}>Validar contexto</button>
        <button type="button" className="primary-button p2-primary" title="Reanalizar con contexto validado" onClick={onReanalyze} disabled={!context?.valid_for_reanalysis || status.status === "loading"}>Incorporar evidencia y completar análisis</button>
      </div>
      <StatusNotice value={status} />
      {context ? (
        <div className="p2-context-review">
          <DefinitionGrid entries={[
            ["Fixture válido", context.valid_for_reanalysis],
            ["Procedencia", displayStatus(context.verification_status)],
            ["Fuentes encontradas", context.urls?.length],
            ["Recibido", formatDate(context.received_at)],
            ["Elementos detectados", context.counters?.detected],
            ["Seleccionados", selectedIds.length],
            ["Rechazados", (context.items?.length || 0) - selectedIds.length],
            ["Rumores", context.counters?.rumors],
            ["Limitaciones", context.counters?.limitations],
          ]} />
          <ListBlock title="Alertas de validación" items={[...(context.validation_errors || []), ...(context.warnings || [])]} empty="Sin alertas estructurales." />
          <fieldset>
            <legend>Selecciona qué elementos reportados se usarán</legend>
            {(context.items || []).length ? (context.items || []).map((item) => (
              <label key={item.id} className="p2-gemini-item">
                <input type="checkbox" checked={selectedIds.includes(item.id)} disabled={item.eligible_for_selection === false} onChange={() => toggleItem(item.id)} />
                <span>
                  <strong>{displayStatus(item.kind)}</strong>
                  {item.summary || "Sin resumen disponible."}
                  <small>Fuente: {item.source_name || item.source || "No informada"}</small>
                  <small>Dominio: {item.domain || item.domains?.join(", ") || "No disponible"} · Fecha: {item.publication_date || "No informada"}</small>
                  <small>Clasificación de fuente: {displayStatus(item.source_classification)} · Validación: {displayStatus(item.validation_status || item.verification_status)}</small>
                  <small>Mercados afectados: {item.affected_markets?.length ? item.affected_markets.map(displayStatus).join(", ") : "Ninguno determinado"} · Impacto: {displayStatus(item.impact)}</small>
                  <small>{item.impact_explanation}</small>
                  {item.selection_warning ? <small><strong>{item.selection_warning}</strong></small> : null}
                </span>
              </label>
            )) : <p>El parser no detectó elementos utilizables. Revisa que la respuesta contenga texto y vuelve a validar.</p>}
          </fieldset>
        </div>
      ) : null}
    </section>
  );
}


function BetTrackerView({ timezone }) {
  const [bets, setBets] = useState([]);
  const [summary, setSummary] = useState(null);
  const [betState, setBetState] = useState(
    state("Carga tus apuestas registradas en Atlas.")
  );

  async function loadBets() {
    setBetState(state("Cargando apuestas…", "loading"));

    try {
      const response = await fetch("/api/bets");
      const result = await response.json();

      if (!response.ok) {
        setBetState(
          state(
            result?.message || "No fue posible cargar las apuestas.",
            "provider_error",
            result?.errorCode
          )
        );
        return;
      }

      setBets(result.bets || []);
      setSummary(result.summary || null);
      setBetState(
        state(
          `${result.count || 0} apuesta(s) registrada(s).`,
          "success"
        )
      );
    } catch {
      setBetState(
        state(
          "No fue posible conectar con el registro de apuestas.",
          "provider_error"
        )
      );
    }
  }

  useEffect(() => {
  const initBets = async () => {
    await loadBets();
  };

  initBets();
}, []);

  return (
    <section className="p2-mode" aria-labelledby="bets-title">
      <div className="p2-mode-heading">
        <p className="eyebrow">Registro personal append-only</p>
        <h2 id="bets-title">Mis apuestas</h2>
        <p>
          Consulta las apuestas que realmente registraste después de una decisión APOSTAR de Atlas.
        </p>
      </div>

      <div className="p2-inline-actions">
        <button
          type="button"
          className="primary-button p2-primary"
          onClick={loadBets}
          disabled={betState.status === "loading"}
        >
          {betState.status === "loading" ? "Actualizando…" : "Actualizar apuestas"}
        </button>

        <a className="secondary-button p2-download" href="/api/bets?format=json">
          Exportar JSON
        </a>
      </div>

      <StatusNotice value={betState} />

      {summary ? (
        <section className="p2-history-compare" aria-labelledby="bets-summary-title">
          <h3 id="bets-summary-title">Resumen personal</h3>
          <DefinitionGrid
            entries={[
              ["Apuestas", summary.bet_count],
              ["Pendientes", summary.pending_count],
              ["Ganadas", summary.won_count],
              ["Perdidas", summary.lost_count],
              ["Nulas", summary.void_count],
              ["Total apostado", `${formatValue(summary.total_staked)} COP`],
              ["Retorno total", `${formatValue(summary.total_payout)} COP`],
              ["Ganancia / pérdida", `${formatValue(summary.net_profit_loss)} COP`],
              ["ROI", summary.roi === null ? null : percentage(summary.roi)],
            ]}
          />
        </section>
      ) : null}

      <div className="p2-history-list">
        {bets.map((bet) => (
          <article key={bet.bet_id} className="p2-history-entry">
            <div>
              <strong>
                {bet.home_team || "Local"} vs {bet.away_team || "Visitante"}
              </strong>
              <p>
                {displaySelection(bet.selection)}
                {bet.line !== null && bet.line !== undefined ? ` · línea ${bet.line}` : ""}
              </p>
              <small>
                {bet.bookmaker} @{bet.decimal_odds} · {formatValue(bet.stake_amount)} {bet.currency}
              </small>
              <small>
                {formatDate(bet.kickoff_utc, timezone)} · Estado: {displayStatus(bet.status)}
              </small>
              <small>
                Atlas: {bet.atlas_price_decision || "No disponible"}
              </small>
              {bet.status !== "pending" ? (
                <small>
                  Retorno: {formatValue(bet.payout)} {bet.currency} · Ganancia/pérdida: {formatValue(bet.profit_loss)} {bet.currency}
                </small>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {betState.status === "success" && !bets.length ? (
        <p>No tienes apuestas registradas todavía.</p>
      ) : null}
    </section>
  );
}

function HistoryView({ timezone }) {
  const [filters, setFilters] = useState({ date: "", competition: "", team: "", fixtureId: "", status: "", market: "", phase: "" });
  const [history, setHistory] = useState([]);
  const [historyState, setHistoryState] = useState(state("Carga el historial operativo almacenado en el servidor."));
  const [selected, setSelected] = useState([]);
  const [parlayAssessment, setParlayAssessment] = useState(null);
  const [calibration, setCalibration] = useState(null);
  const [resultTotals, setResultTotals] = useState({});

  async function loadHistory() {
    setHistoryState(state("Cargando versiones inmutables…", "loading"));
    const params = new URLSearchParams([...Object.entries(filters).filter(([, value]) => value), ["timezone", timezone]]);
    try {
      const response = await fetch(`/api/operational-history?${params}`);
      const result = await response.json();
      setHistory(result.analyses || []);
      setCalibration(result.calibration || null);
      setHistoryState(state(`${result.count || 0} versión(es) encontrada(s).`, "success"));
      setSelected([]);
    } catch {
      setHistoryState(state("No fue posible cargar el historial.", "provider_error"));
    }
  }

  function toggleVersion(id) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 2 ? [...current, id] : [current[1], id]);
  }

  async function deleteSelectedVersion() {
    if (selected.length !== 1) return;
    const confirmed = window.confirm("¿Eliminar esta versión de la vista? El registro append-only conservará una marca auditable de la eliminación.");
    if (!confirmed) return;
    const response = await fetch("/api/operational-history", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ analysisId: selected[0], confirmation: "DELETE" }) });
    if (response.ok) await loadHistory();
  }

  async function deleteAllLocalHistory() {
    const countResponse = await fetch("/api/operational-history");
    const countResult = await countResponse.json();
    const affected = Number(countResult.count) || 0;
    if (!affected) {
      setHistoryState(state("No hay elementos activos para borrar."));
      return;
    }
    if (!window.confirm(`Esta acción ocultará ${affected} elemento(s) del historial local. No elimina configuración, secretos, catálogo ni código. ¿Continuar?`)) return;
    const confirmation = window.prompt("Segunda confirmación: escribe BORRAR HISTORIAL para continuar.");
    if (confirmation !== "BORRAR HISTORIAL") {
      setHistoryState(state("Borrado total cancelado: la frase de confirmación no coincide."));
      return;
    }
    const response = await fetch("/api/operational-history", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "all", confirmation }),
    });
    const result = await response.json();
    if (!response.ok) {
      setHistoryState(state(result.message || "No fue posible archivar el historial.", "blocked", result.errorCode));
      return;
    }
    setHistory([]);
    setSelected([]);
    setCalibration(null);
    setHistoryState(state(`${result.affectedCount || affected} elemento(s) archivado(s). La configuración permanece intacta.`, "success"));
  }

  function evaluateParlays() {
    const candidates = history.map((item) => item.parlay_candidate).filter(Boolean);
    setParlayAssessment(buildConservativeParlays(candidates));
  }

  async function recordResult(analysisId, source) {
    setHistoryState(state("Registrando el resultado de forma auditable…", "loading"));
    const response = await fetch("/api/operational-history", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ analysisId, source, actualTotal: resultTotals[analysisId] }),
    });
    const result = await response.json();
    if (!response.ok) {
      setHistoryState(state(result.message || "El resultado todavía no está disponible.", "unavailable", result.errorCode));
      return;
    }
    setCalibration(result.calibration || null);
    await loadHistory();
  }

  const compared = selected.map((id) => history.find((item) => item.analysis_id === id)).filter(Boolean);
  return (
    <section className="p2-mode" aria-labelledby="history-title">
      <div className="p2-mode-heading"><p className="eyebrow">Persistencia local de servidor</p><h2 id="history-title">Historial</h2><p>Busca expedientes y compara dos versiones del mismo partido. Los análisis finalizados se registran en un log append-only.</p></div>
      <div className="p2-history-filters">
        <label><span>Fecha</span><input type="date" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} /></label>
        <label><span>Competición</span><input value={filters.competition} onChange={(event) => setFilters({ ...filters, competition: event.target.value })} /></label>
        <label><span>Equipo</span><input value={filters.team} onChange={(event) => setFilters({ ...filters, team: event.target.value })} /></label>
        <label><span>ID del partido</span><input inputMode="numeric" value={filters.fixtureId} onChange={(event) => setFilters({ ...filters, fixtureId: event.target.value })} /></label>
        <label><span>Estado</span><input value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} /></label>
        <label><span>Mercado</span><input value={filters.market} onChange={(event) => setFilters({ ...filters, market: event.target.value })} /></label>
        <label><span>Fase</span><input value={filters.phase} onChange={(event) => setFilters({ ...filters, phase: event.target.value })} /></label>
      </div>
      <div className="p2-inline-actions">
        <button type="button" className="primary-button p2-primary" onClick={loadHistory}>Buscar historial</button>
        <a className="secondary-button p2-download" href="/api/operational-history?format=json">Exportar JSON</a>
        <button type="button" className="secondary-button" onClick={deleteSelectedVersion} disabled={selected.length !== 1}>Eliminar versión seleccionada</button>
        <button type="button" className="secondary-button p2-danger-button" onClick={deleteAllLocalHistory}>Borrar todo el historial local{history.length ? ` (${history.length} visibles)` : ""}</button>
        <button type="button" className="secondary-button" onClick={evaluateParlays} disabled={!history.length}>Evaluar parlays conservadores</button>
      </div>
      <StatusNotice value={historyState} />
      <div className="p2-history-list">
        {history.map((item) => (
          <article key={item.analysis_id} className="p2-history-entry">
            <label>
              <input type="checkbox" checked={selected.includes(item.analysis_id)} onChange={() => toggleVersion(item.analysis_id)} />
              <span><strong>{item.director?.fixture?.home_team} vs {item.director?.fixture?.away_team}</strong><small>{formatDate(item.director?.fixture?.kickoff_utc || item.director?.fixture?.kickoff, item.director?.fixture?.timezone || timezone)} · {displayStatus(item.phase)} · {displayStatus(item.director?.market_suitability)}</small><small>Versión {item.analysis_id}</small><small>Resultado: {displayStatus(item.prediction_result?.outcome || "unresolved")}</small></span>
            </label>
            <div className="p2-inline-actions p2-result-entry">
              <label><span>Total real</span><input inputMode="decimal" value={resultTotals[item.analysis_id] || ""} onChange={(event) => setResultTotals({ ...resultTotals, [item.analysis_id]: event.target.value })} placeholder="Ej. 11" /></label>
              <button type="button" className="secondary-button" onClick={() => recordResult(item.analysis_id, "manual_user_input")} disabled={!resultTotals[item.analysis_id]}>Guardar resultado</button>
              <button type="button" className="secondary-button" onClick={() => recordResult(item.analysis_id, "api_football")}>Actualizar con API-FOOTBALL</button>
            </div>
          </article>
        ))}
      </div>
      {compared.length === 2 ? (
        <section className="p2-history-compare"><h3>Comparación seleccionada</h3><DefinitionGrid entries={[
          ["Mismo partido", compared[0].fixture_id === compared[1].fixture_id],
          ["Confianza anterior", `${compared[0].analysis_confidence?.analysis_confidence_score || 0}%`],
          ["Confianza posterior", `${compared[1].analysis_confidence?.analysis_confidence_score || 0}%`],
          ["Cuota anterior", compared[0].director?.odds],
          ["Cuota posterior", compared[1].director?.odds],
          ["Aptitud anterior", displayStatus(compared[0].director?.market_suitability)],
          ["Aptitud posterior", displayStatus(compared[1].director?.market_suitability)],
        ]} /></section>
      ) : null}
      {parlayAssessment ? (
        <section className="p2-history-compare"><h3>Política de parlays</h3><DefinitionGrid entries={[["Estado", displayStatus(parlayAssessment.status)], ["Combinaciones", parlayAssessment.parlays?.length], ["La cuota combinada es probabilidad real", parlayAssessment.combined_odds_is_probability]]} /><ListBlock title="Razones" items={parlayAssessment.reasons} />{(parlayAssessment.parlays || []).map((parlay) => <article key={parlay.type}><h4>{displayStatus(parlay.type)}</h4><p>Cuota decimal combinada: {parlay.combined_decimal_odds}. No representa probabilidad real.</p></article>)}</section>
      ) : null}
      {calibration ? (
        <section className="p2-history-compare"><h3>Calibración preliminar</h3><DefinitionGrid entries={[["Predicciones resueltas", calibration.resolved_count], ["Tasa de acierto", calibration.hit_rate === null ? null : percentage(calibration.hit_rate)], ["Brier score", calibration.brier_score], ["Estado", displayStatus(calibration.calibration_status)], ["Umbral para revisión", calibration.minimum_resolved_for_calibration], ["Recalibración automática", calibration.automatic_weight_recalibration]]} /><p>Modelo preliminar, aún no validado con suficiente historial.</p><details className="p2-source-details"><summary>Ver bandas y grupos</summary><pre>{JSON.stringify({ bands: calibration.bands, by_market_family: calibration.by_market_family, by_competition: calibration.by_competition, by_phase: calibration.by_phase }, null, 2)}</pre></details></section>
      ) : null}
    </section>
  );
}

function InitialAnalysisResult({ analysis }) {
  const director = analysis?.director;
  const fixture = director?.fixture || {};
  return (
    <section className="p2-initial-analysis" data-analysis-stage="initial" aria-labelledby="initial-analysis-title">
      <p className="eyebrow">ANÁLISIS INICIAL</p>
      <h2 id="initial-analysis-title">Completar análisis</h2>
      <p>Ya revisé los datos deportivos. Ahora necesito complementar lo que la API puede no conocer.</p>
      <div className="p2-initial-selection">
        <strong>{fixture.home_team} vs {fixture.away_team}</strong>
        <span>{displaySelection(director?.selection || director?.market_evaluated?.label)}</span>
      </div>
      <p>Genera la solicitud para Gemini, pega su respuesta y deja que Atlas filtre la evidencia antes de tomar posición.</p>
    </section>
  );
}

function AnalysisResult({ analysis, analysisCompleted, candidateQuotes, onQuoteChange, onEvaluatePrices, showComparison }) {
  const [mode, setMode] = useState("simple");
  const directorHeadingRef = useRef(null);
  useEffect(() => {
    const heading = directorHeadingRef.current;
    if (!heading) return;
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [analysis.analysisVersion?.analysis_id]);
  return (
    <section className="p2-result" aria-labelledby="result-title">
      <div className="p2-result-heading">
        <div>
          <p className="eyebrow">Resultado</p>
          <h2 id="result-title">Lectura del partido</h2>
        </div>
        <div className="p2-view-tabs" role="tablist" aria-label="Nivel de detalle">
          <button type="button" role="tab" aria-selected={mode === "simple"} onClick={() => setMode("simple")}>Modo sencillo</button>
          <button type="button" role="tab" aria-selected={mode === "expert"} onClick={() => setMode("expert")}>Ver análisis completo</button>
        </div>
      </div>
      <ComparisonVisibilityContext.Provider value={showComparison}>
      {mode === "simple" ? (
        <div data-result-mode="simple">
          {analysisCompleted ? (
            <>
              <CompetitiveContextResult context={analysis.competitiveContext} />
              <GeminiContextSummary analysis={analysis} onShowExpert={() => setMode("expert")} />
              <DirectorResult analysis={analysis} headingRef={directorHeadingRef} onShowExpert={() => setMode("expert")} />
            </>
          ) : <InitialAnalysisResult analysis={analysis} />}
        </div>
      ) : (
        <div data-result-mode="expert">
          <ExpertResult analysis={analysis}/>
          <ScoutResult analysis={analysis} candidateQuotes={candidateQuotes} onQuoteChange={onQuoteChange} onEvaluatePrices={onEvaluatePrices} />
          <RedTeamResult redTeam={analysis.redTeam} />
          <OperationalRankingResult ranking={analysis.operationalRanking} />
          <PreflightResult preflight={analysis.preflight} />
          <VersionComparison analysis={analysis} />
          <button type="button" className="secondary-button" onClick={onEvaluatePrices}>Repetir análisis</button>
        </div>
      )}
      </ComparisonVisibilityContext.Provider>
    </section>
  );
}

function JourneyCandidateCard({ candidate, primary = false, onOpen, timezone }) {
  const reason = candidate.reasons?.[0] || candidate.whyMarketWon?.replaceAll("sports_score", "análisis deportivo") || "Atlas encontró señales deportivas relevantes para revisar esta opción.";
  return (
    <article className="p2-candidate-card p2-simple-candidate-card">
      <p className="eyebrow">{candidate.competition}</p>
      <p className="p2-simple-preselection">Opciones encontradas por Atlas</p>
      {primary ? <span className="p2-chip p2-chip-candidate">Mejor opción inicial</span> : null}
      <h3>{candidate.fixture}</h3>
      <p className="p2-simple-selection"><strong>{displaySelection(candidate.selection)}</strong><span>{displayMarket(candidate.marketId || candidate.market)} · línea {candidate.line}</span></p>
      <p>{reason}</p>
      <small>{formatDate(candidate.kickoff, candidate.timezone || timezone)}</small>
      <button type="button" className="primary-button" onClick={() => onOpen(candidate)}>Analizar esta opción</button>
    </article>
  );
}
function JourneyMatchesReviewed({ journey }) {
  const diagnostics = journey.analysisDiagnostics || [];

  if (!diagnostics.length) return null;

  return (
    <section className="p2-source-details">
      <h3>Partidos revisados en esta jornada</h3>
      <p>
        Atlas revisó estos partidos y evaluó los mercados disponibles antes
        de seleccionar candidatos.
      </p>

      <div className="p2-candidate-grid">
        {diagnostics.map((item) => (
          <article
            key={`${item.fixtureId}-${item.competition}`}
            className="p2-candidate-card"
          >
            <p className="eyebrow">{item.competition}</p>

            <h4>{item.fixture}</h4>

            <DefinitionGrid entries={[
              ["Estado", "Evaluado"],
              ["Mercados revisados", item.marketAssessmentCount],
              ["Opciones encontradas", item.rankedCandidateCount],
            ]} />

            <details>
              <summary>Ver mercados evaluados</summary>

              <ul>
                {item.marketStatuses?.map((market) => (
                  <li key={market.marketFamily}>
                    {market.marketFamily} — {market.status}
                    {market.candidate ? " ✅" : ""}
                  </li>
                ))}
              </ul>
            </details>

          </article>
        ))}
      </div>
    </section>
  );
}
function JourneyTechnicalDetails({ journey, quoteLedgers, operationalRanking, quoteCoverage, technicalLabel }) {
  return (
    <details className="p2-source-details p2-journey-technical">
      <summary>Ver análisis completo de Scout</summary>
      <p>Esta sección conserva probabilidades, intervalos, {technicalLabel.toLowerCase()}, rankings, cuotas e identidades para auditoría.</p>
      <DefinitionGrid entries={[
        ["Competiciones consultadas", journey.competitionsQueried?.join(", ")],
        ["Partidos encontrados", journey.fixturesFound],
        ["Partidos revisados", journey.fixturesReviewed],
        ["Partidos descartados", journey.fixturesDiscarded],
        ["Candidatos destacados", journey.candidates?.length],
        ["Cobertura de precio", displayStatus(quoteCoverage.status)],
        ["Cuotas vigentes", quoteCoverage.current],
        ["Cuotas vencidas", quoteCoverage.stale],
      ]} />
      <div className="p2-candidate-grid">
        {(journey.candidates || []).map((candidate) => {
          const operation = findFixtureQuoteEntry(quoteLedgers[String(candidate.fixtureId)], candidate);
          return <article key={`${candidate.fixtureId}-${candidate.marketId}`} className="p2-candidate-card">
            <h4>{candidate.fixture} · {displaySelection(candidate.selection)}</h4>
            <DefinitionGrid entries={[
              ["Probabilidad preliminar", percentage(candidate.probability)],
              ["Intervalo", `${percentage(candidate.uncertaintyLow)}–${percentage(candidate.uncertaintyHigh)}`],
              ["Respaldo deportivo", `${candidate.technicalSupport}/100`],
              ["Posición general Scout", candidate.generalRank ? `#${candidate.generalRank}` : null],
              ["Posición dentro de la familia", candidate.familyRank ? `#${candidate.familyRank}` : null],
              ["Estado de cuota", operation?.quote_state === "current" ? `${operation.active_quote.bookmaker_name} @${operation.active_quote.decimal_odds}` : operation?.quote_state === "stale" ? "Cuota vencida — actualizar precio" : "Pendiente de precio"],
            ]} />
            <section className="p2-market-comparison" aria-label="Por qué Atlas destacó esta opción"><h4>Por qué Atlas destacó esta opción</h4><p>{candidate.whyMarketWon?.replaceAll("sports_score", "respaldo deportivo")}</p><details><summary>Ver comparación de mercados</summary><pre>{JSON.stringify(candidate.familyComparison || [], null, 2)}</pre></details></section>
            <ListBlock title="Razones" items={candidate.reasons} />
            <ListBlock title="Riesgos" items={candidate.risks} />
            <ListBlock title="Datos faltantes" items={candidate.missingData} />
          </article>;
        })}
      </div>
      {operationalRanking.length ? <section className="p2-stage-card"><h3>Clasificación operativa</h3><ol className="p2-operational-ranking">{operationalRanking.map(({ candidate, operation, operational_rank: rank }) => <li key={operation.selection_key}><strong>#{rank} · {displaySelection(candidate.selection)}</strong><p>{operation.active_quote.bookmaker_name} @{operation.active_quote.decimal_odds} · {operation.operational_decision}</p></li>)}</ol></section> : null}
      <details className="p2-source-details"><summary>Ver contrato técnico completo</summary><pre>{JSON.stringify({ journey, quote_ledgers: quoteLedgers }, null, 2)}</pre></details>
    </details>
  );
}

export default function AtlasFunctionalClient({ competitionGroups, markets, defaultTimezone = "America/Bogota", ownerId = "personal" }) {
  const competitions = useMemo(
    () => competitionGroups.flatMap((group) => group.competitions),
    [competitionGroups]
  );
  const initialCompetition = competitions[0] || null;
  const [mainMode, setMainMode] = useState("home");
  const [loggingOut, setLoggingOut] = useState(false);
  const [date, setDate] = useState("");
  const [journeyCompetitionKeys, setJourneyCompetitionKeys] = useState(
    initialCompetition ? [initialCompetition.key] : []
  );
  const [journeyMarketIds, setJourneyMarketIds] = useState(markets.map((market) => market.id));
  const [journeyAnalysisMode, setJourneyAnalysisMode] = useState("general");
  const [maximumFixtures, setMaximumFixtures] = useState(50);
  const [journeyState, setJourneyState] = useState(state("Configura la jornada y pulsa “Escanear jornada”."));
  const [journey, setJourney] = useState(null);
  const journeyRequest = useRef(null);

  const [competitionKey, setCompetitionKey] = useState(initialCompetition?.key || "");
  const [season, setSeason] = useState(String(initialCompetition?.currentSeason || ""));
  const [fixturesState, setFixturesState] = useState(state("Elige fecha y competición para cargar partidos."));
  const [fixtures, setFixtures] = useState([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState("");
  const [marketId, setMarketId] = useState("open");
  const [analysisMode, setAnalysisMode] = useState("general");
  const [transferredCandidate, setTransferredCandidate] = useState(null);
  const [line, setLine] = useState("");
  const [odds, setOdds] = useState("");
  const [bookmaker, setBookmaker] = useState("");
  const [selection, setSelection] = useState("");
  const [oddsConsultedAt, setOddsConsultedAt] = useState("");
  const intendedUse = "individual";
  const [analysisState, setAnalysisState] = useState(state("Selecciona un partido; Atlas nunca ejecuta el análisis automáticamente."));
  const [analysis, setAnalysis] = useState(null);
  const [geminiText, setGeminiText] = useState("");
  const [geminiContext, setGeminiContext] = useState(null);
  const [selectedGeminiIds, setSelectedGeminiIds] = useState([]);
  const [geminiState, setGeminiState] = useState(state("Completa la investigación manual para que Atlas pueda tomar posición."));
  const [showActiveComparison, setShowActiveComparison] = useState(false);
  const [candidateQuotes, setCandidateQuotes] = useState({});
  const [fixtureQuoteLedgers, setFixtureQuoteLedgers] = useState({});
  const [selectedQuoteEntry, setSelectedQuoteEntry] = useState(null);
  const fixturesRequest = useRef(null);
  const analysisRequest = useRef(null);

  const selectedFixture = fixtures.find(
    (fixture) => String(fixture.fixtureId) === selectedFixtureId
  ) || null;
  const resolvedOptionLine = line.trim() || analysis?.director?.line || transferredCandidate?.line || "";
  const resolvedOptionDirection = selection.trim() || analysis?.director?.sports_verdict?.direction || transferredCandidate?.direction || "";
  const hasPriceInput = Boolean(bookmaker.trim() || odds.trim() || oddsConsultedAt);
  const manualQuoteReady = Boolean(
    bookmaker.trim() &&
    resolvedOptionLine &&
    odds.trim() &&
    Number(odds.replace(",", ".")) > 1 &&
    oddsConsultedAt &&
    resolvedOptionDirection
  );
  const specificOptionReady = analysisMode !== "specific" || Boolean(marketId && marketId !== "open" && resolvedOptionLine && resolvedOptionDirection);
  const incompletePriceInput = hasPriceInput && !manualQuoteReady;
  const manualQuoteWarning = manualOddsCopyWarning({ line: resolvedOptionLine, decimalOdds: odds });
  const analysisCompleted = Boolean(analysis?.gemini?.context && analysis?.analysisVersion?.inputs?.reanalysis);
  const analysisForDisplay = analysis && selectedQuoteEntry?.quote_state === "stale" && !analysis.selectedOdds && !analysis.historicalQuote
    ? { ...analysis, historicalQuote: selectedQuoteEntry.latest_known_quote }
    : analysis;
  const staleAnalysisQuote = Boolean(analysisForDisplay?.historicalQuote && !analysisForDisplay?.selectedOdds);
  const journeyOperationalRanking = useMemo(
    () => buildJourneyOperationalRanking(journey?.candidates || [], fixtureQuoteLedgers),
    [journey, fixtureQuoteLedgers]
  );
  const journeyQuoteCoverage = useMemo(
    () => summarizeJourneyQuoteCoverage(journey?.candidates || [], fixtureQuoteLedgers),
    [journey, fixtureQuoteLedgers]
  );
  function clearTemporaryQuote() {
    setLine("");
    setOdds("");
    setBookmaker("");
    setSelection("");
    setOddsConsultedAt("");
  }

  async function refreshFixtureQuoteLedger(fixtureId) {
    if (!Number.isInteger(Number(fixtureId)) || Number(fixtureId) <= 0) return null;
    try {
      const params = new URLSearchParams({ view: "fixture_quotes", fixtureId: String(fixtureId) });
      const response = await fetch(`/api/operational-history?${params}`);
      const result = await response.json();
      if (!response.ok || !result.ledger) return null;
      setFixtureQuoteLedgers((current) => ({ ...current, [String(fixtureId)]: result.ledger }));
      return result.ledger;
    } catch {
      return null;
    }
  }

  async function refreshJourneyQuoteLedgers(candidates = []) {
    const fixtureIds = [...new Set(candidates.map((candidate) => Number(candidate.fixtureId)).filter(Number.isInteger))];
    await Promise.all(fixtureIds.map(refreshFixtureQuoteLedger));
  }

  function invalidateJourney(message = "Los filtros cambiaron. Vuelve a escanear la jornada.") {
    journeyRequest.current?.abort();
    setJourney(null);
    setJourneyState(state(message));
  }

  function invalidateAnalysis(message = "Los filtros cambiaron. Vuelve a ejecutar el análisis.", clearFixture = false) {
    analysisRequest.current?.abort();
    setAnalysis(null);
    setAnalysisState(state(message));
    setGeminiText("");
    setGeminiContext(null);
    setSelectedGeminiIds([]);
    setGeminiState(state("Completa la investigación manual para que Atlas pueda tomar posición."));
    setShowActiveComparison(false);
    setCandidateQuotes({});
    setSelectedQuoteEntry(null);
    if (clearFixture) setSelectedFixtureId("");
  }

  function startNewSearch() {
    const hasUnsavedData = Boolean(geminiText.trim() && !geminiContext) || Boolean(
      odds.trim() && Number(odds) !== Number(analysis?.selectedOdds?.decimal_odds)
    );
    if (hasUnsavedData && !window.confirm("Hay datos temporales sin incorporar. ¿Iniciar una nueva búsqueda?")) return;
    fixturesRequest.current?.abort();
    journeyRequest.current?.abort();
    analysisRequest.current?.abort();
    setMainMode("journey");
    setDate("");
    setJourney(null);
    setJourneyState(state("Configura la jornada y pulsa “Escanear jornada”."));
    setFixtures([]);
    setSelectedFixtureId("");
    setFixturesState(state("Elige fecha y competición para cargar partidos."));
    setAnalysis(null);
    setAnalysisState(state("Selecciona un partido; Atlas nunca ejecuta el análisis automáticamente."));
    setAnalysisMode("general");
    setTransferredCandidate(null);
    setJourneyAnalysisMode("general");
    setMarketId("open");
    clearTemporaryQuote();
    setGeminiText("");
    setGeminiContext(null);
    setSelectedGeminiIds([]);
    setGeminiState(state("Completa la investigación manual para que Atlas pueda tomar posición."));
    setShowActiveComparison(false);
    setCandidateQuotes({});
    setFixtureQuoteLedgers({});
    setSelectedQuoteEntry(null);
  }

  async function logout() {
    setLoggingOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("logout_failed");
      window.location.assign("/login");
    } catch {
      window.alert("No fue posible cerrar la sesión. Inténtalo de nuevo.");
      setLoggingOut(false);
    }
  }

  function changeDate(value) {
    fixturesRequest.current?.abort();
    setDate(value);
    const competition = competitions.find((item) => item.key === competitionKey);
    setSeason(String(seasonFor(competition, value)));
    setFixtures([]);
    setFixturesState(state("Carga los partidos para la nueva fecha."));
    setTransferredCandidate(null);
    clearTemporaryQuote();
    invalidateJourney();
    invalidateAnalysis(undefined, true);
  }

  function toggleJourneyCompetition(key) {
    setJourneyCompetitionKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
    invalidateJourney();
  }

  function toggleJourneyMarket(id) {
    setJourneyMarketIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
    invalidateJourney();
  }

  async function scanJourney() {
    journeyRequest.current?.abort();
    setJourney(null);
    if (!date || journeyCompetitionKeys.length === 0 || journeyMarketIds.length === 0) {
      setJourneyState(state("Fecha, al menos una competición y un mercado son obligatorios."));
      return;
    }
    const controller = new AbortController();
    journeyRequest.current = controller;
    setJourneyState(state("Atlas está revisando únicamente las competiciones seleccionadas…", "loading"));
    try {
      const response = await fetch("/api/football/journey-scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          date,
          timezone: defaultTimezone,
          competitionKeys: journeyCompetitionKeys,
          marketIds: journeyMarketIds,
          maximumFixtures,
          maximumCandidates: maximumFixtures,
          analysisMode: journeyAnalysisMode,
        }),
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      setJourney(result);
      setJourneyState({ ...state(result?.message || "No fue posible interpretar el resultado.", safeStatus(result?.status), result?.errorCode), tone: result?.displayTone });
      if (safeStatus(result?.status) === "success") await refreshJourneyQuoteLedgers(result.candidates || []);
    } catch (error) {
      if (error?.name === "AbortError") return;
      setJourneyState(state("No fue posible completar el escaneo.", "provider_error", "client_journey_failed"));
    }
  }

  function changeCompetition(value) {
    fixturesRequest.current?.abort();
    const competition = competitions.find((item) => item.key === value);
    setCompetitionKey(value);
    setSeason(String(seasonFor(competition, date)));
    setFixtures([]);
    setFixturesState(state("Carga los partidos de la nueva competición."));
    setTransferredCandidate(null);
    clearTemporaryQuote();
    invalidateAnalysis(undefined, true);
  }

  async function loadFixtures() {
    fixturesRequest.current?.abort();
    setFixtures([]);
    setTransferredCandidate(null);
    clearTemporaryQuote();
    invalidateAnalysis("Selecciona un partido después de cargar la lista.", true);
    if (!date || !competitionKey || !season) {
      setFixturesState(state("Fecha, competición y temporada son obligatorias."));
      return;
    }
    const controller = new AbortController();
    fixturesRequest.current = controller;
    setFixturesState(state("Cargando partidos exactos del proveedor…", "loading"));
    try {
      const params = new URLSearchParams({ date, leagueKey: competitionKey, season, timezone: defaultTimezone });
      const response = await fetch(`/api/football/fixtures?${params}`, { signal: controller.signal });
      const result = await response.json();
      if (controller.signal.aborted) return;
      const status = safeStatus(result?.status);
      setFixtures(status === "success" ? result.fixtures || [] : []);
      setFixturesState(state(result?.message || "No fue posible interpretar la lista.", status, result?.errorCode));
    } catch (error) {
      if (error?.name === "AbortError") return;
      setFixturesState(state("No fue posible cargar los partidos.", "provider_error", "client_fixture_failed"));
    }
  }

  function chooseFixture(fixtureId) {
    setTransferredCandidate(null);
    clearTemporaryQuote();
    setSelectedFixtureId(String(fixtureId));
    invalidateAnalysis(`Partido seleccionado. Pulsa “Analizar partido” para continuar.`);
  }

  async function runOperationalAnalysis({ reanalysis = false } = {}) {
    analysisRequest.current?.abort();
    const currentAnalysis = analysis;
    setAnalysis(null);
    if (!selectedFixture || !selectedFixtureId) {
      setAnalysisState(state("Selecciona un partido válido de la lista."));
      return;
    }
    const requestedFixtureId = Number(selectedFixtureId);
    const requestedLine = line.trim() || transferredCandidate?.line || (reanalysis ? currentAnalysis?.director?.line : null);
    const reportedDirection = selection.trim() || currentAnalysis?.director?.sports_verdict?.direction || transferredCandidate?.direction || "";
    const reportedSelection = reportedDirection && requestedLine
      ? `${reportedDirection === "under" ? "Menos de" : "Más de"} ${requestedLine}`
      : reportedDirection;
    const manualMarketFamily = transferredCandidate?.market_family || (analysisMode === "specific" ? marketId : currentAnalysis?.director?.market_evaluated?.family);
    const currentLine = currentAnalysis?.director?.line;
    const currentDirection = currentAnalysis?.director?.sports_verdict?.direction;
    const sameCurrentOption = Number(requestedLine) === Number(currentLine) && reportedDirection === currentDirection;
    const lineOrigin = reanalysis && sameCurrentOption && currentAnalysis?.analysisVersion?.line_origin
      ? currentAnalysis.analysisVersion.line_origin
      : transferredCandidate?.line_origin || (analysisMode === "specific" && requestedLine ? "user_selected" : "atlas_selected");
    const consultedAt = oddsConsultedAt ? localDateTimeToUtcIso(oddsConsultedAt, defaultTimezone) : null;
    const manualCandidateOdds = (reanalysis ? Object.values(candidateQuotes) : []).filter((item) =>
      item.bookmaker?.trim() && Number(String(item.decimalOdds || "").replace(",", ".")) > 1 && item.consultedAt
    ).map((item) => ({
      ...item,
      consultedAt: localDateTimeToUtcIso(item.consultedAt, defaultTimezone),
      timezone: defaultTimezone,
      analysisVersion: currentAnalysis?.analysisVersion?.analysis_id || "initial",
    }));
    const controller = new AbortController();
    analysisRequest.current = controller;
    setAnalysisState(state("Construyendo perfiles y evaluando mercados…", "loading"));
    try {
      const response = await fetch("/api/football/operational-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          date,
          timezone: defaultTimezone,
          competitionKey,
          season,
          fixtureId: requestedFixtureId,
          marketId,
          analysisMode,
          line: requestedLine || null,
          lineOrigin,
          odds: reanalysis ? odds.trim() || null : null,
          selection: reportedSelection || null,
          manualOdds: reanalysis && manualQuoteReady ? {
            bookmaker: bookmaker.trim(),
            marketFamily: manualMarketFamily,
            direction: reportedDirection,
            selection: reportedSelection,
            line: requestedLine,
            decimalOdds: odds.trim(),
            consultedAt,
            timezone: defaultTimezone,
            analysisVersion: currentAnalysis?.analysisVersion?.analysis_id || "initial",
          } : null,
          manualCandidateOdds,
          transferredCandidate,
          intendedUse,
          evaluatePrice: Boolean(reanalysis && manualQuoteReady),
          geminiContext: reanalysis ? geminiContext : null,
          selectedGeminiItemIds: reanalysis ? selectedGeminiIds : [],
          reanalysis,
        }),
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (Number(result?.selectedFixtureId) !== requestedFixtureId) {
        setAnalysisState(state("Atlas rechazó una respuesta que no conservó el partido seleccionado.", "blocked", "fixture_id_changed"));
        return;
      }
      if (transferredCandidate && result?.marketSelection?.primary?.market_family !== transferredCandidate.market_family) {
        setAnalysisState(state("Atlas rechazó un resultado que cambió la familia del candidato transferido.", "blocked", "transferred_candidate_changed"));
        return;
      }
      setAnalysis(result);
      await refreshFixtureQuoteLedger(requestedFixtureId);
      setShowActiveComparison(Boolean(reanalysis && result?.changesSincePrevious?.comparable));
      setAnalysisState(state(result?.message || "El análisis no está disponible.", safeStatus(result?.status), result?.errorCode));
    } catch (error) {
      if (error?.name === "AbortError") return;
      setAnalysisState(state("No fue posible completar el análisis.", "provider_error", "client_analysis_failed"));
    }
  }

  async function analyzeSelectedFixture() {
    await runOperationalAnalysis({ reanalysis: false });
  }

  async function reanalyzeWithManualOdds() {
    if (!manualQuoteReady) return;
    await runOperationalAnalysis({ reanalysis: true });
  }

  async function validateGeminiContext() {
    if (!analysis?.fixture || !geminiText.trim()) return;
    setGeminiState(state("Validando identidad, fuentes y contradicciones…", "loading"));
    try {
      const response = await fetch("/api/football/validate-context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fixture: analysis.fixture,
          text: geminiText,
          expectedLine: analysis.director?.line,
          expectedOdds: analysis.director?.odds,
        }),
      });
      const result = await response.json();
      setGeminiContext(result.context || null);
      setSelectedGeminiIds((result.context?.items || []).filter((item) => item.selected).map((item) => item.id));
      setGeminiState(state(result.message || "Contexto procesado.", safeStatus(result.status), result.errorCode));
    } catch {
      setGeminiState(state("No fue posible validar el contexto.", "provider_error", "client_context_failed"));
    }
  }

  function toggleGeminiItem(id) {
    setSelectedGeminiIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function reanalyzeWithContext() {
    if (!geminiContext?.valid_for_reanalysis) return;
    setGeminiState(state("Reanalizando con los elementos seleccionados…", "loading"));
    await runOperationalAnalysis({ reanalysis: true });
    setGeminiState(state(selectedGeminiIds.length
      ? "Análisis completo: Atlas incorporó la evidencia aceptada en una nueva versión."
      : "Análisis completo: la respuesta quedó trazada, pero ningún elemento rechazado influyó en la conclusión.", "success"));
  }

  function startNewGeminiResearch() {
    setGeminiText("");
    setGeminiContext(null);
    setSelectedGeminiIds([]);
    setGeminiState(state("Nueva investigación complementaria lista. Pega una respuesta nueva para validarla."));
    setShowActiveComparison(false);
  }

  function updateCandidateQuote(candidate, field, value) {
    setCandidateQuotes((current) => ({
      ...current,
      [candidate.candidate_id]: {
        ...current[candidate.candidate_id],
        candidateId: candidate.candidate_id,
        marketFamily: candidate.market_family,
        direction: candidate.direction,
        selection: candidate.selection,
        line: candidate.line,
        [field]: value,
      },
    }));
  }

  function openCandidate(candidate) {
    const competition = competitions.find((item) => item.key === candidate.competitionKey);
    setMainMode("match");
    setDate(candidate.localCalendarDate || candidate.kickoffLocal?.slice(0, 10) || date);
    setCompetitionKey(candidate.competitionKey);
    setSeason(String(candidate.season || seasonFor(competition, candidate.kickoff)));
    const transferredBase = candidate.transferredCandidate || {
      fixture_id: candidate.fixtureId,
      analysis_mode: "specific",
      market_family: candidate.marketId,
      direction: candidate.direction,
      line: candidate.line,
      selection: candidate.selection,
      preliminary_probability: candidate.probability,
      uncertainty: { low: candidate.uncertaintyLow, high: candidate.uncertaintyHigh },
      sports_score: candidate.sportsScore ?? candidate.technicalSupport,
      rank: candidate.generalRank,
      overall_rank: candidate.generalRank,
      family_rank: candidate.familyRank,
      reasons: candidate.reasons,
      risks: candidate.risks,
      methodology_version: candidate.methodologyVersion,
    };
    const transferred = { ...transferredBase, line_origin: transferredBase.line_origin || "transferred_candidate" };
    const storedOperation = findFixtureQuoteEntry(fixtureQuoteLedgers[String(candidate.fixtureId)], candidate);
    const storedQuote = storedOperation?.active_quote || storedOperation?.latest_known_quote || null;
    setTransferredCandidate(transferred);
    setAnalysisMode("specific");
    setMarketId(transferred.market_family);
    setLine(String(transferred.line));
    setSelection(transferred.direction);
    setOdds(storedQuote ? String(storedQuote.decimal_odds) : "");
    setBookmaker(storedQuote?.bookmaker_name || "");
    setOddsConsultedAt(storedQuote ? utcIsoToLocalDateTimeInput(storedQuote.updated_at || storedQuote.consulted_at, storedQuote.timezone || defaultTimezone) : "");
    setSelectedQuoteEntry(storedOperation);
    setGeminiText("");
    setGeminiContext(null);
    setSelectedGeminiIds([]);
    setGeminiState(state("Completa la investigación manual para que Atlas pueda tomar posición."));
    setCandidateQuotes({});
    setFixtures([{
      fixtureId: candidate.fixtureId,
      label: candidate.fixture,
      date: { utc: candidate.kickoff, kickoff_utc: candidate.kickoff, timezone: candidate.timezone || defaultTimezone },
      status: { long: "Candidato de la jornada" },
    }]);
    setSelectedFixtureId(String(candidate.fixtureId));
    setFixturesState(state("Candidato transferido. El ID del partido permanece inmutable.", "success"));
    setAnalysis(null);
    setAnalysisState(state("La opción seleccionada está lista. Prepara la investigación para completar el análisis.", "transferred_ready"));
  }

  async function returnToJourneyComparison() {
    await refreshFixtureQuoteLedger(selectedFixtureId);
    setMainMode("journey");
    setTransferredCandidate(null);
    clearTemporaryQuote();
  }

  return (
    <div className="p2-app">
      <nav className="p2-main-tabs" aria-label="Modos principales">
        <div className="p2-main-destinations">
          <button type="button" aria-current={mainMode === "home" ? "page" : undefined} onClick={() => setMainMode("home")}>Inicio</button>
          <button type="button" aria-current={mainMode === "journey" ? "page" : undefined} onClick={() => setMainMode("journey")}>Analizar jornada</button>
          <button type="button" aria-current={mainMode === "match" ? "page" : undefined} onClick={() => setMainMode("match")}>Analizar partido</button>
          <button type="button" aria-current={mainMode === "live" ? "page" : undefined} onClick={() => setMainMode("live")}>Atlas EN VIVO</button>
          <button type="button" aria-current={mainMode === "combinations" ? "page" : undefined} onClick={() => setMainMode("combinations")}>Parlay y Soñadora Atlas</button>
          <button type="button" aria-current={mainMode === "memory" ? "page" : undefined} onClick={() => setMainMode("memory")}>Memoria Atlas · rendimiento</button>
          <button type="button" aria-current={mainMode === "history" ? "page" : undefined} onClick={() => setMainMode("history")}>Historial</button>
          <button type="button" aria-current={mainMode === "bets" ? "page" : undefined} onClick={() => setMainMode("bets")}>Mis apuestas</button>
        </div>
        <div className="p2-nav-utilities" aria-label="Acciones de sesión">
          <button type="button" className="secondary-button p2-new-search-button" onClick={startNewSearch}>Nueva búsqueda</button>
          <button type="button" className="secondary-button p2-logout-button" onClick={logout} disabled={loggingOut} title={`Sesión ${ownerId}`}>{loggingOut ? "Cerrando…" : "Cerrar sesión"}</button>
        </div>
      </nav>
      <AtlasGlossary />

      {!["home", "history", "bets", "combinations", "memory", "live"].includes(mainMode) ? <div className="p2-shared-date">
        <label>
          <span>1 · Elige la fecha</span>
          <input type="date" value={date} onChange={(event) => changeDate(event.target.value)} />
        </label>
        <p>Una sola fecha mantiene la consulta controlada y hace visible el contexto exacto.</p>
      </div> : null}

      {mainMode === "home" ? (
        <section className="p2-mode p2-home" aria-labelledby="atlas-home-title">
          <div className="p2-mode-heading">
            <p className="eyebrow">Centro de inteligencia</p>
            <h2 id="atlas-home-title">¿Qué quieres analizar?</h2>
            <p>Accede a cada flujo sin perder el principio de Atlas: comprender primero, decidir después.</p>
          </div>
          <div className="p2-home-primary" aria-label="Acciones principales">
            <button type="button" onClick={() => setMainMode("journey")}><span>01</span><strong>Analizar jornada</strong><small>Compara partidos y mercados con respaldo deportivo.</small></button>
            <button type="button" onClick={() => setMainMode("match")}><span>02</span><strong>Analizar partido</strong><small>Profundiza en un partido y una opción exacta.</small></button>
            <button type="button" onClick={() => setMainMode("live")}><span>03</span><strong>Atlas EN VIVO</strong><small>Lee marcador, minuto y estadísticas actuales.</small></button>
            <button type="button" onClick={() => setMainMode("combinations")}><span>04</span><strong>Parlay y Soñadora</strong><small>Construye combinaciones desde el análisis deportivo.</small></button>
          </div>
          <div className="p2-home-secondary" aria-label="Accesos secundarios">
            <button type="button" onClick={() => setMainMode("memory")}><strong>Memoria Atlas</strong><small>Pronósticos y calibración.</small></button>
            <button type="button" onClick={() => setMainMode("bets")}><strong>Rendimiento</strong><small>ROI y resultados registrados.</small></button>
            <button type="button" onClick={() => setMainMode("history")}><strong>Historial</strong><small>Expedientes y versiones.</small></button>
            <button type="button" onClick={() => setMainMode("bets")}><strong>Mis apuestas</strong><small>Registro personal.</small></button>
          </div>
        </section>
      ) : null}

      {mainMode === "journey" ? (
        <section className="p2-mode" aria-labelledby="journey-title">
          <div className="p2-mode-heading">
            <p className="eyebrow">Exploración guiada</p>
            <h2 id="journey-title">Analizar jornada</h2>
            <p>Atlas revisa los partidos elegibles y presenta varias opciones útiles para continuar.</p>
          </div>

          <div className="p2-filter-section">
            <fieldset className="p2-market-filters">
              <legend>Modo de análisis</legend>
              <label><input type="radio" name="journey-analysis-mode" checked={journeyAnalysisMode === "general"} onChange={() => { setJourneyAnalysisMode("general"); invalidateJourney(); }} />Buscar mejor opción general</label>
              <label><input type="radio" name="journey-analysis-mode" checked={journeyAnalysisMode === "specific"} onChange={() => { setJourneyAnalysisMode("specific"); setJourneyMarketIds([journeyMarketIds[0] || markets[0]?.id || "goals"]); invalidateJourney(); }} />Analizar un mercado específico</label>
            </fieldset>
            <h3>2 · Elige las competiciones</h3>
            <div className="p2-competition-groups">
              {competitionGroups.map((group) => (
                <fieldset key={group.id}>
                  <legend>{group.label}</legend>
                  {group.competitions.map((competition) => (
                    <label key={competition.key}>
                      <input type="checkbox" checked={journeyCompetitionKeys.includes(competition.key)} onChange={() => toggleJourneyCompetition(competition.key)} />
                      <span>{competition.localName}<small>{displayStatus(competition.verificationStatus)}</small></span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          </div>

          <div className="p2-filter-grid">
            <fieldset className="p2-market-filters">
              <legend>3 · Mercados de interés</legend>
              {markets.map((market) => (
                <label key={market.id}>
                  <input type={journeyAnalysisMode === "specific" ? "radio" : "checkbox"} name={journeyAnalysisMode === "specific" ? "journey-specific-market" : undefined} checked={journeyMarketIds.includes(market.id)} onChange={() => journeyAnalysisMode === "specific" ? (setJourneyMarketIds([market.id]), invalidateJourney()) : toggleJourneyMarket(market.id)} />
                  {market.label}
                </label>
              ))}
              <small>Todos están seleccionados inicialmente. Scout no utiliza cuotas.</small>
            </fieldset>
            <label>
              <span>4 · Máximo de partidos a revisar</span>
              <input type="number" min="1" max="50" value={maximumFixtures} onChange={(event) => { setMaximumFixtures(Math.max(1, Math.min(50, Number(event.target.value) || 1))); invalidateJourney(); }} />
              <small>Entre 1 y 50 partidos seleccionados para revisión.</small>
            </label>
          </div>

          <button type="button" className="primary-button p2-primary" onClick={scanJourney} disabled={journeyState.status === "loading"}>
            {journeyState.status === "loading" ? "Escaneando jornada…" : "Escanear jornada"}
          </button>
          <StatusNotice value={journeyState} />

          {journey ? (
            <section className="p2-journey-result" aria-labelledby="journey-summary-title">
              <h3 id="journey-summary-title">Oportunidades encontradas por Atlas</h3>
              <p>Atlas encontró estas opciones con los datos deportivos disponibles. Elige una para completar el análisis.</p>
              <div className="p2-candidate-grid">
                {(journey.candidates || []).slice(0, 3).map((candidate, index) => <JourneyCandidateCard key={`${candidate.fixtureId}-${candidate.marketId}`} candidate={candidate} primary={index === 0} onOpen={openCandidate} timezone={defaultTimezone} />)}
              </div>
              {(journey.candidates || []).length > 3 ? <div className="p2-candidate-grid">{journey.candidates.slice(3).map((candidate) => <JourneyCandidateCard key={`${candidate.fixtureId}-${candidate.marketId}`} candidate={candidate} onOpen={openCandidate} timezone={defaultTimezone} />)}</div> : null}
             <JourneyMatchesReviewed journey={journey} />
             <JourneyTechnicalDetails journey={journey} quoteLedgers={fixtureQuoteLedgers} operationalRanking={journeyOperationalRanking} quoteCoverage={journeyQuoteCoverage} technicalLabel="Respaldo deportivo" />
            </section>
          ) : null}
        </section>
      ) : mainMode === "combinations" ? (
        <AtlasCombinationBuilder competitionGroups={competitionGroups} markets={markets} defaultTimezone={defaultTimezone} />
      ) : mainMode === "memory" ? (
        <AtlasPredictionMemory />
      ) : mainMode === "live" ? (
        <AtlasLive competitions={competitions} defaultTimezone={defaultTimezone} />
      ) : mainMode === "match" ? (
        <section className="p2-mode" aria-labelledby="match-title">
          <div className="p2-mode-heading">
            <p className="eyebrow">ANÁLISIS DE UNA OPCIÓN</p>
            <h2 id="match-title">Analizar partido</h2>
            <p>Elige una opción, completa la investigación y deja la cuota para el final.</p>
          </div>

          <ol className="p2-flow-steps" aria-label="Flujo del análisis">
            <li>Partido</li><li>Opción</li><li>Investigación Gemini</li><li>Análisis completo</li><li>Cuota</li><li>Decisión final</li>
          </ol>
          {transferredCandidate ? (
            <section className="p2-transferred-candidate" aria-labelledby="transferred-candidate-title">
              <p className="eyebrow">Candidato transferido desde la jornada</p>
              <h3 id="transferred-candidate-title">{markets.find((item) => item.id === transferredCandidate.market_family)?.label || transferredCandidate.market_family} · {transferredCandidate.direction === "over" ? "Más de" : "Menos de"} {transferredCandidate.line}</h3>
              <p>Atlas conservará exactamente esta selección durante la investigación.</p>
              <details className="p2-source-details"><summary>Ver datos técnicos de la preselección</summary><DefinitionGrid entries={[
                ["Probabilidad preliminar", percentage(transferredCandidate.preliminary_probability)],
                ["Incertidumbre", `${percentage(transferredCandidate.uncertainty?.low)}–${percentage(transferredCandidate.uncertainty?.high)}`],
                ["Respaldo deportivo", `${transferredCandidate.sports_score}/100`],
                ["Posición general Scout", transferredCandidate.overall_rank || transferredCandidate.rank ? `#${transferredCandidate.overall_rank || transferredCandidate.rank}` : null],
                ["Posición dentro de la familia", transferredCandidate.family_rank ? `#${transferredCandidate.family_rank}` : null],
              ]} /></details>
              <div className="p2-inline-actions">
                <button type="button" className="secondary-button" onClick={returnToJourneyComparison}>Volver a comparar todas las opciones</button>
              </div>
            </section>
          ) : null}
          <fieldset className="p2-market-filters">
            <legend>Modo de análisis</legend>
            <label><input type="radio" name="match-analysis-mode" disabled={Boolean(transferredCandidate)} checked={analysisMode === "general"} onChange={() => { setAnalysisMode("general"); setMarketId("open"); clearTemporaryQuote(); invalidateAnalysis(); }} />Buscar mejor opción general</label>
            <label><input type="radio" name="match-analysis-mode" disabled={Boolean(transferredCandidate)} checked={analysisMode === "specific"} onChange={() => { setAnalysisMode("specific"); setMarketId(markets[0]?.id || "goals"); clearTemporaryQuote(); invalidateAnalysis(); }} />Analizar un mercado específico</label>
          </fieldset>

          <div className="p2-filter-grid p2-match-filters">
            <label>
              <span>2 · Competición</span>
              <select value={competitionKey} onChange={(event) => changeCompetition(event.target.value)}>
                {competitionGroups.map((group) => (
                  <optgroup key={group.id} label={group.label}>
                    {group.competitions.map((competition) => <option key={competition.key} value={competition.key}>{competition.localName}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <label>
              <span>Temporada</span>
              <input inputMode="numeric" value={season} onChange={(event) => { setSeason(event.target.value); setFixtures([]); setFixturesState(state("Carga los partidos para la nueva temporada.")); invalidateAnalysis(undefined, true); }} />
              <small>Se sugiere según la fecha; puedes corregirla antes de consultar.</small>
            </label>
          </div>
          <button type="button" className="secondary-button" onClick={loadFixtures} disabled={fixturesState.status === "loading"}>{fixturesState.status === "loading" ? "Cargando partidos…" : "3 · Cargar partidos"}</button>
          <StatusNotice value={fixturesState} />

          {fixtures.length ? (
            <fieldset className="p2-fixture-list">
              <legend>4 · Selecciona el partido exacto</legend>
              {fixtures.map((fixture) => (
                <label key={fixture.fixtureId} className={selectedFixtureId === String(fixture.fixtureId) ? "selected" : ""}>
                  <input type="radio" name="fixtureId" checked={selectedFixtureId === String(fixture.fixtureId)} onChange={() => chooseFixture(fixture.fixtureId)} />
                  <span><strong>{fixture.label || `${fixture.teams.home.name} vs ${fixture.teams.away.name}`}</strong><small>{formatDate(fixture.date?.kickoff_utc || fixture.date?.utc, fixture.date?.timezone || defaultTimezone)} · {fixture.date?.timezone === "America/Bogota" || !fixture.date?.timezone ? "Hora de Colombia" : fixture.date.timezone} · {displayProviderStatus(fixture.status?.long || fixture.status?.short)}</small><small className="p2-secondary-id">ID del partido {fixture.fixtureId}</small></span>
                </label>
              ))}
            </fieldset>
          ) : null}

          <div className="p2-market-entry p2-market-entry-selection">
            {analysisMode === "specific" && !transferredCandidate ? (
              <section className="p2-entry-panel p2-atlas-forecast" aria-labelledby="manual-option-form-title">
                <p className="eyebrow" id="manual-option-form-title">OPCIÓN QUE QUIERES ANALIZAR</p>
                <label>
                  <span>5 · Familia</span>
                  <select value={marketId} onChange={(event) => { setMarketId(event.target.value); clearTemporaryQuote(); invalidateAnalysis(); }}>
                    {markets.map((market) => <option key={market.id} value={market.id}>{market.label}</option>)}
                  </select>
                </label>
                <label><span>Dirección</span><select value={selection} onChange={(event) => { setSelection(event.target.value); invalidateAnalysis(); }}><option value="">Elige Más de o Menos de</option><option value="over">Más de</option><option value="under">Menos de</option></select></label>
                <label><span>Línea</span><input inputMode="decimal" value={line} onChange={(event) => { setLine(event.target.value); invalidateAnalysis(); }} placeholder="Ej. 1.5" /></label>
                <small>Atlas evaluará exactamente esta opción y no la sustituirá por el candidato general.</small>
              </section>
            ) : (
              <section className="p2-entry-panel p2-atlas-forecast" aria-labelledby="atlas-forecast-form-title">
                <p className="eyebrow" id="atlas-forecast-form-title">OPCIÓN SELECCIONADA</p>
                {analysisMode === "specific" ? <label>
                  <span>5 · Familia de mercado</span>
                  <select value={marketId} disabled>
                  {markets.map((market) => <option key={market.id} value={market.id}>{market.label}</option>)}
                  </select>
                </label> : <div className="p2-family-copy"><strong>Atlas comparará las cinco familias.</strong><small>La cuota no participa en esta comparación inicial; se evaluará únicamente al final.</small></div>}
                <label><span>Mercado candidato</span><input readOnly value={analysis?.director?.market_evaluated?.label || markets.find((item) => item.id === transferredCandidate?.market_family)?.label || "Atlas lo determinará"} /></label>
                <label><span>Selección candidata</span><input readOnly value={analysis?.director?.selection || transferredCandidate?.selection ? displaySelection(analysis?.director?.selection || transferredCandidate?.selection) : "Atlas la determinará"} /></label>
                <label><span>Línea sugerida</span><input readOnly value={analysis?.director?.line ?? transferredCandidate?.line ?? "Atlas la determinará"} /></label>
              </section>
            )}
          </div>
          {!analysis?.director ? <button type="button" className="primary-button p2-primary" onClick={analyzeSelectedFixture} disabled={analysisState.status === "loading" || !selectedFixtureId || !specificOptionReady}>{analysisState.status === "loading" ? "Preparando investigación…" : "Preparar investigación Gemini"}</button> : null}
          <StatusNotice value={analysisState} />
          {analysisForDisplay?.director ? <AnalysisResult key={`${analysisForDisplay.selectedFixtureId}-${analysisForDisplay.analysisVersion?.analysis_id || "result"}`} analysis={analysisForDisplay} analysisCompleted={analysisCompleted} candidateQuotes={candidateQuotes} onQuoteChange={updateCandidateQuote} onEvaluatePrices={() => runOperationalAnalysis({ reanalysis: true })} showComparison={showActiveComparison} /> : null}
          {!analysisCompleted ? <GeminiWorkflow analysis={analysis} text={geminiText} setText={setGeminiText} context={geminiContext} selectedIds={selectedGeminiIds} toggleItem={toggleGeminiItem} onValidate={validateGeminiContext} onReanalyze={reanalyzeWithContext} onNewResearch={startNewGeminiResearch} status={geminiState} /> : null}
          {analysisCompleted ? <section className="p2-entry-panel p2-user-quote p2-final-quote-entry" aria-labelledby="user-quote-form-title">
            <p className="eyebrow" id="user-quote-form-title">INTRODUCIR CUOTA</p>
            <p>{staleAnalysisQuote ? "La cuota anterior venció. Introduce un precio actual para volver a decidir." : "La tesis ya está completa. Ahora Atlas evaluará el precio por separado."}</p>
            <label><span>Casa</span><input value={bookmaker} onChange={(event) => setBookmaker(event.target.value)} placeholder="Ej. Betano" /></label>
            <label><span>Cuota decimal</span><input inputMode="decimal" value={odds} onChange={(event) => setOdds(event.target.value)} placeholder="Ej. 1.65" /></label>
            <label><span>Hora de consulta</span><input type="datetime-local" value={oddsConsultedAt} onChange={(event) => setOddsConsultedAt(event.target.value)} /><small>{defaultTimezone === "America/Bogota" ? "Hora de Colombia" : defaultTimezone}</small></label>
            {manualQuoteWarning ? <small className="p2-quote-warning">{manualQuoteWarning}</small> : null}
            {incompletePriceInput ? <small>Completa casa, cuota y hora para evaluar el precio.</small> : null}
            <button type="button" className="primary-button p2-primary" onClick={reanalyzeWithManualOdds} disabled={!manualQuoteReady || analysisState.status === "loading"}>{staleAnalysisQuote ? "Actualizar cuota" : analysis?.selectedOdds ? "Actualizar decisión con esta cuota" : "Evaluar esta cuota"}</button>
          </section> : null}
          {analysisCompleted ? <details className="p2-source-details p2-new-gemini-research"><summary>Nueva investigación Gemini</summary><GeminiWorkflow analysis={analysis} text={geminiText} setText={setGeminiText} context={geminiContext} selectedIds={selectedGeminiIds} toggleItem={toggleGeminiItem} onValidate={validateGeminiContext} onReanalyze={reanalyzeWithContext} onNewResearch={startNewGeminiResearch} status={geminiState} /></details> : null}
        </section>
      ) : mainMode === "bets" ? (
        <BetTrackerView timezone={defaultTimezone} />
      ) : mainMode === "home" ? null : (
        <HistoryView timezone={defaultTimezone} />
      )}
    </div>
  );
}
