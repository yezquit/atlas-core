import {
  PERSONAL_OWNER_ID,
  belongsToPersonalOwner,
} from "../auth/personalIdentity.js";

export const DEFAULT_LOCAL_USER_ID = "local-user";

const VALID_BET_OUTCOMES = new Set(["won", "lost", "void"]);
const VALID_COMBINATION_MODES = new Set(["automatic", "manual", "mixed"]);
const COMBINATION_LIMITS = Object.freeze({
  parlay: Object.freeze({ minimum: 2, maximum: 4 }),
  dream: Object.freeze({ minimum: 5, maximum: 15 }),
});
const VALID_COMBINATION_ODDS_SOURCES = new Set([
  "atlas_complete_coverage",
  "manual_user_input",
]);

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function positiveNumber(value, field) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new TypeError(`${field}_must_be_positive`);
  }

  return numeric;
}

function roundMoney(value) {
  return Number(Number(value).toFixed(2));
}

function combinationLegSnapshot(leg = {}) {
  const fixtureId = Number(leg.fixture_id ?? leg.fixtureId);
  const marketFamily = leg.market_family ?? leg.marketId ?? null;

  if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
    throw new TypeError("combination_leg_fixture_id_required");
  }
  if (!marketFamily) {
    throw new TypeError("combination_leg_market_family_required");
  }

  return Object.freeze({
    fixture_id: fixtureId,
    competition: leg.competition ?? null,
    home_team: leg.home_team ?? leg.homeTeam ?? null,
    away_team: leg.away_team ?? leg.awayTeam ?? null,
    fixture: leg.fixture ?? null,
    kickoff_utc: leg.kickoff_utc ?? leg.kickoffUtc ?? leg.kickoff ?? null,
    market_family: String(marketFamily),
    selection: leg.selection ?? null,
    direction: leg.direction ?? null,
    line: numberOrNull(leg.line),
    sports_score: numberOrNull(leg.sports_score ?? leg.sportsScore),
    preliminary_probability: numberOrNull(
      leg.preliminary_probability ?? leg.preliminaryProbability ?? leg.probability
    ),
    decimal_odds: numberOrNull(leg.decimal_odds ?? leg.decimalOdds),
    economic_status:
      leg.economic_status ??
      leg.economic_price_status ??
      leg.price_status ??
      null,
  });
}

export function createBetRecord({
  betId,
  userId = DEFAULT_LOCAL_USER_ID,
  ownerId = PERSONAL_OWNER_ID,
  analysisId,
  fixtureId,
  competition = null,
  homeTeam = null,
  awayTeam = null,
  kickoffUtc = null,
  marketFamily = null,
  selection = null,
  line = null,
  analysisConfidenceScore = null,
  preliminaryProbability = null,
  atlasSportsVerdict = null,
  atlasPriceDecision = null,
  bookmaker,
  decimalOdds,
  stakeAmount,
  stakeUnits = null,
  currency = "COP",
  analyzedAt = null,
  placedAt = new Date().toISOString(),
} = {}) {
  if (!betId) throw new TypeError("bet_id_required");
  if (!userId) throw new TypeError("user_id_required");
  if (!ownerId) throw new TypeError("owner_id_required");
  if (!analysisId) throw new TypeError("analysis_id_required");
  if (!fixtureId) throw new TypeError("fixture_id_required");
  if (!bookmaker) throw new TypeError("bookmaker_required");

  const odds = positiveNumber(decimalOdds, "decimal_odds");
  const amount = positiveNumber(stakeAmount, "stake_amount");

  const units =
    stakeUnits === null || stakeUnits === undefined || stakeUnits === ""
      ? null
      : positiveNumber(stakeUnits, "stake_units");

  return Object.freeze({
    contract: "BetRecord",
    version: 1,

    bet_id: String(betId),
    user_id: String(userId),
    owner_id: String(ownerId),
    analysis_id: String(analysisId),
    fixture_id: Number(fixtureId),

    competition,
    home_team: homeTeam,
    away_team: awayTeam,
    kickoff_utc: kickoffUtc,

    market_family: marketFamily,
    selection,
    line: numberOrNull(line),

    analysis_confidence_score: numberOrNull(analysisConfidenceScore),
    preliminary_probability: numberOrNull(preliminaryProbability),

    atlas_sports_verdict: atlasSportsVerdict,
    atlas_price_decision: atlasPriceDecision,

    bookmaker: String(bookmaker),
    decimal_odds: odds,

    stake_amount: amount,
    stake_units: units,
    currency: String(currency || "COP").toUpperCase(),

    status: "pending",

    result_source: null,
    actual_total: null,

    payout: null,
    profit_loss: null,

    analyzed_at: analyzedAt,
    placed_at: placedAt,
    settled_at: null,
  });
}

export function createCombinationBetRecord({
  betId,
  userId = DEFAULT_LOCAL_USER_ID,
  ownerId = PERSONAL_OWNER_ID,
  combinationId,
  product,
  mode,
  legs,
  bookmaker,
  decimalOdds,
  oddsSource,
  stakeAmount,
  stakeUnits = null,
  currency = "COP",
  placedAt = new Date().toISOString(),
} = {}) {
  if (!betId) throw new TypeError("bet_id_required");
  if (!userId) throw new TypeError("user_id_required");
  if (!ownerId) throw new TypeError("owner_id_required");
  if (!combinationId) throw new TypeError("combination_id_required");
  if (!bookmaker) throw new TypeError("bookmaker_required");

  const limits = COMBINATION_LIMITS[product];
  if (!limits) throw new TypeError("invalid_combination_product");
  if (!VALID_COMBINATION_MODES.has(mode)) {
    throw new TypeError("invalid_combination_mode");
  }
  if (!Array.isArray(legs) || legs.length < limits.minimum || legs.length > limits.maximum) {
    throw new TypeError("invalid_combination_leg_count");
  }
  if (!VALID_COMBINATION_ODDS_SOURCES.has(oddsSource)) {
    throw new TypeError("invalid_combination_odds_source");
  }

  const odds = positiveNumber(decimalOdds, "decimal_odds");
  if (odds <= 1) throw new TypeError("decimal_odds_must_be_greater_than_one");
  const amount = positiveNumber(stakeAmount, "stake_amount");
  const units =
    stakeUnits === null || stakeUnits === undefined || stakeUnits === ""
      ? null
      : positiveNumber(stakeUnits, "stake_units");
  const immutableLegs = Object.freeze(legs.map(combinationLegSnapshot));

  return Object.freeze({
    contract: "BetRecord",
    version: 2,

    bet_id: String(betId),
    user_id: String(userId),
    owner_id: String(ownerId),
    bet_type: "combination",
    combination_id: String(combinationId),
    product,
    mode,
    legs: immutableLegs,

    bookmaker: String(bookmaker),
    decimal_odds: odds,
    odds_source: oddsSource,

    stake_amount: amount,
    stake_units: units,
    currency: String(currency || "COP").toUpperCase(),

    status: "pending",
    result_source: null,
    actual_total: null,
    payout: null,
    profit_loss: null,
    placed_at: placedAt,
    settled_at: null,
  });
}

export function settleBetRecord(
  bet,
  {
    outcome,
    resultSource = "manual_user_input",
    actualTotal = null,
    settledAt = new Date().toISOString(),
  } = {}
) {
  if (!bet?.bet_id) throw new TypeError("bet_required");

  if (!VALID_BET_OUTCOMES.has(outcome)) {
    throw new TypeError("invalid_bet_outcome");
  }

  const stake = Number(bet.stake_amount);
  const odds = Number(bet.decimal_odds);

  const payout =
    outcome === "won"
      ? roundMoney(stake * odds)
      : outcome === "void"
        ? roundMoney(stake)
        : 0;

  const profitLoss =
    outcome === "won"
      ? roundMoney(stake * (odds - 1))
      : outcome === "lost"
        ? roundMoney(-stake)
        : 0;

  return Object.freeze({
    ...bet,

    status: outcome,
    result_source: resultSource,
    actual_total: numberOrNull(actualTotal),

    payout,
    profit_loss: profitLoss,

    settled_at: settledAt,
  });
}

export function createMemoryBetLedger(initialEvents = []) {
  const events = [...initialEvents];

  function currentBets() {
    const bets = new Map();

    for (const event of events) {
      if (event.type === "bet_registered") {
        bets.set(event.payload.bet_id, event.payload);
      }

      if (event.type === "bet_settled" && bets.has(event.payload.bet_id)) {
        bets.set(event.payload.bet_id, event.payload);
      }
    }

    return [...bets.values()];
  }

  return {
    async appendBet(bet) {
      if (!bet?.bet_id) throw new TypeError("bet_id_required");

      if (
        events.some(
          (event) =>
            event.type === "bet_registered" &&
            event.payload.bet_id === bet.bet_id
        )
      ) {
        throw new Error("bet_id_already_exists");
      }

      events.push({
        type: "bet_registered",
        schema_version: 1,
        recorded_at: bet.placed_at,
        payload: bet,
      });

      return bet;
    },

    async appendSettlement(settledBet) {
      if (!settledBet?.bet_id) throw new TypeError("bet_id_required");

      const existing = currentBets().find(
        (item) => item.bet_id === settledBet.bet_id
      );

      if (!existing) throw new Error("bet_not_found");
      if (existing.status !== "pending") {
        throw new Error("bet_already_settled");
      }

      events.push({
        type: "bet_settled",
        schema_version: 1,
        recorded_at: settledBet.settled_at,
        payload: settledBet,
      });

      return settledBet;
    },

    async getById(betId) {
      return currentBets().find((item) => item.bet_id === betId) || null;
    },

    async list(filters = {}) {
      return currentBets()
        .filter(
          (item) =>
            (!filters.userId || item.user_id === filters.userId) &&
            (!filters.ownerId || belongsToPersonalOwner(item, filters.ownerId)) &&
            (!filters.status || item.status === filters.status) &&
            (!filters.market || item.market_family === filters.market) &&
            (!filters.fixtureId ||
              Number(item.fixture_id) === Number(filters.fixtureId))
        )
        .sort(
          (left, right) =>
            Date.parse(right.placed_at) - Date.parse(left.placed_at)
        );
    },

    async summary(userId = DEFAULT_LOCAL_USER_ID, ownerId = null) {
      const bets = await this.list(ownerId ? { ownerId } : { userId });

      const settled = bets.filter((item) =>
        ["won", "lost", "void"].includes(item.status)
      );

      const financial = settled.filter((item) =>
        ["won", "lost"].includes(item.status)
      );

      const totalStaked = bets.reduce(
        (sum, item) => sum + Number(item.stake_amount || 0),
        0
      );

      const settledStake = financial.reduce(
        (sum, item) => sum + Number(item.stake_amount || 0),
        0
      );

      const netProfitLoss = settled.reduce(
        (sum, item) => sum + Number(item.profit_loss || 0),
        0
      );

      return {
        contract: "BetLedgerSummary",
        version: 1,

        user_id: userId,
        owner_id: ownerId || PERSONAL_OWNER_ID,

        bet_count: bets.length,
        pending_count: bets.filter((item) => item.status === "pending").length,
        won_count: bets.filter((item) => item.status === "won").length,
        lost_count: bets.filter((item) => item.status === "lost").length,
        void_count: bets.filter((item) => item.status === "void").length,

        settled_count: settled.length,

        total_staked: roundMoney(totalStaked),

        total_payout: roundMoney(
          settled.reduce(
            (sum, item) => sum + Number(item.payout || 0),
            0
          )
        ),

        net_profit_loss: roundMoney(netProfitLoss),

        roi: totalStaked
          ? Number((netProfitLoss / totalStaked).toFixed(4))
          : null,

        settled_roi: settledStake
          ? Number((netProfitLoss / settledStake).toFixed(4))
          : null,
      };
    },

    async exportJson(userId = DEFAULT_LOCAL_USER_ID, ownerId = null) {
      return JSON.stringify(
        {
          schema_version: 1,
          exported_at: new Date().toISOString(),
          user_id: userId,
          owner_id: ownerId || PERSONAL_OWNER_ID,

          bets: await this.list(ownerId ? { ownerId } : { userId }),
          summary: await this.summary(userId, ownerId),
        },
        null,
        2
      );
    },

    events,
  };
}
