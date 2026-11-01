export function formatDateKey(date: Date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function dateFromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1)
}

export function formatDisplayDate(date: Date = new Date()) {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

/** "Tue, Oct 20" in the user's locale. */
export function formatShortDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function startOfWeekMonday(date: Date = new Date()) {
  const copy = new Date(date)
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  copy.setHours(0, 0, 0, 0)
  return copy
}

/** ISO 8601 week number (Monday-based weeks). */
export function isoWeekNumber(date: Date = new Date()) {
  const thursday = addDays(startOfWeekMonday(date), 3)
  const week1Thursday = addDays(
    startOfWeekMonday(new Date(thursday.getFullYear(), 0, 4)),
    3,
  )
  return (
    1 +
    Math.round(
      (thursday.getTime() - week1Thursday.getTime()) / (7 * 24 * 60 * 60 * 1000),
    )
  )
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export function weekStripDays(anchor: Date): Array<{
  dateKey: string
  label: string
  dayNum: number
}> {
  const start = startOfWeekMonday(anchor)
  return WEEKDAY_LABELS.map((label, index) => {
    const date = addDays(start, index)
    return { dateKey: formatDateKey(date), label, dayNum: date.getDate() }
  })
}

export function startOfDayMs(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy.getTime()
}

/**
 * The local calendar day for `dateKey` as the server needs it: the key plus
 * its [dayStartMs, dayEndMs) bounds. The server runs in UTC, so the client
 * works these out.
 */
export function dayWindow(dateKey: string) {
  const start = dateFromDateKey(dateKey)
  return {
    dateKey,
    dayStartMs: start.getTime(),
    dayEndMs: startOfDayMs(addDays(start, 1)),
  }
}

/** Same local clock time on the next calendar day, across DST changes. */
export function sameClockTimeNextDay(startMs: number) {
  return addDays(new Date(startMs), 1).getTime()
}

/**
 * The block's start moved forward a day at a time until it is after `nowMs`,
 * and at least one day. For a block reviewed today that is tomorrow; for a
 * block from an earlier day it is the next upcoming slot, never the past.
 */
export function followUpStart(blockStart: number, nowMs: number) {
  let start = sameClockTimeNextDay(blockStart)
  while (start <= nowMs) start = sameClockTimeNextDay(start)
  return start
}

export function weekRangeMs(anchorDate: Date = new Date()) {
  const weekStart = startOfWeekMonday(anchorDate)
  const weekEnd = addDays(weekStart, 7)
  return {
    weekStart,
    weekEnd,
    startMs: startOfDayMs(weekStart),
    endMs: startOfDayMs(weekEnd),
  }
}

export function msToTimeLabel(ms: number) {
  const d = new Date(ms)
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function relativeTime(ms: number) {
  const diff = Date.now() - ms
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
