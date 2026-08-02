"use client";

import { useMemo, useRef, useState } from "react";

const KNOWN_LOAD_STATES = new Set([
  "loading",
  "success",
  "empty",
  "ambiguous",
  "provider_error",
  "unavailable",
]);

function safeLoadState(value) {
  return KNOWN_LOAD_STATES.has(value) ? value : "provider_error";
}

function initialState(message) {
  return {
    status: "unavailable",
    message,
    errorCode: null,
  };
}

function formatFixtureDate(value) {
  if (!value) return "Fecha no disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function AtlasFunctionalClient({ leagues, markets }) {
  const initialLeague = leagues[0] || null;
  const [date, setDate] = useState("");
  const [leagueKey, setLeagueKey] = useState(initialLeague?.key || "");
  const [season, setSeason] = useState(
    initialLeague ? String(initialLeague.currentSeason) : ""
  );
  const [fixturesState, setFixturesState] = useState(
    initialState("Selecciona fecha y liga para cargar fixtures.")
  );
  const [fixtures, setFixtures] = useState([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState("");
  const [marketId, setMarketId] = useState(markets[0]?.id || "goals");
  const [analysisState, setAnalysisState] = useState(
    initialState("Selecciona un fixture; el análisis nunca se ejecuta automáticamente.")
  );
  const [analysis, setAnalysis] = useState(null);
  const fixturesRequest = useRef(null);
  const analysisRequest = useRef(null);

  const selectedFixture = useMemo(
    () =>
      fixtures.find(
        (fixture) => String(fixture.fixtureId) === selectedFixtureId
      ) || null,
    [fixtures, selectedFixtureId]
  );

  function clearSelection(message = "Selecciona un fixture para analizarlo.") {
    analysisRequest.current?.abort();
    setSelectedFixtureId("");
    setAnalysis(null);
    setAnalysisState(initialState(message));
  }

  function handleDateChange(value) {
    fixturesRequest.current?.abort();
    setDate(value);
    if (/^\d{4}-/.test(value)) setSeason(value.slice(0, 4));
    setFixtures([]);
    setFixturesState(initialState("Carga los fixtures para la nueva fecha."));
    clearSelection();
  }

  function handleLeagueChange(value) {
    fixturesRequest.current?.abort();
    const league = leagues.find((item) => item.key === value);
    setLeagueKey(value);
    if (!date && league) setSeason(String(league.currentSeason));
    setFixtures([]);
    setFixturesState(initialState("Carga los fixtures para la nueva liga."));
    clearSelection();
  }

  function handleSeasonChange(value) {
    fixturesRequest.current?.abort();
    setSeason(value);
    setFixtures([]);
    setFixturesState(
      initialState("Carga los fixtures para la nueva temporada.")
    );
    clearSelection();
  }

  async function loadFixtures() {
    fixturesRequest.current?.abort();
    analysisRequest.current?.abort();
    setFixtures([]);
    clearSelection();

    if (!date || !leagueKey || !season) {
      setFixturesState(
        initialState("Fecha, liga y temporada son obligatorias.")
      );
      return;
    }

    const controller = new AbortController();
    fixturesRequest.current = controller;
    setFixturesState({
      status: "loading",
      message: "Cargando fixtures exactos del proveedor…",
      errorCode: null,
    });

    const params = new URLSearchParams({ date, leagueKey, season });

    try {
      const response = await fetch(`/api/football/fixtures?${params}`, {
        signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted) return;

      const status = safeLoadState(result?.status);
      setFixturesState({
        status,
        message:
          result?.message || "No fue posible interpretar la respuesta de fixtures.",
        errorCode: result?.errorCode || null,
      });
      setFixtures(status === "success" ? result.fixtures || [] : []);
    } catch (error) {
      if (error?.name === "AbortError") return;
      setFixturesState({
        status: "provider_error",
        message: "No fue posible cargar los fixtures.",
        errorCode: "client_request_failed",
      });
    }
  }

  function chooseFixture(fixtureId) {
    analysisRequest.current?.abort();
    setSelectedFixtureId(String(fixtureId));
    setAnalysis(null);
    setAnalysisState(
      initialState(
        `Fixture ${fixtureId} seleccionado. Pulsa “Analizar fixture” para continuar.`
      )
    );
  }

  async function analyzeSelectedFixture() {
    analysisRequest.current?.abort();
    setAnalysis(null);

    if (!selectedFixtureId || !selectedFixture) {
      setAnalysisState(initialState("Selecciona un fixture válido de la lista."));
      return;
    }

    const requestedFixtureId = Number(selectedFixtureId);
    const controller = new AbortController();
    analysisRequest.current = controller;
    setAnalysisState({
      status: "loading",
      message: `Cargando datos del fixture ${requestedFixtureId}…`,
      errorCode: null,
    });

    try {
      const response = await fetch("/api/football/fixture-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          date,
          leagueKey,
          season,
          fixtureId: requestedFixtureId,
          marketId,
        }),
      });
      const result = await response.json();
      if (controller.signal.aborted) return;

      if (Number(result?.selectedFixtureId) !== requestedFixtureId) {
        setAnalysisState({
          status: "provider_error",
          message:
            "Atlas rechazó la respuesta porque no conserva el fixture ID seleccionado.",
          errorCode: "fixture_id_changed",
        });
        return;
      }

      const status = safeLoadState(result?.status);
      setAnalysisState({
        status,
        message: result?.message || "El análisis no está disponible.",
        errorCode: result?.errorCode || null,
      });
      setAnalysis(result);
    } catch (error) {
      if (error?.name === "AbortError") return;
      setAnalysisState({
        status: "provider_error",
        message: "No fue posible completar el análisis del fixture.",
        errorCode: "client_analysis_failed",
      });
    }
  }

  return (
    <div className="functional-flow">
      <section className="functional-step" aria-labelledby="filters-title">
        <div className="functional-step-heading">
          <span>1</span>
          <div>
            <h2 id="filters-title">Fecha y competición</h2>
            <p>La consulta se limita a una liga y una fecha exactas.</p>
          </div>
        </div>

        <div className="functional-filter-grid">
          <label>
            Fecha
            <input
              type="date"
              value={date}
              onInput={(event) => handleDateChange(event.currentTarget.value)}
            />
          </label>

          <label>
            Competición / liga
            <select
              value={leagueKey}
              onChange={(event) => handleLeagueChange(event.target.value)}
            >
              {leagues.map((league) => (
                <option key={league.key} value={league.key}>
                  {league.localName}
                </option>
              ))}
            </select>
          </label>

          <label>
            Temporada
            <input
              inputMode="numeric"
              value={season}
              onChange={(event) => handleSeasonChange(event.target.value)}
              aria-describedby="season-help"
            />
            <small id="season-help">
              Para estas ligas, debe coincidir con el año de la fecha.
            </small>
          </label>
        </div>

        <button
          type="button"
          className="primary-button functional-button"
          onClick={loadFixtures}
          disabled={fixturesState.status === "loading"}
        >
          {fixturesState.status === "loading"
            ? "Cargando partidos…"
            : "Cargar partidos"}
        </button>

        <StatusNotice state={fixturesState} />
      </section>

      {fixturesState.status === "success" && fixtures.length > 0 && (
        <section className="functional-step" aria-labelledby="fixtures-title">
          <div className="functional-step-heading">
            <span>2</span>
            <div>
              <h2 id="fixtures-title">Partidos disponibles</h2>
              <p>Selecciona explícitamente un fixture ID.</p>
            </div>
          </div>

          <fieldset className="fixture-choice-list">
            <legend className="sr-only">Fixtures disponibles</legend>
            {fixtures.map((fixture) => (
              <label
                key={fixture.fixtureId}
                className={`fixture-choice ${
                  selectedFixtureId === String(fixture.fixtureId)
                    ? "selected"
                    : ""
                }`}
              >
                <input
                  type="radio"
                  name="fixtureId"
                  value={fixture.fixtureId}
                  checked={selectedFixtureId === String(fixture.fixtureId)}
                  onChange={() => chooseFixture(fixture.fixtureId)}
                />
                <span className="fixture-id">ID {fixture.fixtureId}</span>
                <strong>
                  {fixture.teams.home.name} vs {fixture.teams.away.name}
                </strong>
                <small>
                  {formatFixtureDate(fixture.date.utc)} · {fixture.status.long}
                </small>
              </label>
            ))}
          </fieldset>
        </section>
      )}

      {selectedFixture && (
        <section className="functional-step" aria-labelledby="analysis-title">
          <div className="functional-step-heading">
            <span>3</span>
            <div>
              <h2 id="analysis-title">Análisis del fixture seleccionado</h2>
              <p>
                Atlas mantendrá el ID {selectedFixture.fixtureId} durante toda
                la ejecución.
              </p>
            </div>
          </div>

          <div className="selected-fixture-card">
            <strong>
              {selectedFixture.teams.home.name} vs
              {" "}
              {selectedFixture.teams.away.name}
            </strong>
            <span>Fixture ID: {selectedFixture.fixtureId}</span>
            <small>{formatFixtureDate(selectedFixture.date.utc)}</small>
          </div>

          <label className="market-selector">
            Mercado a evaluar
            <select
              value={marketId}
              onChange={(event) => {
                setMarketId(event.target.value);
                setAnalysis(null);
                setAnalysisState(
                  initialState("Pulsa “Analizar fixture” para evaluar el nuevo mercado.")
                );
              }}
            >
              {markets.map((market) => (
                <option key={market.id} value={market.id}>
                  {market.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="primary-button functional-button"
            onClick={analyzeSelectedFixture}
            disabled={analysisState.status === "loading"}
          >
            {analysisState.status === "loading"
              ? "Analizando fixture…"
              : "Analizar fixture"}
          </button>

          <StatusNotice state={analysisState} />
        </section>
      )}

      {analysis?.director && (
        <section
          className="director-atlas-panel functional-director"
          aria-labelledby="director-title"
        >
          <div className="director-atlas-header">
            <strong id="director-title">{analysis.director.title}</strong>
            <span>{analysis.director.status}</span>
          </div>

          <h2>{analysis.director.verdict}</h2>

          <div className="functional-director-grid">
            <div>
              <small>Fixture ID</small>
              <p>{analysis.director.selectedFixtureId}</p>
            </div>
            <div>
              <small>Mercado</small>
              <p>{analysis.director.market}</p>
            </div>
            <div>
              <small>Probabilidad</small>
              <p>{analysis.director.probabilityStatus}</p>
            </div>
            <div>
              <small>Parlay</small>
              <p>{analysis.director.parlayStatus}</p>
            </div>
            <div>
              <small>Pick accionable</small>
              <p>{analysis.director.canRecommend ? "Sí" : "No"}</p>
            </div>
            <div>
              <small>Cobertura actual</small>
              <p>{analysis.marketAssessment.coverage}</p>
            </div>
          </div>

          <DirectorList title="Razones" items={analysis.director.reasons} />
          <DirectorList
            title="Datos faltantes"
            items={analysis.director.missingData}
          />
          <DirectorList title="Qué evitar" items={analysis.director.avoid} />

          <div className="director-next-action">
            <small>Próxima acción</small>
            <p>{analysis.director.nextAction}</p>
          </div>

          <details className="functional-evidence">
            <summary>Evidencia técnica y disponibilidad</summary>
            <p>
              Las estadísticas pertenecen al fixture seleccionado y no se
              interpretan como forma reciente.
            </p>
            <ul>
              {analysis.evidence.map((item) => (
                <li key={item.id}>
                  <strong>{item.type}</strong>: {item.status}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </div>
  );
}

function StatusNotice({ state }) {
  return (
    <div className={`functional-status status-${state.status}`} role="status">
      <strong>{state.status}</strong>
      <span>{state.message}</span>
      {state.errorCode && <small>Código: {state.errorCode}</small>}
    </div>
  );
}

function DirectorList({ title, items = [] }) {
  if (items.length === 0) return null;

  return (
    <div className="functional-director-section">
      <small>{title}</small>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
