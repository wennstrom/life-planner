import { describe, expect, it } from 'vitest'
import {
  formatFocus,
  formatLastBlock,
  isStalled,
  statsWindow,
  workingDaysUntil,
} from './project-stats'
import type { ProjectTimeStats } from './project-stats'

const DAY = 24 * 60 * 60 * 1000

function stats(overrides: Partial<ProjectTimeStats> = {}): ProjectTimeStats {
  return {
    plannedWeekMinutes: 0,
    spentWeekMinutes: 0,
    spentAllTimeMinutes: 0,
    focusAllTime: { deep: 0, shallow: 0, other: 0 },
    focusWeek: { deep: 0, shallow: 0, other: 0 },
    remaining: { estimatedMinutes: 0, unestimatedCount: 0, openCount: 1 },
    ...overrides,
  }
}

describe('statsWindow', () => {
  it('starts the week on local Monday and puts Sunday night in the same week', () => {
    const sundayNight = new Date(2026, 9, 25, 23, 30).getTime()
    const window = statsWindow(sundayNight)
    expect(window.weekStartMs).toBe(new Date(2026, 9, 19).getTime())
    expect(window.weekEndMs).toBe(new Date(2026, 9, 26).getTime())
    expect(window.nowMs).toBe(sundayNight)
  })
})

describe('formatLastBlock', () => {
  const now = new Date(2026, 9, 24, 9, 0).getTime()

  it('uses words for today and yesterday', () => {
    expect(formatLastBlock(new Date(2026, 9, 24, 7).getTime(), now)).toBe(
      'Last block: today',
    )
    expect(formatLastBlock(new Date(2026, 9, 23, 22).getTime(), now)).toBe(
      'Last block: yesterday',
    )
  })

  it('counts calendar days, then switches to a date after 60 days', () => {
    expect(formatLastBlock(new Date(2026, 9, 21, 10).getTime(), now)).toBe(
      'Last block: 3 days ago',
    )
    expect(formatLastBlock(now - 90 * DAY, now)).toMatch(/^Last block: \w+ \d+, 2026$/)
  })

  it('returns null with no block', () => {
    expect(formatLastBlock(undefined, now)).toBeNull()
  })
})

describe('isStalled', () => {
  const now = 100 * DAY

  it('flags at exactly N days since the last block', () => {
    expect(isStalled(stats({ lastBlockStart: now - 14 * DAY }), 0, now)).toBe(true)
    expect(isStalled(stats({ lastBlockStart: now - 13 * DAY }), 0, now)).toBe(false)
  })

  it('falls back to creation time when there was never a block', () => {
    expect(isStalled(stats(), now - 20 * DAY, now)).toBe(true)
    expect(isStalled(stats(), now - 2 * DAY, now)).toBe(false)
  })

  it('is suppressed by a future block, no open tasks, or N = 0', () => {
    expect(
      isStalled(stats({ nextBlockStart: now + DAY }), now - 20 * DAY, now),
    ).toBe(false)
    expect(
      isStalled(
        stats({
          remaining: { estimatedMinutes: 0, unestimatedCount: 0, openCount: 0 },
        }),
        now - 20 * DAY,
        now,
      ),
    ).toBe(false)
    expect(isStalled(stats(), now - 20 * DAY, now, 0)).toBe(false)
  })
})

describe('workingDaysUntil', () => {
  it('counts the same weekday as one', () => {
    expect(workingDaysUntil('2026-10-21', '2026-10-21')).toBe(1)
  })

  it('skips weekends', () => {
    // Fri 23 → Tue 27: Fri, Mon, Tue
    expect(workingDaysUntil('2026-10-23', '2026-10-27')).toBe(3)
  })

  it('is zero for a goal in the past', () => {
    expect(workingDaysUntil('2026-10-21', '2026-10-01')).toBe(0)
  })
})

describe('formatFocus', () => {
  it('leaves out zero buckets and other unless asked', () => {
    expect(formatFocus({ deep: 105, shallow: 0, other: 30 })).toBe('Deep 1h 45m')
    expect(
      formatFocus({ deep: 0, shallow: 45, other: 120 }, { includeOther: true }),
    ).toBe('Shallow 45m · Other 2h')
    expect(formatFocus({ deep: 0, shallow: 0, other: 0 })).toBeNull()
  })
})
