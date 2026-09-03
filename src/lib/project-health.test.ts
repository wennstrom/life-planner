import { describe, expect, it } from 'vitest'
import { goalDateCaption, isGoalOverdue } from './project-health'

describe('isGoalOverdue', () => {
  it('is false when missing, today, or future', () => {
    expect(isGoalOverdue(undefined, '2026-09-03')).toBe(false)
    expect(isGoalOverdue('2026-09-03', '2026-09-03')).toBe(false)
    expect(isGoalOverdue('2026-09-04', '2026-09-03')).toBe(false)
  })

  it('is true when the calendar day is before today', () => {
    expect(isGoalOverdue('2026-09-02', '2026-09-03')).toBe(true)
  })
})

describe('goalDateCaption', () => {
  it('returns null without a date', () => {
    expect(goalDateCaption(undefined, '2026-09-03')).toBeNull()
  })

  it('formats Goal vs Overdue with a short month day', () => {
    expect(goalDateCaption('2026-09-30', '2026-09-03')).toEqual({
      text: 'Goal · Sep 30',
      overdue: false,
    })
    expect(goalDateCaption('2026-08-15', '2026-09-03')).toEqual({
      text: 'Overdue · Aug 15',
      overdue: true,
    })
  })
})
