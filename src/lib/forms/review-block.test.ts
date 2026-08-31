import { describe, expect, it } from 'vitest'
import {
  emptyReviewBlockValues,
  firstReviewStepIndex,
  nextReviewQueueIndex,
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

describe('calculateRemainingMinutes', () => {
  it('splits remaining minutes across unreviewed tasks', async () => {
    const { calculateRemainingMinutes } = await import('./review-block')
    const memberships = [
      { review: undefined },
      { review: undefined },
      { review: undefined },
    ]
    expect(calculateRemainingMinutes(60, memberships, 0)).toBe(20)
  })

  it('splits remaining minutes after one task is reviewed', async () => {
    const { calculateRemainingMinutes } = await import('./review-block')
    const memberships = [
      { review: { actualMinutes: 25 } },
      { review: undefined },
      { review: undefined },
    ]
    expect(calculateRemainingMinutes(60, memberships, 1)).toBe(17)
  })

  it('returns all remaining minutes when only one task is left', async () => {
    const { calculateRemainingMinutes } = await import('./review-block')
    const memberships = [
      { review: { actualMinutes: 25 } },
      { review: { actualMinutes: 15 } },
      { review: undefined },
    ]
    expect(calculateRemainingMinutes(60, memberships, 2)).toBe(20)
  })

  it('returns 0 when more time was spent than planned', async () => {
    const { calculateRemainingMinutes } = await import('./review-block')
    const memberships = [
      { review: { actualMinutes: 40 } },
      { review: { actualMinutes: 30 } },
      { review: undefined },
    ]
    expect(calculateRemainingMinutes(60, memberships, 2)).toBe(0)
  })

  it('handles the initial step correctly', async () => {
    const { calculateRemainingMinutes } = await import('./review-block')
    const memberships = [
      { review: undefined },
      { review: undefined },
    ]
    expect(calculateRemainingMinutes(60, memberships, 0)).toBe(30)
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

  it('after saving index 0 of two unreviewed memberships, continues at 1', () => {
    expect(
      nextReviewStepIndex(
        [{ review: undefined }, { review: undefined }],
        0,
      ),
    ).toBe(1)
  })

  it('after saving index 1 of two unreviewed memberships, finishes', () => {
    expect(
      nextReviewStepIndex(
        [{ review: undefined }, { review: undefined }],
        1,
      ),
    ).toBeUndefined()
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

describe('shutdown review queue', () => {
  const blockA = { _id: 'a' }
  const blockB = { _id: 'b' }
  const blockC = { _id: 'c' }

  it('stays at index 0 when the queue has already shrunk', () => {
    expect(nextReviewQueueIndex([blockB], 0, blockA._id)).toBe(0)
  })

  it('finishes early when the live queue id is passed after shrink', () => {
    const shrunkQueue = [blockB]
    expect(nextReviewQueueIndex(shrunkQueue, 0, blockB._id)).toBeUndefined()
    expect(nextReviewQueueIndex(shrunkQueue, 0, blockA._id)).toBe(0)
  })

  it('stays at index 0 when the completed block is still in the snapshot', () => {
    expect(nextReviewQueueIndex([blockA, blockB], 0, blockA._id)).toBe(0)
  })

  it('finishes when no sittings remain after filtering the completed block', () => {
    expect(nextReviewQueueIndex([], 0, blockA._id)).toBeUndefined()
    expect(nextReviewQueueIndex([blockA], 0, blockA._id)).toBeUndefined()
  })

  it('finishes after the last sitting in an unshrunk two-item queue', () => {
    expect(nextReviewQueueIndex([blockA, blockB], 1, blockB._id)).toBeUndefined()
  })

  it('continues at the same index for a later sitting in a three-item queue', () => {
    expect(nextReviewQueueIndex([blockA, blockC], 1, blockB._id)).toBe(1)
  })
})
