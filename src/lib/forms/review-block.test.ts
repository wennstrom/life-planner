import { describe, expect, it } from 'vitest'
import {
  emptyReviewBlockValues,
  firstReviewStepIndex,
  nextReviewStepIndex,
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

  it('accepts actualMinutes of 0', () => {
    expect(
      reviewBlockSchema.safeParse({
        ...emptyReviewBlockValues(60),
        actualMinutes: 0,
      }).success,
    ).toBe(true)
  })

  it('shows a useful message when time spent is invalid', () => {
    const result = reviewBlockSchema.safeParse({
      ...emptyReviewBlockValues(60),
      actualMinutes: Number.NaN,
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

describe('review wizard steps', () => {
  it('starts at the first unreviewed membership', () => {
    expect(
      firstReviewStepIndex([
        { review: { outcome: 'done' } },
        { review: undefined },
        { review: undefined },
      ]),
    ).toBe(1)
  })

  it('starts at 0 when every membership is already reviewed', () => {
    expect(
      firstReviewStepIndex([{ review: { outcome: 'done' } }]),
    ).toBe(0)
  })

  it('walks the next unreviewed membership after a save', () => {
    expect(
      nextReviewStepIndex(
        [{ review: undefined }, { review: undefined }, { review: undefined }],
        0,
      ),
    ).toBe(1)
  })

  it('returns undefined when no unreviewed memberships remain', () => {
    expect(
      nextReviewStepIndex(
        [{ review: undefined }, { review: { outcome: 'done' } }],
        0,
      ),
    ).toBeUndefined()
  })
})
