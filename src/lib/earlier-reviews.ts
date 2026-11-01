/** Most earlier-day blocks fetched for the Today link and its queue. */
export const EARLIER_REVIEW_LIMIT = 50

/** Session-only: dismissing the link hides it until the tab is closed. */
export const EARLIER_REVIEWS_DISMISSED_KEY = 'planner.earlierReviewsDismissed'

export function earlierReviewsLabel(
  count: number,
  limit = EARLIER_REVIEW_LIMIT,
): string {
  const amount = count >= limit ? `${limit}+` : String(count)
  const noun = count === 1 ? 'block' : 'blocks'
  return `${amount} ${noun} from earlier days to review`
}

export function parseEarlierReviewsDismissed(value: string | null): boolean {
  return value === '1'
}
