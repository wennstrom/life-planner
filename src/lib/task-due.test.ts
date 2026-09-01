import { describe, expect, it } from 'vitest'
import { dueDateBadge } from './task-due'

describe('dueDateBadge', () => {
  const now = new Date(2026, 7, 31, 12, 0, 0)

  it('returns null when there is no due date', () => {
    expect(dueDateBadge(undefined, now)).toBeNull()
  })

  it('treats YYYY-MM-DD as a local calendar day', () => {
    const earlyMorning = new Date(2026, 7, 31, 1, 0, 0)
    expect(dueDateBadge('2026-08-30', earlyMorning)?.tone).toBe('overdue')
    expect(dueDateBadge('2026-08-31', earlyMorning)?.tone).toBe('thisWeek')
  })

  it('marks overdue dates red', () => {
    const badge = dueDateBadge('2026-08-01', now)
    expect(badge?.tone).toBe('overdue')
    expect(badge?.label).toMatch(/Aug/)
  })

  it('marks dates later this week orange', () => {
    const badge = dueDateBadge('2026-09-02', now)
    expect(badge?.tone).toBe('thisWeek')
  })

  it('marks later dates muted', () => {
    const badge = dueDateBadge('2026-10-01', now)
    expect(badge?.tone).toBe('later')
  })
})
