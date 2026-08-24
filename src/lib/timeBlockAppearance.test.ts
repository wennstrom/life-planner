import { describe, expect, it } from 'vitest'
import {
  blockNeedsReview,
  blockToneClass,
  reviewBorderClass,
  reviewOutcomeLabel,
} from './timeBlockAppearance'

describe('blockToneClass', () => {
  it('uses google tone for google-origin blocks', () => {
    expect(blockToneClass({ origin: 'google' })).toBe('bg-event-google')
  })

  it('uses work tone when a task is linked', () => {
    expect(blockToneClass({ origin: 'app', taskId: 'jd7task' })).toBe(
      'bg-event-work',
    )
  })

  it('uses personal tone otherwise', () => {
    expect(blockToneClass({ origin: 'app' })).toBe('bg-event-personal')
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

describe('blockNeedsReview', () => {
  const now = 1_000_000
  const base = {
    origin: 'app' as const,
    taskId: 'jd7task',
    end: now - 1,
  }

  it('is true for a past unreviewed app block with a task', () => {
    expect(blockNeedsReview(base, now)).toBe(true)
  })

  it('is false when the block has not ended', () => {
    expect(blockNeedsReview({ ...base, end: now + 1 }, now)).toBe(false)
  })

  it('is false once reviewed', () => {
    expect(
      blockNeedsReview({ ...base, review: { outcome: 'done' } }, now),
    ).toBe(false)
  })

  it('is false for google blocks and blocks without a task', () => {
    expect(blockNeedsReview({ ...base, origin: 'google' }, now)).toBe(false)
    expect(blockNeedsReview({ ...base, taskId: undefined }, now)).toBe(false)
  })
})
