import { describe, expect, it } from 'vitest'
import { dueDateBadge } from './task-due'

describe('dueDateBadge', () => {
  const now = new Date('2026-08-31T12:00:00')

  it('returns null when there is no due date', () => {
    expect(dueDateBadge(undefined, now)).toBeNull()
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
