"use client";

import { useState } from "react";
import { classifyScenario } from "@/core/modules/scenarioClassifier";
import { routeSpecialists } from "@/core/modules/specialistRouter";
import { generateSpecialistReports } from "@/core/modules/specialistEngine";
import { runFiscalReview } from "@/core/modules/fiscalEngine";
import { runDecisionEngine } from "@/core/modules/decisionEngine";
import { createCaseRecord } from "@/core/modules/caseRecorder";

export default function Home() {
  const [mode, setMode] = useState("partido");
  const [form, setForm] = useState({
    partido: "",
    competicion: "",
    mercado: "",
    uso: "analisis",
  });
  const [analysis, setAnalysis] = useState(null);

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
  }

  function runInitialAnalysis() {
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
      </section>
    </main>
  );
}
