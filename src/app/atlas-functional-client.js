"use client";

import { useMemo, useRef, useState } from "react";

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
  verified: "Verificado",
  partial: "Cobertura parcial",
  insufficient_sample: "Muestra insuficiente",
  experimental: "Experimental hasta verificar",
  confirmed: "Confirmado",
  probable: "Probable",
  missing: "No informado",
  unsupported: "No soportado",
  observe_only: "Solo observar",
  analysis_only: "Solo análisis",
  market_review_only: "Solo revisar mercado",
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

function formatDate(value) {
  if (!value) return "Fecha no disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "No disponible";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(value);
  return displayStatus(value);
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
  return (
    <div className={`p2-status p2-status-${safeStatus(value.status)}`} role="status">
      <strong>{displayStatus(value.status)}</strong>
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

function DirectorResult({ analysis }) {
  const director = analysis?.director;
  if (!director) return null;
  return (
    <Accordion
      id="director-atlas"
      title="Dictamen del Director Atlas"
      summary={director.display_status}
      defaultOpen
    >
      <div className="director-atlas-panel functional-director p2-director">
        <div className="p2-director-heading">
          <span className={`p2-chip p2-chip-${director.status}`}>{director.display_status}</span>
          <p>{director.verdict}</p>
        </div>
        <DefinitionGrid entries={[
          ["Partido", director.fixture ? `${director.fixture.home_team} vs ${director.fixture.away_team}` : null],
          ["Competición", director.fixture?.competition],
          ["Mercado mejor respaldado", director.market_evaluated?.label],
          ["Respaldo técnico", `${director.technical_support}/100`],
          ["Probabilidad", director.probability_status === "unavailable" ? "No disponible" : director.estimated_probability],
          ["Nivel operativo", displayStatus(director.operational_level)],
          ["Parlay", displayStatus(director.parlay_authorization)],
        ]} />
        <div className="p2-four-columns">
          <ListBlock title="Razones principales" items={director.reasons} />
          <ListBlock title="Riesgos" items={director.risks} />
          <ListBlock title="Datos faltantes" items={director.missing_data} />
          <ListBlock title="Qué evitar" items={director.avoid} />
        </div>
        <div className="p2-next-action">
          <small>Próxima acción</small>
          <strong>{director.next_action}</strong>
        </div>
      </div>
    </Accordion>
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

      <Accordion id="expert-markets" title="Evaluación por mercado" summary="Cinco familias, sin probabilidad inventada">
        <div className="p2-market-grid">
          {(analysis.marketAssessments || []).map((market) => (
            <MarketAssessment key={market.market_family} market={market} />
          ))}
        </div>
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

function AnalysisResult({ analysis }) {
  const [mode, setMode] = useState("simple");
  return (
    <section className="p2-result" aria-labelledby="result-title">
      <div className="p2-result-heading">
        <div>
          <p className="eyebrow">Resultado</p>
          <h2 id="result-title">Lectura del partido</h2>
        </div>
        <div className="p2-view-tabs" role="tablist" aria-label="Nivel de detalle">
          <button type="button" role="tab" aria-selected={mode === "simple"} onClick={() => setMode("simple")}>Modo sencillo</button>
          <button type="button" role="tab" aria-selected={mode === "expert"} onClick={() => setMode("expert")}>Modo experto</button>
        </div>
      </div>
      {mode === "simple" ? (
        <div data-result-mode="simple"><DirectorResult analysis={analysis} /></div>
      ) : (
        <ExpertResult analysis={analysis} />
      )}
    </section>
  );
}

export default function AtlasFunctionalClient({ competitionGroups, markets }) {
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
  const [line, setLine] = useState("");
  const [odds, setOdds] = useState("");
  const [analysisState, setAnalysisState] = useState(state("Selecciona un partido; Atlas nunca ejecuta el análisis automáticamente."));
  const [analysis, setAnalysis] = useState(null);
  const fixturesRequest = useRef(null);
  const analysisRequest = useRef(null);

  const selectedFixture = fixtures.find(
    (fixture) => String(fixture.fixtureId) === selectedFixtureId
  ) || null;

  function invalidateJourney(message = "Los filtros cambiaron. Vuelve a escanear la jornada.") {
    journeyRequest.current?.abort();
    setJourney(null);
    setJourneyState(state(message));
  }

  function invalidateAnalysis(message = "Los filtros cambiaron. Vuelve a ejecutar el análisis.", clearFixture = false) {
    analysisRequest.current?.abort();
    setAnalysis(null);
    setAnalysisState(state(message));
    if (clearFixture) setSelectedFixtureId("");
  }

  function changeDate(value) {
    fixturesRequest.current?.abort();
    setDate(value);
    const competition = competitions.find((item) => item.key === competitionKey);
    setSeason(String(seasonFor(competition, value)));
    setFixtures([]);
    setFixturesState(state("Carga los partidos para la nueva fecha."));
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
          competitionKeys: journeyCompetitionKeys,
          marketIds: journeyMarketIds,
          maximumFixtures,
        }),
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      setJourney(result);
      setJourneyState(state(result?.message || "No fue posible interpretar el resultado.", safeStatus(result?.status), result?.errorCode));
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
    invalidateAnalysis(undefined, true);
  }

  async function loadFixtures() {
    fixturesRequest.current?.abort();
    setFixtures([]);
    invalidateAnalysis("Selecciona un partido después de cargar la lista.", true);
    if (!date || !competitionKey || !season) {
      setFixturesState(state("Fecha, competición y temporada son obligatorias."));
      return;
    }
    const controller = new AbortController();
    fixturesRequest.current = controller;
    setFixturesState(state("Cargando partidos exactos del proveedor…", "loading"));
    try {
      const params = new URLSearchParams({ date, leagueKey: competitionKey, season });
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
    setSelectedFixtureId(String(fixtureId));
    invalidateAnalysis(`Partido seleccionado. Pulsa “Analizar partido” para continuar.`);
  }

  async function analyzeSelectedFixture() {
    analysisRequest.current?.abort();
    setAnalysis(null);
    if (!selectedFixture || !selectedFixtureId) {
      setAnalysisState(state("Selecciona un partido válido de la lista."));
      return;
    }
    const requestedFixtureId = Number(selectedFixtureId);
    const controller = new AbortController();
    analysisRequest.current = controller;
    setAnalysisState(state("Construyendo perfiles y evaluando mercados…", "loading"));
    try {
      const response = await fetch("/api/football/match-intelligence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          date,
          competitionKey,
          season,
          fixtureId: requestedFixtureId,
          marketId,
          line: line.trim() || null,
          odds: odds.trim() || null,
        }),
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (Number(result?.selectedFixtureId) !== requestedFixtureId) {
        setAnalysisState(state("Atlas rechazó una respuesta que no conservó el fixture seleccionado.", "blocked", "fixture_id_changed"));
        return;
      }
      setAnalysis(result);
      setAnalysisState(state(result?.message || "El análisis no está disponible.", safeStatus(result?.status), result?.errorCode));
    } catch (error) {
      if (error?.name === "AbortError") return;
      setAnalysisState(state("No fue posible completar el análisis.", "provider_error", "client_analysis_failed"));
    }
  }

  function openCandidate(candidate) {
    const competition = competitions.find((item) => item.key === candidate.competitionKey);
    setMainMode("match");
    setDate(candidate.kickoff?.slice(0, 10) || date);
    setCompetitionKey(candidate.competitionKey);
    setSeason(String(candidate.season || seasonFor(competition, candidate.kickoff)));
    setMarketId(candidate.marketId || "open");
    setFixtures([{
      fixtureId: candidate.fixtureId,
      label: candidate.fixture,
      date: { utc: candidate.kickoff },
      status: { long: "Candidato de la jornada" },
    }]);
    setSelectedFixtureId(String(candidate.fixtureId));
    setFixturesState(state("Candidato transferido. El fixture ID permanece inmutable.", "success"));
    setAnalysis(null);
    setAnalysisState(state("Revisa la selección y pulsa “Analizar partido”."));
  }

  return (
    <div className="p2-app">
      <nav className="p2-main-tabs" aria-label="Modos principales">
        <button type="button" aria-current={mainMode === "journey" ? "page" : undefined} onClick={() => setMainMode("journey")}>Explorar jornada</button>
        <button type="button" aria-current={mainMode === "match" ? "page" : undefined} onClick={() => setMainMode("match")}>Analizar partido</button>
      </nav>

      <div className="p2-shared-date">
        <label>
          <span>1 · Elige la fecha</span>
          <input type="date" value={date} onChange={(event) => changeDate(event.target.value)} />
        </label>
        <p>Una sola fecha mantiene la consulta controlada y hace visible el contexto exacto.</p>
      </div>

      {mainMode === "journey" ? (
        <section className="p2-mode" aria-labelledby="journey-title">
          <div className="p2-mode-heading">
            <p className="eyebrow">Exploración guiada</p>
            <h2 id="journey-title">Explorar jornada</h2>
            <p>Atlas revisa hasta el límite indicado y destaca como máximo cinco candidatos por calidad, muestra, respaldo y riesgos.</p>
          </div>

          <div className="p2-filter-section">
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
                  <input type="checkbox" checked={journeyMarketIds.includes(market.id)} onChange={() => toggleJourneyMarket(market.id)} />
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
                    <p>{formatDate(candidate.kickoff)}</p>
                    <small className="p2-secondary-id">Fixture ID {candidate.fixtureId}</small>
                    <DefinitionGrid entries={[
                      ["Mercado", candidate.market],
                      ["Estado", candidate.displayStatus],
                      ["Respaldo técnico", `${candidate.technicalSupport}/100`],
                      ["Tamaño de muestra", candidate.sampleSize],
                    ]} />
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
      ) : (
        <section className="p2-mode" aria-labelledby="match-title">
          <div className="p2-mode-heading">
            <p className="eyebrow">Selección estricta</p>
            <h2 id="match-title">Analizar partido</h2>
            <p>Carga la lista, selecciona el partido exacto y decide si Atlas debe revisar todos los mercados o uno específico.</p>
          </div>

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
                  <span><strong>{fixture.label || `${fixture.teams.home.name} vs ${fixture.teams.away.name}`}</strong><small>{formatDate(fixture.date?.utc)} · {fixture.status?.long}</small><small className="p2-secondary-id">Fixture ID {fixture.fixtureId}</small></span>
                </label>
              ))}
            </fieldset>
          ) : null}

          <div className="p2-filter-grid p2-market-entry">
            <label>
              <span>5 · Mercado</span>
              <select value={marketId} onChange={(event) => { setMarketId(event.target.value); invalidateAnalysis(); }}>
                <option value="open">Todos los compatibles</option>
                {markets.map((market) => <option key={market.id} value={market.id}>{market.label}</option>)}
              </select>
            </label>
            <label><span>Línea (opcional)</span><input value={line} onChange={(event) => { setLine(event.target.value); invalidateAnalysis(); }} placeholder="Ej. más de 2,5" /></label>
            <label><span>Cuota (opcional)</span><input value={odds} onChange={(event) => { setOdds(event.target.value); invalidateAnalysis(); }} placeholder="Ej. 1.85" /></label>
          </div>
          <button type="button" className="primary-button p2-primary" onClick={analyzeSelectedFixture} disabled={analysisState.status === "loading" || !selectedFixtureId}>{analysisState.status === "loading" ? "Analizando partido…" : "6 · Analizar partido"}</button>
          <StatusNotice value={analysisState} />
          {analysis?.director ? <AnalysisResult key={`${analysis.selectedFixtureId}-${analysis.telemetry?.finishedAt || "result"}`} analysis={analysis} /> : null}
        </section>
      )}
    </div>
  );
}
