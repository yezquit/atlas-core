"use client";

import { useEffect, useState } from "react";
import { classifyScenario } from "@/core/modules/scenarioClassifier";
import { routeSpecialists } from "@/core/modules/specialistRouter";
import { generateSpecialistReports } from "@/core/modules/specialistEngine";
import { runFiscalReview } from "@/core/modules/fiscalEngine";
import { runDecisionEngine } from "@/core/modules/decisionEngine";
import { createCaseRecord } from "@/core/modules/caseRecorder";
import { evaluateMarkets } from "@/core/modules/marketEvaluator";
import { buildSourceValidationPlan } from "@/core/modules/sourceValidation";
import { getMockSourceData } from "@/core/modules/sourceConnectorMock";
import { calculateSourceConfidence } from "@/core/modules/sourceConfidenceEngine";
import { runValidationGate } from "@/core/modules/validationGate";
import { prepareAuditPlan } from "@/core/modules/auditPrep";
import { getProjectStatus } from "@/core/modules/projectStatus";
import { lookupRealFixture } from "@/core/modules/realFixtureLookup";
import { applyRealFixtureToSourceConfidence } from "@/core/modules/realFixtureSourceImpact";
import { lookupFixtureStatistics } from "@/core/modules/realFixtureStatisticsLookup";
import { evaluateMarketDataCoverage } from "@/core/modules/marketDataCoverage";
import { buildMarketFocusedStats } from "@/core/modules/marketFocusedStats";
import { applyMarketCoverageToSourceConfidence } from "@/core/modules/marketCoverageImpact";
import { runMarketGate } from "@/core/modules/marketGate";
import { coordinateGates } from "@/core/modules/gateCoordinator";
import { buildAtlasExecutiveAnswer } from "@/core/modules/atlasExecutiveAnswer";
import { buildDirectorAtlasVerdict } from "@/core/modules/directorAtlas";
import { buildTechnicalConfidence } from "@/core/modules/technicalConfidence";

export default function Home() {
  const [mode, setMode] = useState("partido");
  const [form, setForm] = useState({
    partido: "",
    competicion: "",
    mercado: "",
    uso: "analisis",
  });
  const [analysis, setAnalysis] = useState(null);
  const [caseHistory, setCaseHistory] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const projectStatus = getProjectStatus();

  useEffect(() => {
    const savedHistory = window.localStorage.getItem("atlas_case_history");

    if (savedHistory) {
      try {
        setCaseHistory(JSON.parse(savedHistory));
      } catch {
        setCaseHistory([]);
      }
    }
  }, []);

  function saveCaseToHistory(caseRecord) {
    const updatedHistory = [caseRecord, ...caseHistory].slice(0, 10);

    setCaseHistory(updatedHistory);
    window.localStorage.setItem(
      "atlas_case_history",
      JSON.stringify(updatedHistory)
    );
  }

  function clearCaseHistory() {
    setCaseHistory([]);
    setSelectedCase(null);
    window.localStorage.removeItem("atlas_case_history");
  }

  function openCaseDetail(caseRecord) {
    setSelectedCase(caseRecord);
  }

  function closeCaseDetail() {
    setSelectedCase(null);
  }

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetSearch() {
    setForm({
      partido: "",
      competicion: "",
      mercado: "",
      uso: "analisis",
    });
    setAnalysis(null);
    setSelectedCase(null);
  }

  async function runInitialAnalysis() {
    const partido = form.partido.trim() || "Partido pendiente";
    const competicion = form.competicion.trim() || "Competición pendiente";
    const mercado = form.mercado.trim();

    const scenario = classifyScenario({
      mode,
      partido,
      competicion,
      mercado,
    });

    const candidateMarkets = scenario.candidateMarkets;

    const scenarioType = scenario.tags.join(" · ");

    const resolvedCompetitionLabel = scenario.resolvedCompetition?.resolved
      ? `${scenario.resolvedCompetition.competitionName} (${scenario.resolvedCompetition.division})`
      : competicion;

    const specialistRoute = routeSpecialists({
      scenario,
      mercado,
      uso: form.uso,
    });

    const specialistReports = generateSpecialistReports({
      specialistRoute,
      scenario,
      mercado,
      uso: form.uso,
    });

    const parlayStatus =
      form.uso === "parlay"
        ? "🟠 Esperar validación"
        : "No aplica";

    const fiscalReview = runFiscalReview({
      analysisInput: {
        partido,
        competicion,
        mercado,
        uso: form.uso,
      },
      scenario,
      specialistReports,
      parlayStatus,
    });

    const marketEvaluation = evaluateMarkets({
      mercado,
      scenario,
      specialistReports,
      fiscalReview,
    });

    const sourceValidation = buildSourceValidationPlan({
      scenario,
      specialistReports,
      marketEvaluation,
      analysisInput: {
        partido,
        competicion,
        mercado,
        uso: form.uso,
      },
    });

    const sourceConnector = getMockSourceData({
      scenario,
      analysisInput: {
        partido,
        competicion,
        mercado,
        uso: form.uso,
      },
    });

    let sourceConfidence = calculateSourceConfidence({
      sourceConnector,
      sourceValidation,
    });

    const decisionResult = runDecisionEngine({
      analysisInput: {
        partido,
        competicion,
        mercado,
        uso: form.uso,
      },
      scenario,
      specialistReports,
      fiscalReview,
      parlayStatus,
    });

    let validationGate = runValidationGate({
      decisionResult,
      fiscalReview,
      sourceConfidence,
      marketEvaluation,
      analysisInput: {
        partido,
        competicion,
        mercado,
        uso: form.uso,
      },
    });

    let auditPrep = prepareAuditPlan({
      analysisInput: {
        partido,
        competicion,
        mercado,
        uso: form.uso,
      },
      scenario,
      marketEvaluation,
      fiscalReview,
      decisionResult,
      sourceConfidence,
    });

    const realFixtureLookup = await lookupRealFixture({
      matchText: partido,
      resolvedCompetition: scenario?.resolvedCompetition || scenario?.competition || null,
      competitionText: competicion,
    });

    sourceConfidence = applyRealFixtureToSourceConfidence({
      sourceConfidence,
      realFixtureLookup,
      marketEvaluation,
    });

    const realFixtureStatistics = await lookupFixtureStatistics(realFixtureLookup);

    const marketDataCoverage = evaluateMarketDataCoverage({
      marketText: mercado,
      fixtureStatistics: realFixtureStatistics,
    });

    const marketFocusedStats = buildMarketFocusedStats({
      marketText: mercado,
      fixtureStatistics: realFixtureStatistics,
    });

    sourceConfidence = applyMarketCoverageToSourceConfidence({
      sourceConfidence,
      marketDataCoverage,
    });

    const marketGate = runMarketGate({
      marketDataCoverage,
      marketFocusedStats,
      sourceConfidence,
      analysisInput: {
        partido,
        competicion,
        mercado,
        uso: form.uso,
      },
    });

    validationGate = runValidationGate({
      decisionResult,
      fiscalReview,
      sourceConfidence,
      marketEvaluation,
      analysisInput: {
        partido,
        competicion,
        mercado,
        uso: form.uso,
      },
    });

    auditPrep = prepareAuditPlan({
      analysisInput: {
        partido,
        competicion,
        mercado,
        uso: form.uso,
      },
      scenario,
      marketEvaluation,
      fiscalReview,
      decisionResult,
      sourceConfidence,
    });

    const gateCoordinator = coordinateGates({
      validationGate,
      marketGate,
      sourceConfidence,
      analysisInput: {
        partido,
        competicion,
        mercado,
        uso: form.uso,
      },
    });

    const technicalConfidence = buildTechnicalConfidence({
      sourceConfidence,
      marketGate,
      gateCoordinator,
      marketDataCoverage,
      realFixtureLookup,
      realFixtureStatistics,
      marketFocusedStats,
    });

    const atlasExecutiveAnswer = buildAtlasExecutiveAnswer({
      gateCoordinator,
      marketGate,
      marketDataCoverage,
      realFixtureLookup,
      realFixtureStatistics,
      sourceConfidence,
      analysisInput: {
        partido,
        competicion,
        mercado,
        uso: form.uso,
      },
    });

    const directorAtlas = buildDirectorAtlasVerdict({
      gateCoordinator,
      marketGate,
      marketDataCoverage,
      marketFocusedStats,
      realFixtureLookup,
      realFixtureStatistics,
      sourceConfidence,
      analysisInput: {
        partido,
        competicion,
        mercado,
        uso: form.uso,
      },
    });

    validationGate = runValidationGate({
      decisionResult,
      fiscalReview,
      sourceConfidence,
      marketEvaluation,
      analysisInput: {
        partido,
        competicion,
        mercado,
        uso: form.uso,
      },
    });

    auditPrep = prepareAuditPlan({
      analysisInput: {
        partido,
        competicion,
        mercado,
        uso: form.uso,
      },
      scenario,
      marketEvaluation,
      fiscalReview,
      decisionResult,
      sourceConfidence,
    });

    const caseRecord = createCaseRecord({
      analysisInput: {
        partido,
        competicion,
        mercado,
        uso: form.uso,
      },
      scenario,
      specialistRoute,
      specialistReports,
      fiscalReview,
      decisionResult,
      parlayStatus,
    });

    saveCaseToHistory(caseRecord);

    setAnalysis({
      partido,
      competicion: resolvedCompetitionLabel,
      scenarioType,
      candidateMarkets,
      temporalStatus: decisionResult.temporalStatus,
      decision: decisionResult.decision,
      confidence: decisionResult.confidence,
      robustness: decisionResult.robustness,
      fragility: decisionResult.fragility,
      mainReason: decisionResult.mainReason,
      mainRisk: decisionResult.mainRisk,
      invalidation: decisionResult.invalidationCondition,
      parlayStatus,
      specialistRoute,
      specialistReports,
      fiscalReview,
      marketEvaluation,
      sourceValidation,
      sourceConnector,
      sourceConfidence,
      validationGate,
      auditPrep,
      realFixtureLookup,
      realFixtureStatistics,
      marketDataCoverage,
      marketFocusedStats,
      marketGate,
      gateCoordinator,
      technicalConfidence,
      atlasExecutiveAnswer,
      directorAtlas,
      caseRecord,
      nextAction: decisionResult.nextAction,
    });
  }

  return (
    <main className="atlas-page">
      <section className="hero-card">
        <p className="eyebrow">Atlas Core v0.1</p>

        <h1>ATLAS</h1>

        <p className="subtitle">
          No buscamos predecir el deporte. Buscamos comprenderlo lo suficiente
          para tomar mejores decisiones.
        </p>

        <div className="status-box">
          <span className="status-dot"></span>
          <p>Documento Maestro aprobado · Construcción inicial en progreso</p>
        </div>

        <div className="mode-grid">
          <button
            type="button"
            className={`mode-card ${mode === "partido" ? "active" : ""}`}
            onClick={() => setMode("partido")}
          >
            <span>⚽</span>
            <strong>Partido específico</strong>
            <small>Analizar un partido concreto y sus mercados candidatos.</small>
          </button>

          <button
            type="button"
            className={`mode-card ${mode === "jornada" ? "active" : ""}`}
            onClick={() => setMode("jornada")}
          >
            <span>📅</span>
            <strong>Jornada / Liga</strong>
            <small>Explorar partidos del día y detectar oportunidades.</small>
          </button>
        </div>

        <form className="analysis-form">
          <label>
            {mode === "jornada" ? "Liga / Jornada" : "Partido"}
            <input
              type="text"
              value={form.partido}
              onChange={(event) => updateField("partido", event.target.value)}
              placeholder={
                mode === "jornada"
                  ? "Ej: Liga BetPlay hoy"
                  : "Ej: América vs Millonarios"
              }
            />
          </label>

          <label>
            Competición
            <input
              type="text"
              value={form.competicion}
              onChange={(event) =>
                updateField("competicion", event.target.value)
              }
              placeholder="Ej: Liga BetPlay"
            />
          </label>

          <label>
            Mercado opcional
            <input
              type="text"
              value={form.mercado}
              onChange={(event) => updateField("mercado", event.target.value)}
              placeholder="Ej: tarjetas, pases, remates"
            />
          </label>

          <label>
            Uso
            <select
              value={form.uso}
              onChange={(event) => updateField("uso", event.target.value)}
            >
              <option value="analisis">Solo análisis</option>
              <option value="simple">Apuesta simple</option>
              <option value="parlay">Parlay</option>
            </select>
          </label>

          <button type="button" className="primary-button" onClick={runInitialAnalysis}>
            Analizar con Atlas
          </button>
        </form>

        {analysis && (
          <section className="result-card">
            <div className="result-header">
              <div>
                <p className="eyebrow small">Primer latido del motor</p>
                <h2>{analysis.partido}</h2>
              </div>
              <div className="result-actions">
                <span className="pill">{analysis.temporalStatus}</span>
                <button type="button" className="secondary-button" onClick={resetSearch}>
                  ↻ Nueva búsqueda
                </button>
              </div>
            </div>

            <div className="result-grid">
              <div>
                <strong>Competición</strong>
                <p>{analysis.competicion}</p>
              </div>

              <div>
                <strong>Escenario detectado</strong>
                <p>{analysis.scenarioType}</p>
              </div>

              <div>
                <strong>Mercados candidatos</strong>
                <p>{analysis.candidateMarkets.join(", ")}</p>
              </div>

              <div>
                <strong>Decisión</strong>
                <p>{analysis.decision}</p>
              </div>

              <div>
                <strong>Confianza</strong>
                <p>{analysis.confidence}</p>
              </div>

              <div>
                <strong>Estado para parlay</strong>
                <p>{analysis.parlayStatus}</p>
              </div>

              <div>
                <strong>Robustez</strong>
                <p>{analysis.robustness}</p>
              </div>

              <div>
                <strong>Fragilidad</strong>
                <p>{analysis.fragility}</p>
              </div>
            </div>

            <div className="specialists-panel">
              <strong>Especialistas activados</strong>
              <div className="specialists-list">
                {analysis.specialistRoute.specialists.map((specialist) => (
                  <article key={specialist.name} className="specialist-chip">
                    <span>{specialist.name}</span>
                    <small>Prioridad: {specialist.priority}</small>
                    <p>{specialist.reason}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="market-panel">
              <div className="market-header">
                <strong>Evaluación de mercados</strong>
                <span>{analysis.marketEvaluation.marketFamily}</span>
              </div>

              <p>{analysis.marketEvaluation.summary}</p>

              <div className="market-list">
                {analysis.marketEvaluation.evaluations.map((market) => (
                  <article key={market.name} className="market-card">
                    <div className="market-title">
                      <h3>{market.name}</h3>
                      <span>{market.status} · {market.confidence}</span>
                    </div>

                    <p><strong>Rol:</strong> {market.role}</p>
                    <p><strong>Fragilidad:</strong> {market.fragility}</p>

                    <div className="market-section">
                      <small>Fortalezas</small>
                      <ul>
                        {market.strengths.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="market-section">
                      <small>Validación necesaria</small>
                      <ul>
                        {market.validationNeeded.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="reports-panel">
              <strong>Informes iniciales de especialistas</strong>
              <div className="reports-list">
                {analysis.specialistReports.reports.map((report) => (
                  <article key={report.specialist} className="report-card">
                    <div className="report-title">
                      <h3>{report.specialist}</h3>
                      <span>{report.confidence}</span>
                    </div>

                    <p>{report.conclusion}</p>

                    <div className="report-section">
                      <small>Evidencia inicial</small>
                      <ul>
                        {report.evidence.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="report-section">
                      <small>Datos faltantes</small>
                      <ul>
                        {report.missingData.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="connector-panel">
              <div className="connector-header">
                <strong>Conector de fuentes</strong>
                <span>{analysis.sourceConnector.status}</span>
              </div>

              <p>{analysis.sourceConnector.summary}</p>

              <div className="connector-grid">
                {analysis.sourceConnector.sourceData.map((item) => (
                  <article key={item.data} className="connector-card">
                    <div className="connector-title">
                      <h3>{item.data}</h3>
                      <span>{item.status}</span>
                    </div>

                    <p><strong>Valor:</strong> {item.value}</p>
                    <p><strong>Fuente:</strong> {item.source}</p>
                    <p><strong>Nivel:</strong> {item.sourceLevel}</p>
                    <small>{item.note}</small>
                  </article>
                ))}
              </div>
            </div>

            <div className="confidence-panel">
              <div className="confidence-header">
                <strong>Calidad de información</strong>
                <span>{analysis.sourceConfidence.status}</span>
              </div>

              <div className="confidence-grid">
                <div>
                  <small>Calidad</small>
                  <p>{analysis.sourceConfidence.informationQuality}</p>
                </div>

                <div>
                  <small>Puntaje</small>
                  <p>{analysis.sourceConfidence.informationScore}</p>
                </div>

                <div>
                  <small>Fuentes confirmadas</small>
                  <p>{analysis.sourceConfidence.confirmedCount}/{analysis.sourceConfidence.totalSources}</p>
                </div>

                <div>
                  <small>Fuentes pendientes</small>
                  <p>{analysis.sourceConfidence.pendingCount}</p>
                </div>

                <div>
                  <small>Críticas pendientes</small>
                  <p>{analysis.sourceConfidence.criticalPendingCount}</p>
                </div>

                <div>
                  <small>Decisión permitida</small>
                  <p>{analysis.sourceConfidence.allowedDecisionLevel}</p>
                </div>
              </div>

              <p className="confidence-summary">{analysis.sourceConfidence.summary}</p>

              {analysis.sourceConfidence.blockers.length > 0 && (
                <div className="confidence-blockers">
                  <small>Bloqueos actuales</small>
                  <ul>
                    {analysis.sourceConfidence.blockers.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="source-panel">
              <div className="source-header">
                <strong>Validación de fuentes</strong>
                <span>{analysis.sourceValidation.validationStatus}</span>
              </div>

              <p>{analysis.sourceValidation.summary}</p>

              <div className="priority-legend">
                <span><strong>Crítica:</strong> dato obligatorio para decidir.</span>
                <span><strong>Alta:</strong> dato necesario para elevar confianza.</span>
              </div>

              <div className="source-list">
                {analysis.sourceValidation.requiredSources.map((source) => (
                  <article key={source.data} className="source-card">
                    <div className="source-title">
                      <h3>{source.data}</h3>
                      <span>{source.priority}</span>
                    </div>

                    <p><strong>Fuente requerida:</strong> {source.sourceType}</p>
                    <p>{source.reason}</p>
                    <small>Estado: {source.status}</small>
                  </article>
                ))}
              </div>
            </div>

            <div className="fiscal-panel">
              <div className="fiscal-header">
                <strong>Fiscal de Atlas</strong>
                <span>{analysis.fiscalReview.fiscalStatus}</span>
              </div>

              <p>{analysis.fiscalReview.recommendation}</p>

              {analysis.fiscalReview.objections.length > 0 && (
                <div className="fiscal-section">
                  <small>Objeciones</small>
                  <ul>
                    {analysis.fiscalReview.objections.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.fiscalReview.warnings.length > 0 && (
                <div className="fiscal-section">
                  <small>Advertencias</small>
                  <ul>
                    {analysis.fiscalReview.warnings.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="gate-panel">
              <div className="gate-header">
                <strong>Semáforo operativo Atlas</strong>
                <span>{analysis.validationGate.gateStatus}</span>
              </div>

              <h3>{analysis.validationGate.finalMessage}</h3>

              <div className="gate-grid">
                <div>
                  <small>Permiso</small>
                  <p>{analysis.validationGate.permission}</p>
                </div>

                <div>
                  <small>Razón</small>
                  <p>{analysis.validationGate.reason}</p>
                </div>

                <div>
                  <small>Acción requerida</small>
                  <p>{analysis.validationGate.userAction}</p>
                </div>

                <div>
                  <small>Uso en parlay</small>
                  <p>{analysis.validationGate.canUseInParlay ? "Permitido" : "No permitido todavía"}</p>
                </div>
              </div>
            </div>

            <div className="real-fixture-panel">
              <div className="real-fixture-header">
                <strong>Fuente real API-FOOTBALL</strong>
                <span>{analysis.realFixtureLookup.status}</span>
              </div>

              <p>{analysis.realFixtureLookup.reason}</p>

              <div className="real-fixture-grid">
                <div>
                  <small>Liga consultada</small>
                  <p>{analysis.realFixtureLookup.leagueKey}</p>
                </div>

                <div>
                  <small>Modo de búsqueda</small>
                  <p>{analysis.realFixtureLookup.parsed.mode}</p>
                </div>

                <div>
                  <small>Coincidencias</small>
                  <p>{analysis.realFixtureLookup.count || 0}</p>
                </div>

                <div>
                  <small>Conexión</small>
                  <p>{analysis.realFixtureLookup.connected ? "Activa" : "No validada"}</p>
                </div>
              </div>

              {analysis.realFixtureLookup.selectedFixture && (
                <div className="real-fixture-card">
                  <div>
                    <small>Fixture ID</small>
                    <p>{analysis.realFixtureLookup.selectedFixture.fixtureId}</p>
                  </div>

                  <div>
                    <small>Partido real</small>
                    <p>
                      {analysis.realFixtureLookup.selectedFixture.teams.home.name}
                      {" "}vs{" "}
                      {analysis.realFixtureLookup.selectedFixture.teams.away.name}
                    </p>
                  </div>

                  <div>
                    <small>Fecha UTC</small>
                    <p>{analysis.realFixtureLookup.selectedFixture.date.utc}</p>
                  </div>

                  <div>
                    <small>Estado</small>
                    <p>
                      {analysis.realFixtureLookup.selectedFixture.status.long}
                      {" "}({analysis.realFixtureLookup.selectedFixture.status.short})
                    </p>
                  </div>

                  <div>
                    <small>Marcador</small>
                    <p>
                      {analysis.realFixtureLookup.selectedFixture.score.goals.home}
                      {" - "}
                      {analysis.realFixtureLookup.selectedFixture.score.goals.away}
                    </p>
                  </div>

                  <div>
                    <small>Árbitro</small>
                    <p>
                      {analysis.realFixtureLookup.selectedFixture.referee.confirmed
                        ? analysis.realFixtureLookup.selectedFixture.referee.name
                        : "No confirmado"}
                    </p>
                  </div>

                  <div>
                    <small>Estadio</small>
                    <p>
                      {analysis.realFixtureLookup.selectedFixture.venue.name || "Sin estadio"}
                      {analysis.realFixtureLookup.selectedFixture.venue.city
                        ? ` · ${analysis.realFixtureLookup.selectedFixture.venue.city}`
                        : ""}
                    </p>
                  </div>

                  <div>
                    <small>Ronda</small>
                    <p>{analysis.realFixtureLookup.selectedFixture.competition.round}</p>
                  </div>
                </div>
              )}
            </div>

            {analysis.realFixtureStatistics && (
              <div className="fixture-statistics-panel">
                <div className="fixture-statistics-header">
                  <strong>Estadísticas reales del fixture</strong>
                  <span>{analysis.realFixtureStatistics.status}</span>
                </div>

                <p>{analysis.realFixtureStatistics.reason}</p>

                <div className="fixture-statistics-grid">
                  <div>
                    <small>Fixture ID</small>
                    <p>{analysis.realFixtureStatistics.fixtureId || "Sin fixture"}</p>
                  </div>

                  <div>
                    <small>Conexión</small>
                    <p>{analysis.realFixtureStatistics.connected ? "Activa" : "No validada"}</p>
                  </div>

                  <div>
                    <small>Equipos con datos</small>
                    <p>{analysis.realFixtureStatistics.statistics?.countTeams || 0}</p>
                  </div>

                  <div>
                    <small>Tarjetas</small>
                    <p>{analysis.realFixtureStatistics.statistics?.qualityFlags?.hasCards ? "Disponibles" : "No disponibles"}</p>
                  </div>

                  <div>
                    <small>Faltas</small>
                    <p>{analysis.realFixtureStatistics.statistics?.qualityFlags?.hasFouls ? "Disponibles" : "No disponibles"}</p>
                  </div>

                  <div>
                    <small>Córners</small>
                    <p>{analysis.realFixtureStatistics.statistics?.qualityFlags?.hasCorners ? "Disponibles" : "No disponibles"}</p>
                  </div>

                  <div>
                    <small>Remates</small>
                    <p>{analysis.realFixtureStatistics.statistics?.qualityFlags?.hasShots ? "Disponibles" : "No disponibles"}</p>
                  </div>

                  <div>
                    <small>Posesión</small>
                    <p>{analysis.realFixtureStatistics.statistics?.qualityFlags?.hasPossession ? "Disponible" : "No disponible"}</p>
                  </div>
                </div>

                {analysis.realFixtureStatistics.statistics?.teams?.length > 0 && (
                  <div className="team-stats-grid">
                    {analysis.realFixtureStatistics.statistics.teams.map((team) => (
                      <article key={team.team.id || team.team.name}>
                        <h3>{team.team.name}</h3>

                        <div>
                          <small>Faltas</small>
                          <p>{team.statistics?.fouls?.value ?? "N/D"}</p>
                        </div>

                        <div>
                          <small>Amarillas</small>
                          <p>{team.statistics?.yellow_cards?.value ?? 0}</p>
                        </div>

                        <div>
                          <small>Rojas</small>
                          <p>{team.statistics?.red_cards?.value ?? 0}</p>
                        </div>

                        <div>
                          <small>Córners</small>
                          <p>{team.statistics?.corner_kicks?.value ?? "N/D"}</p>
                        </div>

                        <div>
                          <small>Remates</small>
                          <p>{team.statistics?.total_shots?.value ?? "N/D"}</p>
                        </div>

                        <div>
                          <small>Posesión</small>
                          <p>
                            {team.statistics?.ball_possession?.value ?? "N/D"}
                            {team.statistics?.ball_possession?.value !== undefined ? "%" : ""}
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                )}

                {analysis.realFixtureStatistics.statistics?.availableStats?.length > 0 && (
                  <div className="available-stats-list">
                    <small>Estadísticas disponibles</small>
                    <p>{analysis.realFixtureStatistics.statistics.availableStats.join(" · ")}</p>
                  </div>
                )}
              </div>
            )}

            {analysis.marketFocusedStats && (
              <div className="focused-stats-panel">
                <div className="focused-stats-header">
                  <strong>Estadísticas relevantes para el mercado</strong>
                  <span>{analysis.marketFocusedStats.status}</span>
                </div>

                <p>{analysis.marketFocusedStats.summary}</p>

                <div className="focused-stats-summary">
                  <div>
                    <small>Mercado</small>
                    <p>{analysis.marketFocusedStats.marketLabel}</p>
                  </div>

                  <div>
                    <small>Datos principales disponibles</small>
                    <p>
                      {analysis.marketFocusedStats.primaryAvailable.length}
                      {" / "}
                      {analysis.marketFocusedStats.primaryStatKeys.length}
                    </p>
                  </div>

                  <div>
                    <small>Datos de apoyo disponibles</small>
                    <p>
                      {analysis.marketFocusedStats.supportAvailable.length}
                      {" / "}
                      {analysis.marketFocusedStats.supportStatKeys.length}
                    </p>
                  </div>
                </div>

                {analysis.marketFocusedStats.primaryMissing.length > 0 && (
                  <div className="focused-missing">
                    <small>Datos principales faltantes</small>
                    <p>{analysis.marketFocusedStats.primaryMissing.join(" · ")}</p>
                  </div>
                )}

                <div className="focused-team-grid">
                  {analysis.marketFocusedStats.teamRows.map((row) => (
                    <article key={row.team.id || row.team.name}>
                      <h3>{row.team.name}</h3>

                      <strong>Datos principales</strong>
                      {row.primaryStats.length > 0 ? (
                        row.primaryStats.map((stat) => (
                          <div key={stat.key}>
                            <small>{stat.available ? "✅" : "❌"} {stat.label}</small>
                            <p>{stat.value}</p>
                          </div>
                        ))
                      ) : (
                        <p className="focused-empty">Sin datos principales definidos</p>
                      )}

                      {row.supportStats.length > 0 && (
                        <>
                          <strong className="support-title">Datos de apoyo</strong>
                          {row.supportStats.map((stat) => (
                            <div key={stat.key}>
                              <small>{stat.available ? "✅" : "❌"} {stat.label}</small>
                              <p>{stat.value}</p>
                            </div>
                          ))}
                        </>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            )}

            {analysis.marketDataCoverage && (
              <div className="market-coverage-panel">
                <div className="market-coverage-header">
                  <strong>Cobertura de datos del mercado</strong>
                  <span>{analysis.marketDataCoverage.coverageStatus}</span>
                </div>

                <p>{analysis.marketDataCoverage.summary}</p>

                <div className="market-coverage-grid">
                  <div>
                    <small>Mercado detectado</small>
                    <p>{analysis.marketDataCoverage.marketLabel}</p>
                  </div>

                  <div>
                    <small>Nivel</small>
                    <p>{analysis.marketDataCoverage.coverageLevel}</p>
                  </div>

                  <div>
                    <small>Requeridos cubiertos</small>
                    <p>
                      {analysis.marketDataCoverage.coveredRequiredStats.length}
                      {" / "}
                      {analysis.marketDataCoverage.requiredStats.length}
                    </p>
                  </div>

                  <div>
                    <small>Fuente base</small>
                    <p>API-FOOTBALL</p>
                  </div>
                </div>

                <div className="coverage-lists">
                  <article>
                    <small>Datos requeridos</small>
                    <ul>
                      {analysis.marketDataCoverage.requiredStats.map((stat) => (
                        <li key={stat.key}>
                          {stat.available ? "✅" : "❌"} {stat.label}
                        </li>
                      ))}
                    </ul>
                  </article>

                  <article>
                    <small>Datos útiles complementarios</small>
                    <ul>
                      {analysis.marketDataCoverage.usefulStats.length > 0
                        ? analysis.marketDataCoverage.usefulStats.map((stat) => (
                            <li key={stat.key}>
                              {stat.available ? "✅" : "❌"} {stat.label}
                            </li>
                          ))
                        : <li>Sin datos complementarios definidos</li>}
                    </ul>
                  </article>

                  <article>
                    <small>Faltantes externos</small>
                    <ul>
                      {analysis.marketDataCoverage.missingExternalData.map((item) => (
                        <li key={item}>⚠️ {item}</li>
                      ))}
                    </ul>
                  </article>

                  <article>
                    <small>Todas las estadísticas disponibles</small>
                    <ul>
                      {analysis.marketDataCoverage.availableStats.map((stat) => (
                        <li key={stat.key}>{stat.label}</li>
                      ))}
                    </ul>
                  </article>
                </div>
              </div>
            )}

            {analysis.sourceConfidence.realFixtureImpact && (
              <div className="fixture-impact-panel">
                <div className="fixture-impact-header">
                  <strong>Impacto de fuente real</strong>
                  <span>
                    {analysis.sourceConfidence.realFixtureImpact.applied
                      ? "Aplicado"
                      : "No aplicado"}
                  </span>
                </div>

                <p>{analysis.sourceConfidence.realFixtureImpact.summary}</p>

                <div className="fixture-impact-grid">
                  <div>
                    <small>Puntaje anterior</small>
                    <p>{analysis.sourceConfidence.realFixtureImpact.originalScore ?? 0}%</p>
                  </div>

                  <div>
                    <small>Puntaje nuevo</small>
                    <p>{analysis.sourceConfidence.realFixtureImpact.newScore ?? analysis.sourceConfidence.informationScore}%</p>
                  </div>

                  <div>
                    <small>Incremento</small>
                    <p>+{analysis.sourceConfidence.realFixtureImpact.scoreAdded ?? 0}</p>
                  </div>

                  <div>
                    <small>Críticos pendientes</small>
                    <p>
                      {analysis.sourceConfidence.realFixtureImpact.originalCriticalPending ?? 0}
                      {" → "}
                      {analysis.sourceConfidence.realFixtureImpact.newCriticalPending ?? 0}
                    </p>
                  </div>
                </div>

                {analysis.sourceConfidence.realFixtureImpact.confirmedData?.length > 0 && (
                  <div className="fixture-impact-list">
                    <small>Datos confirmados</small>
                    <p>{analysis.sourceConfidence.realFixtureImpact.confirmedData.join(" · ")}</p>
                  </div>
                )}

                {analysis.sourceConfidence.realFixtureImpact.resolvedCriticalData?.length > 0 && (
                  <div className="fixture-impact-list">
                    <small>Datos críticos resueltos</small>
                    <p>{analysis.sourceConfidence.realFixtureImpact.resolvedCriticalData.join(" · ")}</p>
                  </div>
                )}
              </div>
            )}

            {analysis.technicalConfidence && (
              <div className="technical-confidence-panel">
                <div className="technical-confidence-header">
                  <strong>Fuerza técnica Atlas</strong>
                  <span>{analysis.technicalConfidence.technicalLevel.label}</span>
                </div>

                <h3>{analysis.technicalConfidence.summary}</h3>

                <div className="technical-confidence-grid">
                  <div>
                    <small>Confianza informativa</small>
                    <p>{analysis.technicalConfidence.informationScore}%</p>
                  </div>

                  <div>
                    <small>Fuerza técnica</small>
                    <p>{analysis.technicalConfidence.technicalScore}%</p>
                  </div>

                  <div>
                    <small>Nivel técnico</small>
                    <p>{analysis.technicalConfidence.technicalLevel.level}</p>
                  </div>

                  <div>
                    <small>Nivel de exposición</small>
                    <p>{analysis.technicalConfidence.exposure.label}</p>
                  </div>

                  <div>
                    <small>Puede recomendar</small>
                    <p>{analysis.technicalConfidence.canRecommend ? "Sí" : "No"}</p>
                  </div>

                  <div>
                    <small>Parlay</small>
                    <p>{analysis.technicalConfidence.canUseInParlay ? "Apto" : "No apto"}</p>
                  </div>
                </div>

                <div className="technical-confidence-section">
                  <small>Razón del nivel de exposición</small>
                  <p>{analysis.technicalConfidence.exposure.reason}</p>
                </div>

                {analysis.technicalConfidence.factors.length > 0 && (
                  <div className="technical-confidence-section">
                    <small>Factores a favor</small>
                    <ul>
                      {analysis.technicalConfidence.factors.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis.technicalConfidence.penalties.length > 0 && (
                  <div className="technical-confidence-section penalty">
                    <small>Limitantes / penalizaciones</small>
                    <ul>
                      {analysis.technicalConfidence.penalties.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {analysis.directorAtlas && (
              <div className="director-atlas-panel">
                <div className="director-atlas-header">
                  <strong>{analysis.directorAtlas.title}</strong>
                  <span>{analysis.directorAtlas.actionLevel.label}</span>
                </div>

                <h2>{analysis.directorAtlas.verdict}</h2>

                <div className="director-atlas-grid">
                  <div>
                    <small>Nivel de acción</small>
                    <p>{analysis.directorAtlas.actionLevel.level}</p>
                  </div>

                  <div>
                    <small>Mercado evaluado</small>
                    <p>{analysis.directorAtlas.market}</p>
                  </div>

                  <div>
                    <small>Mercado preferente</small>
                    <p>{analysis.directorAtlas.preferredMarket}</p>
                  </div>

                  <div>
                    <small>Selección candidata</small>
                    <p>{analysis.directorAtlas.candidateSelection}</p>
                  </div>

                  <div>
                    <small>Cuota mínima aceptable</small>
                    <p>{analysis.directorAtlas.minimumAcceptableOdds}</p>
                  </div>

                  <div>
                    <small>Confianza informativa</small>
                    <p>{analysis.directorAtlas.informationScore}%</p>
                  </div>

                  <div>
                    <small>Puede recomendar</small>
                    <p>{analysis.directorAtlas.canRecommend ? "Sí" : "No"}</p>
                  </div>

                  <div>
                    <small>Parlay</small>
                    <p>{analysis.directorAtlas.canUseInParlay ? "Apto" : "No apto"}</p>
                  </div>

                  <div>
                    <small>Uso solicitado</small>
                    <p>{analysis.directorAtlas.useCase}</p>
                  </div>
                </div>

                <div className="director-atlas-section">
                  <small>Razones principales</small>
                  <ul>
                    {analysis.directorAtlas.mainReasons.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>

                {analysis.directorAtlas.risks.length > 0 && (
                  <div className="director-atlas-section risk">
                    <small>Riesgos / faltantes</small>
                    <ul>
                      {analysis.directorAtlas.risks.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis.directorAtlas.requiredConditions.length > 0 && (
                  <div className="director-atlas-section">
                    <small>Condiciones para volverlo accionable</small>
                    <ul>
                      {analysis.directorAtlas.requiredConditions.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis.directorAtlas.avoid.length > 0 && (
                  <div className="director-atlas-section avoid">
                    <small>Qué evitar</small>
                    <ul>
                      {analysis.directorAtlas.avoid.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="director-note">{analysis.directorAtlas.directorNote}</p>
              </div>
            )}

            {analysis.atlasExecutiveAnswer && (
              <div className="atlas-answer-panel">
                <div className="atlas-answer-header">
                  <strong>{analysis.atlasExecutiveAnswer.title}</strong>
                  <span>{analysis.atlasExecutiveAnswer.finalLabel}</span>
                </div>

                <h2>{analysis.atlasExecutiveAnswer.mainConclusion}</h2>

                <div className="atlas-answer-grid">
                  <div>
                    <small>Permiso operativo</small>
                    <p>{analysis.atlasExecutiveAnswer.operationalPermission}</p>
                  </div>

                  <div>
                    <small>Mercado</small>
                    <p>{analysis.atlasExecutiveAnswer.market}</p>
                  </div>

                  <div>
                    <small>Confianza informativa</small>
                    <p>{analysis.atlasExecutiveAnswer.informationScore}%</p>
                  </div>

                  <div>
                    <small>Puede analizar</small>
                    <p>{analysis.atlasExecutiveAnswer.canAnalyze ? "Sí" : "No"}</p>
                  </div>

                  <div>
                    <small>Puede recomendar</small>
                    <p>{analysis.atlasExecutiveAnswer.canRecommend ? "Sí" : "No"}</p>
                  </div>

                  <div>
                    <small>Puede ir en parlay</small>
                    <p>{analysis.atlasExecutiveAnswer.canUseInParlay ? "Sí" : "No"}</p>
                  </div>
                </div>

                <div className="atlas-answer-section">
                  <small>Razón principal</small>
                  <p>{analysis.atlasExecutiveAnswer.primaryReason}</p>
                </div>

                <div className="atlas-answer-section">
                  <small>Acción requerida</small>
                  <p>{analysis.atlasExecutiveAnswer.requiredAction}</p>
                </div>

                {analysis.atlasExecutiveAnswer.keyFacts.length > 0 && (
                  <div className="atlas-answer-section">
                    <small>Hechos confirmados</small>
                    <ul>
                      {analysis.atlasExecutiveAnswer.keyFacts.map((fact) => (
                        <li key={fact}>{fact}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis.atlasExecutiveAnswer.warnings.length > 0 && (
                  <div className="atlas-answer-section warning">
                    <small>Advertencias</small>
                    <ul>
                      {analysis.atlasExecutiveAnswer.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {analysis.gateCoordinator && (
              <div className="gate-coordinator-panel">
                <div className="gate-coordinator-header">
                  <strong>Estado final Atlas</strong>
                  <span>{analysis.gateCoordinator.finalLabel}</span>
                </div>

                <h3>{analysis.gateCoordinator.summary}</h3>

                <div className="gate-coordinator-grid">
                  <div>
                    <small>Permiso operativo</small>
                    <p>{analysis.gateCoordinator.operationalPermission}</p>
                  </div>

                  <div>
                    <small>Puede analizar</small>
                    <p>{analysis.gateCoordinator.canAnalyze ? "Sí" : "No"}</p>
                  </div>

                  <div>
                    <small>Puede recomendar</small>
                    <p>{analysis.gateCoordinator.canRecommend ? "Sí" : "No"}</p>
                  </div>

                  <div>
                    <small>Puede ir en parlay</small>
                    <p>{analysis.gateCoordinator.canUseInParlay ? "Sí" : "No"}</p>
                  </div>

                  <div>
                    <small>Confianza informativa</small>
                    <p>{analysis.gateCoordinator.informationScore}%</p>
                  </div>

                  <div>
                    <small>Estado interno</small>
                    <p>{analysis.gateCoordinator.finalStatus}</p>
                  </div>
                </div>

                <div className="gate-coordinator-list">
                  <small>Razón principal</small>
                  <p>{analysis.gateCoordinator.primaryReason}</p>
                </div>

                <div className="gate-coordinator-list">
                  <small>Acción requerida</small>
                  <p>{analysis.gateCoordinator.requiredAction}</p>
                </div>

                <div className="gate-coordinator-list">
                  <small>Jerarquía aplicada</small>
                  <p>{analysis.gateCoordinator.hierarchy}</p>
                </div>
              </div>
            )}

            {analysis.marketGate && (
              <div className="market-gate-panel">
                <div className="market-gate-header">
                  <strong>Gate operativo del mercado</strong>
                  <span>{analysis.marketGate.gateLabel}</span>
                </div>

                <h3>{analysis.marketGate.summary}</h3>

                <div className="market-gate-grid">
                  <div>
                    <small>Mercado</small>
                    <p>{analysis.marketGate.marketLabel}</p>
                  </div>

                  <div>
                    <small>Permiso</small>
                    <p>{analysis.marketGate.permission}</p>
                  </div>

                  <div>
                    <small>Razón</small>
                    <p>{analysis.marketGate.reason}</p>
                  </div>

                  <div>
                    <small>Acción requerida</small>
                    <p>{analysis.marketGate.requiredAction}</p>
                  </div>

                  <div>
                    <small>Puede analizar</small>
                    <p>{analysis.marketGate.canAnalyze ? "Sí" : "No"}</p>
                  </div>

                  <div>
                    <small>Puede recomendar</small>
                    <p>{analysis.marketGate.canRecommend ? "Sí" : "No"}</p>
                  </div>

                  <div>
                    <small>Puede ir en parlay</small>
                    <p>{analysis.marketGate.canUseInParlay ? "Sí" : "No"}</p>
                  </div>

                  <div>
                    <small>Confianza informativa</small>
                    <p>{analysis.marketGate.informationScore}%</p>
                  </div>
                </div>

                {analysis.marketGate.missingRequiredStats?.length > 0 && (
                  <div className="market-gate-list">
                    <small>Estadísticas base faltantes</small>
                    <p>{analysis.marketGate.missingRequiredStats.join(" · ")}</p>
                  </div>
                )}

                {analysis.marketGate.missingExternalData?.length > 0 && (
                  <div className="market-gate-list">
                    <small>Faltantes externos</small>
                    <p>{analysis.marketGate.missingExternalData.join(" · ")}</p>
                  </div>
                )}
              </div>
            )}

            {analysis.sourceConfidence.marketCoverageImpact && (
              <div className="market-impact-panel">
                <div className="market-impact-header">
                  <strong>Impacto de cobertura del mercado</strong>
                  <span>
                    {analysis.sourceConfidence.marketCoverageImpact.blocksMarket
                      ? "Bloquea mercado"
                      : "Aplicado"}
                  </span>
                </div>

                <p>{analysis.sourceConfidence.marketCoverageImpact.summary}</p>

                <div className="market-impact-grid">
                  <div>
                    <small>Mercado</small>
                    <p>{analysis.sourceConfidence.marketCoverageImpact.marketLabel}</p>
                  </div>

                  <div>
                    <small>Cobertura</small>
                    <p>{analysis.sourceConfidence.marketCoverageImpact.coverageStatus}</p>
                  </div>

                  <div>
                    <small>Puntaje anterior</small>
                    <p>{analysis.sourceConfidence.marketCoverageImpact.originalScore}%</p>
                  </div>

                  <div>
                    <small>Puntaje nuevo</small>
                    <p>{analysis.sourceConfidence.marketCoverageImpact.newScore}%</p>
                  </div>

                  <div>
                    <small>Incremento</small>
                    <p>+{analysis.sourceConfidence.marketCoverageImpact.scoreAdded}</p>
                  </div>

                  <div>
                    <small>Tope aplicado</small>
                    <p>{analysis.sourceConfidence.marketCoverageImpact.cap}%</p>
                  </div>
                </div>

                {analysis.sourceConfidence.marketCoverageImpact.missingRequiredStats?.length > 0 && (
                  <div className="market-impact-list">
                    <small>Estadísticas requeridas faltantes</small>
                    <p>{analysis.sourceConfidence.marketCoverageImpact.missingRequiredStats.join(" · ")}</p>
                  </div>
                )}

                {analysis.sourceConfidence.marketCoverageImpact.missingExternalData?.length > 0 && (
                  <div className="market-impact-list">
                    <small>Faltantes externos</small>
                    <p>{analysis.sourceConfidence.marketCoverageImpact.missingExternalData.join(" · ")}</p>
                  </div>
                )}
              </div>
            )}

            <div className="auditprep-panel">
              <div className="auditprep-header">
                <strong>Preparación de auditoría</strong>
                <span>{analysis.auditPrep.auditStatus} · Prioridad {analysis.auditPrep.auditPriority}</span>
              </div>

              <p>{analysis.auditPrep.summary}</p>

              <div className="auditprep-grid">
                <div>
                  <small>Tipo de auditoría</small>
                  <p>{analysis.auditPrep.auditType}</p>
                </div>

                <div>
                  <small>Mercado auditado</small>
                  <p>{analysis.auditPrep.market}</p>
                </div>

                <div>
                  <small>Familia</small>
                  <p>{analysis.auditPrep.marketFamily}</p>
                </div>

                <div>
                  <small>Decisión a auditar</small>
                  <p>{analysis.auditPrep.decisionToAudit}</p>
                </div>

                <div>
                  <small>Confianza a auditar</small>
                  <p>{analysis.auditPrep.confidenceToAudit}</p>
                </div>

                <div>
                  <small>Resultado</small>
                  <p>Pendiente</p>
                </div>
              </div>

              <div className="auditprep-lists">
                <article>
                  <small>Preguntas obligatorias</small>
                  <ul>
                    {analysis.auditPrep.auditQuestions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>

                <article>
                  <small>Datos a comparar después</small>
                  <ul>
                    {analysis.auditPrep.postMatchChecks.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>

                <article>
                  <small>Revisiones especiales</small>
                  <ul>
                    {analysis.auditPrep.specialChecks.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>

                <article>
                  <small>Clasificaciones posibles</small>
                  <ul>
                    {analysis.auditPrep.expectedAuditResultTypes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              </div>
            </div>

            <div className="case-panel">
              <div className="case-header">
                <strong>Expediente Atlas</strong>
                <span>{analysis.caseRecord.caseId}</span>
              </div>

              <div className="case-grid">
                <div>
                  <small>Fecha de análisis</small>
                  <p>{analysis.caseRecord.readableDate}</p>
                </div>

                <div>
                  <small>Decisión registrada</small>
                  <p>{analysis.caseRecord.decision.status}</p>
                </div>

                <div>
                  <small>Fiscal</small>
                  <p>{analysis.caseRecord.fiscal.status}</p>
                </div>

                <div>
                  <small>Auditoría</small>
                  <p>{analysis.caseRecord.pending.auditStatus}</p>
                </div>

                <div>
                  <small>Fuentes</small>
                  <p>{analysis.caseRecord.pending.sourceValidation}</p>
                </div>

                <div>
                  <small>Especialistas</small>
                  <p>{analysis.caseRecord.specialists.reportsCount} informes iniciales</p>
                </div>
              </div>

              <div className="case-missing">
                <small>Datos faltantes principales</small>
                <p>
                  {analysis.caseRecord.pending.missingData.length > 0
                    ? analysis.caseRecord.pending.missingData.slice(0, 8).join(", ")
                    : "Sin datos faltantes registrados"}
                </p>
              </div>
            </div>

            <div className="analysis-notes">
              <div>
                <strong>Razón principal</strong>
                <p>{analysis.mainReason}</p>
              </div>

              <div>
                <strong>Riesgo principal</strong>
                <p>{analysis.mainRisk}</p>
              </div>

              <div>
                <strong>Condición de invalidación</strong>
                <p>{analysis.invalidation}</p>
              </div>

              <div>
                <strong>Próxima acción</strong>
                <p>{analysis.nextAction}</p>
              </div>
            </div>
          </section>
        )}

        <section className="project-status-panel">
          <div className="project-status-header">
            <div>
              <strong>Estado interno de Atlas</strong>
              <h2>{projectStatus.version}</h2>
            </div>

            <span>{projectStatus.phase}</span>
          </div>

          <p className="project-warning">{projectStatus.warning}</p>

          <div className="project-summary-grid">
            <div>
              <small>Estado</small>
              <p>{projectStatus.status}</p>
            </div>

            <div>
              <small>Módulos activos</small>
              <p>{projectStatus.activeModules}</p>
            </div>

            <div>
              <small>Siguiente decisión</small>
              <p>Fuentes/API reales</p>
            </div>
          </div>

          <div className="modules-grid">
            {projectStatus.modules.map((module) => (
              <article key={module.name} className="module-card">
                <div>
                  <h3>{module.name}</h3>
                  <span>{module.status}</span>
                </div>
                <p>{module.description}</p>
              </article>
            ))}
          </div>

          <div className="next-modules">
            <small>Próximos módulos</small>
            <p>{projectStatus.nextModules.join(" · ")}</p>
          </div>
        </section>

        {selectedCase && (
          <section className="case-detail-panel">
            <div className="case-detail-header">
              <div>
                <strong>Detalle de expediente</strong>
                <h2>{selectedCase.caseId}</h2>
              </div>

              <button type="button" onClick={closeCaseDetail}>
                Cerrar detalle
              </button>
            </div>

            <div className="case-detail-grid">
              <div>
                <small>Partido</small>
                <p>{selectedCase.input.partido}</p>
              </div>

              <div>
                <small>Competición</small>
                <p>{selectedCase.resolvedCompetition.name} ({selectedCase.resolvedCompetition.division})</p>
              </div>

              <div>
                <small>Mercado</small>
                <p>{selectedCase.input.mercado}</p>
              </div>

              <div>
                <small>Uso</small>
                <p>{selectedCase.input.uso}</p>
              </div>

              <div>
                <small>Decisión</small>
                <p>{selectedCase.decision.status}</p>
              </div>

              <div>
                <small>Confianza</small>
                <p>{selectedCase.decision.confidence}</p>
              </div>

              <div>
                <small>Robustez</small>
                <p>{selectedCase.decision.robustness}</p>
              </div>

              <div>
                <small>Fragilidad</small>
                <p>{selectedCase.decision.fragility}</p>
              </div>

              <div>
                <small>Estado temporal</small>
                <p>{selectedCase.decision.temporalStatus}</p>
              </div>

              <div>
                <small>Estado parlay</small>
                <p>{selectedCase.decision.parlayStatus}</p>
              </div>

              <div>
                <small>Fiscal</small>
                <p>{selectedCase.fiscal.status}</p>
              </div>

              <div>
                <small>Auditoría</small>
                <p>{selectedCase.pending.auditStatus}</p>
              </div>
            </div>

            <div className="case-detail-section">
              <small>Escenario</small>
              <p>{selectedCase.scenario.tags.join(" · ")}</p>
            </div>

            <div className="case-detail-section">
              <small>Mercados candidatos</small>
              <p>{selectedCase.scenario.candidateMarkets.join(", ")}</p>
            </div>

            <div className="case-detail-section">
              <small>Objeciones del Fiscal</small>
              <p>
                {selectedCase.fiscal.objections.length > 0
                  ? selectedCase.fiscal.objections.join(" ")
                  : "Sin objeciones registradas"}
              </p>
            </div>

            <div className="case-detail-section">
              <small>Datos faltantes</small>
              <p>
                {selectedCase.pending.missingData.length > 0
                  ? selectedCase.pending.missingData.join(", ")
                  : "Sin datos faltantes registrados"}
              </p>
            </div>
          </section>
        )}

        {caseHistory.length > 0 && (
          <section className="history-panel">
            <div className="history-header">
              <strong>Historial local de expedientes</strong>
              <button type="button" onClick={clearCaseHistory}>
                Limpiar historial
              </button>
            </div>

            <div className="history-list">
              {caseHistory.map((item) => (
                <article
                  key={item.caseId}
                  className="history-item"
                  onClick={() => openCaseDetail(item)}
                  role="button"
                  tabIndex={0}
                >
                  <div>
                    <strong>{item.input.partido}</strong>
                    <small>{item.caseId}</small>
                  </div>

                  <p>
                    {item.resolvedCompetition.name} ({item.resolvedCompetition.division})
                  </p>

                  <span>{item.decision.status} · {item.decision.confidence}</span>
                </article>
              ))}
            </div>
          </section>
        )}

      </section>
    </main>
  );
}
