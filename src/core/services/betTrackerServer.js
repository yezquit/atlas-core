import "server-only";

import { randomUUID } from "node:crypto";
import {
  PERSONAL_OWNER_ID,
  belongsToPersonalOwner,
} from "../auth/personalIdentity.js";

import {
  DEFAULT_LOCAL_USER_ID,
  createBetRecord,
  settleBetRecord,
} from "../infrastructure/betLedger.js";
import { createFileBetLedger } from "../infrastructure/betLedgerServer.js";
import {
  assertAtlasAuthorizesBet,
  currentActiveQuote,
} from "../intelligence/betRegistrationPolicy.js";
import { getOperationalHistoryRepository } from "./operationalAnalysisServer.js";

const betStore = createFileBetLedger();

async function findAnalysisById(analysisId) {
  const id = String(analysisId || "").trim();

  if (!id) {
    throw new Error("analysisId es obligatorio.");
  }

  const history = await getOperationalHistoryRepository();
  const analyses = await history.list();
  const analysis = analyses.find((item) => item?.analysis_id === id);

  if (!analysis) {
    throw new Error(`No existe el análisis ${id}.`);
  }

  return analysis;
}

export async function registerTrackedBet({
  analysisId,
  stakeAmount,
  stakeUnits = null,
  currency = "COP",
}) {
  const analysis = await findAnalysisById(analysisId);
  const presentation = assertAtlasAuthorizesBet(analysis);
  const quote = currentActiveQuote(analysis);

  const ledger = await betStore.repository();

  const duplicate = (await ledger.list({
    ownerId: PERSONAL_OWNER_ID,
  })).find((bet) => bet?.analysis_id === analysis.analysis_id);

  if (duplicate) {
    throw new Error("Este análisis ya tiene una apuesta registrada para el usuario local.");
  }

  const director = analysis.director;
  const fixture = director.fixture;

  const bet = createBetRecord({
    betId: randomUUID(),
    userId: DEFAULT_LOCAL_USER_ID,
    ownerId: PERSONAL_OWNER_ID,
    analysisId: analysis.analysis_id,
    fixtureId: fixture.fixture_id,
    competition: fixture.competition || null,
    homeTeam: fixture.home_team || null,
    awayTeam: fixture.away_team || null,
    kickoffUtc: fixture.kickoff_utc || fixture.kickoff || null,
    marketFamily: director.market_evaluated?.family || quote.market_family,
    selection: director.selection || quote.selection,
    line: director.line ?? quote.line ?? null,
    analysisConfidenceScore:
      director.analysis_confidence_score ??
      analysis.analysis_confidence?.analysis_confidence_score ??
      null,
    preliminaryProbability:
      director.estimated_probability ??
      analysis.preliminary_probability?.point_estimate ??
      null,
    atlasSportsVerdict: presentation.analysis_decision.label,
    atlasPriceDecision: presentation.price_decision.label,
    bookmaker: quote.bookmaker_name,
    decimalOdds: quote.decimal_odds,
    stakeAmount,
    stakeUnits,
    currency,
    analyzedAt: director.analyzed_at || analysis.analyzed_at || null,
    placedAt: new Date().toISOString(),
  });

  await ledger.appendBet(bet);

  return bet;
}

export async function listMyTrackedBets(filters = {}) {
  const ledger = await betStore.repository();

  return ledger.list({
    ...filters,
    ownerId: PERSONAL_OWNER_ID,
  });
}

export async function getMyBetSummary() {
  const ledger = await betStore.repository();
  return ledger.summary(DEFAULT_LOCAL_USER_ID, PERSONAL_OWNER_ID);
}

export async function getTrackedBetById(betId) {
  const ledger = await betStore.repository();
  const bet = await ledger.getById(betId);

  if (!bet || !belongsToPersonalOwner(bet)) {
    return null;
  }

  return bet;
}

export async function settleTrackedBet({
  betId,
  outcome,
  resultSource = "manual_user_input",
  actualTotal = null,
}) {
  const ledger = await betStore.repository();
  const current = await ledger.getById(betId);

  if (!current || !belongsToPersonalOwner(current)) {
    throw new Error("No existe esa apuesta para el usuario local.");
  }

  if (current.status !== "pending") {
    throw new Error("La apuesta ya fue liquidada.");
  }

  const settled = settleBetRecord(current, {
    outcome,
    resultSource,
    actualTotal,
    settledAt: new Date().toISOString(),
  });

  await ledger.appendSettlement(settled);

  return settled;
}

export async function exportMyTrackedBets() {
  const ledger = await betStore.repository();
  return ledger.exportJson(DEFAULT_LOCAL_USER_ID, PERSONAL_OWNER_ID);
}
