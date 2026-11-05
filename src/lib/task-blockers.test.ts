import { describe, expect, it } from 'vitest'
import {
  blockedBadgeLabel,
  blockerErrorText,
  blockerPickerOptions,
  blockerStateLabel,
} from './task-blockers'

describe('blockerPickerOptions', () => {
  it('leaves out the task, archived tasks and existing blockers', () => {
    const tasks = [
      { _id: 'a', title: 'A' },
      { _id: 'b', title: 'B' },
      { _id: 'c', title: 'C', archived: true },
      { _id: 'd', title: 'D' },
    ]
    expect(blockerPickerOptions(tasks, 'a', ['d'])).toEqual([
      { value: 'b', label: 'B' },
    ])
  })
})

describe('blockedBadgeLabel', () => {
  it('labels only tasks with open blockers', () => {
    expect(blockedBadgeLabel(0)).toBeNull()
    expect(blockedBadgeLabel(1)).toBe('Blocked')
    expect(blockedBadgeLabel(3)).toBe('Blocked by 3')
  })
})

describe('blockerStateLabel', () => {
  it('says why a blocker no longer blocks', () => {
    expect(blockerStateLabel({ open: true, done: false, archived: false })).toBeNull()
    expect(blockerStateLabel({ open: false, done: true, archived: false })).toBe('Done')
    expect(blockerStateLabel({ open: false, done: true, archived: true })).toBe(
      'Archived',
    )
  })
})

describe('blockerErrorText', () => {
  it('keeps the server message and falls back otherwise', () => {
    const error = new Error(
      "[CONVEX M(taskBlockers:add)] [Request ID: 1] Server Error\nUncaught Error: A task can't block itself\n    at handler",
    )
    expect(blockerErrorText(error, 'fallback')).toBe("A task can't block itself")
    expect(blockerErrorText('nope', 'fallback')).toBe('fallback')
  })
})
