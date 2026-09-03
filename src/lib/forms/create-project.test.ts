import { describe, expect, it } from 'vitest'
import { BOARD_COLUMN_COLORS } from '../../../convex/lib/boardColumnColors'
import { createProjectSchema } from './create-project'

const valid = {
  name: 'Life planner',
  description: 'Ship the planner',
  color: '#6366f1',
  health: 'onTrack',
}

describe('createProjectSchema', () => {
  it('rejects a blank name', () => {
    expect(createProjectSchema.safeParse({ ...valid, name: '  ' }).success).toBe(
      false,
    )
  })

  it('accepts a trimmed name', () => {
    expect(createProjectSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts an omitted description', () => {
    const { description: _description, ...withoutDescription } = valid
    expect(createProjectSchema.safeParse(withoutDescription).success).toBe(true)
  })

  it('accepts an empty description', () => {
    expect(
      createProjectSchema.safeParse({ ...valid, description: '' }).success,
    ).toBe(true)
  })

  it('rejects a color outside the palette', () => {
    expect(
      createProjectSchema.safeParse({ ...valid, color: '#ffffff' }).success,
    ).toBe(false)
  })

  it('accepts each palette color', () => {
    for (const color of BOARD_COLUMN_COLORS) {
      expect(createProjectSchema.safeParse({ ...valid, color }).success).toBe(
        true,
      )
    }
  })

  it('defaults are not required in the payload if health is onTrack', () => {
    expect(
      createProjectSchema.safeParse({ ...valid, health: 'atRisk' }).success,
    ).toBe(true)
  })

  it('rejects an unknown health', () => {
    expect(
      createProjectSchema.safeParse({ ...valid, health: 'paused' }).success,
    ).toBe(false)
  })

  it('accepts an empty goalDate and a valid one', () => {
    expect(
      createProjectSchema.safeParse({ ...valid, goalDate: '' }).success,
    ).toBe(true)
    expect(
      createProjectSchema.safeParse({ ...valid, goalDate: '2026-09-30' }).success,
    ).toBe(true)
  })

  it('rejects an invalid goalDate', () => {
    expect(
      createProjectSchema.safeParse({ ...valid, goalDate: '2026-02-30' }).success,
    ).toBe(false)
  })
})
