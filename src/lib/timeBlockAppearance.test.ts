import { describe, expect, it } from 'vitest'
import {
  BLOCK_CONTROL_SELECTOR,
  TIME_BLOCK_CHIP_SELECTOR,
  blockNeedsReview,
  blockToneClass,
  isBlockControl,
  isTimeBlockChipTarget,
  reviewBorderClass,
  reviewOutcomeLabel,
  sharedReviewOutcome,
  truncateChipTitle,
} from './timeBlockAppearance'

/** Lucide icons dispatch pointer events from SVG nodes, which are not HTMLElements. */
function svgDescendantOf(selector: string): EventTarget {
  return {
    closest: (query: string) => (query === selector ? {} : null),
  } as unknown as EventTarget
}

describe('blockToneClass', () => {
  it('uses google tone for google-origin blocks', () => {
    expect(blockToneClass({ origin: 'google', hasTasks: false })).toBe(
      'bg-event-google',
    )
  })

  it('uses work tone when the block has tasks', () => {
    expect(blockToneClass({ origin: 'app', hasTasks: true })).toBe(
      'bg-event-work',
    )
  })

  it('uses personal tone when the block has no tasks', () => {
    expect(blockToneClass({ origin: 'app', hasTasks: false })).toBe(
      'bg-event-personal',
    )
  })
})

describe('sharedReviewOutcome', () => {
  it('returns undefined when there are no memberships', () => {
    expect(sharedReviewOutcome([])).toBeUndefined()
  })

  it('returns the outcome when every membership shares it', () => {
    expect(
      sharedReviewOutcome([
        { review: { outcome: 'done' } },
        { review: { outcome: 'done' } },
      ]),
    ).toBe('done')
  })

  it('returns undefined when any membership is unreviewed', () => {
    expect(
      sharedReviewOutcome([{ review: { outcome: 'partial' } }, {}]),
    ).toBeUndefined()
  })

  it('returns undefined when reviewed outcomes differ', () => {
    expect(
      sharedReviewOutcome([
        { review: { outcome: 'done' } },
        { review: { outcome: 'missed' } },
      ]),
    ).toBeUndefined()
  })
})

describe('reviewBorderClass', () => {
  it('keeps a transparent 3px border when unreviewed', () => {
    expect(reviewBorderClass(undefined)).toBe('border-l-[3px] border-l-transparent')
  })

  it('maps outcomes to success / warning / destructive', () => {
    expect(reviewBorderClass('done')).toBe('border-l-[3px] border-l-success')
    expect(reviewBorderClass('partial')).toBe('border-l-[3px] border-l-warning')
    expect(reviewBorderClass('missed')).toBe(
      'border-l-[3px] border-l-destructive',
    )
  })
})

describe('reviewOutcomeLabel', () => {
  it('returns the locked display labels', () => {
    expect(reviewOutcomeLabel('done')).toBe('Done')
    expect(reviewOutcomeLabel('partial')).toBe('Partial')
    expect(reviewOutcomeLabel('missed')).toBe('Missed')
  })
})

describe('truncateChipTitle', () => {
  it('keeps titles of 15 characters or fewer', () => {
    expect(truncateChipTitle('Short')).toBe('Short')
    expect(truncateChipTitle('123456789012345')).toBe('123456789012345')
  })

  it('truncates longer titles with an ellipsis', () => {
    expect(truncateChipTitle('1234567890123456')).toBe('123456789012345...')
    expect(truncateChipTitle('Deep work session')).toBe('Deep work sessi...')
  })
})

describe('blockNeedsReview', () => {
  const now = 1_000_000
  const base = {
    origin: 'app' as const,
    end: now - 1,
    memberships: [{ review: undefined }],
  }

  it('is true for a past app block with unreviewed memberships', () => {
    expect(blockNeedsReview(base, now)).toBe(true)
  })

  it('is false when the block has not ended', () => {
    expect(blockNeedsReview({ ...base, end: now + 1 }, now)).toBe(false)
  })

  it('is false when every membership is reviewed', () => {
    expect(
      blockNeedsReview(
        {
          ...base,
          memberships: [
            { review: { outcome: 'done' } },
            { review: { outcome: 'done' } },
          ],
        },
        now,
      ),
    ).toBe(false)
  })

  it('is false when there are no memberships', () => {
    expect(blockNeedsReview({ ...base, memberships: [] }, now)).toBe(false)
  })

  it('is false for google blocks', () => {
    expect(blockNeedsReview({ ...base, origin: 'google' }, now)).toBe(false)
  })
})

describe('isBlockControl', () => {
  it('matches Review only (no delete control)', () => {
    expect(BLOCK_CONTROL_SELECTOR).toContain('data-review-button')
    expect(BLOCK_CONTROL_SELECTOR).not.toContain('data-delete-button')
  })

  it('does not match null or non-elements', () => {
    expect(isBlockControl(null)).toBe(false)
    expect(isBlockControl({} as EventTarget)).toBe(false)
  })

  it('matches SVG descendants of the review button', () => {
    expect(isBlockControl(svgDescendantOf(BLOCK_CONTROL_SELECTOR))).toBe(true)
  })
})

describe('isTimeBlockChipTarget', () => {
  it('matches SVG descendants of a time-block chip', () => {
    expect(
      isTimeBlockChipTarget(
        svgDescendantOf(TIME_BLOCK_CHIP_SELECTOR),
      ),
    ).toBe(true)
  })

  it('does not match null or non-elements', () => {
    expect(isTimeBlockChipTarget(null)).toBe(false)
    expect(isTimeBlockChipTarget({} as EventTarget)).toBe(false)
  })
})
