import { describe, expect, it } from 'vitest'
import { addDays, startOfDayMs, startOfWeekMonday, weekRangeMs } from './dates'

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
