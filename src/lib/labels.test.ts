import { describe, expect, it } from 'vitest'
import {
  existingLabelIds,
  matchesLabelFilter,
  toggleLabelId,
} from './labels'

describe('toggleLabelId', () => {
  it('adds and removes a label', () => {
    expect(toggleLabelId(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleLabelId(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('does not go over the cap but can still remove', () => {
    expect(toggleLabelId(['a', 'b'], 'c', 2)).toEqual(['a', 'b'])
    expect(toggleLabelId(['a', 'b'], 'b', 2)).toEqual(['a'])
  })
})

describe('existingLabelIds', () => {
  it('drops deleted labels and keeps order', () => {
    expect(
      existingLabelIds(['c', 'gone', 'a'], [{ _id: 'a' }, { _id: 'c' }]),
    ).toEqual(['c', 'a'])
  })
})

describe('matchesLabelFilter', () => {
  it('filters by one label, no label or all', () => {
    const tagged = { labelIds: ['a'] }
    const plain = {}
    expect(matchesLabelFilter(tagged, 'all')).toBe(true)
    expect(matchesLabelFilter(plain, 'all')).toBe(true)
    expect(matchesLabelFilter(tagged, 'a')).toBe(true)
    expect(matchesLabelFilter(tagged, 'b')).toBe(false)
    expect(matchesLabelFilter(plain, 'a')).toBe(false)
    expect(matchesLabelFilter(plain, 'none')).toBe(true)
    expect(matchesLabelFilter(tagged, 'none')).toBe(false)
  })
})
