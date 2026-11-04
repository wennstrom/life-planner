import { describe, expect, it } from 'vitest'
import {
  MAX_REPEAT_WEEKS,
  clampRepeatWeeks,
  mondayIndex,
  repeatStarts,
  sameClockTimeInDays,
} from './repeat-block'

// Wednesday 2026-10-21, 09:30 local time.
const WED = new Date(2026, 9, 21, 9, 30).getTime()

function clock(ms: number) {
  const date = new Date(ms)
  return [date.getHours(), date.getMinutes()]
}

describe('mondayIndex', () => {
  it('counts from Monday', () => {
    expect(mondayIndex(new Date(2026, 9, 19).getTime())).toBe(0)
    expect(mondayIndex(WED)).toBe(2)
    expect(mondayIndex(new Date(2026, 9, 25).getTime())).toBe(6)
  })
})

describe('sameClockTimeInDays', () => {
  it('keeps the local clock time across a DST change', () => {
    // Spans late October / early November, when many zones change clocks.
    for (let days = 1; days <= 21; days++) {
      expect(clock(sameClockTimeInDays(WED, days))).toEqual([9, 30])
    }
    expect(new Date(sameClockTimeInDays(WED, 1)).getDate()).toBe(22)
  })
})

describe('clampRepeatWeeks', () => {
  it('keeps weeks between 1 and the max', () => {
    expect(clampRepeatWeeks(0)).toBe(1)
    expect(clampRepeatWeeks(3.7)).toBe(3)
    expect(clampRepeatWeeks(99)).toBe(MAX_REPEAT_WEEKS)
    expect(clampRepeatWeeks(Number.NaN)).toBe(1)
  })
})

describe('repeatStarts', () => {
  it('gives one copy per week on the same weekday', () => {
    const starts = repeatStarts(WED, [2], 2)
    expect(starts.map((ms) => new Date(ms).getDate())).toEqual([28, 4])
    expect(starts.every((ms) => mondayIndex(ms) === 2)).toBe(true)
    expect(starts.map(clock)).toEqual([
      [9, 30],
      [9, 30],
    ])
  })

  it('covers the chosen weekdays over the next N weeks, in order', () => {
    const starts = repeatStarts(WED, [0, 4], 1)
    // Fri 23 Oct, then Mon 26 Oct.
    expect(starts.map((ms) => new Date(ms).getDate())).toEqual([23, 26])
  })

  it('returns nothing when no weekday is chosen', () => {
    expect(repeatStarts(WED, [], 4)).toEqual([])
  })

  it('stays under the server cap', () => {
    expect(repeatStarts(WED, [0, 1, 2, 3, 4, 5, 6], 99)).toHaveLength(56)
  })
})
