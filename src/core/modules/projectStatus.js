export function getProjectStatus() {
  const modules = [
    {
      name: "CompetitionResolver",
      status: "Activo",
      description: "Resuelve competición y división desde equipos, aliases o texto del usuario.",
    },
    {
      name: "ScenarioClassifier",
      status: "Activo",
      description: "Clasifica escenario inicial, competición, clásico, jornada y mercados candidatos.",
    },
    {
      name: "SpecialistRouter",
      status: "Activo",
      description: "Decide qué especialistas participan y por qué.",
    },
    {
      name: "SpecialistReports",
      status: "Activo",
      description: "Genera informes iniciales por especialista con evidencia, riesgos y datos faltantes.",
    },
    {
      name: "MarketEvaluator",
      status: "Activo",
      description: "Evalúa familia de mercado y alternativas relacionadas.",
    },
    {
      name: "SourceConnector Mock",
      status: "Activo provisional",
      description: "Simula datos de fuentes antes de conectar APIs reales.",
    },
    {
      name: "SourceValidation",
      status: "Activo",
      description: "Define qué fuentes necesita Atlas para validar datos críticos.",
    },
    {
      name: "SourceConfidence",
      status: "Activo",
      description: "Calcula calidad de información según fuentes confirmadas y pendientes.",
    },
    {
      name: "FiscalEngine",
      status: "Activo",
      description: "Detecta objeciones, riesgos y bloqueos antes de recomendar.",
    },
    {
      name: "DecisionEngine",
      status: "Activo",
      description: "Convierte el análisis en decisión preliminar prudente.",
    },
    {
      name: "ValidationGate",
      status: "Activo",
      description: "Emite semáforo operativo y define qué está permitido hacer.",
    },
    {
      name: "CaseRecorder",
      status: "Activo",
      description: "Crea expediente Atlas por cada análisis.",
    },
    {
      name: "LocalStorage Memory",
      status: "Activo provisional",
      description: "Guarda historial local de expedientes en el navegador.",
    },
    {
      name: "CaseDetailView",
      status: "Activo",
      description: "Permite abrir y revisar detalle de expedientes guardados.",
    },
    {
      name: "AuditPrep",
      status: "Activo",
      description: "Prepara expediente para auditoría posterior de proceso y resultado.",
    },
  ];

  const nextModules = [
    "Selección de API/fuentes reales",
    "SourceConnector real v0.1",
    "DataNormalizer v0.1",
    "Lineup/Referee Validator",
    "MarketLine Evaluator",
    "ParlayCompatibility Engine",
  ];

  return {
    version: "Atlas Core v0.1",
    phase: "Construcción inicial funcional",
    status: "Operativo local con datos simulados",
    modules,
    activeModules: modules.length,
    nextModules,
    warning:
      "Atlas todavía no debe emitir recomendaciones reales porque no hay conexión a fuentes externas verificadas.",
  };
}
