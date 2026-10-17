import { describe, expect, it } from 'vitest'
import { focusColumnTarget, type FocusColumn } from './focus-column'

const columns: Array<FocusColumn> = [
  { _id: 'test', order: 2, isDone: false },
  { _id: 'done', order: 3, isDone: true },
  { _id: 'doing', order: 1, isDone: false },
]

describe('focusColumnTarget', () => {
  it('checks into the done column', () => {
    expect(focusColumnTarget(columns, true)).toBe('done')
  })

  it('unchecks into the first non-done column by order', () => {
    expect(focusColumnTarget(columns, false)).toBe('doing')
  })

  it('returns null when the destination column is missing', () => {
    expect(focusColumnTarget([], true)).toBeNull()
    expect(
      focusColumnTarget([{ _id: 'doing', order: 1, isDone: false }], true),
    ).toBeNull()
    expect(
      focusColumnTarget([{ _id: 'done', order: 1, isDone: true }], false),
    ).toBeNull()
  })
})
