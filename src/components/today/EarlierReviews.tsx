import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { X } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { ReviewBlockModal } from '~/components/time-block/ReviewBlockModal'
import { dateFromDateKey, startOfDayMs } from '~/lib/dates'
import {
  EARLIER_REVIEWS_DISMISSED_KEY,
  EARLIER_REVIEW_LIMIT,
  earlierReviewsLabel,
  parseEarlierReviewsDismissed,
} from '~/lib/earlier-reviews'
import { nextReviewQueueIndex } from '~/lib/forms/review-block'
import { useNowMinute } from '~/lib/project-stats'

function getInitialDismissed(): boolean {
  if (typeof window === 'undefined') return false
  return parseEarlierReviewsDismissed(
    sessionStorage.getItem(EARLIER_REVIEWS_DISMISSED_KEY),
  )
}

/**
 * A quiet link to review blocks left unreviewed on earlier days. Only shown
 * when there are some; dismissing it hides it for the rest of the session.
 */
export function EarlierReviews({ dateKey }: { dateKey: string }) {
  const nowMs = useNowMinute()
  const beforeMs = startOfDayMs(dateFromDateKey(dateKey))
  // Keep the last result while the minute ticks over, so the link doesn't flicker.
  const { data: blocks } = useQuery({
    ...convexQuery(api.timeBlocks.listUnreviewedBefore, {
      beforeMs,
      nowMs,
      limit: EARLIER_REVIEW_LIMIT,
    }),
    placeholderData: keepPreviousData,
  })
  const [dismissed, setDismissed] = useState(getInitialDismissed)
  const [queueOpen, setQueueOpen] = useState(false)
  const [index, setIndex] = useState(0)

  const queue = blocks ?? []
  const current = queue[index] ?? null

  useEffect(() => {
    setQueueOpen(false)
    setIndex(0)
  }, [dateKey])

  function dismiss() {
    sessionStorage.setItem(EARLIER_REVIEWS_DISMISSED_KEY, '1')
    setDismissed(true)
  }

  function closeQueue() {
    setQueueOpen(false)
    setIndex(0)
  }

  function advance(completedBlockId: string) {
    const nextIndex = nextReviewQueueIndex(queue, index, completedBlockId)
    if (nextIndex === undefined) closeQueue()
    else setIndex(nextIndex)
  }

  const showLink = !dismissed && queue.length > 0

  return (
    <>
      {showLink ? (
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <button
            type="button"
            className="rounded-sm underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => {
              setIndex(0)
              setQueueOpen(true)
            }}
          >
            {earlierReviewsLabel(queue.length)}
          </button>
          <button
            type="button"
            aria-label="Hide for this session"
            title="Hide for this session"
            className="flex size-5 items-center justify-center rounded-sm hover:bg-accent hover:text-foreground"
            onClick={dismiss}
          >
            <X className="size-3" aria-hidden />
          </button>
        </div>
      ) : null}

      <ReviewBlockModal
        block={queueOpen ? current : null}
        positionLabel={
          queueOpen && queue.length > 1
            ? `${index + 1} of ${queue.length}`
            : undefined
        }
        showDate
        open={queueOpen && current != null}
        onClose={closeQueue}
        onSaved={(completedBlockId) => {
          if (completedBlockId) advance(completedBlockId)
        }}
      />
    </>
  )
}
