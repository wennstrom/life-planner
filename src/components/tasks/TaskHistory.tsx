import { useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { ReviewBlockModal } from '~/components/time-block/ReviewBlockModal'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'
import { formatMinutes, formatTaskRollup } from '~/lib/format'
import { formatDisplayDate, msToTimeLabel } from '~/lib/dates'

type TaskHistoryProps = {
  taskId: Id<'tasks'>
  estimateMinutes?: number
}

const OUTCOME_LABELS: Record<string, string> = {
  done: 'Done',
  partial: 'Partial',
  missed: 'Missed',
}

export function TaskHistory({ taskId, estimateMinutes }: TaskHistoryProps) {
  const blocks = useQuery(api.timeBlocks.listForTask, { taskId })
  const [reviewBlock, setReviewBlock] = useState<Doc<'timeBlocks'> | null>(null)

  if (blocks === undefined) {
    return <p className="text-sm text-muted-foreground">Loading history…</p>
  }

  const spentMinutes = blocks.reduce(
    (sum, b) => sum + (b.review?.actualMinutes ?? 0),
    0,
  )
  const deepCount = blocks.filter((b) => b.review?.focus === 'deep').length

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
        <p>{formatTaskRollup({ spentMinutes, blockCount: blocks.length }, estimateMinutes)}</p>
        {deepCount > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {deepCount} deep block{deepCount === 1 ? '' : 's'}
          </p>
        ) : null}
      </div>

      {blocks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No blocks planned yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {blocks.map((block) => (
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
                {block.review ? (
                  <Badge variant="secondary" className="shrink-0 text-[11px]">
                    {OUTCOME_LABELS[block.review.outcome] ?? block.review.outcome}
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
                ) : null}
              </div>

              {block.review ? (
                <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  <p>{formatMinutes(block.review.actualMinutes)} spent</p>
                  {block.review.focus ? (
                    <p className="capitalize">{block.review.focus} focus</p>
                  ) : null}
                  {block.review.note ? <p>{block.review.note}</p> : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <ReviewBlockModal
        block={reviewBlock}
        open={reviewBlock != null}
        onClose={() => setReviewBlock(null)}
      />
    </div>
  )
}
