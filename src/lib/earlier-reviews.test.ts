import { describe, expect, it } from 'vitest'
import {
  earlierReviewsLabel,
  parseEarlierReviewsDismissed,
} from './earlier-reviews'

describe('earlierReviewsLabel', () => {
  it('uses singular and plural nouns', () => {
    expect(earlierReviewsLabel(1)).toBe('1 block from earlier days to review')
    expect(earlierReviewsLabel(3)).toBe('3 blocks from earlier days to review')
  })

  it('shows a plus when the list hit the limit', () => {
    expect(earlierReviewsLabel(50, 50)).toBe(
      '50+ blocks from earlier days to review',
    )
  })
})

describe('parseEarlierReviewsDismissed', () => {
  it('is dismissed only for the stored flag', () => {
    expect(parseEarlierReviewsDismissed('1')).toBe(true)
    expect(parseEarlierReviewsDismissed(null)).toBe(false)
    expect(parseEarlierReviewsDismissed('0')).toBe(false)
  })
})
