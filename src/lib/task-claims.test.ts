import { describe, expect, it } from 'vitest'
import { claimMinutesRemaining } from './task-claims'

describe('claimMinutesRemaining', () => {
  it('rounds an active partial minute up and expires at the boundary', () => {
    expect(claimMinutesRemaining(60_001, 0)).toBe(2)
    expect(claimMinutesRemaining(60_000, 0)).toBe(1)
    expect(claimMinutesRemaining(60_000, 59_999)).toBe(1)
    expect(claimMinutesRemaining(60_000, 60_000)).toBe(0)
    expect(claimMinutesRemaining(60_000, 60_001)).toBe(0)
  })
})
