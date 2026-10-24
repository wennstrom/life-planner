import { useEffect, useMemo, useState } from 'react'
import { dateFromDateKey, formatDateKey, weekRangeMs } from './dates'
import { formatMinutes } from './format'
import type {
  FocusMinutes,
  ProjectTimeStats,
} from '../../convex/lib/projectStats'

export type { ProjectTimeStats }

/** Until `userSettings` exists, the stalled hint uses this many days. */
export const STALLED_AFTER_DAYS_DEFAULT = 14

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

export function roundToMinute(ms: number) {
  return Math.floor(ms / MINUTE) * MINUTE
}

/** The current time rounded down to the minute, refreshed every minute. */
export function useNowMinute() {
  const [nowMs, setNowMs] = useState(() => roundToMinute(Date.now()))
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    const tick = () => setNowMs(roundToMinute(Date.now()))
    const timeout = setTimeout(
      () => {
        tick()
        interval = setInterval(tick, MINUTE)
      },
      MINUTE - (Date.now() % MINUTE),
    )
    return () => {
      clearTimeout(timeout)
      if (interval) clearInterval(interval)
    }
  }, [])
  return nowMs
}

/** Args for `projects.stats` / `statsFor`: the local Monday-start week plus now. */
export function statsWindow(nowMs: number) {
  const { startMs, endMs } = weekRangeMs(new Date(nowMs))
  return { weekStartMs: startMs, weekEndMs: endMs, nowMs }
}

export function useStatsWindow() {
  const nowMs = useNowMinute()
  return useMemo(() => statsWindow(nowMs), [nowMs])
}

function calendarDaysBetween(earlierMs: number, laterMs: number) {
  const a = dateFromDateKey(formatDateKey(new Date(earlierMs)))
  const b = dateFromDateKey(formatDateKey(new Date(laterMs)))
  return Math.round((b.getTime() - a.getTime()) / DAY)
}

export function formatLastBlock(
  lastBlockStart: number | undefined,
  nowMs: number,
): string | null {
  if (lastBlockStart === undefined) return null
  const days = calendarDaysBetween(lastBlockStart, nowMs)
  if (days <= 0) return 'Last block: today'
  if (days === 1) return 'Last block: yesterday'
  if (days <= 60) return `Last block: ${days} days ago`
  return `Last block: ${new Date(lastBlockStart).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`
}

export function isStalled(
  stats: Pick<
    ProjectTimeStats,
    'lastBlockStart' | 'nextBlockStart' | 'remaining'
  >,
  createdAt: number,
  nowMs: number,
  days: number = STALLED_AFTER_DAYS_DEFAULT,
): boolean {
  if (days <= 0) return false
  if (stats.remaining.openCount === 0) return false
  if (stats.nextBlockStart !== undefined) return false
  return nowMs - (stats.lastBlockStart ?? createdAt) >= days * DAY
}

/** Monday–Friday dates from today through the goal date, inclusive. */
export function workingDaysUntil(today: string, goalDate: string): number {
  if (goalDate < today) return 0
  const end = dateFromDateKey(goalDate)
  let count = 0
  for (
    const day = dateFromDateKey(today);
    day.getTime() <= end.getTime();
    day.setDate(day.getDate() + 1)
  ) {
    const weekday = day.getDay()
    if (weekday !== 0 && weekday !== 6) count += 1
  }
  return count
}

export function hasAnyBlocks(stats: ProjectTimeStats) {
  return (
    stats.lastBlockStart !== undefined ||
    stats.nextBlockStart !== undefined ||
    stats.plannedWeekMinutes > 0
  )
}

/** "Deep 1h 45m · Shallow 45m", leaving out zero buckets. */
export function formatFocus(
  focus: FocusMinutes,
  options: { includeOther?: boolean } = {},
): string | null {
  const parts: Array<string> = []
  if (focus.deep > 0) parts.push(`Deep ${formatMinutes(focus.deep)}`)
  if (focus.shallow > 0) parts.push(`Shallow ${formatMinutes(focus.shallow)}`)
  if (options.includeOther && focus.other > 0) {
    parts.push(`Other ${formatMinutes(focus.other)}`)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}
