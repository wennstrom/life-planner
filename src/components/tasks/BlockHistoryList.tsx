import { useState } from 'react'
import type {
  MembershipView,
  TimeBlockView,
} from '../../../convex/lib/timeBlockMemberships'
import { ReviewBlockModal } from '~/components/time-block/ReviewBlockModal'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'
import { formatMinutes } from '~/lib/format'
import { formatDisplayDate, msToTimeLabel } from '~/lib/dates'

const OUTCOME_LABELS: Record<string, string> = {
  done: 'Done',
  partial: 'Partial',
  missed: 'Missed',
}

type BlockHistoryListProps = {
  blocks: Array<TimeBlockView>
  /** Which memberships of each block belong to this history. */
  isMine: (membership: MembershipView) => boolean
  /** Name each matching task, for histories that span several tasks. */
  showTaskTitles?: boolean
  emptyText: string
}

export function BlockHistoryList({
  blocks,
  isMine,
  showTaskTitles = false,
  emptyText,
}: BlockHistoryListProps) {
  const [reviewBlock, setReviewBlock] = useState<TimeBlockView | null>(null)

  if (blocks.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>
  }

  const status = (block: TimeBlockView, membership: MembershipView) =>
    membership.review ? (
      <Badge variant="secondary" className="shrink-0 text-[11px]">
        {OUTCOME_LABELS[membership.review.outcome] ?? membership.review.outcome}
      </Badge>
    ) : block.end <= Date.now() ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => setReviewBlock(block)}
      >
        Review
      </Button>
    ) : null

  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {blocks.map((block) => {
          const mine = block.memberships.filter(isMine)
          const single = !showTaskTitles ? mine[0] : undefined
          return (
            <li
              key={block._id}
              className="rounded-md border border-border bg-card p-3 text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{block.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDisplayDate(new Date(block.start))} ·{' '}
                    {msToTimeLabel(block.start)} – {msToTimeLabel(block.end)}
                  </p>
                </div>
                {single ? status(block, single) : null}
              </div>

              {mine.map((membership) => (
                <div key={membership._id} className="mt-2">
                  {showTaskTitles ? (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium">
                        {membership.taskTitle}
                      </p>
                      {status(block, membership)}
                    </div>
                  ) : null}
                  <ReviewDetails review={membership.review} />
                </div>
              ))}
            </li>
          )
        })}
      </ul>

      <ReviewBlockModal
        block={reviewBlock}
        open={reviewBlock != null}
        onClose={() => setReviewBlock(null)}
      />
    </>
  )
}

function ReviewDetails({ review }: { review: MembershipView['review'] }) {
  if (!review) return null
  return (
    <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
      <p>{formatMinutes(review.actualMinutes)} spent</p>
      {review.focus ? <p className="capitalize">{review.focus} focus</p> : null}
      {review.note ? <p>{review.note}</p> : null}
      {review.nextStep ? <p>Next: {review.nextStep}</p> : null}
      {review.blockedReason ? <p>Blocked: {review.blockedReason}</p> : null}
    </div>
  )
}
