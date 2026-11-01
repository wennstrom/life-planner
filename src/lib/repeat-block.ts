/** Mon–Sun, matching the week strip. Index 0 is Monday. */
export const REPEAT_WEEKDAYS = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
] as const

export const MAX_REPEAT_WEEKS = 8
/** Mirrors the server cap in `timeBlocks.duplicate`. */
export const MAX_DUPLICATE_STARTS = 60

/** 0 = Monday … 6 = Sunday. */
export function mondayIndex(ms: number): number {
  return (new Date(ms).getDay() + 6) % 7
}

/**
 * The same local clock time `days` days later. Uses the calendar, not
 * 24-hour steps, so a 09:00 block stays at 09:00 across a DST change.
 */
export function sameClockTimeInDays(startMs: number, days: number): number {
  const date = new Date(startMs)
  date.setDate(date.getDate() + days)
  return date.getTime()
}

export function clampRepeatWeeks(weeks: number): number {
  if (!Number.isFinite(weeks)) return 1
  return Math.min(Math.max(Math.floor(weeks), 1), MAX_REPEAT_WEEKS)
}

/**
 * Start times for copies on the chosen weekdays over the next `weeks` weeks,
 * counted from the day after the block. Picking the block's own weekday for
 * 2 weeks gives exactly 2 copies.
 */
export function repeatStarts(
  startMs: number,
  weekdays: ReadonlyArray<number>,
  weeks: number,
): number[] {
  const chosen = new Set(weekdays)
  const days = clampRepeatWeeks(weeks) * 7
  const starts: number[] = []
  for (let offset = 1; offset <= days; offset++) {
    const start = sameClockTimeInDays(startMs, offset)
    if (chosen.has(mondayIndex(start))) starts.push(start)
  }
  return starts.slice(0, MAX_DUPLICATE_STARTS)
}
