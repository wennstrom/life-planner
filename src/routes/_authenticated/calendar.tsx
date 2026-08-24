import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useMemo, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { WeekView } from '~/components/calendar/WeekView'
import { AddTimeBlockModal } from '~/components/time-block/AddTimeBlockModal'
import { ReviewBlockModal } from '~/components/time-block/ReviewBlockModal'
import { ConfirmDialog } from '~/components/ConfirmDialog'
import { Button } from '~/components/ui/button'
import {
  addDays,
  formatDateKey,
  startOfDayMs,
  startOfWeekMonday,
} from '~/lib/dates'

export const Route = createFileRoute('/_authenticated/calendar')({
  component: CalendarPage,
})

function CalendarPage() {
  const [anchorDate, setAnchorDate] = useState(new Date())
  const weekStart = startOfWeekMonday(anchorDate)
  const weekEnd = addDays(weekStart, 7)

  const { data: blocks } = useSuspenseQuery(
    convexQuery(api.timeBlocks.listForRange, {
      startMs: startOfDayMs(weekStart),
      endMs: startOfDayMs(weekEnd),
    }),
  )
  const { data: tasks } = useSuspenseQuery(convexQuery(api.tasks.list, {}))
  const createFromTask = useMutation(api.timeBlocks.createFromTask)
  const updateBlock = useMutation(api.timeBlocks.update)
  const removeBlock = useMutation(api.timeBlocks.remove)

  const [addBlockOpen, setAddBlockOpen] = useState(false)
  const [reviewBlock, setReviewBlock] = useState<Doc<'timeBlocks'> | null>(
    null,
  )
  const [blockToDelete, setBlockToDelete] = useState<Doc<'timeBlocks'> | null>(
    null,
  )

  const unscheduledTasks = tasks.filter((task) => task.status === 'backlog')

  const taskMap = useMemo(
    () => new Map(tasks.map((task) => [task._id, task])),
    [tasks],
  )

  const reviewTask = reviewBlock?.taskId
    ? taskMap.get(reviewBlock.taskId) ?? null
    : null

  return (
    <section>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDateKey(weekStart)} – {formatDateKey(addDays(weekStart, 6))}
          </p>
        </div>
        <Button type="button" onClick={() => setAddBlockOpen(true)}>
          + New block
        </Button>
      </header>

      <WeekView
        blocks={blocks}
        unscheduledTasks={unscheduledTasks}
        taskMap={taskMap}
        anchorDate={anchorDate}
        now={Date.now()}
        onNavigate={setAnchorDate}
        onCreateFromTask={(taskId, start, end) =>
          void createFromTask({ taskId, start, end })
        }
        onUpdateBlock={(blockId, patch) => void updateBlock({ blockId, ...patch })}
        onReviewBlock={setReviewBlock}
        onRemoveBlock={setBlockToDelete}
      />

      <AddTimeBlockModal
        open={addBlockOpen}
        onClose={() => setAddBlockOpen(false)}
      />
      <ReviewBlockModal
        block={reviewBlock}
        task={reviewTask}
        open={reviewBlock != null}
        onClose={() => setReviewBlock(null)}
      />
      <ConfirmDialog
        open={blockToDelete != null}
        onClose={() => setBlockToDelete(null)}
        onConfirm={() => removeBlock({ blockId: blockToDelete!._id })}
        title="Delete time block?"
        description={
          blockToDelete ? (
            <>
              <span className="font-medium text-foreground">
                {blockToDelete.title}
              </span>{' '}
              will be permanently deleted. The Google Calendar event will also
              be canceled.
            </>
          ) : null
        }
        confirmLabel="Delete"
        cancelLabel="Keep"
        confirmVariant="destructive"
        errorMessage="Could not delete the time block. Please try again."
      />
    </section>
  )
}
