import { describe, expect, it } from 'vitest'
import { BOARD_COLUMN_COLORS } from '../../convex/lib/boardColumnColors'
import { nextProjectColor } from './project-color'

describe('nextProjectColor', () => {
  it('picks the first palette color that is not already used', () => {
    expect(nextProjectColor(['#6366f1', '#3b82f6'])).toBe('#22c55e')
  })

  it('matches used colors with case-sensitive exact hex strings', () => {
    expect(nextProjectColor(['#6366F1'])).toBe('#6366f1')
  })

  it('wraps to #6366f1 when all eight palette colors are used', () => {
    expect(nextProjectColor([...BOARD_COLUMN_COLORS])).toBe('#6366f1')
  })
})
