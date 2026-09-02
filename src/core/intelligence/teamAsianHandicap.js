// Team Asian Handicap — núcleo matemático y contrato de dominio.
//
// Mercado deportivo INDEPENDIENTE de cuotas: el settlement se calcula
// exclusivamente a partir del marcador real y la línea, nunca de
// decimal_odds, implied_probability, bookmaker ni disponibilidad del
// proveedor (ver ATLAS_DECISIONS_LOG.md, decisiones 8-13).
//
// Identidad exacta de un candidato: fixture_id + market_family + team_id +
// line. El lado apostado se identifica por equipo explícito (side: "home"
// u "away"), NUNCA por direction="over"|"under" — esa vocabulario solo
// tiene sentido para mercados de total, no por equipo (decisión 13).
//
// Reutiliza la matemática de partición/combinación de líneas de cuarto ya
// verificada para asian_total_goals (settlementMath.js), generalizada allí
// sin cambiar su comportamiento — ver asianTotalGoals.js.
//
// Este módulo NO genera candidatos productivos, NO construye una
// distribución deportiva de diferencia de goles y NO se conecta a
// Jornada/Radar/Individual/Parlay/LIVE/UI. Es exclusivamente el contrato
// matemático de settlement, listo para que un bloque futuro lo use.

import { combineSettlementParts, splitQuarterStepLine } from "./settlementMath.js";

export const TEAM_ASIAN_HANDICAP_FAMILY = "team_asian_handicap";
export const TEAM_ASIAN_HANDICAP_LABEL = "Asiático — Hándicap por equipo";

// Vocabulario ya usado en el repo para identificar equipo (home_team/
// away_team, homeTeamProfile/awayTeamProfile, as_home/as_away) — no se
// inventa un alias nuevo.
export const TEAM_ASIAN_HANDICAP_SIDES = Object.freeze(["home", "away"]);

export function isValidTeamAsianHandicapSide(side) {
  return TEAM_ASIAN_HANDICAP_SIDES.includes(String(side || "").toLowerCase());
}

// Contrato de línea válida para team_asian_handicap: cualquier número
// finito, múltiplo exacto de 0.25, CON signo (a diferencia de
// isValidAsianTotalGoalLine, que exige líneas no negativas porque
// asian_total_goals no tiene concepto de "a favor de quién"). No se impone
// ningún rango artificial ni se valida contra disponibilidad de bookmaker
// — la línea es deportiva por definición.
export function isValidTeamAsianHandicapLine(line) {
  const numericLine = Number(line);
  if (!Number.isFinite(numericLine)) return false;
  const quarter = numericLine * 4;
  return Math.abs(quarter - Math.round(quarter)) <= 1e-8;
}

/**
 * Divide una línea de hándicap por equipo (firmada, pasos de 0.25) en sus
 * componentes de medio punto. Composición delgada sobre
 * splitQuarterStepLine (settlementMath.js) — sin envoltorio de
 * direction/stake_fraction propio de asian_total_goals, porque Team AH no
 * tiene concepto de over/under: el signo de la línea ya codifica a favor de
 * quién corre el hándicap.
 *
 * @param {number} line
 * @returns {number[]|null}
 */
export function splitTeamAsianHandicapLine(line) {
  if (!isValidTeamAsianHandicapLine(line)) return null;
  return splitQuarterStepLine(Number(line));
}

/**
 * Traduce side (home|away) a la perspectiva del equipo seleccionado. Pura:
 * no consulta ningún dato de proveedor ni construye un candidato — solo
 * resuelve qué marcador cuenta como "propio" y cuál como "rival" según el
 * lado elegido.
 */
export function selectedTeamGoalsFromSide({ side, homeGoals, awayGoals } = {}) {
  const normalizedSide = String(side || "").toLowerCase();
  if (normalizedSide === "home") return { selectedTeamGoals: Number(homeGoals), opponentGoals: Number(awayGoals) };
  if (normalizedSide === "away") return { selectedTeamGoals: Number(awayGoals), opponentGoals: Number(homeGoals) };
  return { selectedTeamGoals: NaN, opponentGoals: NaN };
}

function evaluateMargin(adjustedMargin) {
  if (adjustedMargin > 0) return "win";
  if (adjustedMargin < 0) return "loss";
  return "push";
}

/**
 * Settlement canónico de Team Asian Handicap.
 *
 * goal_difference = selectedTeamGoals - opponentGoals
 * adjusted_margin = goal_difference + (cada componente de la línea)
 *
 * Para líneas enteras/.5 (un solo componente): adjusted_margin>0→full_win,
 * =0→push, <0→full_loss. Para quarter-lines (.25/.75, dos componentes de
 * medio punto): cada componente se evalúa por separado y se combina con la
 * misma reducción de 5 estados que asian_total_goals ya usa
 * (combineSettlementParts, settlementMath.js) — nunca inventa un sexto
 * estado.
 *
 * No depende de cuotas, bookmaker ni disponibilidad del proveedor — solo
 * del marcador real y la línea.
 *
 * @param {{selectedTeamGoals:number, opponentGoals:number, line:number}} input
 * @returns {{status:"full_win"|"half_win"|"push"|"half_loss"|"full_loss"|"not_evaluable", goal_difference:number|null, exact_line:number|null, parts:object[]}}
 */
export function settleTeamAsianHandicap({ selectedTeamGoals, opponentGoals, line } = {}) {
  const selected = Number(selectedTeamGoals);
  const opponent = Number(opponentGoals);
  const halves = splitTeamAsianHandicapLine(line);
  if (!Number.isFinite(selected) || !Number.isFinite(opponent) || !halves) {
    return { status: "not_evaluable", goal_difference: null, exact_line: null, parts: [] };
  }
  const goalDifference = selected - opponent;
  const stakeFraction = halves.length === 2 ? 0.5 : 1;
  const parts = halves.map((halfLine) => {
    const adjustedMargin = Number((goalDifference + halfLine).toFixed(6));
    return {
      line: halfLine,
      stake_fraction: stakeFraction,
      adjusted_margin: adjustedMargin,
      result: evaluateMargin(adjustedMargin),
    };
  });
  return {
    status: combineSettlementParts(parts),
    goal_difference: goalDifference,
    exact_line: Number(line),
    parts,
  };
}

/**
 * Identidad exacta de un candidato Team Asian Handicap: fixture_id +
 * market_family + team_id + line. No usa direction=over|under (decisión
 * 13) — el lado ya queda identificado por team_id/side fuera de esta
 * cadena. Puramente descriptiva: no construye un candidato productivo.
 */
export function buildTeamAsianHandicapCandidateId({ fixtureId, teamId, line } = {}) {
  return `${TEAM_ASIAN_HANDICAP_FAMILY}:${fixtureId}:${teamId}:${Number(line)}`;
}
