import {
  exportMyTrackedBets,
  getMyBetSummary,
  listMyTrackedBets,
  registerTrackedBet,
  settleTrackedBet,
} from "@/core/services/betTrackerServer";
import {
  isLocalRequest,
  localAccessDeniedResponse,
} from "@/core/services/localAccessPolicy";

function filters(url) {
  const result = {};

  const status = url.searchParams.get("status");
  const market = url.searchParams.get("market");
  const fixtureId = url.searchParams.get("fixtureId");

  if (status) result.status = status;
  if (market) result.market = market;

  if (fixtureId) {
    const numericFixtureId = Number(fixtureId);
    if (Number.isInteger(numericFixtureId) && numericFixtureId > 0) {
      result.fixtureId = numericFixtureId;
    }
  }

  return result;
}

export async function GET(request) {
  if (!isLocalRequest(request)) {
    return localAccessDeniedResponse();
  }

  const url = new URL(request.url);

  try {
    if (url.searchParams.get("format") === "json") {
      const json = await exportMyTrackedBets();

      return new Response(json, {
        headers: {
          "content-type": "application/json",
          "content-disposition": "attachment; filename=atlas-bets.json",
        },
      });
    }

    const bets = await listMyTrackedBets(filters(url));
    const summary = await getMyBetSummary();

    return Response.json({
      status: "success",
      count: bets.length,
      bets,
      summary,
    });
  } catch (error) {
    return Response.json(
      {
        status: "unavailable",
        errorCode: "bet_list_failed",
        message: error?.message || "No fue posible cargar las apuestas.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  if (!isLocalRequest(request)) {
    return localAccessDeniedResponse();
  }

  let input;

  try {
    input = await request.json();
  } catch {
    return Response.json(
      {
        status: "unavailable",
        errorCode: "invalid_json",
      },
      { status: 400 }
    );
  }

  if (!input?.analysisId) {
    return Response.json(
      {
        status: "unavailable",
        errorCode: "analysis_id_required",
        message: "El análisis es obligatorio.",
      },
      { status: 400 }
    );
  }

  const stakeAmount = Number(input.stakeAmount);

  if (!Number.isFinite(stakeAmount) || stakeAmount <= 0) {
    return Response.json(
      {
        status: "unavailable",
        errorCode: "invalid_stake_amount",
        message: "El monto apostado debe ser mayor que cero.",
      },
      { status: 400 }
    );
  }

  let stakeUnits = null;

  if (
    input.stakeUnits !== null &&
    input.stakeUnits !== undefined &&
    input.stakeUnits !== ""
  ) {
    stakeUnits = Number(input.stakeUnits);

    if (!Number.isFinite(stakeUnits) || stakeUnits <= 0) {
      return Response.json(
        {
          status: "unavailable",
          errorCode: "invalid_stake_units",
          message: "Las unidades deben ser mayores que cero.",
        },
        { status: 400 }
      );
    }
  }

  try {
    const bet = await registerTrackedBet({
      analysisId: input.analysisId,
      stakeAmount,
      stakeUnits,
      currency: input.currency || "COP",
    });

    return Response.json(
      {
        status: "success",
        message: "Apuesta registrada correctamente.",
        bet,
      },
      { status: 201 }
    );
  } catch (error) {
    return Response.json(
      {
        status: "unavailable",
        errorCode: "bet_registration_failed",
        message: error?.message || "No fue posible registrar la apuesta.",
      },
      { status: 409 }
    );
  }
}

export async function PATCH(request) {
  if (!isLocalRequest(request)) {
    return localAccessDeniedResponse();
  }

  let input;

  try {
    input = await request.json();
  } catch {
    return Response.json(
      {
        status: "unavailable",
        errorCode: "invalid_json",
      },
      { status: 400 }
    );
  }

  if (!input?.betId) {
    return Response.json(
      {
        status: "unavailable",
        errorCode: "bet_id_required",
        message: "La apuesta es obligatoria.",
      },
      { status: 400 }
    );
  }

  if (!["won", "lost", "void"].includes(input.outcome)) {
    return Response.json(
      {
        status: "unavailable",
        errorCode: "invalid_outcome",
        message: "El resultado debe ser won, lost o void.",
      },
      { status: 400 }
    );
  }

  const resultSource =
    input.resultSource === "api_football"
      ? "api_football"
      : "manual_user_input";

  let actualTotal = null;

  if (
    input.actualTotal !== null &&
    input.actualTotal !== undefined &&
    input.actualTotal !== ""
  ) {
    actualTotal = Number(input.actualTotal);

    if (!Number.isFinite(actualTotal)) {
      return Response.json(
        {
          status: "unavailable",
          errorCode: "invalid_actual_total",
          message: "El total real debe ser numérico.",
        },
        { status: 400 }
      );
    }
  }

  try {
    const bet = await settleTrackedBet({
      betId: input.betId,
      outcome: input.outcome,
      resultSource,
      actualTotal,
    });

    return Response.json({
      status: "success",
      message: "Apuesta liquidada correctamente.",
      bet,
    });
  } catch (error) {
    return Response.json(
      {
        status: "unavailable",
        errorCode: "bet_settlement_failed",
        message: error?.message || "No fue posible liquidar la apuesta.",
      },
      { status: 409 }
    );
  }
}
