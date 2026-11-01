import { v } from "convex/values";

// Convex runs in UTC, so the server can't know where a user's day starts or
// ends. Clients send the local calendar day: its key (for `dayRecords`) and
// its [dayStartMs, dayEndMs) bounds.

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

// A local day is 23-25 hours around DST changes; leave room for odd offsets.
const MAX_DAY_LENGTH_MS = 26 * HOUR_MS;

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const dayWindowArgs = {
  dateKey: v.string(),
  dayStartMs: v.number(),
  dayEndMs: v.number(),
};

export type DayWindow = {
  dateKey: string;
  dayStartMs: number;
  dayEndMs: number;
};

export function assertValidDateKey(dateKey: string) {
  if (!DATE_KEY_PATTERN.test(dateKey)) {
    throw new Error("Invalid date");
  }
}

export function assertValidDayWindow(window: DayWindow) {
  assertValidDateKey(window.dateKey);
  const length = window.dayEndMs - window.dayStartMs;
  if (!(length > 0 && length <= MAX_DAY_LENGTH_MS)) {
    throw new Error("Invalid day window");
  }
}

export function assertValidRange(startMs: number, endMs: number) {
  if (!(endMs > startMs)) {
    throw new Error("Invalid range");
  }
}
