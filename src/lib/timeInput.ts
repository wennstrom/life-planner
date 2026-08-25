export type ParsedTime = { hours: number; minutes: number }

const END_OF_DAY_MINUTES = 23 * 60 + 59

export function formatTime(hours: number, minutes: number) {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function parseTimeInput(raw: string): ParsedTime | null {
  const trimmed = raw.trim()
  if (!trimmed || /am|pm/i.test(trimmed)) return null

  let hours: number
  let minutes: number

  if (trimmed.includes(':')) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed)
    if (!match) return null
    hours = Number(match[1])
    minutes = Number(match[2])
  } else if (/^\d{3,4}$/.test(trimmed)) {
    if (trimmed.length === 3) {
      hours = Number(trimmed[0])
      minutes = Number(trimmed.slice(1))
    } else {
      hours = Number(trimmed.slice(0, 2))
      minutes = Number(trimmed.slice(2))
    }
  } else {
    return null
  }

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null
  }

  return { hours, minutes }
}

export function canonicalTime(raw: string) {
  const parsed = parseTimeInput(raw)
  if (!parsed) return null
  return formatTime(parsed.hours, parsed.minutes)
}

export function minutesFromCanonical(time: string) {
  const parsed = parseTimeInput(time)
  if (!parsed) return null
  return parsed.hours * 60 + parsed.minutes
}

function timeFromMinutes(totalMinutes: number) {
  const clamped = Math.min(Math.max(totalMinutes, 0), END_OF_DAY_MINUTES)
  const hours = Math.floor(clamped / 60)
  const minutes = clamped % 60
  return formatTime(hours, minutes)
}

export function formatDurationLabel(durationMs: number) {
  const totalMin = Math.round(durationMs / 60_000)
  const hours = Math.floor(totalMin / 60)
  const minutes = totalMin % 60
  if (hours === 0) return `${minutes} min`
  if (minutes === 0) return `${hours} hr`
  return `${hours} hr ${minutes} min`
}

export function fifteenMinuteSlots() {
  const slots: Array<string> = []
  for (let minutes = 0; minutes < 24 * 60; minutes += 15) {
    slots.push(timeFromMinutes(minutes))
  }
  return slots
}

export function startTimeOptions() {
  return fifteenMinuteSlots().map((value) => ({ value, label: value }))
}

function durationLabelBetween(startTime: string, endTime: string) {
  const start = minutesFromCanonical(startTime)
  const end = minutesFromCanonical(endTime)
  if (start == null || end == null) return ''
  return formatDurationLabel((end - start) * 60_000)
}

export function endTimeOptions(startTime: string) {
  const start = minutesFromCanonical(startTime)
  if (start == null) return []

  const options: Array<{ value: string; label: string }> = []
  for (const value of fifteenMinuteSlots()) {
    const minutes = minutesFromCanonical(value)
    if (minutes == null || minutes <= start) continue
    options.push({
      value,
      label: `${value} (${durationLabelBetween(startTime, value)})`,
    })
  }

  if (start < END_OF_DAY_MINUTES) {
    const value = '23:59'
    options.push({
      value,
      label: `${value} (${durationLabelBetween(startTime, value)})`,
    })
  }

  return options
}

export function isEndAfterStart(start: string, end: string) {
  const startMinutes = minutesFromCanonical(start)
  const endMinutes = minutesFromCanonical(end)
  if (startMinutes == null || endMinutes == null) return false
  return endMinutes > startMinutes
}

export function endAfterDuration(startTime: string, durationMinutes: number) {
  const start = minutesFromCanonical(startTime)
  if (start == null) return startTime
  return timeFromMinutes(start + durationMinutes)
}

export function shiftEndPreservingDuration({
  previousStart,
  previousEnd,
  nextStart,
}: {
  previousStart: string
  previousEnd: string
  nextStart: string
}) {
  const prevStart = minutesFromCanonical(previousStart)
  const prevEnd = minutesFromCanonical(previousEnd)
  const next = minutesFromCanonical(nextStart)
  if (prevStart == null || prevEnd == null || next == null) return previousEnd
  const duration = Math.max(prevEnd - prevStart, 0)
  return timeFromMinutes(next + duration)
}
