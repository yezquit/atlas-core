export const DEFAULT_ATLAS_TIMEZONE = "America/Bogota";

export function isValidTimeZone(value) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeZone(value) {
  return isValidTimeZone(value) ? value : DEFAULT_ATLAS_TIMEZONE;
}

function zonedParts(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function localDateTimeToUtc({ year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0 }, timeZone) {
  const desired = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let guess = desired;
  for (let index = 0; index < 4; index += 1) {
    const rendered = zonedParts(guess, timeZone);
    const renderedAsUtc = Date.UTC(
      Number(rendered.year),
      Number(rendered.month) - 1,
      Number(rendered.day),
      Number(rendered.hour),
      Number(rendered.minute),
      Number(rendered.second),
      millisecond
    );
    const adjustment = desired - renderedAsUtc;
    guess += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(guess);
}

export function localDateTimeToUtcIso(value, requestedTimeZone = DEFAULT_ATLAS_TIMEZONE) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "0"] = match;
  return localDateTimeToUtc({ year: Number(year), month: Number(month), day: Number(day), hour: Number(hour), minute: Number(minute), second: Number(second) }, normalizeTimeZone(requestedTimeZone)).toISOString();
}

function nextCalendarDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

export function localDateInterval(date, requestedTimeZone = DEFAULT_ATLAS_TIMEZONE) {
  const timeZone = normalizeTimeZone(requestedTimeZone);
  const [year, month, day] = String(date).split("-").map(Number);
  const start = localDateTimeToUtc({ year, month, day }, timeZone);
  const [nextYear, nextMonth, nextDay] = nextCalendarDate(date).split("-").map(Number);
  const nextStart = localDateTimeToUtc({ year: nextYear, month: nextMonth, day: nextDay }, timeZone);
  return {
    timezone: timeZone,
    local_calendar_date: date,
    local_start: `${date}T00:00:00.000`,
    local_end: `${date}T23:59:59.999`,
    utc_start: start.toISOString(),
    utc_end: new Date(nextStart.getTime() - 1).toISOString(),
  };
}

export function fixtureDateContext(instant, requestedTimeZone = DEFAULT_ATLAS_TIMEZONE) {
  const parsed = new Date(instant);
  const timeZone = normalizeTimeZone(requestedTimeZone);
  if (Number.isNaN(parsed.getTime())) {
    return { kickoff_utc: null, kickoff_local: null, timezone: timeZone, local_calendar_date: null, local_label: null };
  }
  const parts = zonedParts(parsed, timeZone);
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}:${parts.second}`;
  return {
    kickoff_utc: parsed.toISOString(),
    kickoff_local: `${date}T${time}`,
    timezone: timeZone,
    local_calendar_date: date,
    local_label: new Intl.DateTimeFormat("es-CO", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(parsed),
  };
}

export function isFixtureOnLocalDate(instant, localDate, timeZone) {
  return fixtureDateContext(instant, timeZone).local_calendar_date === localDate;
}
