import { describe, expect, it } from 'vitest'
import {
  addDays,
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

it('lists Monday through Sunday for the week containing 17 Oct 2026', () => {
  expect(weekStripDays(new Date(2026, 9, 17)).map((day) => day.dayNum)).toEqual([
    12, 13, 14, 15, 16, 17, 18,
  ])
  expect(weekStripDays(new Date(2026, 9, 17))[0]?.label).toBe('Mon')
  expect(weekStripDays(new Date(2026, 9, 17))[5]?.dateKey).toBe('2026-10-17')
})
