import test from "node:test";
import assert from "node:assert/strict";

import { buildComplementarySourceCoverage } from "../modules/complementarySourceCoverage.js";
import { evaluateMarketDataCoverage } from "../modules/marketDataCoverage.js";
import { buildMarketFocusedStats } from "../modules/marketFocusedStats.js";
import { applyMarketCoverageToSourceConfidence } from "../modules/marketCoverageImpact.js";
import { runMarketGate } from "../modules/marketGate.js";
import { getMockSourceData } from "../modules/sourceConnectorMock.js";
import { buildSourceValidationPlan } from "../modules/sourceValidation.js";
import { buildTeamRecentProfile } from "../modules/teamRecentProfile.js";

export const atlasTrialCases = [
  {
    id: "trial-001",
    title: "Mercado disciplinario con línea y cuota reportadas",
    mercado: "tarjetas",
    lineaMercado: "Más de 4.5 tarjetas",
    cuotaMercado: "1.85",
    uso: "analisis",
  },
  {
    id: "trial-002",
    title: "Mercado de remates con estadísticas normalizadas",
    mercado: "remates a arco",
    lineaMercado: "Más de 7.5 remates a arco",
    cuotaMercado: "1.85",
    uso: "analisis",
  },
  {
    id: "trial-003",
    title: "Mercado sin estadística base disponible",
    mercado: "saques de banda",
    lineaMercado: "Más de 35.5 saques de banda",
    cuotaMercado: "1.85",
    uso: "analisis",
  },
  {
    id: "trial-004",
    title: "Parlay marcado como capacidad no soportada",
    mercado: "tarjetas",
    lineaMercado: "Más de 4.5 tarjetas",
    cuotaMercado: "1.85",
    uso: "parlay",
  },
];

const realFixtureLookup = {
  selectedFixture: {
    fixtureId: 101,
    teams: {
      home: { name: "Patriotas" },
      away: { name: "Jaguares" },
    },
  },
};

const realFixtureStatistics = {
  statistics: {
    availableStats: [
      "yellow_cards",
      "red_cards",
      "fouls",
      "shots_on_goal",
      "total_shots",
    ],
    qualityFlags: { hasStatistics: true },
    teams: [
      {
        team: { name: "Patriotas" },
        statistics: {
          yellow_cards: { value: 2 },
          red_cards: { value: 0 },
          fouls: { value: 11 },
          shots_on_goal: { value: 5 },
          total_shots: { value: 12 },
        },
      },
      {
        team: { name: "Jaguares" },
        statistics: {
          yellow_cards: { value: 3 },
          red_cards: { value: 0 },
          fouls: { value: 14 },
          shots_on_goal: { value: 3 },
          total_shots: { value: 9 },
        },
      },
    ],
  },
};

function evaluateTrial(trial) {
  const marketDataCoverage = evaluateMarketDataCoverage({
    marketText: trial.mercado,
    fixtureStatistics: realFixtureStatistics,
    lineText: trial.lineaMercado,
    oddsText: trial.cuotaMercado,
  });
  const marketFocusedStats = buildMarketFocusedStats({
    marketText: trial.mercado,
    fixtureStatistics: realFixtureStatistics,
  });
  const teamRecentProfile = buildTeamRecentProfile({
    realFixtureLookup,
    realFixtureStatistics,
    marketFocusedStats,
    marketText: trial.mercado,
  });
  const complementarySourceCoverage = buildComplementarySourceCoverage({
    marketText: trial.mercado,
    realFixtureStatistics,
    marketDataCoverage,
    refereeProfile: { sourceImpact: { shouldLimitConfidence: false } },
    teamRecentProfile,
    marketLineContext: { status: "available" },
  });
  const marketGate = runMarketGate({
    marketDataCoverage,
    marketFocusedStats,
    sourceConfidence: { informationScore: "60%" },
    analysisInput: trial,
  });
  const marketCoverageImpact = applyMarketCoverageToSourceConfidence({
    sourceConfidence: { informationScore: "40%" },
    marketDataCoverage,
  });
  const sourceConnector = getMockSourceData({
    scenario: {
      resolvedCompetition: {
        resolved: true,
        competitionName: "Liga BetPlay",
        division: "Primera A",
      },
    },
    analysisInput: trial,
  });
  const sourceValidation = buildSourceValidationPlan({
    scenario: {
      resolvedCompetition: { resolved: true },
    },
    specialistReports: { reports: [] },
    marketEvaluation: { marketFamily: "disciplinario" },
    analysisInput: trial,
  });

  return {
    marketDataCoverage,
    marketFocusedStats,
    teamRecentProfile,
    complementarySourceCoverage,
    marketGate,
    marketCoverageImpact,
    sourceConnector,
    sourceValidation,
  };
}

for (const trial of atlasTrialCases) {
  test(`${trial.id}: ${trial.title}`, () => {
    const result = evaluateTrial(trial);

    assert.equal(result.marketDataCoverage.hasLine, true);
    assert.equal(result.marketDataCoverage.hasOdds, true);
    assert.equal(
      result.marketDataCoverage.missingExternalData.some((item) =>
        /línea|linea|cuota/i.test(item)
      ),
      false
    );
    assert.match(
      result.sourceConnector.sourceData.find(
        (item) => item.data === "Líneas y cuotas"
      ).status,
      /Reportado/
    );
    assert.equal(
      result.sourceValidation.requiredSources.some(
        (source) =>
          source.data.includes("Líneas") && source.status === "Pendiente"
      ),
      false
    );
    assert.doesNotMatch(
      result.marketCoverageImpact.marketCoverageImpact.summary,
      /falta.*línea|falta.*cuota/i
    );

    if (trial.id === "trial-001") {
      assert.equal(result.marketDataCoverage.coverageLevel, "covered");
      assert.deepEqual(
        result.teamRecentProfile.currentTeamStats.map((row) => row.teamName),
        ["Patriotas", "Jaguares"]
      );
    }

    if (trial.id === "trial-002") {
      assert.equal(result.teamRecentProfile.hasCurrentMatchStats, true);
      assert.equal(
        result.marketFocusedStats.primaryAvailable.includes("shots_on_goal"),
        true
      );
    }

    if (trial.id === "trial-003") {
      assert.equal(result.marketDataCoverage.coverageLevel, "missing");
      assert.equal(result.complementarySourceCoverage.blocksDecision, true);
      assert.equal(result.marketGate.gateStatus, "blocked");
    }

    if (trial.id === "trial-004") {
      assert.equal(result.marketGate.parlayStatus, "unsupported");
      assert.equal(result.marketGate.canUseInParlay, false);
    }
  });
}
