import { describe, expect, it } from 'vitest'
import { canPlanAgain, planAgainDraft } from './plan-again'

describe('canPlanAgain', () => {
  it('is offered for partial and missed, not done', () => {
    expect(canPlanAgain('partial')).toBe(true)
    expect(canPlanAgain('missed')).toBe(true)
    expect(canPlanAgain('done')).toBe(false)
  })
})

describe('planAgainDraft', () => {
  it('keeps title, tasks, and duration at the same clock time tomorrow', () => {
    const start = new Date(2026, 9, 31, 14, 30).getTime()
    const draft = planAgainDraft({
      title: 'Write report',
      start,
      end: start + 90 * 60000,
      memberships: [
        { taskId: 'a', taskTitle: 'Outline' },
        { taskId: 'b', taskTitle: 'Draft' },
      ],
    })
    const tomorrow = new Date(draft.start)
    expect(draft.title).toBe('Write report')
    expect(draft.tasks.map((t) => t.taskId)).toEqual(['a', 'b'])
    expect(draft.dateKey).toBe('2026-11-01')
    expect([tomorrow.getHours(), tomorrow.getMinutes()]).toEqual([14, 30])
    expect(draft.end - draft.start).toBe(90 * 60000)
  })

  it('works for a block without tasks', () => {
    const start = new Date(2026, 2, 28, 9, 0).getTime()
    const draft = planAgainDraft({
      title: 'Walk',
      start,
      end: start + 30 * 60000,
      memberships: [],
    })
    expect(draft.tasks).toEqual([])
    expect(draft.dateKey).toBe('2026-03-29')
    expect(new Date(draft.start).getHours()).toBe(9)
  })
})
