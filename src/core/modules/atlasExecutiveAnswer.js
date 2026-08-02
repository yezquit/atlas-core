import { PARLAY_STATUS } from "../contracts/atlasContracts.js";

export function buildAtlasExecutiveAnswer({
  gateCoordinator,
  marketGate,
  marketDataCoverage,
  realFixtureLookup,
  realFixtureStatistics,
  sourceConfidence,
  analysisInput,
}) {
  const fixture = realFixtureLookup?.selectedFixture || null;
  const market = analysisInput?.mercado || "Mercado no especificado";
  const useCase = analysisInput?.uso || "analisis";

  const keyFacts = [];

  if (fixture) {
    keyFacts.push(
      `Fixture real confirmado: ${fixture.teams.home.name} vs ${fixture.teams.away.name}`
    );

    if (fixture.referee?.confirmed) {
      keyFacts.push(`Árbitro confirmado: ${fixture.referee.name}`);
    }

    if (fixture.status?.short) {
      keyFacts.push(`Estado del partido: ${fixture.status.long} (${fixture.status.short})`);
    }
  } else {
    keyFacts.push("No hay fixture real confirmado.");
  }

  if (realFixtureStatistics?.statistics?.qualityFlags?.hasStatistics) {
    keyFacts.push("Estadísticas reales disponibles para el fixture.");
  }

  if (marketDataCoverage?.coverageStatus) {
    keyFacts.push(`Cobertura del mercado: ${marketDataCoverage.coverageStatus}.`);
  }

  const warnings = [];

  if (marketGate?.gateStatus === "blocked") {
    warnings.push("El mercado está bloqueado por falta de datos base.");
  }

  if (marketDataCoverage?.missingExternalData?.length > 0) {
    warnings.push(
      `Faltan datos externos: ${marketDataCoverage.missingExternalData.join(", ")}.`
    );
  }

  if (useCase === "parlay") {
    warnings.push("Parlay no está soportado en Fase 0.");
  }

  return {
    title: "Respuesta Atlas",
    finalLabel: gateCoordinator?.finalLabel || "Estado no determinado",
    operationalPermission:
      gateCoordinator?.operationalPermission || "Sin permiso operativo definido",
    market,
    useCase,
    informationScore:
      sourceConfidence?.informationScore ??
      sourceConfidence?.score ??
      sourceConfidence?.qualityScore ??
      0,
    mainConclusion:
      gateCoordinator?.summary ||
      "Atlas todavía no tiene una conclusión ejecutiva para este análisis.",
    primaryReason:
      gateCoordinator?.primaryReason || "No hay razón principal registrada.",
    requiredAction:
      gateCoordinator?.requiredAction || "Completar validación pendiente.",
    canAnalyze: gateCoordinator?.canAnalyze === true,
    canRecommend: gateCoordinator?.canRecommend === true,
    canUseInParlay: false,
    parlayStatus: PARLAY_STATUS.UNSUPPORTED,
    keyFacts,
    warnings,
  };
}
