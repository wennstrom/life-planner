import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useMemo, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { TimeBlockView } from '../../../convex/lib/timeBlockMemberships'
import { WeekView } from '~/components/calendar/WeekView'
import { AddTimeBlockModal } from '~/components/time-block/AddTimeBlockModal'
import { ReviewBlockModal } from '~/components/time-block/ReviewBlockModal'
import { Button } from '~/components/ui/button'
import { addDays, formatDateKey, weekRangeMs } from '~/lib/dates'
import { prefetchConvexQueries } from '~/lib/prefetchConvexQueries'

export const Route = createFileRoute('/_authenticated/calendar')({
  loader: async ({ context: { queryClient } }) => {
    const { startMs, endMs } = weekRangeMs()
    await prefetchConvexQueries(queryClient, [
      convexQuery(api.timeBlocks.listForRange, { startMs, endMs }),
      convexQuery(api.tasks.list, {}),
    ])
  },
  component: CalendarPage,
})

function CalendarPage() {
  const [anchorDate, setAnchorDate] = useState(new Date())
  const { weekStart, startMs, endMs } = weekRangeMs(anchorDate)

  const { data: blocks } = useSuspenseQuery(
    convexQuery(api.timeBlocks.listForRange, { startMs, endMs }),
  )
  const { data: tasks } = useSuspenseQuery(convexQuery(api.tasks.list, {}))
  const createFromTask = useMutation(api.timeBlocks.createFromTask)
  const updateBlock = useMutation(api.timeBlocks.update)

  const [blockModal, setBlockModal] = useState<{
    start?: number
    dateKey?: string
    block?: TimeBlockView | null
  } | null>(null)
  const [reviewBlock, setReviewBlock] = useState<TimeBlockView | null>(null)

  const taskMap = useMemo(
    () => new Map(tasks.map((task) => [task._id, task])),
    [tasks],
  )

  return (
    <section>
      <header className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="sr-only text-2xl font-bold md:not-sr-only">Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDateKey(weekStart)} – {formatDateKey(addDays(weekStart, 6))}
          </p>
        </div>
        <Button type="button" onClick={() => setBlockModal({})}>
          + New block
        </Button>
      </header>

      <WeekView
        blocks={blocks}
        taskMap={taskMap}
        anchorDate={anchorDate}
        now={Date.now()}
        onNavigate={setAnchorDate}
        onCreateFromTask={(taskId, start, end) =>
          void createFromTask({ taskId, start, end })
        }
        onUpdateBlock={(blockId, patch) => void updateBlock({ blockId, ...patch })}
        onReviewBlock={setReviewBlock}
        onEmptySlotClick={({ startMs, dateKey }) =>
          setBlockModal({ start: startMs, dateKey })
        }
        onEditBlock={(block) => setBlockModal({ block })}
      />

      <AddTimeBlockModal
        open={blockModal != null}
        onClose={() => setBlockModal(null)}
        block={blockModal?.block}
        defaultDateKey={blockModal?.dateKey}
        defaultStart={blockModal?.start}
      />
      <ReviewBlockModal
        block={reviewBlock}
        open={reviewBlock != null}
        onClose={() => setReviewBlock(null)}
      />
    </section>
  )
}
