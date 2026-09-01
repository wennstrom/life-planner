import { describe, expect, it } from 'vitest'
import { formatChecklistProgress } from './checklist'

describe('formatChecklistProgress', () => {
  it('returns null when there are no items', () => {
    expect(formatChecklistProgress(undefined)).toBeNull()
    expect(formatChecklistProgress([])).toBeNull()
  })

  it('counts completed items', () => {
    expect(
      formatChecklistProgress([
        { done: true },
        { done: false },
        { done: true },
      ]),
    ).toBe('2/3')
  })
})
