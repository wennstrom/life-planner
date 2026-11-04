// Time conversion for the MCP tools. Agents send ISO 8601 times with an
// explicit offset and get back times in the user's own zone, so neither side
// has to guess what "9am" means.

const ISO_WITH_OFFSET =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

export const ISO_WITH_OFFSET_HINT =
  "must be an ISO 8601 time with a UTC offset, e.g. 2026-11-04T09:00:00+01:00 or 2026-11-04T08:00:00Z";

export function isIsoWithOffset(value: string): boolean {
  return parseIsoWithOffsetOrNull(value) !== null;
}

function parseIsoWithOffsetOrNull(value: string): number | null {
  const match = ISO_WITH_OFFSET.exec(value);
  if (!match) return null;
  const [, , month, day, hour, minute] = match;
  const second = match[6] as string | undefined;
  const offset = match[7];
  if (Number(month) < 1 || Number(month) > 12) return null;
  if (Number(day) < 1 || Number(day) > 31) return null;
  if (Number(hour) > 23 || Number(minute) > 59) return null;
  if (second !== undefined && Number(second) > 59) return null;
  if (offset !== "Z") {
    const [h, m] = offset.slice(1).split(":").map(Number);
    if (h > 18 || m > 59) return null;
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  // Date.parse rolls 2026-02-31 over to March; reject dates that don't exist.
  const offsetMinutes =
    offset === "Z"
      ? 0
      : (offset[0] === "-" ? -1 : 1) *
        (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6)));
  const wallClock = new Date(ms + offsetMinutes * 60_000);
  if (wallClock.getUTCDate() !== Number(day)) return null;
  return ms;
}

/** Milliseconds since the epoch. Throws if the string has no offset. */
export function parseIsoWithOffset(value: string, field = "time"): number {
  const ms = parseIsoWithOffsetOrNull(value);
  if (ms === null) {
    throw new Error(`${field} ${ISO_WITH_OFFSET_HINT}`);
  }
  return ms;
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "long",
    });
    formatters.set(timezone, formatter);
  }
  return formatter;
}

function zonedParts(ms: number, timezone: string): ZonedParts {
  const parts: Record<string, string> = {};
  for (const part of formatterFor(timezone).formatToParts(new Date(ms))) {
    parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: parts.weekday,
  };
}

function pad(value: number, length = 2): string {
  return String(Math.abs(value)).padStart(length, "0");
}

/** "2026-11-04T09:00:00+01:00": the instant as wall-clock time in `timezone`. */
export function formatLocal(ms: number, timezone: string): string {
  const wholeSecond = Math.floor(ms / 1000) * 1000;
  const p = zonedParts(wholeSecond, timezone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offsetMinutes = Math.round((asUtc - wholeSecond) / 60_000);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const offset = `${sign}${pad(Math.trunc(offsetMinutes / 60))}:${pad(offsetMinutes % 60)}`;
  return (
    `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}` +
    `T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${offset}`
  );
}

/** The local calendar date ("YYYY-MM-DD") of the instant in `timezone`. */
export function dateKeyInZone(ms: number, timezone: string): string {
  const p = zonedParts(ms, timezone);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** The local weekday name ("Wednesday") of the instant in `timezone`. */
export function weekdayInZone(ms: number, timezone: string): string {
  return zonedParts(ms, timezone).weekday;
}
