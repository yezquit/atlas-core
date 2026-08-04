import { CONTEXT_STATUS } from "../contracts/operationalContracts.js";

function preMatch(kickoff, observedAt) {
  return Number.isFinite(Date.parse(kickoff)) && Date.parse(observedAt) <= Date.parse(kickoff);
}

export function normalizeLineups({ response = [], fixture, coverageAvailable = false, fetchedAt = new Date().toISOString() } = {}) {
  if (!coverageAvailable) return { status: CONTEXT_STATUS.ENDPOINT_UNAVAILABLE, lineups: [], source: "api-football", fetched_at: fetchedAt, warnings: ["lineups_not_covered"] };
  if (!preMatch(fixture?.date?.utc, fetchedAt)) return { status: CONTEXT_STATUS.DATA_UNAVAILABLE, lineups: [], source: "api-football", fetched_at: fetchedAt, warnings: ["post_kickoff_data_rejected"] };
  const lineups = response.filter((item) => Number(item?.team?.id) === Number(fixture?.teams?.home?.id) || Number(item?.team?.id) === Number(fixture?.teams?.away?.id));
  if (!lineups.length) return { status: CONTEXT_STATUS.DATA_UNAVAILABLE, lineups: [], source: "api-football", fetched_at: fetchedAt, warnings: ["lineups_not_published"] };
  const confirmed = lineups.every((item) => Array.isArray(item?.startXI) && item.startXI.length >= 11);
  return { status: confirmed ? CONTEXT_STATUS.CONFIRMED : CONTEXT_STATUS.PROBABLE, lineups, source: "api-football", fetched_at: fetchedAt, warnings: confirmed ? [] : ["lineup_not_confirmed"] };
}

export function normalizeInjuries({ response = [], fixture, coverageAvailable = false, fetchedAt = new Date().toISOString() } = {}) {
  if (!coverageAvailable) return { status: CONTEXT_STATUS.ENDPOINT_UNAVAILABLE, injuries: [], source: "api-football", fetched_at: fetchedAt, warnings: ["injuries_not_covered"] };
  if (!preMatch(fixture?.date?.utc, fetchedAt)) return { status: CONTEXT_STATUS.DATA_UNAVAILABLE, injuries: [], source: "api-football", fetched_at: fetchedAt, warnings: ["post_kickoff_data_rejected"] };
  const injuries = response.filter((item) => Number(item?.fixture?.id) === Number(fixture?.fixtureId));
  return injuries.length
    ? { status: CONTEXT_STATUS.CONFIRMED, injuries, source: "api-football", fetched_at: fetchedAt, warnings: [] }
    : { status: CONTEXT_STATUS.NO_REPORTS, injuries: [], source: "api-football", fetched_at: fetchedAt, warnings: ["no_injuries_reported_is_not_verified_absence"] };
}

export function createUnavailablePreMatchItem(kind, reason = "endpoint_unavailable") {
  return { kind, status: CONTEXT_STATUS.ENDPOINT_UNAVAILABLE, source: "api-football", fetched_at: null, warnings: [reason] };
}
