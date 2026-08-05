"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildConservativeParlays } from "@/core/intelligence/parlayPolicy";
import { localDateTimeToUtcIso } from "@/core/intelligence/dateTimeContext";

const LOAD_STATES = new Set([
  "loading",
  "success",
  "empty",
  "ambiguous",
  "unavailable",
  "insufficient_data",
  "provider_error",
  "blocked",
]);

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
  stale: "Vencido",
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
  over: "Más de",
  under: "Menos de",
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
  return STATUS_LABELS[value] || String(value || "No disponible").replaceAll("_", " ");
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
        <summary>Ver fixtures usados ({profile.fixture_ids?.length || 0})</summary>
        <p>{profile.fixture_ids?.join(", ") || "Ninguno"}</p>
      </details>
    </>
  );
}

const DIRECTOR_DECISIONS = Object.freeze({
  suitable_under_conditions: { icon: "✓", title: "SÍ — APTO PARA CONSIDERACIÓN", tone: "yes" },
  viable_with_caution: { icon: "!", title: "SOLO CON CAUTELA", tone: "caution" },
  review_only: { icon: "…", title: "TODAVÍA NO — FALTA EVALUAR LA CUOTA", tone: "not-yet" },
  not_viable: { icon: "×", title: "NO — MERCADO NO VIABLE", tone: "no" },
  blocked: { icon: "!", title: "NO — ANÁLISIS BLOQUEADO", tone: "blocked" },
  insufficient_data: { icon: "?", title: "TODAVÍA NO — INFORMACIÓN INSUFICIENTE", tone: "insufficient" },
});

function VersionComparison({ analysis, expert = false }) {
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
        ["Fixture ID", comparison?.fixture_id || analysis?.analysisVersion?.fixture_id],
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

function DirectorResult({ analysis, headingRef, onShowExpert }) {
  const director = analysis?.director;
  const [candidateSaved, setCandidateSaved] = useState(false);
  if (!director) return null;
  const decision = DIRECTOR_DECISIONS[director.market_suitability] || DIRECTOR_DECISIONS.insufficient_data;
  const timezone = director.fixture?.timezone || "America/Bogota";
  const oddsStatus = director.odds_freshness === "stale"
    ? "Cuota vencida — no utilizar para decidir"
    : director.odds
      ? `${displayStatus(director.odds_source_status)}${Number.isFinite(director.odds_age_minutes) ? ` · consultada hace ${director.odds_age_minutes} min` : ""}`
      : "Cuota no disponible";
  const isUpdated = Boolean(analysis.changesSincePrevious?.comparable || analysis.analysisVersion?.inputs?.reanalysis);
  const sports = director.sports_verdict;
  const price = director.price_assessment;
  return (
    <section className={`director-atlas-panel functional-director p2-director p2-director-${decision.tone}`} aria-label="Dictamen del Director Atlas" aria-labelledby="director-atlas-title">
      <div className="p2-director-kicker">DICTAMEN DEL DIRECTOR ATLAS · {isUpdated ? "Dictamen actualizado" : displayStatus(director.temporal_status)}</div>
      <div className="p2-decision-banner">
        <span className="p2-decision-icon" aria-hidden="true">{decision.icon}</span>
        <div className="p2-director-heading">
          <h2 id="director-atlas-title" ref={headingRef} tabIndex="-1">{director.display_status || decision.title}</h2>
          <p>{director.verdict}</p>
        </div>
      </div>
      <div className="p2-director-summary">
        <div><small>Respuesta directa</small><strong>{director.decision_code === "yes" ? "Sí" : director.decision_code === "no" ? "No" : director.decision_code === "caution" ? "Solo con cautela" : "Todavía no"}</strong></div>
        <div><small>Opción seleccionada</small><strong>{sports?.selection || director.selection || "Sin selección"}</strong></div>
        <div><small>Probabilidad preliminar</small><strong>{percentage(sports?.preliminary_probability ?? director.estimated_probability)}</strong><span>{sports ? `${percentage(sports.uncertainty_low)}–${percentage(sports.uncertainty_high)}` : "Sin intervalo"}</span></div>
        <div><small>Confianza del análisis</small><strong>{director.analysis_confidence_score || 0}%</strong><span>No es probabilidad de acierto.</span></div>
        <div><small>Precio</small><strong>{displayStatus(price?.status || director.odds_freshness)}</strong><span>{price?.bookmaker || "Casa pendiente"}</span></div>
        <div><small>Parlay</small><strong>{displayStatus(director.parlay_eligibility)}</strong></div>
      </div>
      <div className="p2-split p2-verdict-split">
        <section className="p2-verdict-block">
          <p className="eyebrow">PRONÓSTICO DEPORTIVO</p>
          <DefinitionGrid entries={[
            ["Mercado", director.market_evaluated?.label],
            ["Selección y línea", sports?.selection || director.selection],
            ["Probabilidad preliminar", percentage(sports?.preliminary_probability)],
            ["Incertidumbre", `${percentage(sports?.uncertainty_low)}–${percentage(sports?.uncertainty_high)}`],
            ["Muestra efectiva ponderada", formatEffectiveSample(director.probability_effective_sample, 1)],
          ]} />
          <p className="p2-sample-note">Las submuestras pueden solaparse y no equivalen a partidos independientes.</p>
          <p>{sports?.message}</p>
          <p className="p2-sample-note">{director.line_origin_message}</p>
          {director.user_requested_option ? <p><strong>Opción evaluada por solicitud del usuario.</strong></p> : null}
        </section>
        <section className="p2-verdict-block">
          <p className="eyebrow">EVALUACIÓN DE PRECIO</p>
          <DefinitionGrid entries={[
            ["Estado", displayStatus(price?.status)],
            ["Casa", price?.bookmaker],
            ["Cuota activa", price?.decimal_odds],
            ["Probabilidad implícita", price?.implied_probability === null || price?.implied_probability === undefined ? null : `${(price.implied_probability * 100).toFixed(2)}%`],
          ]} />
          <p>{price?.message}</p>
          <p className="p2-sample-note">{price?.model_notice}</p>
        </section>
        <section className="p2-verdict-block">
          <p className="eyebrow">APTITUD INDIVIDUAL</p>
          <h3>{displayStatus(director.individual_eligibility)}</h3>
          <p>{director.individual_eligibility_reason}</p>
        </section>
        <section className="p2-verdict-block">
          <p className="eyebrow">ELEGIBILIDAD PARA PARLAY</p>
          <h3>{displayStatus(director.parlay_eligibility)}</h3>
          <p>{director.parlay_eligibility_reason}</p>
        </section>
      </div>
      <DefinitionGrid entries={[
          ["Partido", director.fixture ? `${director.fixture.home_team} vs ${director.fixture.away_team}` : null],
          ["Competición", director.fixture?.competition],
          [`Fecha y hora · ${timezone === "America/Bogota" ? "Hora de Colombia" : timezone}`, formatDate(director.fixture?.kickoff_utc || director.fixture?.kickoff, timezone)],
          ["Mercado mejor respaldado", director.market_evaluated?.label],
          ["Selección", director.selection],
          ["Línea", director.line],
          ["Cuota", director.odds],
          ["Casa de apuestas", director.bookmaker],
          ["Estado de la cuota", oddsStatus],
          ["Probabilidad implícita de la cuota", director.implied_probability === null || director.implied_probability === undefined ? null : `${(director.implied_probability * 100).toFixed(2)}%`],
          ["Confianza del análisis", director.analysis_confidence_score === undefined ? `${director.technical_support}/100` : `${director.analysis_confidence_score}% · ${displayStatus(director.confidence_label)}`],
          ["Probabilidad estimada preliminar", percentage(director.estimated_probability)],
          ["Rango de incertidumbre", director.probability_status === "preliminary" ? `${percentage(director.probability_uncertainty_low)}–${percentage(director.probability_uncertainty_high)}` : "No disponible"],
          ["Aptitud individual", displayStatus(director.individual_eligibility)],
          ["Elegibilidad para parlay", displayStatus(director.parlay_eligibility)],
          ["Fase", displayStatus(director.analysis_phase)],
        ]} />
        <p className="p2-confidence-note">{director.temporal_message}</p>
        {director.context_reanalysis_message ? <p className="p2-confidence-note"><strong>{director.context_reanalysis_message}</strong></p> : null}
        <div className="p2-four-columns">
          <ListBlock title="Explicación simple" items={(director.simple_reasons || director.reasons || []).slice(0, 3)} />
          <ListBlock title="Qué podría cambiarlo" items={(director.what_may_change || director.risks || []).slice(0, 3)} />
          <ListBlock title="Evaluación de precio" items={[price?.message]} />
          <ListBlock title="Acción" items={[director.next_action]} />
        </div>
        <p className="p2-confidence-note">Confianza del análisis: {director.analysis_confidence_score || 0}% — {displayStatus(director.confidence_label)}. Este porcentaje mide calidad y coherencia de la evidencia; no es una probabilidad de acierto ni representa la probabilidad de ganar.</p>
        {director.probability_status === "preliminary" ? <p className="p2-confidence-note">Modelo preliminar, aún no validado con suficiente historial. La estimación no afirma valor esperado.</p> : <p className="p2-confidence-note">La probabilidad deportiva no está disponible porque la línea, la cobertura o la muestra no cumplen la metodología documentada.</p>}
        <div className="p2-four-columns p2-technical-summary">
          <ListBlock title="Razón principal" items={[director.primary_reason]} />
          <ListBlock title="Evidencia favorable principal" items={[director.primary_supporting_evidence]} />
          <ListBlock title="Evidencia contraria principal" items={[director.primary_opposing_evidence]} />
          <ListBlock title="Condición bloqueante" items={[director.blocking_condition]} empty="No hay un bloqueo crítico informado." />
        </div>
        <div className="p2-four-columns">
          <ListBlock title="Razones" items={director.reasons} />
          <ListBlock title="Riesgos" items={director.risks} />
          <ListBlock title="Qué falta" items={director.missing_data} />
          <ListBlock title="Qué evitar" items={director.avoid} />
        </div>
        <ListBlock title="Condiciones" items={director.conditions} />
        <div className="p2-director-actions">
          <div className="p2-next-action"><small>Próxima acción</small><strong>{director.next_action}</strong></div>
          <div className="p2-next-action"><small>Cuándo reanalizar</small><strong>{director.next_review}</strong></div>
        </div>
        {analysis.parlayCandidate ? <button type="button" className="secondary-button" onClick={() => setCandidateSaved(true)}>{candidateSaved ? "Candidato guardado en esta versión" : "Agregar como candidato a parlay"}</button> : null}
        <GeminiContextSummary analysis={analysis} onShowExpert={onShowExpert} />
        <p className="p2-user-decision">Atlas informa; la decisión final corresponde al usuario.</p>
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

function ExpertResult({ analysis }) {
  const fixture = analysis.fixture;
  const metadata = analysis.competitionMetadata;
  const league = analysis.leagueProfile;
  const referee = analysis.refereeProfile;
  const venue = analysis.venueWeatherContext;
  const telemetry = analysis.telemetry;
  return (
    <div className="p2-expert" data-result-mode="expert">
      <Accordion id="expert-identity" title="Identidad del fixture" summary="ID, fecha, liga y temporada">
        <DefinitionGrid entries={[
          ["Fixture ID", fixture?.fixtureId],
          ["Partido", fixture ? `${fixture.teams.home.name} vs ${fixture.teams.away.name}` : null],
          ["Inicio", formatDate(fixture?.date?.utc)],
          ["Competición", analysis.competition?.localName],
          ["Temporada", fixture?.competition?.season],
          ["Estado", fixture?.status?.long],
        ]} />
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
          ["Casa", analysis.selectedOdds?.bookmaker_name],
          ["Mercado", analysis.selectedOdds?.market_name],
          ["Mejor cuota comparable", analysis.bestComparableOdds?.decimal_odds],
          ["Selección", analysis.selectedOdds?.selection],
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
        <details className="p2-source-details"><summary>Ver componentes</summary><pre>{JSON.stringify(analysis.confidence?.components || [], null, 2)}</pre></details>
      </Accordion>

      <Accordion id="expert-version-diff" title="Versión temporal y cambios" summary={analysis.analysisVersion?.phase || "Sin versión"}>
        <VersionComparison analysis={analysis} expert />
        {!analysis.changesSincePrevious && !analysis.analysisVersion?.inputs?.reanalysis ? <p>Esta es la primera versión conservada para el fixture.</p> : null}
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

function GeminiWorkflow({ analysis, text, setText, context, selectedIds, toggleItem, onValidate, onReanalyze, status }) {
  if (!analysis?.gemini?.prompt) return null;
  async function copyPrompt() {
    await navigator.clipboard.writeText(analysis.gemini.prompt);
  }
  return (
    <section className="p2-gemini-flow" aria-labelledby="gemini-title">
      <p className="eyebrow">Investigación complementaria manual</p>
      <h3 id="gemini-title">Gemini, sin conexión automática</h3>
      <p>Atlas prepara la solicitud. La respuesta pegada empieza como información reportada por el usuario y nunca sustituye al fixture, línea o cuota.</p>
      <button type="button" className="secondary-button" onClick={copyPrompt}>Copiar solicitud para Gemini</button>
      <details className="p2-source-details"><summary>Revisar solicitud completa</summary><pre>{analysis.gemini.prompt}</pre></details>
      <label className="p2-textarea-label">
        <span>Pegar respuesta de Gemini</span>
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows="12" placeholder="Pega aquí la respuesta obtenida manualmente…" />
      </label>
      <div className="p2-inline-actions">
        <button type="button" className="secondary-button" onClick={onValidate} disabled={!text.trim() || status.status === "loading"}>Validar contexto</button>
        <button type="button" className="primary-button p2-primary" onClick={onReanalyze} disabled={!context?.valid_for_reanalysis || selectedIds.length === 0 || status.status === "loading"}>Reanalizar con contexto</button>
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
                <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleItem(item.id)} />
                <span>
                  <strong>{displayStatus(item.kind)}</strong>
                  {item.summary || "Sin resumen disponible."}
                  <small>Fuente: {item.source || "No informada"}</small>
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
        <label><span>Fixture ID</span><input inputMode="numeric" value={filters.fixtureId} onChange={(event) => setFilters({ ...filters, fixtureId: event.target.value })} /></label>
        <label><span>Estado</span><input value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} /></label>
        <label><span>Mercado</span><input value={filters.market} onChange={(event) => setFilters({ ...filters, market: event.target.value })} /></label>
        <label><span>Fase</span><input value={filters.phase} onChange={(event) => setFilters({ ...filters, phase: event.target.value })} /></label>
      </div>
      <div className="p2-inline-actions">
        <button type="button" className="primary-button p2-primary" onClick={loadHistory}>Buscar historial</button>
        <a className="secondary-button p2-download" href="/api/operational-history?format=json">Exportar JSON</a>
        <button type="button" className="secondary-button" onClick={deleteSelectedVersion} disabled={selected.length !== 1}>Eliminar versión seleccionada</button>
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
          ["Mismo fixture", compared[0].fixture_id === compared[1].fixture_id],
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

function AnalysisResult({ analysis }) {
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
          <button type="button" role="tab" aria-selected={mode === "expert"} onClick={() => setMode("expert")}>Ver análisis técnico completo</button>
        </div>
      </div>
      {mode === "simple" ? (
        <div data-result-mode="simple">
          <DirectorResult analysis={analysis} headingRef={directorHeadingRef} onShowExpert={() => setMode("expert")} />
          <VersionComparison analysis={analysis} />
        </div>
      ) : (
        <ExpertResult analysis={analysis} />
      )}
    </section>
  );
}

export default function AtlasFunctionalClient({ competitionGroups, markets, defaultTimezone = "America/Bogota" }) {
  const competitions = useMemo(
    () => competitionGroups.flatMap((group) => group.competitions),
    [competitionGroups]
  );
  const initialCompetition = competitions[0] || null;
  const [mainMode, setMainMode] = useState("journey");
  const [date, setDate] = useState("");
  const [journeyCompetitionKeys, setJourneyCompetitionKeys] = useState(
    initialCompetition ? [initialCompetition.key] : []
  );
  const [journeyMarketIds, setJourneyMarketIds] = useState(markets.map((market) => market.id));
  const [journeyAnalysisMode, setJourneyAnalysisMode] = useState("general");
  const [maximumFixtures, setMaximumFixtures] = useState(5);
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
  const [intendedUse, setIntendedUse] = useState("individual");
  const [analysisState, setAnalysisState] = useState(state("Selecciona un partido; Atlas nunca ejecuta el análisis automáticamente."));
  const [analysis, setAnalysis] = useState(null);
  const [geminiText, setGeminiText] = useState("");
  const [geminiContext, setGeminiContext] = useState(null);
  const [selectedGeminiIds, setSelectedGeminiIds] = useState([]);
  const [geminiState, setGeminiState] = useState(state("La investigación Gemini es opcional y manual."));
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

  function clearTemporaryQuote() {
    setLine("");
    setOdds("");
    setBookmaker("");
    setSelection("");
    setOddsConsultedAt("");
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
    setGeminiContext(null);
    setSelectedGeminiIds([]);
    setGeminiState(state("La investigación Gemini es opcional y manual."));
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
    setGeminiState(state("La investigación Gemini es opcional y manual."));
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
      ? `${reportedDirection === "under" ? "Under" : "Over"} ${requestedLine}`
      : reportedDirection;
    const manualMarketFamily = transferredCandidate?.market_family || (analysisMode === "specific" ? marketId : currentAnalysis?.director?.market_evaluated?.family);
    const currentLine = currentAnalysis?.director?.line;
    const currentDirection = currentAnalysis?.director?.sports_verdict?.direction;
    const sameCurrentOption = Number(requestedLine) === Number(currentLine) && reportedDirection === currentDirection;
    const lineOrigin = reanalysis && sameCurrentOption && currentAnalysis?.analysisVersion?.line_origin
      ? currentAnalysis.analysisVersion.line_origin
      : transferredCandidate?.line_origin || (analysisMode === "specific" && requestedLine ? "user_selected" : "atlas_selected");
    const consultedAt = oddsConsultedAt ? localDateTimeToUtcIso(oddsConsultedAt, defaultTimezone) : null;
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
          odds: odds.trim() || null,
          selection: reportedSelection || null,
          manualOdds: manualQuoteReady ? {
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
          transferredCandidate,
          intendedUse,
          geminiContext: reanalysis ? geminiContext : null,
          selectedGeminiItemIds: reanalysis ? selectedGeminiIds : [],
          reanalysis,
        }),
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (Number(result?.selectedFixtureId) !== requestedFixtureId) {
        setAnalysisState(state("Atlas rechazó una respuesta que no conservó el fixture seleccionado.", "blocked", "fixture_id_changed"));
        return;
      }
      if (transferredCandidate && result?.marketSelection?.primary?.market_family !== transferredCandidate.market_family) {
        setAnalysisState(state("Atlas rechazó un resultado que cambió la familia del candidato transferido.", "blocked", "transferred_candidate_changed"));
        return;
      }
      setAnalysis(result);
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
    if (!geminiContext?.valid_for_reanalysis || !selectedGeminiIds.length) return;
    setGeminiState(state("Reanalizando con los elementos seleccionados…", "loading"));
    await runOperationalAnalysis({ reanalysis: true });
    setGeminiState(state("Nueva versión inmutable creada con contexto manual seleccionado.", "success"));
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
      reasons: candidate.reasons,
      risks: candidate.risks,
      methodology_version: candidate.methodologyVersion,
    };
    const transferred = { ...transferredBase, line_origin: transferredBase.line_origin || "transferred_candidate" };
    setTransferredCandidate(transferred);
    setAnalysisMode("specific");
    setMarketId(transferred.market_family);
    setLine(String(transferred.line));
    setSelection(transferred.direction);
    setOdds("");
    setBookmaker("");
    setOddsConsultedAt("");
    setFixtures([{
      fixtureId: candidate.fixtureId,
      label: candidate.fixture,
      date: { utc: candidate.kickoff, kickoff_utc: candidate.kickoff, timezone: candidate.timezone || defaultTimezone },
      status: { long: "Candidato de la jornada" },
    }]);
    setSelectedFixtureId(String(candidate.fixtureId));
    setFixturesState(state("Candidato transferido. El fixture ID permanece inmutable.", "success"));
    setAnalysis(null);
    setAnalysisState(state("Candidato completo transferido. Continúa con este candidato para crear el análisis individual."));
  }

  return (
    <div className="p2-app">
      <nav className="p2-main-tabs" aria-label="Modos principales">
        <button type="button" aria-current={mainMode === "journey" ? "page" : undefined} onClick={() => setMainMode("journey")}>Explorar jornada</button>
        <button type="button" aria-current={mainMode === "match" ? "page" : undefined} onClick={() => setMainMode("match")}>Analizar partido</button>
        <button type="button" aria-current={mainMode === "history" ? "page" : undefined} onClick={() => setMainMode("history")}>Historial</button>
        <button type="button" className="secondary-button" onClick={startNewSearch}>Nueva búsqueda</button>
      </nav>

      {mainMode !== "history" ? <div className="p2-shared-date">
        <label>
          <span>1 · Elige la fecha</span>
          <input type="date" value={date} onChange={(event) => changeDate(event.target.value)} />
        </label>
        <p>Una sola fecha mantiene la consulta controlada y hace visible el contexto exacto.</p>
      </div> : null}

      {mainMode === "journey" ? (
        <section className="p2-mode" aria-labelledby="journey-title">
          <div className="p2-mode-heading">
            <p className="eyebrow">Exploración guiada</p>
            <h2 id="journey-title">Explorar jornada</h2>
            <p>Atlas revisa hasta el límite indicado y destaca como máximo cinco candidatos por calidad, muestra, respaldo y riesgos.</p>
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
              <small>Todos están seleccionados inicialmente. El respaldo técnico no es probabilidad.</small>
            </fieldset>
            <label>
              <span>4 · Máximo de partidos a revisar</span>
              <input type="number" min="1" max="10" value={maximumFixtures} onChange={(event) => { setMaximumFixtures(Math.max(1, Math.min(10, Number(event.target.value) || 1))); invalidateJourney(); }} />
              <small>Entre 1 y 10; el resultado nunca supera cinco candidatos.</small>
            </label>
          </div>

          <button type="button" className="primary-button p2-primary" onClick={scanJourney} disabled={journeyState.status === "loading"}>
            {journeyState.status === "loading" ? "Escaneando jornada…" : "Escanear jornada"}
          </button>
          <StatusNotice value={journeyState} />

          {journey ? (
            <section className="p2-journey-result" aria-labelledby="journey-summary-title">
              <h3 id="journey-summary-title">Resumen de jornada</h3>
              <DefinitionGrid entries={[
                ["Competiciones consultadas", journey.competitionsQueried?.join(", ")],
                ["Fixtures encontrados", journey.fixturesFound],
                ["Fixtures revisados", journey.fixturesReviewed],
                ["Fixtures descartados", journey.fixturesDiscarded],
                ["Fixtures analizables", journey.analyzableFixtures],
                ["Candidatos destacados", journey.candidates?.length],
                ["Solicitudes usadas", journey.telemetry?.requestsUsed],
                ["Aciertos de caché", journey.telemetry?.cacheHits],
                ["Tiempo de ejecución", `${journey.executionTimeMs || 0} ms`],
              ]} />
              <ListBlock title="Advertencias" items={journey.warnings} />
              <div className="p2-candidate-grid">
                {(journey.candidates || []).map((candidate) => (
                  <article key={`${candidate.fixtureId}-${candidate.marketId}`} className="p2-candidate-card">
                    <p className="eyebrow">{candidate.competition}</p>
                    <h3>{candidate.fixture}</h3>
                    <p>{formatDate(candidate.kickoff, candidate.timezone || defaultTimezone)} · {candidate.timezone === "America/Bogota" || !candidate.timezone ? "Hora de Colombia" : candidate.timezone}</p>
                    <small className="p2-secondary-id">Fixture ID {candidate.fixtureId}</small>
                    <DefinitionGrid entries={[
                      ["Mercado", candidate.market],
                      ["Selección", candidate.selection],
                      ["Línea", candidate.line],
                      ["Probabilidad preliminar", percentage(candidate.probability)],
                      ["Incertidumbre", `${percentage(candidate.uncertaintyLow)}–${percentage(candidate.uncertaintyHigh)}`],
                      ["Estado de cuota", displayStatus(candidate.priceStatus)],
                      ["Estado", candidate.displayStatus],
                      ["Respaldo técnico", `${candidate.technicalSupport}/100`],
                      ["Muestra efectiva ponderada", formatEffectiveSample(candidate.sampleSize, 1)],
                    ]} />
                    <p className="p2-sample-note">Las submuestras pueden solaparse y no equivalen a partidos independientes.</p>
                    <section className="p2-market-comparison" aria-label="Por qué ganó este mercado">
                      <h4>Por qué ganó este mercado</h4>
                      <DefinitionGrid entries={[
                        ["Posición en el ranking general", candidate.generalRank],
                        ["Sports score", `${candidate.sportsScore ?? candidate.technicalSupport}/100`],
                        ["Familias comparadas", candidate.familiesCompared?.join(", ")],
                      ]} />
                      <p>{candidate.whyMarketWon}</p>
                      <details><summary>Ver comparación de mercados</summary><ul>{(candidate.familyComparison || []).map((family) => <li key={family.market_family}><strong>{family.market_label}</strong>: {family.best_score === null ? "sin puntaje" : `${family.best_score}/100`} · {family.reason}</li>)}</ul></details>
                    </section>
                    <ListBlock title="Razones" items={candidate.reasons} />
                    <ListBlock title="Riesgos" items={candidate.risks} />
                    <ListBlock title="Datos faltantes" items={candidate.missingData} />
                    <div className="p2-next-action"><small>Próxima acción</small><strong>{candidate.nextAction}</strong></div>
                    <button type="button" className="secondary-button" onClick={() => openCandidate(candidate)}>Abrir análisis profundo</button>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </section>
      ) : mainMode === "match" ? (
        <section className="p2-mode" aria-labelledby="match-title">
          <div className="p2-mode-heading">
            <p className="eyebrow">Selección estricta</p>
            <h2 id="match-title">Analizar partido</h2>
            <p>Carga la lista, selecciona el partido exacto y decide si Atlas debe revisar todos los mercados o uno específico.</p>
          </div>

          <ol className="p2-flow-steps" aria-label="Flujo del análisis">
            <li>Datos del partido</li><li>Datos deportivos</li><li>Mercado y cuota</li><li>Investigación Gemini</li><li>Validación del contexto</li><li>Reanálisis</li><li>Dictamen final</li>
          </ol>
          {transferredCandidate ? (
            <section className="p2-transferred-candidate" aria-labelledby="transferred-candidate-title">
              <p className="eyebrow">Candidato transferido desde la jornada</p>
              <h3 id="transferred-candidate-title">{markets.find((item) => item.id === transferredCandidate.market_family)?.label || transferredCandidate.market_family} · {transferredCandidate.direction === "over" ? "Más de" : "Menos de"} {transferredCandidate.line}</h3>
              <DefinitionGrid entries={[
                ["Probabilidad preliminar", percentage(transferredCandidate.preliminary_probability)],
                ["Incertidumbre", `${percentage(transferredCandidate.uncertainty?.low)}–${percentage(transferredCandidate.uncertainty?.high)}`],
                ["Respaldo deportivo", `${transferredCandidate.sports_score}/100`],
                ["Posición general", transferredCandidate.rank],
              ]} />
              <div className="p2-inline-actions">
                <button type="button" className="primary-button" onClick={() => runOperationalAnalysis({ reanalysis: false })} disabled={analysisState.status === "loading"}>Continuar con este candidato</button>
                <button type="button" className="secondary-button" onClick={() => { setMainMode("journey"); setTransferredCandidate(null); clearTemporaryQuote(); }}>Volver a comparar todas las opciones</button>
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
                  <span><strong>{fixture.label || `${fixture.teams.home.name} vs ${fixture.teams.away.name}`}</strong><small>{formatDate(fixture.date?.kickoff_utc || fixture.date?.utc, fixture.date?.timezone || defaultTimezone)} · {fixture.date?.timezone === "America/Bogota" || !fixture.date?.timezone ? "Hora de Colombia" : fixture.date.timezone} · {fixture.status?.long}</small><small className="p2-secondary-id">Fixture ID {fixture.fixtureId}</small></span>
                </label>
              ))}
            </fieldset>
          ) : null}

          <div className="p2-market-entry">
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
                <p className="eyebrow" id="atlas-forecast-form-title">PRONÓSTICO DE ATLAS</p>
                {analysisMode === "specific" ? <label>
                  <span>5 · Familia de mercado</span>
                  <select value={marketId} disabled>
                  {markets.map((market) => <option key={market.id} value={market.id}>{market.label}</option>)}
                  </select>
                </label> : <div className="p2-family-copy"><strong>Atlas comparará las cinco familias.</strong><small>La cuota no participa en el ranking deportivo.</small></div>}
                <label><span>Mercado candidato</span><input readOnly value={analysis?.director?.market_evaluated?.label || markets.find((item) => item.id === transferredCandidate?.market_family)?.label || "Atlas lo determinará"} /></label>
                <label><span>Selección candidata</span><input readOnly value={analysis?.director?.selection || transferredCandidate?.selection || "Atlas la determinará"} /></label>
                <label><span>Línea sugerida</span><input readOnly value={analysis?.director?.line ?? transferredCandidate?.line ?? "Atlas la determinará"} /></label>
              </section>
            )}
            <section className="p2-entry-panel p2-user-quote" aria-labelledby="user-quote-form-title">
              <p className="eyebrow" id="user-quote-form-title">PRECIO ENCONTRADO</p>
              <p className="p2-sample-note">Opcional. La casa y la cuota se asociarán únicamente con la opción mostrada a la izquierda.</p>
              <label><span>Casa</span><input value={bookmaker} onChange={(event) => setBookmaker(event.target.value)} placeholder="Ej. Betano" /></label>
              <label><span>Cuota decimal</span><input inputMode="decimal" value={odds} onChange={(event) => setOdds(event.target.value)} placeholder="Ej. 1.65" /></label>
              <label><span>Hora de consulta</span><input type="datetime-local" value={oddsConsultedAt} onChange={(event) => setOddsConsultedAt(event.target.value)} /><small>{defaultTimezone === "America/Bogota" ? "Hora de Colombia" : defaultTimezone}</small></label>
              {incompletePriceInput ? <small>Completa casa, cuota y hora, o deja los tres campos vacíos para analizar sin precio.</small> : null}
            </section>
          </div>
          <fieldset className="p2-market-filters p2-intended-use">
            <legend>Uso previsto</legend>
            {[['individual', 'Evaluación individual'], ['parlay', 'Considerar para parlay'], ['both', 'Ambos']].map(([value, label]) => <label key={value}><input type="radio" name="intended-use" value={value} checked={intendedUse === value} onChange={() => setIntendedUse(value)} />{label}</label>)}
            <small>Esta elección no altera los datos deportivos ni la estimación.</small>
          </fieldset>
          <button type="button" className="primary-button p2-primary" onClick={analyzeSelectedFixture} disabled={analysisState.status === "loading" || !selectedFixtureId || !specificOptionReady || incompletePriceInput}>{analysisState.status === "loading" ? "Analizando partido…" : analysisMode === "specific" && !transferredCandidate ? manualQuoteReady ? "Analizar esta opción y cuota" : "Analizar esta opción sin cuota" : transferredCandidate ? "Reanalizar este candidato" : "6 · Analizar partido"}</button>
          {analysis?.director ? <div className="p2-inline-actions"><button type="button" className="secondary-button" onClick={() => runOperationalAnalysis({ reanalysis: true })} disabled={analysisState.status === "loading"}>Repetir análisis</button><button type="button" className="primary-button" onClick={reanalyzeWithManualOdds} disabled={!manualQuoteReady || analysisState.status === "loading"}>{analysisMode === "specific" ? "Analizar esta opción y cuota" : "Evaluar el precio encontrado"}</button></div> : null}
          <StatusNotice value={analysisState} />
          {analysis?.director ? <AnalysisResult key={`${analysis.selectedFixtureId}-${analysis.telemetry?.finishedAt || "result"}`} analysis={analysis} /> : null}
          {analysis?.selectedOdds?.freshness === "stale" ? <div className="p2-stale-action"><p>La cotización anterior venció. Introduce arriba la casa, la cuota y la hora actuales para la misma opción.</p><button type="button" className="primary-button p2-primary" onClick={reanalyzeWithManualOdds} disabled={!manualQuoteReady || analysisState.status === "loading"}>Evaluar el precio encontrado</button></div> : null}
          <GeminiWorkflow analysis={analysis} text={geminiText} setText={setGeminiText} context={geminiContext} selectedIds={selectedGeminiIds} toggleItem={toggleGeminiItem} onValidate={validateGeminiContext} onReanalyze={reanalyzeWithContext} status={geminiState} />
        </section>
      ) : <HistoryView timezone={defaultTimezone} />}
    </div>
  );
}
