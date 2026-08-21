import { describe, expect, it } from 'vitest'
import {
  emptyReviewBlockValues,
  reviewBlockSchema,
  toReviewBlockArgs,
} from './review-block'

describe('reviewBlockSchema', () => {
  it('accepts blocked with an empty reason', () => {
    expect(
      reviewBlockSchema.safeParse({
        ...emptyReviewBlockValues(60),
        blocked: true,
        blockedReason: '',
      }).success,
    ).toBe(true)
  })

  it('rejects actualMinutes below 1', () => {
    expect(
      reviewBlockSchema.safeParse({
        ...emptyReviewBlockValues(60),
        actualMinutes: 0,
      }).success,
    ).toBe(false)
  })

  it('shows a useful message when time spent is invalid', () => {
    for (const actualMinutes of [0, Number.NaN]) {
      const result = reviewBlockSchema.safeParse({
        ...emptyReviewBlockValues(60),
        actualMinutes,
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({
            path: ['actualMinutes'],
            message: 'Enter time spent in minutes',
          }),
        )
      }
    }
  })
})

describe('toReviewBlockArgs', () => {
  it('omits empty optionals and sends scheduleNext only when true', () => {
    expect(toReviewBlockArgs(emptyReviewBlockValues(45))).toEqual({
      outcome: 'done',
      actualMinutes: 45,
      focus: undefined,
      note: undefined,
      nextStep: undefined,
      blockedReason: undefined,
      scheduleNext: undefined,
    })
  })

  it('sends blockedReason only when blocked', () => {
    expect(
      toReviewBlockArgs({
        ...emptyReviewBlockValues(45),
        blocked: false,
        blockedReason: 'ignored',
      }).blockedReason,
    ).toBeUndefined()
  })
})
