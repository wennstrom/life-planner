import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addDays,
  dateFromDateKey,
  dayWindow,
  followUpStart,
  formatDateKey,
  sameClockTimeNextDay,
  startOfDayMs,
  startOfWeekMonday,
  weekRangeMs,
  weekStripDays,
} from './dates'

describe('weekRangeMs', () => {
  it('covers Monday 00:00 through next Monday 00:00', () => {
    const wednesday = new Date(2026, 8, 9, 10, 24)
    const range = weekRangeMs(wednesday)
    const expectedStart = startOfWeekMonday(wednesday)

    expect(range.weekStart).toEqual(expectedStart)
    expect(range.weekEnd).toEqual(addDays(expectedStart, 7))
    expect(range.startMs).toBe(startOfDayMs(expectedStart))
    expect(range.endMs).toBe(startOfDayMs(addDays(expectedStart, 7)))
  })
})

it('reads a date key back as that local calendar day', () => {
  expect(formatDateKey(dateFromDateKey('2026-10-16'))).toBe('2026-10-16')
})

it('lists Monday through Sunday for the week containing 17 Oct 2026', () => {
  expect(weekStripDays(new Date(2026, 9, 17)).map((day) => day.dayNum)).toEqual([
    12, 13, 14, 15, 16, 17, 18,
  ])
  expect(weekStripDays(new Date(2026, 9, 17))[0]?.label).toBe('Mon')
  expect(weekStripDays(new Date(2026, 9, 17))[5]?.dateKey).toBe('2026-10-17')
})

describe('in Stockholm', () => {
  const originalTz = process.env.TZ
  beforeAll(() => {
    process.env.TZ = 'Europe/Stockholm'
  })
  afterAll(() => {
    process.env.TZ = originalTz
  })

  it('dayWindow covers local midnight to local midnight', () => {
    expect(dayWindow('2026-11-01')).toEqual({
      dateKey: '2026-11-01',
      dayStartMs: Date.UTC(2026, 9, 31, 23),
      dayEndMs: Date.UTC(2026, 10, 1, 23),
    })
  })

  it('puts 00:30 local on the local day, not the UTC one', () => {
    const justAfterMidnight = Date.UTC(2026, 9, 31, 23, 30)
    const { dateKey, dayStartMs, dayEndMs } = dayWindow(
      formatDateKey(new Date(justAfterMidnight)),
    )
    expect(dateKey).toBe('2026-11-01')
    expect(justAfterMidnight).toBeGreaterThanOrEqual(dayStartMs)
    expect(justAfterMidnight).toBeLessThan(dayEndMs)
  })

  it('dayWindow follows DST changes', () => {
    const hours = (dateKey: string) => {
      const { dayStartMs, dayEndMs } = dayWindow(dateKey)
      return (dayEndMs - dayStartMs) / 3_600_000
    }
    expect(hours('2026-03-29')).toBe(23)
    expect(hours('2026-10-25')).toBe(25)
  })

  it('sameClockTimeNextDay keeps the local time across a DST change', () => {
    const saturdayNine = Date.UTC(2026, 9, 24, 7)
    const next = sameClockTimeNextDay(saturdayNine)
    expect(next).toBe(Date.UTC(2026, 9, 25, 8))
    expect(new Date(next).getHours()).toBe(9)
  })
})

describe('followUpStart', () => {
  const HOUR = 3600000
  const DAY = 24 * HOUR
  it('is the next day for a block reviewed the same day', () => {
    const nineAm = new Date(2026, 9, 20, 9).getTime()
    expect(followUpStart(nineAm, nineAm + 8 * HOUR)).toBe(
      new Date(2026, 9, 21, 9).getTime(),
    )
  })

  it('skips past days for a block from earlier days', () => {
    const nineAm = new Date(2026, 9, 20, 9).getTime()
    const now = nineAm + 5 * DAY + 2 * HOUR
    const start = followUpStart(nineAm, now)
    expect(start).toBeGreaterThan(now)
    expect(start - now).toBeLessThan(DAY)
    expect(new Date(start).getHours()).toBe(9)
  })
})
