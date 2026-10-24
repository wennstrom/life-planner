import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import type { TimeBlockView } from '../../../convex/lib/timeBlockMemberships'
import { BlockHistoryList } from '~/components/tasks/BlockHistoryList'
import { formatTaskRollup } from '~/lib/format'

type TaskHistoryProps = {
  taskId: Id<'tasks'>
  estimateMinutes?: number
}

export function TaskHistory({ taskId, estimateMinutes }: TaskHistoryProps) {
  const blocks = useQuery(api.timeBlocks.listForTask, { taskId })

  if (blocks === undefined) {
    return <p className="text-sm text-muted-foreground">Loading history…</p>
  }

  const membershipReview = (block: TimeBlockView) =>
    block.memberships.find((m) => m.taskId === taskId)?.review

  const spentMinutes = blocks.reduce(
    (sum, b) => sum + (membershipReview(b)?.actualMinutes ?? 0),
    0,
  )
  const deepCount = blocks.filter(
    (b) => membershipReview(b)?.focus === 'deep',
  ).length

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

      <BlockHistoryList
        blocks={blocks}
        isMine={(m) => m.taskId === taskId}
        emptyText="No blocks planned yet."
      />
    </div>
  )
}
