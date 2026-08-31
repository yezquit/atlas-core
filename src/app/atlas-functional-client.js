"use client";

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { buildConservativeParlays } from "@/core/intelligence/parlayPolicy";
import { localDateTimeToUtcIso, todayLocalDateString, utcIsoToLocalDateTimeInput } from "@/core/intelligence/dateTimeContext";
import { manualOddsCopyWarning } from "@/core/intelligence/oddsIntelligence";
import { buildJourneyOperationalRanking, findFixtureQuoteEntry, summarizeJourneyQuoteCoverage } from "@/core/intelligence/fixtureQuoteLedger";
import { asianSettlementExplanation } from "@/core/intelligence/asianTotalGoals";
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

const RADAR_DIRECTION_LABELS = { high: "ALTA", low: "BAJA", neutral: "NEUTRAL" };
function radarDirectionLabel(direction) {
  return RADAR_DIRECTION_LABELS[direction] || "SIN DATO";
}

function radarOpportunityState(radar) {
  if (!radar) return null;
  if (radar.radar_direction !== "neutral" && radar.adversarial_passed === false) {
    return { key: "blocked", label: "BLOQUEADA POR CONTRAEVIDENCIA" };
  }
  if (radar.opportunity_detected === true) {
    return { key: "opportunity", label: "OPORTUNIDAD ATLAS" };
  }
  if (radar.radar_direction === "neutral") {
    return { key: "observation", label: "EN OBSERVACIÓN" };
  }
  return { key: "unclassified", label: "SIN CLASIFICAR" };
}

function adversarialStatusLabel(adversarialPassed) {
  if (adversarialPassed === true) return "Superada";
  if (adversarialPassed === false) return "No superada";
  return "No disponible";
}

function coherenceLabel(coherent) {
  if (coherent === true) return "Coherencia correcta";
  if (coherent === false) return "Coherencia problemática";
  return "Coherencia desconocida";
}

function pointsDifference(estimated, implied) {
  if (!Number.isFinite(estimated) || !Number.isFinite(implied)) return null;
  const rounded = Math.round((estimated - implied) * 1000) / 10;
  return `${rounded >= 0 ? "+" : ""}${rounded.toFixed(1)} pp`;
}

const DIRECTOR_DECISION_ICONS = { yes: "✅", wait: "⏳", no: "⛔" };
function directorDecisionIcon(decision) {
  return DIRECTOR_DECISION_ICONS[decision?.status] ?? null;
}

function bestCandidatePerFamily(rankedCandidates = []) {
  const seen = new Set();
  const result = [];
  for (const candidate of rankedCandidates) {
    if (seen.has(candidate.market_family)) continue;
    seen.add(candidate.market_family);
    result.push(candidate);
  }
  return result;
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

const METRIC_HINTS = Object.freeze({
  "SOLIDEZ ATLAS":
    "Indica qué tan sólido y respaldado está técnicamente el análisis según calidad de muestra, incertidumbre, cobertura y estabilidad. No es la probabilidad de acertar.",
  "Probabilidad estimada Atlas": "Estimación de Atlas sobre la probabilidad de que ocurra esta selección. Es una estimación estadística, no una garantía.",
  "PROBABILIDAD ESTIMADA": "Estimación de Atlas sobre la probabilidad de que ocurra esta selección. Es una estimación estadística, no una garantía.",
  "Dirección Radar": "ALTA: las señales deportivas tienden hacia valores superiores respecto a la línea analizada. BAJA: tienden hacia valores inferiores. NEUTRAL: no existe una dirección suficientemente clara. BAJA describe dirección, no baja calidad ni baja probabilidad.",
  "Convergencia Radar": "Indica cuánto coinciden y qué tan consistentes son las señales deportivas consideradas por el Radar. No es una probabilidad.",
  "Contraevidencia": "Señales relevantes que contradicen la oportunidad detectada. Si son suficientemente fuertes, Atlas puede bloquear la oportunidad.",
  "Coherencia del modelo": "Mide si los distintos componentes y la distribución del modelo son consistentes entre sí. Puede ser correcta, problemática o desconocida según la evidencia disponible.",
  "Incertidumbre": "Representa el rango de duda alrededor de la estimación. Una incertidumbre menor implica una estimación más precisa; una mayor exige más cautela.",
  "Soporte": "Resume la cantidad y calidad de evidencia que respalda esta lectura deportiva. Más soporte no equivale automáticamente a mayor probabilidad.",
});

function InfoHint({ label, text }) {
  const tooltipId = useId();
  return (
    <span className="p2-info-hint">
      <button type="button" className="p2-info-hint-trigger" aria-label={`Más información sobre ${label}`} aria-describedby={tooltipId}>ⓘ</button>
      <span id={tooltipId} role="tooltip" className="p2-info-hint-tooltip">{text}</span>
    </span>
  );
}

function MetricLabel({ label }) {
  const hint = METRIC_HINTS[label];
  return <span className="p2-metric-label">{label}{hint ? <InfoHint label={label} text={hint} /> : null}</span>;
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
          <dt>{typeof label === "string" && METRIC_HINTS[label] ? <MetricLabel label={label} /> : label}</dt>
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
  const supplementaryReferee = analysis.gemini?.supplementary_referee_evidence;
  return (
    <section className="p2-history-compare" aria-labelledby="context-summary-title">
      <h3 id="context-summary-title">Resumen del contexto incorporado</h3>
      <div className="p2-four-columns">
        <ListBlock title="Elementos favorables" items={(summary.favorable || []).slice(0, 3)} />
        <ListBlock title="Elementos contrarios" items={(summary.unfavorable || []).slice(0, 3)} />
        <ListBlock title="Limitaciones" items={(summary.limitations || []).slice(0, 3)} />
      </div>
      {supplementaryReferee ? <p><strong>{supplementaryReferee.display_message}</strong> <small>Procedencia: evidencia suplementaria reportada por el usuario; no verificada por el proveedor.</small></p> : null}
      <button type="button" className="secondary-button" onClick={onShowExpert}>Ver contexto completo</button>
    </section>
  );
}

const SCOUT_LABELS = Object.freeze({
  atlas_recommendation: "Recomendación Atlas",
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
      {analysis.scout.catalog?.length > candidates.length ? <details className="p2-source-details"><summary>Ver catálogo completo ({analysis.scout.catalog.length} líneas válidas)</summary><ul>{analysis.scout.catalog.map((candidate) => <li key={candidate.candidate_id}><strong>{candidate.candidate_id === analysis.scout.primary_candidate_id ? "Recomendación Atlas · " : ""}</strong>{displaySelection(candidate.selection)} · {percentage(candidate.preliminary_probability)} · respaldo {candidate.sports_score}/100</li>)}</ul></details> : null}
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

function RadarBadge({ radar }) {
  if (!radar) {
    return (
      <section className="p2-radar-summary p2-radar-unavailable" aria-label="Estado del Radar">
        <p className="eyebrow">RADAR</p>
        <p>Sin contexto de convergencia disponible para esta familia.</p>
      </section>
    );
  }
  const state = radarOpportunityState(radar);
  return (
    <section className={`p2-radar-summary p2-radar-${state.key}`} aria-label="Estado del Radar">
      <p className="eyebrow">RADAR</p>
      <p className="p2-radar-state"><strong>{state.label}</strong></p>
      <DefinitionGrid entries={[
        ["Dirección Radar", radarDirectionLabel(radar.radar_direction)],
        ["Convergencia Radar", Number.isFinite(radar.radar_score) ? `${radar.radar_score}/100` : "No disponible"],
        ["Contraevidencia", adversarialStatusLabel(radar.adversarial_passed)],
        ["Coherencia del modelo", coherenceLabel(radar.model_coherence?.coherent)],
      ]} />
      <small>Convergencia Radar resume la calidad y convergencia de las señales deportivas; no es una probabilidad.</small>
      <details className="p2-source-details">
        <summary>Ver métricas auditables del Radar</summary>
        <DefinitionGrid entries={[
          ["Fixtures únicos considerados", radar.unique_fixture_count],
          ["Grupos de señal disponibles", radar.signal_group_count],
          ["Conteo técnico de señales", radar.independent_signal_count],
          ["Calidad de muestra", Number.isFinite(radar.sample_quality) ? `${radar.sample_quality}/100` : null],
          ["Contradicciones fuertes", radar.opposing_strength],
        ]} />
      </details>
    </section>
  );
}

function EconomicsPanel({ decimalOdds, bookmaker, impliedProbability, estimatedProbability }) {
  const hasExactQuote = Number.isFinite(decimalOdds) && Number.isFinite(impliedProbability);
  return (
    <section className="p2-economics-panel" aria-label="Información económica">
      <p className="eyebrow">ECONOMÍA</p>
      <DefinitionGrid entries={[
        ["Cuota", hasExactQuote
          ? `${decimalOdds}${bookmaker ? ` · ${bookmaker}` : ""}`
          : "Cuota no disponible"],
        ["Probabilidad implícita", hasExactQuote ? percentage(impliedProbability) : "No disponible"],
        ["Probabilidad estimada Atlas", Number.isFinite(estimatedProbability) ? percentage(estimatedProbability) : "No disponible"],
        ["Diferencia vs cuota", hasExactQuote ? (pointsDifference(estimatedProbability, impliedProbability) ?? "No disponible") : "No disponible"],
      ]} />
      <small>Compara la estimación deportiva de Atlas con la probabilidad implícita de la cuota. No representa una garantía de rentabilidad.</small>
    </section>
  );
}

function SideComparisonReading({ sideComparison, oppositeMarket, conclusion }) {
  if (!sideComparison?.canonical) return null;
  return (
    <section className="p2-stage-card p2-line-reading" aria-label="Lectura de la línea">
      <p className="eyebrow">LECTURA DE LA LÍNEA</p>
      <DefinitionGrid entries={[
        [`Menos de ${sideComparison.line}`, percentage(sideComparison.under_probability)],
        [`Más de ${sideComparison.line}`, percentage(sideComparison.over_probability)],
      ]} />
      <p>{sideComparison.message}</p>
      {oppositeMarket?.has_quote ? (
        <DefinitionGrid entries={[
          ["Cuota contraria", `${oppositeMarket.bookmaker} @${oppositeMarket.decimal_odds}`],
          ["Probabilidad implícita contraria", Number.isFinite(oppositeMarket.price_assessment?.implied_probability) ? percentage(oppositeMarket.price_assessment.implied_probability) : "No disponible"],
          ["Diferencia contraria (edge)", Number.isFinite(oppositeMarket.price_assessment?.price_gap_percentage_points) ? `${oppositeMarket.price_assessment.price_gap_percentage_points} pp` : "No disponible"],
          ["Evaluación de precio contraria", displayStatus(oppositeMarket.price_assessment?.status)],
        ]} />
      ) : null}
      {conclusion ? <p><strong>{conclusion}</strong></p> : null}
    </section>
  );
}

// Reutiliza EXCLUSIVAMENTE evidencia deportiva ya calculada por el motor
// (simple_sports_reasons: hit-rate de la línea exacta por rol + producción/
// concesión; market_model_audit.distribution_center: centro de la
// distribución ya estimado). Nunca inventa texto genérico ni suma
// producción+concesión como si fuera un total: cada frase describe UN
// componente ya calculado, y el centro de distribución se reporta tal cual
// lo entrega marketAudit, sin recalcularlo aquí.
function buildAtlasReasoningBullets(candidate, marketLabel) {
  if (!candidate) return [];
  const bullets = [...new Set((candidate.simple_sports_reasons || candidate.reasons || []).filter(Boolean))];
  const distributionCenter = candidate.market_model_audit?.distribution_center;
  if (Number.isFinite(distributionCenter)) {
    bullets.push(`La distribución estimada se centra alrededor de ${distributionCenter} ${(marketLabel || "").toLowerCase() || "eventos"}.`);
  }
  return bullets;
}

function WhyAtlasReasoning({ candidate, marketLabel }) {
  const bullets = buildAtlasReasoningBullets(candidate, marketLabel);
  if (!bullets.length) return null;
  return (
    <section className="p2-stage-card p2-why-atlas" aria-labelledby="why-atlas-title">
      <p className="eyebrow">¿POR QUÉ ATLAS LLEGA A ESTA CONCLUSIÓN?</p>
      <h3 id="why-atlas-title" className="sr-only">Motivos deportivos</h3>
      <ul>{bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
    </section>
  );
}

// Redacta la brecha probabilidad/precio en palabras simples. Es puramente
// descriptivo (magnitud y signo de un price_gap_percentage_points YA
// calculado por evaluateMarketPrice) — nunca una voz oficial ("SÍ"/"ESPERAR"/
// "NO" son exclusivas de DirectorAtlas) ni un umbral de decisión: no altera
// price_assessment.status ni ninguna regla existente.
function describeGapMagnitude(gapPoints) {
  if (!Number.isFinite(gapPoints)) return null;
  if (gapPoints >= 5) return `Existe una ventaja matemática aparente importante de +${gapPoints} puntos porcentuales.`;
  if (gapPoints > 0) return `Existe una ventaja matemática aparente de +${gapPoints} puntos porcentuales.`;
  if (gapPoints > -5) return `La diferencia es de solo ${gapPoints} puntos porcentuales: deportivamente la selección conserva respaldo y está muy cerca del nivel que exige la cuota, aunque el precio ofrecido queda ligeramente por debajo de lo que Atlas considera suficiente.`;
  return `Atlas está ${Math.abs(gapPoints)} puntos porcentuales por debajo del nivel que exige la cuota: el precio paga demasiado poco para el riesgo que Atlas estima.`;
}

// Todos los números vienen ya calculados (implied_probability, gap, sports_score);
// esta función solo los redacta. NUNCA calcula edge a partir de Solidez —
// Solidez y edge son dos métricas independientes y se muestran por separado.
function buildNumbersExplanation({ label, decimalOdds, impliedProbability, estimatedProbability, gapPoints, sportsScore }) {
  if (!Number.isFinite(decimalOdds) || !Number.isFinite(impliedProbability) || !Number.isFinite(estimatedProbability) || !Number.isFinite(gapPoints)) return null;
  const impliedPercent = Number((impliedProbability * 100).toFixed(1));
  const estimatedPercent = Number((estimatedProbability * 100).toFixed(1));
  const direction = gapPoints >= 0 ? "por encima" : "por debajo";
  return {
    demandParagraph: `Una cuota de ${decimalOdds} significa que ${label ? `"${label}"` : "esta selección"} necesita acertarse aproximadamente el ${impliedPercent}% de las veces para justificar matemáticamente ese precio.`,
    atlasParagraph: `Atlas calcula aproximadamente un ${estimatedPercent}% de probabilidad para ${label || "esta selección"}.`,
    differenceParagraph: `Atlas está ${Math.abs(gapPoints)} puntos porcentuales ${direction} de lo que exige la cuota.`,
    simpleParagraph: `La casa exige aproximadamente ${impliedPercent}%, mientras Atlas estima ${estimatedPercent}%. ${describeGapMagnitude(gapPoints)}`,
    solidezParagraph: Number.isFinite(sportsScore) ? `Solidez Atlas: ${sportsScore}/100. La Solidez indica qué tan respaldado está el análisis por los datos disponibles; NO es una probabilidad.` : null,
  };
}

function NumbersExplanation({ label, priceAssessment, sportsScore, oppositeLabel, oppositeAssessment }) {
  const primary = buildNumbersExplanation({
    label,
    decimalOdds: priceAssessment?.decimal_odds,
    impliedProbability: priceAssessment?.implied_probability,
    estimatedProbability: priceAssessment?.preliminary_probability,
    gapPoints: priceAssessment?.price_gap_percentage_points,
    sportsScore,
  });
  if (!primary) return null;
  const oppositeGap = oppositeAssessment?.price_gap_percentage_points;
  const hasOpposite = Number.isFinite(oppositeGap) && Number.isFinite(oppositeAssessment?.decimal_odds) && Number.isFinite(oppositeAssessment?.implied_probability) && Number.isFinite(oppositeAssessment?.preliminary_probability);
  const selectedGap = priceAssessment?.price_gap_percentage_points;
  return (
    <section className="p2-stage-card p2-numbers-explanation" aria-labelledby="numbers-explanation-title">
      <p className="eyebrow" id="numbers-explanation-title">¿QUÉ SIGNIFICAN ESTOS NÚMEROS?</p>
      <h4>¿Qué exige la cuota?</h4>
      <p>{primary.demandParagraph}</p>
      <h4>¿Qué estima Atlas?</h4>
      <p>{primary.atlasParagraph}</p>
      <h4>¿Qué diferencia hay?</h4>
      <p>{primary.differenceParagraph}</p>
      <h4>En palabras simples</h4>
      <p>{primary.simpleParagraph}</p>
      {primary.solidezParagraph ? <p>{primary.solidezParagraph}</p> : null}
      {hasOpposite ? (
        <>
          <h4>Lado contrario</h4>
          <DefinitionGrid entries={[
            ["Atlas (contrario)", percentage(oppositeAssessment.preliminary_probability)],
            ["Cuota (contraria)", oppositeAssessment.decimal_odds],
            ["Exige (contraria)", percentage(oppositeAssessment.implied_probability)],
            ["Diferencia (contraria)", `${oppositeGap > 0 ? "+" : ""}${oppositeGap} pp`],
          ]} />
          <p>{Number(selectedGap) >= Number(oppositeGap)
            ? "El lado seleccionado presenta una relación probabilidad/precio considerablemente más favorable."
            : "El lado contrario presenta una relación probabilidad/precio considerablemente más favorable."}</p>
        </>
      ) : null}
      <p><small>La decisión definitiva corresponde a DirectorAtlas después de considerar el análisis completo.</small></p>
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

function DirectorResult({ analysis, headingRef, onShowExpert, onAddToManualParlay, manualParlayLegCount = 0 }) {
  const director = analysis?.director;
  if (!director) return null;
  const price = director.price_assessment;
  const geminiItems = analysis.gemini?.applied_items || [];
  const supplementaryReferee = analysis.gemini?.supplementary_referee_evidence;
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
  const decisionReasons = [...new Set(contextSummary.favorable || [])].slice(0, 3);
  const fixtureRisks = (director.red_team?.items || []).filter((item) => item.status === "risk").map((item) => item.text).slice(0, 3);
  const simpleRisks = [...new Set([...(contextSummary.unfavorable || []), ...fixtureRisks])].slice(0, 2);
  const balanceReasons = [...new Set(baseReasons)].slice(0, 3);
  const fixture = director.fixture || {};
  const sideComparison = director.side_comparison || analysis.marketSelection?.primary?.side_comparison || null;
  const marketAudit = analysis.marketSelection?.primary?.market_model_audit || null;

  return (
    <section className={`director-atlas-panel functional-director p2-director p2-simple-director p2-simple-director-${analysisDecision.status}`} aria-label="Dictamen del Director Atlas" aria-labelledby="director-atlas-title">
      <p className="p2-director-kicker">ANÁLISIS COMPLETO</p>
      <header className="p2-simple-fixture">
        <p>{fixture.competition}</p>
        <h2 id="director-atlas-title" ref={headingRef} tabIndex="-1">{fixture.home_team} vs {fixture.away_team}</h2>
        <strong>{displaySelection(director.selection || director.market_evaluated?.label)}</strong>
      </header>
      <section className={`p2-simple-decision p2-simple-decision-${analysisDecision.status}`} aria-label="Resultado de Atlas">
        <span className="p2-decision-status-icon" aria-hidden="true">{directorDecisionIcon(analysisDecision)}</span>
        <div><small>RESULTADO DE ATLAS</small><h3>{analysisDecision.label}</h3><p>{analysisDecision.explanation}</p></div>
      </section>
      <p className="p2-solidez-atlas"><small><MetricLabel label="SOLIDEZ ATLAS" /></small> <strong>{Number.isFinite(analysis.marketSelection?.primary?.sports_score) ? `${analysis.marketSelection.primary.sports_score}/100` : "No disponible"}</strong></p>
      <div className="p2-director-metrics" aria-label="Resumen del dictamen">
        <span><small><MetricLabel label="Probabilidad estimada Atlas" /></small><strong>{Number.isFinite(analysis.marketSelection?.primary?.probability_percent) ? `${analysis.marketSelection.primary.probability_percent}%` : "No disponible"}</strong>{analysis.marketSelection?.primary?.probability_classification ? <small>{analysis.marketSelection.primary.probability_classification}</small> : null}</span>
        <span><small>Precio</small><strong>{presentation.has_current_price ? `${price.bookmaker} @${price.decimal_odds}` : "Pendiente"}</strong></span>
        <span><small>Riesgo</small><strong>{simpleRisks.length ? "Con alertas" : "Sin alerta específica"}</strong></span>
      </div>
      <section aria-label="Radar de oportunidad">
        <RadarBadge radar={analysis.primaryMarketOpportunityRadar} />
        <p><small>El Radar aporta evidencia deportiva adicional y posible contraevidencia; no sustituye la decisión final de Atlas.</small></p>
      </section>
      <EconomicsPanel
        decimalOdds={presentation.has_current_price ? price.decimal_odds : undefined}
        bookmaker={presentation.has_current_price ? price.bookmaker : undefined}
        impliedProbability={presentation.has_current_price ? price.implied_probability : undefined}
        estimatedProbability={analysis.marketSelection?.primary?.estimated_probability}
      />
      <SideComparisonReading sideComparison={sideComparison} oppositeMarket={director.opposite_market} conclusion={director.sports_price_conclusion} />
      <WhyAtlasReasoning candidate={analysis.marketSelection?.primary} marketLabel={director.market_evaluated?.label} />
      <NumbersExplanation
        label={analysis.marketSelection?.primary?.selection}
        priceAssessment={director.price_assessment}
        sportsScore={analysis.marketSelection?.primary?.sports_score}
        oppositeLabel={director.opposite_market?.selection}
        oppositeAssessment={director.opposite_market?.price_assessment}
      />
      {sideComparison ? <section className="p2-simple-sports-reading" aria-label="Lectura deportiva por lado">
        {Number.isFinite(marketAudit?.distribution_center) ? <p>La distribución observada se centra alrededor de {marketAudit.distribution_center} {director.market_evaluated?.label?.toLowerCase() || "eventos"}. Esta referencia no suma producción y concesión como si fueran equipos distintos.</p> : null}
        {Number.isFinite(marketAudit?.expected_total) ? <div className="p2-component-summary" aria-label="Componentes del mercado">
          <p><strong>EXPECTATIVA DEL LOCAL</strong><br />Producción propia: {marketAudit.home_for?.value ?? "No disponible"} · Rival concede: {marketAudit.away_against?.value ?? "No disponible"} · Componente Atlas: {marketAudit.expected_home_component}</p>
          <p><strong>EXPECTATIVA DEL VISITANTE</strong><br />Producción propia: {marketAudit.away_for?.value ?? "No disponible"} · Rival concede: {marketAudit.home_against?.value ?? "No disponible"} · Componente Atlas: {marketAudit.expected_away_component}</p>
          <p><strong>TOTAL BASE:</strong> {marketAudit.expected_total} · <strong>CENTRO DE DISTRIBUCIÓN:</strong> {marketAudit.distribution_center}</p>
        </div> : <p>Atlas utiliza la distribución ponderada de totales históricos; todavía no existe un componente esperado explícito para esta familia.</p>}
        {marketAudit?.model_coherence_warning ? <p><strong>Lectura con cautela:</strong> los componentes y la distribución no son coherentes dentro de su dispersión observada.</p> : null}
      </section> : null}
      {(() => {
        const otherFamilies = bestCandidatePerFamily(
          (analysis.marketSelection?.ranked_candidates || []).filter((item) => item.ranking_eligible)
        ).filter((item) => item.market_family !== analysis.marketSelection?.primary?.market_family);
        return otherFamilies.length ? (
          <section aria-labelledby="director-other-families-title">
            <h3 id="director-other-families-title">Otras familias que Atlas comparó</h3>
            <ul>{otherFamilies.map((item) => <li key={item.market_family}>{displaySelection(item.selection)} — {Number.isFinite(item.probability_percent) ? `${item.probability_percent}%` : "No disponible"} {item.probability_classification || ""}</li>)}</ul>
          </section>
        ) : null;
      })()}
      <div className="p2-simple-evidence-grid">
        <ListBlock title="A favor" items={decisionReasons} empty="Atlas no encontró evidencia estructurada a favor." />
        <ListBlock title="En contra" items={simpleRisks} empty="No se identificó un riesgo específico del partido con los datos disponibles." />
        <ListBlock title="Balance" items={balanceReasons} empty="No hay evidencia deportiva adicional sin clasificar." />
      </div>
      <section className="p2-simple-gemini-evidence" aria-labelledby="simple-gemini-evidence-title">
        <h3 id="simple-gemini-evidence-title">Evidencia Gemini relevante</h3>
        {supplementaryReferee ? <p><strong>{supplementaryReferee.display_message}</strong></p> : null}
        {geminiItems.length
          ? <ul>{geminiItems.slice(0, 3).map((item) => <li key={item.id}>{item.summary || item.text}</li>)}</ul>
          : <p>La respuesta fue validada, pero ningún elemento superó el filtro para modificar el análisis.</p>}
      </section>
      <section className="p2-simple-price" aria-labelledby="simple-price-title">
        <p className="eyebrow">CUOTA</p>
        <h3 id="simple-price-title">{presentation.has_current_price ? `${price.bookmaker} @${price.decimal_odds}` : presentation.stale_quote ? `${presentation.stale_quote.bookmaker_name} @${presentation.stale_quote.decimal_odds}` : "Todavía no informada"}</h3>
        <p>{simplePriceMessage}</p>
      </section>
      {priceDecision ? <section className={`p2-simple-final p2-simple-decision-${priceDecision.status}`} aria-label="Decisión final"><small>DECISIÓN FINAL</small><h3><span className="p2-decision-status-icon" aria-hidden="true">{directorDecisionIcon(priceDecision)}</span> {priceDecision.label}</h3><p>{simplePriceMessage}</p></section> : null}
      {priceDecision?.status === "yes" ? (
        <>
          <BetRegistrationButton analysisId={analysis?.analysisVersion?.analysis_id} />
          {onAddToManualParlay ? (
            <ManualParlayAddButton analysis={analysis} presentation={presentation} legCount={manualParlayLegCount} onAdd={onAddToManualParlay} />
          ) : null}
        </>
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

function ManualParlayAddButton({ analysis, presentation, legCount, onAdd }) {
  const [status, setStatus] = useState({ status: "idle", message: "" });
  const atMax = legCount >= 4;
  return (
    <div className="p2-manual-parlay-add">
      <button
        type="button"
        className="secondary-button"
        disabled={atMax}
        onClick={() => setStatus(onAdd(analysis, presentation))}
      >
        Agregar a Parlay manual
      </button>
      {atMax ? <p><small>El Parlay manual ya tiene el máximo de 4 selecciones.</small></p> : null}
      {status.message ? <p role={status.ok === false ? "alert" : "status"}>{status.message}</p> : null}
    </div>
  );
}

function ManualParlayPanel({ legs, onRemove, onSave, status }) {
  if (!legs.length) return null;
  const canSave = legs.length >= 2 && legs.length <= 4;
  return (
    <section className="p2-stage-card p2-manual-parlay-panel" aria-labelledby="manual-parlay-title">
      <p className="eyebrow" id="manual-parlay-title">PARLAY MANUAL PENDIENTE ({legs.length}/4)</p>
      <ul>
        {legs.map((leg, index) => (
          <li key={`${leg.fixture_id}-${leg.market_family}`}>
            <strong>{leg.home_team} vs {leg.away_team}</strong> — {displaySelection(leg.selection)}
            <small> · {Number.isFinite(leg.preliminary_probability) ? `${(leg.preliminary_probability * 100).toFixed(1)}%` : "Probabilidad no disponible"} · Solidez {Number.isFinite(leg.sports_score) ? `${leg.sports_score}/100` : "No disponible"} · {leg.bookmaker ? `${leg.bookmaker} @${leg.decimal_odds}` : "Cuota no disponible"}</small>
            <button type="button" className="secondary-button" onClick={() => onRemove(index)}>Quitar</button>
          </li>
        ))}
      </ul>
      {!canSave ? <p><small>El Parlay manual necesita entre 2 y 4 selecciones para poder guardarse.</small></p> : null}
      <button type="button" className="primary-button" disabled={!canSave || status.status === "loading"} onClick={onSave}>
        {status.status === "loading" ? "Registrando Parlay…" : "Guardar Parlay manual"}
      </button>
      {status.message ? <p role={status.status === "error" ? "alert" : "status"}>{status.message}</p> : null}
    </section>
  );
}

function ExpertResult({ analysis }) {
  const [candidateSaved, setCandidateSaved] = useState(false);
  const director = analysis.director;
  const fixture = analysis.fixture;
  const metadata = analysis.competitionMetadata;
  const league = analysis.leagueProfile;
  const referee = analysis.refereeProfile;
  const supplementaryReferee = analysis.gemini?.supplementary_referee_evidence;
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
        {supplementaryReferee ? (
          <div className="p2-source-details">
            <p><strong>{supplementaryReferee.display_message}</strong></p>
            <p>Procedencia: evidencia suplementaria reportada por el usuario. No sustituye ni verifica el perfil del proveedor.</p>
            <DefinitionGrid entries={[
              ["Fuente suplementaria", supplementaryReferee.source_name],
              ["URL", supplementaryReferee.source_url],
              ["Fecha", supplementaryReferee.publication_date],
              ["Verificación del proveedor", supplementaryReferee.provider_verified],
            ]} />
          </div>
        ) : null}
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
  const contextItems = context?.items || [];
  const selectedCount = contextItems.filter((item) => item.eligible_for_selection !== false && selectedIds.includes(item.id)).length;
  const unselectedCount = contextItems.filter((item) => item.eligible_for_selection !== false && !selectedIds.includes(item.id)).length;
  const rejectedCount = contextItems.filter((item) => item.eligible_for_selection === false).length;
  async function copyResearchPrompt() {
    await navigator.clipboard.writeText(analysis.gemini.prompt);
  }
  async function copyCleanupPrompt() {
    await navigator.clipboard.writeText(analysis.gemini.cleanupPrompt);
  }
  return (
    <section className="p2-gemini-flow" aria-labelledby="gemini-title">
      <p className="eyebrow">INVESTIGACIÓN COMPLEMENTARIA (MANUAL, COPIAR Y PEGAR)</p>
      <h3 id="gemini-title">Completar análisis</h3>
      <p>Atlas ya revisó los datos deportivos. Este flujo es manual: Atlas no llama a Gemini automáticamente. Sigue los tres pasos en orden.</p>
      <div className="p2-gemini-steps">
        <div className="p2-gemini-step">
          <p className="eyebrow">1 · 🔎 Deep Research</p>
          <ol>
            <li>Copia este prompt.</li>
            <li>Abre Gemini Pro con Deep Research.</li>
            <li>Ejecuta la investigación.</li>
            <li>Copia la respuesta COMPLETA que entregue Deep Research.</li>
          </ol>
          <button type="button" className="secondary-button" onClick={copyResearchPrompt}>Copiar prompt para Gemini Pro + Deep Research</button>
          <details className="p2-source-details"><summary>Revisar prompt completo</summary><pre>{analysis.gemini.prompt}</pre></details>
        </div>
        <div className="p2-gemini-step">
          <p className="eyebrow">2 · 🧹 Pro normal</p>
          <p>Abre un chat aparte de Gemini Pro normal (sin Deep Research). Copia este segundo prompt, pega allí mismo — dentro de Gemini, no en Atlas — la respuesta completa de Deep Research donde el prompt lo indica, y ejecútalo. Este paso solo depura y da formato: no vuelve a investigar, no genera probabilidades ni modifica la probabilidad deportiva ni el sports_score de Atlas. Sigue siendo copiar y pegar: Atlas no llama a Gemini por ti.</p>
          <button type="button" className="secondary-button" onClick={copyCleanupPrompt}>Copiar prompt para Gemini Pro normal</button>
          <details className="p2-source-details"><summary>Revisar prompt de depuración completo</summary><pre>{analysis.gemini.cleanupPrompt}</pre></details>
        </div>
        <div className="p2-gemini-step">
          <p className="eyebrow">3 · ✅ Volver a Atlas</p>
          <p>No pegues aquí el informe largo original de Deep Research. Pega únicamente la respuesta final limpia que te devolvió Gemini Pro normal en el paso 2.</p>
          <label className="p2-textarea-label">
            <span>Pegar aquí solo la respuesta limpia de Gemini Pro normal</span>
            <textarea value={text} onChange={(event) => setText(event.target.value)} rows="12" placeholder="Pega aquí únicamente la respuesta limpia y formateada de Gemini Pro normal…" />
          </label>
        </div>
      </div>
      <div className="p2-inline-actions">
        <button type="button" className="secondary-button" onClick={onNewResearch}>Nueva investigación complementaria</button>
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
            ["Seleccionados", selectedCount],
            ["No seleccionados", unselectedCount],
            ["Rechazados por validación", rejectedCount],
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
  const [settlingBetId, setSettlingBetId] = useState(null);
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

  async function settleBet(betId, outcome) {
    if (settlingBetId) return;
    setSettlingBetId(betId);
    setBetState(state("Liquidando apuesta…", "loading"));
    try {
      const response = await fetch("/api/bets", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ betId, outcome, resultSource: "manual_user_input" }),
      });
      const result = await response.json();
      if (!response.ok) {
        setBetState(state(result?.message || "No fue posible liquidar la apuesta.", "provider_error", result?.errorCode));
        return;
      }
      await loadBets();
    } catch {
      setBetState(state("No fue posible conectar con el registro de apuestas.", "provider_error"));
    } finally {
      setSettlingBetId(null);
    }
  }

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
              ["Medio ganadas", summary.half_won_count],
              ["Perdidas", summary.lost_count],
              ["Medio perdidas", summary.half_lost_count],
              ["Nulas", summary.void_count],
              ["Push", summary.push_count],
              ["Total apostado", `${formatValue(summary.total_staked)} COP`],
              ["Retorno total", `${formatValue(summary.total_payout)} COP`],
              ["Ganancia / pérdida", `${formatValue(summary.net_profit_loss)} COP`],
              ["ROI", summary.roi === null ? null : percentage(summary.roi)],
            ]}
          />
        </section>
      ) : null}

      <div className="p2-history-list">
        {bets.map((bet) => {
          const isCombination = bet.bet_type === "combination";
          const productLabel = bet.product === "dream" ? "Soñadora" : "Parlay";
          return (
            <article key={bet.bet_id} className="p2-history-entry">
              <div>
                <strong>
                  {isCombination
                    ? `${productLabel} · ${bet.legs?.length || 0} patas`
                    : `${bet.home_team || "Local"} vs ${bet.away_team || "Visitante"}`}
                </strong>
                {isCombination ? (
                  <>
                    <span className="p2-chip">{productLabel}</span>
                    <details className="p2-source-details">
                      <summary>Ver {bet.legs?.length || 0} patas</summary>
                      <ol>
                        {(bet.legs || []).map((leg, index) => (
                          <li key={`${bet.bet_id}-${index}`}>
                            <strong>{leg.home_team && leg.away_team ? `${leg.home_team} vs ${leg.away_team}` : leg.fixture || `Partido ${leg.fixture_id}`}</strong>
                            <span>{displaySelection(leg.selection)}{leg.line !== null && leg.line !== undefined ? ` · línea ${leg.line}` : ""} · {displayMarketLabel(leg.market_family)}</span>
                            <small>Soporte Atlas: {leg.sports_score ?? "No disponible"}{leg.decimal_odds ? ` · cuota individual @${leg.decimal_odds}` : ""}</small>
                          </li>
                        ))}
                      </ol>
                    </details>
                  </>
                ) : (
                  <p>
                    {displaySelection(bet.selection)}
                    {bet.line !== null && bet.line !== undefined ? ` · línea ${bet.line}` : ""}
                  </p>
                )}
                <small>
                  {bet.bookmaker} @{bet.decimal_odds} · {formatValue(bet.stake_amount)} {bet.currency}
                </small>
                <small>
                  {isCombination ? `Registrada ${formatDate(bet.placed_at, timezone)}` : formatDate(bet.kickoff_utc, timezone)} · Estado: {displayStatus(bet.status)}
                </small>
                <small>
                  {isCombination ? `Origen de cuota: ${bet.odds_source === "atlas_complete_coverage" ? "Cobertura Atlas completa" : "Informada manualmente"}` : `Atlas: ${bet.atlas_price_decision || "No disponible"}`}
                </small>
                {bet.status !== "pending" ? (
                  <small>
                    Retorno: {formatValue(bet.payout)} {bet.currency} · Ganancia/pérdida: {formatValue(bet.profit_loss)} {bet.currency}
                  </small>
                ) : (
                  <div className="p2-inline-actions p2-result-entry">
                    <button type="button" className="secondary-button" disabled={Boolean(settlingBetId)} onClick={() => settleBet(bet.bet_id, "won")}>Ganada</button>
                    {bet.market_family === "asian_total_goals" ? <button type="button" className="secondary-button" disabled={Boolean(settlingBetId)} onClick={() => settleBet(bet.bet_id, "half_won")}>Media ganada</button> : null}
                    <button type="button" className="secondary-button" disabled={Boolean(settlingBetId)} onClick={() => settleBet(bet.bet_id, "lost")}>Perdida</button>
                    {bet.market_family === "asian_total_goals" ? <button type="button" className="secondary-button" disabled={Boolean(settlingBetId)} onClick={() => settleBet(bet.bet_id, "half_lost")}>Media perdida</button> : null}
                    {bet.market_family === "asian_total_goals" ? <button type="button" className="secondary-button" disabled={Boolean(settlingBetId)} onClick={() => settleBet(bet.bet_id, "push")}>Push</button> : null}
                    <button type="button" className="secondary-button" disabled={Boolean(settlingBetId)} onClick={() => settleBet(bet.bet_id, "void")}>Nula</button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
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
  const primary = analysis?.marketSelection?.primary || null;
  const otherFamilies = bestCandidatePerFamily(
    (analysis?.marketSelection?.ranked_candidates || []).filter((item) => item.ranking_eligible)
  ).filter((item) => item.market_family !== primary?.market_family);
  return (
    <section className="p2-initial-analysis" data-analysis-stage="initial" aria-labelledby="initial-analysis-title">
      <p className="eyebrow">ANÁLISIS INICIAL</p>
      <h2 id="initial-analysis-title">Completar análisis</h2>
      <p>{analysis?.marketSelection?.exact_requested_line_unavailable
        ? "Atlas no pudo calcular exactamente la línea solicitada. Corrige la línea o elige explícitamente una alternativa antes de evaluar una cuota."
        : "Ya revisé los datos deportivos. Ahora puedes introducir la cuota para evaluar el precio; la investigación Gemini es un paso posterior."}</p>
      <div className="p2-initial-selection">
        <strong>{fixture.home_team} vs {fixture.away_team}</strong>
        <span>{analysis?.marketSelection?.exact_requested_line_unavailable ? "Línea exacta no disponible" : displaySelection(primary?.selection || director?.market_evaluated?.label)}</span>
      </div>
      <p className="p2-initial-probability">
        <small><MetricLabel label="Probabilidad estimada Atlas" /></small>
        <strong>{Number.isFinite(primary?.probability_percent) ? `${primary.probability_percent}%` : "No disponible"}</strong>
        {primary?.probability_classification ? <span>{primary.probability_classification}</span> : null}
      </p>
      <p className="p2-solidez-atlas"><small><MetricLabel label="SOLIDEZ ATLAS" /></small> <strong>{Number.isFinite(primary?.sports_score) ? `${primary.sports_score}/100` : "No disponible"}</strong></p>
      <SideComparisonReading sideComparison={director?.side_comparison} oppositeMarket={director?.opposite_market} conclusion={director?.sports_price_conclusion} />
      <WhyAtlasReasoning candidate={primary} marketLabel={director?.market_evaluated?.label} />
      <NumbersExplanation
        label={primary?.selection}
        priceAssessment={director?.price_assessment}
        sportsScore={primary?.sports_score}
        oppositeLabel={director?.opposite_market?.selection}
        oppositeAssessment={director?.opposite_market?.price_assessment}
      />
      {otherFamilies.length ? (
        <section aria-labelledby="initial-other-families-title">
          <h3 id="initial-other-families-title">Otras familias que Atlas comparó</h3>
          <ul>{otherFamilies.map((item) => <li key={item.market_family}>{displaySelection(item.selection)} — {Number.isFinite(item.probability_percent) ? `${item.probability_percent}%` : "No disponible"} {item.probability_classification || ""}</li>)}</ul>
        </section>
      ) : null}
      {director?.price_assessment && director.price_assessment.status !== "unavailable" ? (
        <section className="p2-initial-economic" aria-labelledby="initial-economic-title">
          <p className="eyebrow">EVALUACIÓN ECONÓMICA</p>
          <h3 id="initial-economic-title">Precio evaluado</h3>
          <DefinitionGrid entries={[
            ["Casa", director.price_assessment.bookmaker],
            ["Cuota", director.price_assessment.decimal_odds],
            ["Hora de consulta", director.odds_updated_at ? formatDate(director.odds_updated_at) : null],
            ["Probabilidad implícita", percentage(director.price_assessment.implied_probability)],
            ["Diferencia (edge)", Number.isFinite(director.price_assessment.price_gap_percentage_points) ? `${director.price_assessment.price_gap_percentage_points} pp` : null],
            ["Evaluación de precio", displayStatus(director.price_assessment.status)],
          ]} />
        </section>
      ) : null}
      <p>Introduce la cuota para evaluar el precio; después genera la solicitud para Gemini y pega su respuesta para que Atlas filtre la evidencia.</p>
    </section>
  );
}

function AnalysisResult({ analysis, analysisCompleted, candidateQuotes, onQuoteChange, onEvaluatePrices, showComparison, onAddToManualParlay, manualParlayLegCount }) {
  const [mode, setMode] = useState("simple");
  const directorHeadingRef = useRef(null);
  useEffect(() => {
    const heading = directorHeadingRef.current;
    if (!heading) return;
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [analysis.analysisVersion?.analysis_id]);
  const asianExplanation = analysis.exactSelection?.market_family === "asian_total_goals"
    ? asianSettlementExplanation({ line: analysis.exactSelection.line, direction: analysis.exactSelection.direction })
    : null;
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
          {asianExplanation ? <section className="p2-stage-card"><h3>Cómo se liquida esta línea asiática</h3><p>{asianExplanation}</p></section> : null}
          {analysisCompleted ? (
            <>
              <CompetitiveContextResult context={analysis.competitiveContext} />
              <GeminiContextSummary analysis={analysis} onShowExpert={() => setMode("expert")} />
              <DirectorResult analysis={analysis} headingRef={directorHeadingRef} onShowExpert={() => setMode("expert")} onAddToManualParlay={onAddToManualParlay} manualParlayLegCount={manualParlayLegCount} />
            </>
          ) : <InitialAnalysisResult analysis={analysis} />}
        </div>
      ) : (
        <div data-result-mode="expert">
          {analysis.preliminaryProbability?.asian_settlement_profile ? <details className="p2-source-details"><summary>Probabilidades de liquidación asiática</summary><pre>{JSON.stringify(analysis.preliminaryProbability.asian_settlement_profile, null, 2)}</pre></details> : null}
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

function JourneyCandidateCard({ candidate, primary = false, onOpen, timezone, quoteLedgers }) {
  const fixtureEvidence = candidate.fixtureEvidence?.fixture_id === candidate.fixtureId ? candidate.fixtureEvidence : null;
  const reason = fixtureEvidence?.reasons?.[0] || candidate.whyMarketWon?.replaceAll("sports_score", "análisis deportivo") || "Atlas encontró señales deportivas relevantes para revisar esta opción.";
  const operation = findFixtureQuoteEntry(quoteLedgers?.[String(candidate.fixtureId)], candidate);
  const exactQuote = operation?.quote_state === "current" ? operation.active_quote : null;
  return (
    <article className="p2-candidate-card p2-simple-candidate-card">
      <p className="eyebrow">{candidate.competition}</p>
      <p className="p2-simple-preselection">Opciones encontradas por Atlas</p>
      {primary ? <span className="p2-chip p2-chip-candidate">Mejor opción inicial</span> : null}
      <h3>{candidate.fixture}</h3>
      <p className="p2-simple-selection"><strong>{displaySelection(candidate.selection)}</strong><span>{displayMarket(candidate.marketId || candidate.market)} · línea {candidate.line}</span></p>
      <p className="p2-solidez-atlas"><small><MetricLabel label="SOLIDEZ ATLAS" /></small> <strong>{Number.isFinite(candidate.sportsScore) ? `${candidate.sportsScore}/100` : "No disponible"}</strong></p>
      <p className="p2-simple-probability">
        <small><MetricLabel label="PROBABILIDAD ESTIMADA" /></small>
        {Number.isFinite(candidate.probabilityPercent) ? (
          <>
            <strong>{candidate.probabilityPercent}%</strong>
            <span>{candidate.probabilityClassification}</span>
          </>
        ) : (
          <span>Probabilidad no disponible</span>
        )}
      </p>
      <RadarBadge radar={candidate.radarAnalysis} />
      {candidate.atlasRecommendation ? <p><strong>Motivo deportivo de inclusión:</strong> {candidate.atlasRecommendation.reason}<br /><small>{candidate.atlasRecommendation.frontier_note}</small><br /><small><MetricLabel label="Soporte" /> {candidate.atlasRecommendation.support}/100 · <MetricLabel label="Incertidumbre" /> {Number((candidate.atlasRecommendation.uncertainty_width * 100).toFixed(1))}%</small></p> : null}
      <p>{reason}</p>
      <EconomicsPanel decimalOdds={exactQuote?.decimal_odds} bookmaker={exactQuote?.bookmaker_name} impliedProbability={exactQuote?.implied_probability} estimatedProbability={candidate.estimatedProbability} />
      <small>{formatDate(candidate.kickoff, candidate.timezone || timezone)}</small>
      <button type="button" className="primary-button" onClick={() => onOpen(candidate)}>Analizar esta opción</button>
    </article>
  );
}

const VALUE_STATUS_LABELS = Object.freeze({ interesting: "INTERESANTE", watch: "EN OBSERVACIÓN", no_value: "SIN VALOR", not_evaluable: "NO EVALUABLE" });

function ValueOpportunityCard({ opportunity, onOpen, timezone }) {
  const asian = opportunity.market_family === "asian_total_goals" || opportunity.marketId === "asian_total_goals";
  return (
    <article className="p2-candidate-card p2-value-card">
      <p className="eyebrow">RADAR DE VALOR ATLAS</p>
      <span className={`p2-chip p2-value-${opportunity.status}`}>{VALUE_STATUS_LABELS[opportunity.status] || "NO EVALUABLE"}</span>
      <h3>{opportunity.fixture}</h3>
      <p className="p2-simple-selection"><strong>{displaySelection(opportunity.selection)}</strong><span>{displayMarket(opportunity.marketId || opportunity.market_family)} · línea {opportunity.line}</span></p>
      <p><strong>{opportunity.bookmaker} está pagando {opportunity.decimal_odds}.</strong></p>
      <p>{opportunity.simple_message}</p>
      {Number.isFinite(opportunity.fair_odds_atlas) ? <p>Según Atlas, una cuota cercana a <strong>{opportunity.fair_odds_atlas.toFixed(2)}</strong> sería un precio más equilibrado para el riesgo calculado.</p> : null}
      {asian ? <p>{opportunity.asianSettlementExplanation || "La apuesta conserva la liquidación asiática exacta de la línea."}</p> : null}
      <details>
        <summary>Ver detalle técnico</summary>
        <DefinitionGrid entries={[
          ["Probabilidad Atlas", percentage(opportunity.estimated_probability)],
          ["Cuota ofrecida", opportunity.decimal_odds],
          ["Cuota justa Atlas", Number.isFinite(opportunity.fair_odds_atlas) ? opportunity.fair_odds_atlas.toFixed(4) : "No disponible"],
          ["Probabilidad implícita", percentage(opportunity.implied_probability)],
          ["Raw edge", Number.isFinite(opportunity.raw_edge_pp) ? `${opportunity.raw_edge_pp.toFixed(2)} pp` : "No disponible"],
          ["Edge conservador", Number.isFinite(opportunity.conservative_edge_pp) ? `${opportunity.conservative_edge_pp.toFixed(2)} pp` : "No disponible"],
          ["EV / ROI esperado", Number.isFinite(opportunity.expected_roi) ? percentage(opportunity.expected_roi) : "No disponible"],
          ["SOLIDEZ ATLAS", Number.isFinite(opportunity.sports_score) ? `${opportunity.sports_score}/100` : "No disponible"],
          ["Identidad exacta", `${opportunity.fixture_id}:${opportunity.market_family}:${opportunity.direction}:${opportunity.line}`],
        ]} />
        {opportunity.asian_settlement_profile ? <pre>{JSON.stringify(opportunity.asian_settlement_profile.probabilities, null, 2)}</pre> : null}
        <p><strong>PP:</strong> Puntos porcentuales. 48% frente a 42% = 6 pp.</p>
        <p><strong>EDGE:</strong> Diferencia entre la probabilidad que Atlas estima y lo que exige el precio.</p>
        <p><strong>CUOTA JUSTA:</strong> Precio aproximadamente equilibrado según el riesgo que Atlas calcula.</p>
        <p><strong>EV:</strong> Resultado promedio esperado en situaciones comparables; no garantiza esta apuesta.</p>
        <p><strong>SOLIDEZ:</strong> Respaldo del análisis por los datos disponibles; no es probabilidad.</p>
      </details>
      <small>{formatDate(opportunity.kickoff, opportunity.timezone || timezone)}</small>
      <button type="button" className="primary-button" onClick={() => onOpen(opportunity)}>Analizar esta opción</button>
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
              ["Estado", item.rankedCandidateCount > 0 ? "Evaluado" : "No evaluable"],
              ["Mercados revisados", item.marketAssessmentCount],
              ["Opciones encontradas", item.rankedCandidateCount],
            ]} />

            <details>
              <summary>Ver mercados evaluados</summary>

              <ul>
                {item.marketStatuses?.map((market) => (
                  <li key={market.marketFamily}>
                    {market.marketFamily} — {market.candidate ? "Opción evaluable" : "No evaluable"} ({displayStatus(market.status)})
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
          return <article key={`${candidate.fixtureId}-${candidate.marketId}-${candidate.direction}-${candidate.line}`} className="p2-candidate-card">
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
            <ListBlock title="Razones" items={candidate.fixtureEvidence?.fixture_id === candidate.fixtureId ? candidate.fixtureEvidence.reasons : []} />
            <ListBlock title="Riesgos" items={candidate.fixtureEvidence?.fixture_id === candidate.fixtureId ? candidate.fixtureEvidence.risks : []} />
            <ListBlock title="Datos faltantes" items={candidate.missingData} />
          </article>;
        })}
      </div>
      {operationalRanking.length ? <section className="p2-stage-card"><h3>Clasificación operativa</h3><ol className="p2-operational-ranking">{operationalRanking.map(({ candidate, operation, operational_rank: rank }) => <li key={operation.selection_key}><strong>#{rank} · {displaySelection(candidate.selection)}</strong><p>{operation.active_quote.bookmaker_name} @{operation.active_quote.decimal_odds} · {operation.operational_decision}</p></li>)}</ol></section> : null}
      <details className="p2-source-details"><summary>Ver contrato técnico completo</summary><pre>{JSON.stringify({ journey, quote_ledgers: quoteLedgers }, null, 2)}</pre></details>
    </details>
  );
}

export default function AtlasFunctionalClient({ competitionGroups, markets, specificMarkets = markets, defaultTimezone = "America/Bogota", ownerId = "personal" }) {
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
  const [journeyProductMode, setJourneyProductMode] = useState("classic");
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
  const [oppositeBookmaker, setOppositeBookmaker] = useState("");
  const [oppositeOdds, setOppositeOdds] = useState("");
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
  const [manualParlayLegs, setManualParlayLegs] = useState([]);
  const [manualParlayStatus, setManualParlayStatus] = useState({ status: "idle", message: "" });
  const [selectedQuoteEntry, setSelectedQuoteEntry] = useState(null);
  const fixturesRequest = useRef(null);
  const analysisRequest = useRef(null);

  useEffect(() => {
    queueMicrotask(() => setDate((current) => current || todayLocalDateString()));
  }, []);

  const selectedFixture = fixtures.find(
    (fixture) => String(fixture.fixtureId) === selectedFixtureId
  ) || null;
  const resolvedOptionLine = line.trim() || analysis?.marketSelection?.primary?.line || transferredCandidate?.line || analysis?.director?.line || "";
  const resolvedOptionDirection = selection.trim() || analysis?.marketSelection?.primary?.direction || transferredCandidate?.direction || analysis?.director?.sports_verdict?.direction || "";
  const hasPriceInput = Boolean(bookmaker.trim() || odds.trim() || oddsConsultedAt);
  const manualQuoteReady = Boolean(
    bookmaker.trim() &&
    resolvedOptionLine &&
    odds.trim() &&
    Number(odds.replace(",", ".")) > 1 &&
    resolvedOptionDirection
  );
  const oppositeQuoteReady = Boolean(oppositeBookmaker.trim() && oppositeOdds.trim() && Number(oppositeOdds.replace(",", ".")) > 1);
  const hasDirection = Boolean(resolvedOptionDirection);
  const hasLine = Boolean(resolvedOptionLine);
  const exactRefinementComplete = (!hasDirection && !hasLine) || (hasDirection && hasLine);
  const specificOptionReady = analysisMode !== "specific" || Boolean(marketId && marketId !== "open" && exactRefinementComplete);
  const incompletePriceInput = hasPriceInput && !manualQuoteReady;
  const manualQuoteWarning = manualOddsCopyWarning({ line: resolvedOptionLine, decimalOdds: odds });
  const analysisCompleted = Boolean(analysis?.gemini?.context && analysis?.analysisVersion?.inputs?.reanalysis);
  const analysisForDisplay = analysis && selectedQuoteEntry?.quote_state === "stale" && !analysis.selectedOdds && !analysis.historicalQuote
    ? { ...analysis, historicalQuote: selectedQuoteEntry.latest_known_quote }
    : analysis;
  const staleAnalysisQuote = Boolean(analysisForDisplay?.historicalQuote && !analysisForDisplay?.selectedOdds);
  const quoteTarget = analysisForDisplay?.exactSelection || analysisForDisplay?.marketSelection?.primary || (analysisForDisplay?.director ? {
    market_family: analysisForDisplay.director.market_evaluated?.family || marketId,
    direction: analysisForDisplay.director.sports_verdict?.direction || resolvedOptionDirection,
    selection: analysisForDisplay.director.selection || resolvedOptionDirection,
    line: analysisForDisplay.director.line ?? resolvedOptionLine,
  } : null);
  const quoteTargetReady = Boolean(quoteTarget?.market_family && quoteTarget?.direction && quoteTarget?.line !== null && quoteTarget?.line !== undefined);
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
    setDate(todayLocalDateString());
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

  async function runOperationalAnalysis({ reanalysis = false, lineOverride = null, selectionOverride = null } = {}) {
    analysisRequest.current?.abort();
    const currentAnalysis = analysis;
    setAnalysis(null);
    if (!selectedFixture || !selectedFixtureId) {
      setAnalysisState(state("Selecciona un partido válido de la lista."));
      return;
    }
    const requestedFixtureId = Number(selectedFixtureId);
    const effectiveLine = lineOverride !== null ? String(lineOverride) : line;
    const effectiveSelection = selectionOverride !== null ? selectionOverride : selection;
    const requestedLine = effectiveLine.trim() || currentAnalysis?.marketSelection?.primary?.line || transferredCandidate?.line || (reanalysis ? currentAnalysis?.director?.line : null);
    const reportedDirection = effectiveSelection.trim() || currentAnalysis?.marketSelection?.primary?.direction || transferredCandidate?.direction || currentAnalysis?.director?.sports_verdict?.direction || "";
    const reportedSelection = reportedDirection && requestedLine
      ? `${reportedDirection === "under" ? "Menos de" : "Más de"} ${requestedLine}`
      : reportedDirection;
    const manualMarketFamily = currentAnalysis?.marketSelection?.primary?.market_family || transferredCandidate?.market_family || (analysisMode === "specific" ? marketId : currentAnalysis?.director?.market_evaluated?.family);
    const currentLine = currentAnalysis?.director?.line;
    const currentDirection = currentAnalysis?.director?.sports_verdict?.direction;
    const sameCurrentOption = Number(requestedLine) === Number(currentLine) && reportedDirection === currentDirection;
    const lineOrigin = reanalysis && sameCurrentOption && currentAnalysis?.analysisVersion?.line_origin
      ? currentAnalysis.analysisVersion.line_origin
      : transferredCandidate?.line_origin || (analysisMode === "specific" && requestedLine ? "user_selected" : "atlas_selected");
    const consultedAt = oddsConsultedAt ? localDateTimeToUtcIso(oddsConsultedAt, defaultTimezone) : new Date().toISOString();
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
          sourceAnalysisId: reanalysis && manualQuoteReady ? currentAnalysis?.analysisVersion?.analysis_id || null : null,
          manualOppositeOdds: reanalysis && manualQuoteReady && oppositeQuoteReady ? {
            bookmaker: oppositeBookmaker.trim(),
            decimalOdds: oppositeOdds.trim(),
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

  async function correctLineAndReanalyze() {
    if (!line.trim()) return;
    await runOperationalAnalysis({ reanalysis: true });
  }

  // Contenedor manual de Parlay: cada pierna es un análisis individual ya
  // resuelto por Atlas. Nunca recalcula probabilidad/Solidez/cuota — solo
  // conserva la referencia exacta ya calculada por marketSelection.primary
  // y director. Vive en el componente principal (no en DirectorResult, que
  // remonta con cada análisis) para persistir mientras el usuario analiza
  // varios partidos antes de guardar el Parlay.
  function buildManualParlayLeg(targetAnalysis, presentation) {
    const primary = targetAnalysis?.marketSelection?.primary;
    const director = targetAnalysis?.director;
    const fixture = director?.fixture;
    if (!primary || !director || !fixture?.fixture_id) return null;
    return {
      analysis_id: targetAnalysis?.analysisVersion?.analysis_id || null,
      fixture_id: fixture.fixture_id,
      competition: fixture.competition || null,
      home_team: fixture.home_team || null,
      away_team: fixture.away_team || null,
      kickoff_utc: fixture.kickoff_utc || fixture.kickoff || null,
      market_family: director.market_evaluated?.family || primary.market_family,
      selection: director.selection || primary.selection,
      direction: primary.direction,
      line: director.line ?? primary.line,
      sports_score: primary.sports_score,
      preliminary_probability: primary.estimated_probability,
      decimal_odds: director.price_assessment?.decimal_odds ?? null,
      bookmaker: director.price_assessment?.bookmaker ?? null,
      economic_status: director.price_assessment?.status ?? null,
      atlas_sports_verdict: presentation?.analysis_decision?.label ?? null,
      atlas_price_decision: presentation?.price_decision?.label ?? null,
    };
  }

  function addToManualParlay(targetAnalysis, presentation) {
    const leg = buildManualParlayLeg(targetAnalysis, presentation);
    if (!leg) return { ok: false, message: "No se pudo preparar esta selección para el Parlay." };
    const asianQuarter = leg.market_family === "asian_total_goals" && [0.25, 0.75].includes(((Number(leg.line) % 1) + 1) % 1);
    if (asianQuarter) return { ok: false, message: "Las líneas asiáticas .25/.75 se registran únicamente como apuestas individuales en esta versión." };
    if (manualParlayLegs.length >= 4) return { ok: false, message: "El Parlay manual admite máximo 4 selecciones." };
    if (manualParlayLegs.some((item) => item.fixture_id === leg.fixture_id && item.market_family === leg.market_family)) {
      return { ok: false, message: "Ya existe una selección de este partido y esta familia en el Parlay." };
    }
    setManualParlayLegs((current) => [...current, leg]);
    setManualParlayStatus({ status: "idle", message: "" });
    return { ok: true, message: `Agregada al Parlay manual (${manualParlayLegs.length + 1}/4).` };
  }

  function removeFromManualParlay(index) {
    setManualParlayLegs((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function saveManualParlay() {
    if (manualParlayLegs.length < 2 || manualParlayLegs.length > 4) {
      setManualParlayStatus({ status: "error", message: "El Parlay manual necesita entre 2 y 4 selecciones." });
      return;
    }
    const bookmaker = window.prompt("Casa de apuestas para el Parlay:");
    if (!bookmaker) return;
    const rawOdds = window.prompt("Cuota combinada real ofrecida por la casa para todo el Parlay:");
    if (rawOdds === null) return;
    const decimalOdds = Number(String(rawOdds).replace(",", "."));
    if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) {
      setManualParlayStatus({ status: "error", message: "Introduce una cuota combinada válida mayor que 1." });
      return;
    }
    const rawStake = window.prompt("Monto apostado en COP (ej. 10000):");
    if (rawStake === null) return;
    const stakeAmount = Number(String(rawStake).trim());
    if (!Number.isFinite(stakeAmount) || stakeAmount <= 0) {
      setManualParlayStatus({ status: "error", message: "Introduce un monto válido mayor que cero." });
      return;
    }
    setManualParlayStatus({ status: "loading", message: "Registrando Parlay…" });
    try {
      const response = await fetch("/api/bets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          betType: "combination",
          combinationId: `manual-${Date.now()}`,
          product: "parlay",
          mode: "manual",
          legs: manualParlayLegs,
          bookmaker,
          decimalOdds,
          oddsSource: "manual_user_input",
          stakeAmount,
          currency: "COP",
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setManualParlayStatus({ status: "error", message: result?.message || "No fue posible registrar el Parlay." });
        return;
      }
      setManualParlayLegs([]);
      setManualParlayStatus({ status: "success", message: "Parlay manual registrado correctamente." });
    } catch {
      setManualParlayStatus({ status: "error", message: "No fue posible conectar con el registro de apuestas." });
    }
  }

  async function chooseAlternativeAsExact(alternative) {
    if (!alternative) return;
    setLine(String(alternative.line));
    setSelection(alternative.direction || "");
    await runOperationalAnalysis({ reanalysis: true, lineOverride: String(alternative.line), selectionOverride: alternative.direction || "" });
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
    const storedQuote = candidate.activeQuote || storedOperation?.active_quote || storedOperation?.latest_known_quote || null;
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
              <legend>Capacidad</legend>
              <label><input type="radio" name="journey-product-mode" checked={journeyProductMode === "classic"} onChange={() => setJourneyProductMode("classic")} />ANÁLISIS CLÁSICO</label>
              <label><input type="radio" name="journey-product-mode" checked={journeyProductMode === "value"} onChange={() => setJourneyProductMode("value")} />RADAR DE VALOR</label>
              <small>{journeyProductMode === "classic" ? "Busca las opciones deportivas más sólidas según el modelo actual." : "Busca precios exactos donde la casa parece pagar mejor de lo que Atlas considera justo."}</small>
            </fieldset>
            <fieldset className="p2-market-filters">
              <legend>Modo de análisis</legend>
              <label><input type="radio" name="journey-analysis-mode" checked={journeyAnalysisMode === "general"} onChange={() => { setJourneyAnalysisMode("general"); invalidateJourney(); }} />Buscar mejor opción general</label>
              <label><input type="radio" name="journey-analysis-mode" checked={journeyAnalysisMode === "specific"} onChange={() => { setJourneyAnalysisMode("specific"); setJourneyMarketIds([journeyMarketIds[0] || markets[0]?.id || "goals"]); invalidateJourney(); }} />Analizar un mercado específico</label>
            </fieldset>
            <h3>2 · Elige las competiciones</h3>
            <div className="p2-inline-actions">
              <button type="button" className="secondary-button" onClick={() => { setJourneyCompetitionKeys(competitions.map((competition) => competition.key)); invalidateJourney(); }}>Seleccionar todas</button>
              <button type="button" className="secondary-button" onClick={() => { setJourneyCompetitionKeys([]); invalidateJourney(); }}>Deseleccionar todas</button>
            </div>
            <div className="p2-competition-groups">
              {competitionGroups.map((group) => {
                const groupKeys = group.competitions.map((competition) => competition.key);
                const allGroupSelected = groupKeys.every((key) => journeyCompetitionKeys.includes(key));
                return (
                  <fieldset key={group.id}>
                    <legend>{group.label}</legend>
                    <div className="p2-inline-actions">
                      <button type="button" className="secondary-button" onClick={() => { setJourneyCompetitionKeys((current) => [...new Set([...current, ...groupKeys])]); invalidateJourney(); }} disabled={allGroupSelected}>Seleccionar grupo</button>
                      <button type="button" className="secondary-button" onClick={() => { setJourneyCompetitionKeys((current) => current.filter((key) => !groupKeys.includes(key))); invalidateJourney(); }} disabled={!journeyCompetitionKeys.some((key) => groupKeys.includes(key))}>Deseleccionar grupo</button>
                    </div>
                    {group.competitions.map((competition) => (
                      <label key={competition.key}>
                        <input type="checkbox" checked={journeyCompetitionKeys.includes(competition.key)} onChange={() => toggleJourneyCompetition(competition.key)} />
                        <span>{competition.localName}<small>{displayStatus(competition.verificationStatus)}</small></span>
                      </label>
                    ))}
                  </fieldset>
                );
              })}
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
          </div>

          <button type="button" className="primary-button p2-primary" onClick={scanJourney} disabled={journeyState.status === "loading"}>
            {journeyState.status === "loading" ? "Escaneando jornada…" : "Escanear jornada"}
          </button>
          <StatusNotice value={journeyState} />

          {journey && journeyProductMode === "classic" ? (
            <section className="p2-journey-result" aria-labelledby="journey-summary-title">
              <h3 id="journey-summary-title">RECOMENDADAS POR ATLAS</h3>
              <p>{journey.recommendedCandidates?.length ? `${journey.recommendedCandidates.length} selecciones destacadas por Atlas. El catálogo completo sigue disponible abajo.` : "ATLAS no encontró selecciones con suficiente respaldo para destacar en esta jornada."}</p>
              <div className="p2-candidate-grid">
                {(journey.recommendedCandidates || []).map((candidate, index) => <JourneyCandidateCard key={`${candidate.fixtureId}-${candidate.marketId}-${candidate.direction}-${candidate.line}`} candidate={candidate} primary={index === 0} onOpen={openCandidate} timezone={defaultTimezone} quoteLedgers={fixtureQuoteLedgers} />)}
              </div>
              <details className="p2-source-details"><summary>OTRAS OPCIONES ANALIZADAS — {Math.max(0, (journey.candidates || []).length - (journey.recommendedCandidates || []).length)}</summary><div className="p2-candidate-grid">{(journey.candidates || []).filter((candidate) => !(journey.recommendedCandidates || []).some((recommended) => recommended.fixtureId === candidate.fixtureId && recommended.marketId === candidate.marketId && recommended.direction === candidate.direction && recommended.line === candidate.line)).map((candidate) => <JourneyCandidateCard key={`${candidate.fixtureId}-${candidate.marketId}-${candidate.direction}-${candidate.line}`} candidate={candidate} onOpen={openCandidate} timezone={defaultTimezone} quoteLedgers={fixtureQuoteLedgers} />)}</div></details>
             <JourneyMatchesReviewed journey={journey} />
             <JourneyTechnicalDetails journey={journey} quoteLedgers={fixtureQuoteLedgers} operationalRanking={journeyOperationalRanking} quoteCoverage={journeyQuoteCoverage} technicalLabel="Respaldo deportivo" />
            </section>
          ) : journey && journeyProductMode === "value" ? (
            <section className="p2-journey-result" aria-labelledby="value-radar-title">
              <h3 id="value-radar-title">RADAR DE VALOR ATLAS</h3>
              <p>Solo se evalúan selecciones con identidad y cuota exactas. Una cuota alta no gana por ser alta.</p>
              {journey.valueRadar?.message ? <p><small>{journey.valueRadar.message}</small></p> : null}
              {journey.valueRadar?.opportunities?.length ? <div className="p2-candidate-grid">{journey.valueRadar.opportunities.map((opportunity) => <ValueOpportunityCard key={`${opportunity.fixture_id}-${opportunity.market_family}-${opportunity.direction}-${opportunity.line}-${opportunity.quote_id}`} opportunity={opportunity} onOpen={openCandidate} timezone={defaultTimezone} />)}</div> : <StatusNotice value={state(journey.valueRadar?.message || "No hay cuotas exactas vigentes para evaluar el Radar de Valor.", "empty")} />}
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
            <li>Partido</li><li>Opción</li><li>Análisis deportivo</li><li>Cuota</li><li>Investigación Gemini</li><li>Decisión final</li>
          </ol>
          {transferredCandidate ? (
            <section className="p2-transferred-candidate" aria-labelledby="transferred-candidate-title">
              <p className="eyebrow">Candidato transferido desde la jornada</p>
              <h3 id="transferred-candidate-title">{specificMarkets.find((item) => item.id === transferredCandidate.market_family)?.label || transferredCandidate.market_family} · {transferredCandidate.direction === "over" ? "Más de" : "Menos de"} {transferredCandidate.line}</h3>
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
                    {specificMarkets.map((market) => <option key={market.id} value={market.id}>{market.label}</option>)}
                  </select>
                </label>
                <p>Con la familia es suficiente: Atlas determinará automáticamente la dirección y la línea.</p>
                <label><span>Dirección (opcional)</span><select value={selection} onChange={(event) => { setSelection(event.target.value); invalidateAnalysis(); }}><option value="">Atlas la determinará</option><option value="over">Más de</option><option value="under">Menos de</option></select></label>
                <label><span>Línea (opcional)</span><input inputMode="decimal" value={line} onChange={(event) => { setLine(event.target.value); invalidateAnalysis(); }} placeholder="Atlas la determinará" /></label>
                <small>{hasDirection !== hasLine ? "Para forzar una selección exacta debes completar Dirección y Línea." : "Si quieres forzar una selección exacta, completa Dirección y Línea."}</small>
              </section>
            ) : (
              <section className="p2-entry-panel p2-atlas-forecast" aria-labelledby="atlas-forecast-form-title">
                <p className="eyebrow" id="atlas-forecast-form-title">OPCIÓN SELECCIONADA</p>
                {analysisMode === "specific" ? <label>
                  <span>5 · Familia de mercado</span>
                  <select value={marketId} disabled>
                  {specificMarkets.map((market) => <option key={market.id} value={market.id}>{market.label}</option>)}
                  </select>
                </label> : <div className="p2-family-copy"><strong>Atlas comparará las cinco familias.</strong><small>La cuota no participa en esta comparación inicial; se evaluará únicamente al final.</small></div>}
                <label><span>Mercado candidato</span><input readOnly value={analysis?.director?.market_evaluated?.label || specificMarkets.find((item) => item.id === transferredCandidate?.market_family)?.label || "Atlas lo determinará"} /></label>
                <label><span>Selección candidata</span><input readOnly value={analysis?.director?.selection || transferredCandidate?.selection ? displaySelection(analysis?.director?.selection || transferredCandidate?.selection) : "Atlas la determinará"} /></label>
                <label><span>Línea sugerida</span><input readOnly value={analysis?.director?.line ?? transferredCandidate?.line ?? "Atlas la determinará"} /></label>
              </section>
            )}
          </div>
          {!analysis?.director ? <button type="button" className="primary-button p2-primary" onClick={analyzeSelectedFixture} disabled={analysisState.status === "loading" || !selectedFixtureId || !specificOptionReady}>{analysisState.status === "loading" ? "Analizando el partido…" : "Analizar deportivamente"}</button> : null}
          <StatusNotice value={analysisState} />
          {analysisForDisplay?.director ? <AnalysisResult key={`${analysisForDisplay.selectedFixtureId}-${analysisForDisplay.analysisVersion?.analysis_id || "result"}`} analysis={analysisForDisplay} analysisCompleted={analysisCompleted} candidateQuotes={candidateQuotes} onQuoteChange={updateCandidateQuote} onEvaluatePrices={() => runOperationalAnalysis({ reanalysis: true })} showComparison={showActiveComparison} onAddToManualParlay={addToManualParlay} manualParlayLegCount={manualParlayLegs.length} /> : null}
          <ManualParlayPanel legs={manualParlayLegs} onRemove={removeFromManualParlay} onSave={saveManualParlay} status={manualParlayStatus} />
          {quoteTargetReady || analysis?.marketSelection?.exact_requested_line_unavailable ? <section className="p2-entry-panel p2-user-quote p2-final-quote-entry" aria-labelledby="user-quote-form-title">
            <p className="eyebrow" id="user-quote-form-title">EVALUAR CUOTA ACTUAL</p>
            <label>
              <span>Línea exacta de tu casa</span>
              <input inputMode="decimal" value={line} onChange={(event) => setLine(event.target.value)} placeholder={String(analysis?.director?.line ?? analysis?.marketSelection?.requested_line ?? "")} />
              <small>Si tu casa ofrece una línea distinta, corrígela aquí primero y reanaliza. Esto no requiere casa, cuota ni hora todavía, y no reutiliza la probabilidad de la línea anterior.</small>
            </label>
            <button type="button" className="secondary-button" onClick={correctLineAndReanalyze} disabled={!line.trim() || (analysis?.director?.line != null && Number(line) === Number(analysis?.director?.line)) || analysisState.status === "loading"}>Corregir línea de la casa y reanalizar</button>

            {analysis?.marketSelection?.exact_requested_line_unavailable ? (
              <div className="p2-quote-warning">
                <p><strong>Línea exacta no disponible:</strong> {analysis.marketSelection.explanation}</p>
                <p>Primero ATLAS debe calcular esta línea. Puedes conservar la casa y la cuota mientras corriges los datos o eliges una alternativa calculada.</p>
                {(analysis.marketSelection.alternatives || []).length ? (
                  <ul>
                    {analysis.marketSelection.alternatives.map((alt) => (
                      <li key={alt.candidate_id}>
                        <button type="button" className="secondary-button" onClick={() => chooseAlternativeAsExact(alt)} disabled={analysisState.status === "loading"}>
                          Usar {displaySelection(alt.selection)} como selección exacta
                        </button>
                        <small> {Number.isFinite(alt.probability_percent) ? `${alt.probability_percent}%` : "No disponible"} {alt.probability_classification || ""} <em>(alternativa, no la línea pedida)</em></small>
                      </li>
                    ))}
                  </ul>
                ) : <small>Atlas no encontró alternativas calculables en esta familia.</small>}
              </div>
            ) : null}
            <>
                <p>{staleAnalysisQuote ? "La cuota anterior venció. Introduce un precio actual para volver a decidir." : analysisCompleted ? "Puedes actualizar la cuota si cambió desde la última consulta." : "Con el análisis deportivo listo, introduce la cuota para evaluar el precio; Gemini es un paso posterior."}</p>
                <DefinitionGrid entries={[["Mercado", analysis?.director?.market_evaluated?.label || quoteTarget?.market_family || marketId], ["Dirección", displaySelection(quoteTarget?.selection || selection)], ["Línea", quoteTarget?.line ?? line]].filter(([, value]) => value !== null && value !== undefined && value !== "")} />
                <label><span>Casa de apuestas</span><input value={bookmaker} onChange={(event) => setBookmaker(event.target.value)} placeholder="Ej. Betano" /></label>
                <label><span>Cuota decimal actual</span><input inputMode="decimal" value={odds} onChange={(event) => setOdds(event.target.value)} placeholder="Ej. 1.95" /></label>
                <label><span>Hora de consulta (opcional)</span><input type="datetime-local" value={oddsConsultedAt} onChange={(event) => setOddsConsultedAt(event.target.value)} /><small>{defaultTimezone === "America/Bogota" ? "Hora de Colombia" : defaultTimezone}</small></label>
                {manualQuoteWarning ? <small className="p2-quote-warning">{manualQuoteWarning}</small> : null}
                <details className="p2-source-details p2-opposite-quote">
                  <summary>Cuota del lado contrario (opcional)</summary>
                  <small>Solo evalúa el lado contrario si introduces su cuota. Atlas nunca inventa una cuota contraria.</small>
                  <label><span>Casa de apuestas (contraria)</span><input value={oppositeBookmaker} onChange={(event) => setOppositeBookmaker(event.target.value)} placeholder="Ej. Betano" /></label>
                  <label><span>Cuota decimal (contraria)</span><input inputMode="decimal" value={oppositeOdds} onChange={(event) => setOppositeOdds(event.target.value)} placeholder="Ej. 1.93" /></label>
                </details>
                {incompletePriceInput ? <small>Completa casa y cuota para evaluar el precio.</small> : null}
                {!quoteTargetReady ? <small>Primero ATLAS debe calcular esta línea.</small> : null}
                <button type="button" className="primary-button p2-primary" onClick={reanalyzeWithManualOdds} disabled={!quoteTargetReady || !manualQuoteReady || analysisState.status === "loading"}>{staleAnalysisQuote ? "Actualizar cuota" : analysis?.selectedOdds ? "Actualizar decisión con esta cuota" : "EVALUAR CUOTA"}</button>
              </>
          </section> : null}
          {!analysisCompleted ? <GeminiWorkflow analysis={analysis} text={geminiText} setText={setGeminiText} context={geminiContext} selectedIds={selectedGeminiIds} toggleItem={toggleGeminiItem} onValidate={validateGeminiContext} onReanalyze={reanalyzeWithContext} onNewResearch={startNewGeminiResearch} status={geminiState} /> : null}
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
