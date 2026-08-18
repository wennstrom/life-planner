import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useMemo, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { DayRail } from '~/components/calendar/DayRail'
import { AddTimeBlockModal } from '~/components/time-block/AddTimeBlockModal'
import { ReviewBlockModal } from '~/components/time-block/ReviewBlockModal'
import { EditTaskModal } from '~/components/tasks/EditTaskModal'
import { TaskRow } from '~/components/tasks/TaskRow'
import { ConfirmDialog } from '~/components/ConfirmDialog'
import { formatDisplayDate } from '~/lib/dates'
import { Button } from '~/components/ui/button'
import { Textarea } from '~/components/ui/textarea'

export const Route = createFileRoute('/_authenticated/today')({
  component: TodayPage,
})

function TodayPage() {
  const { data } = useSuspenseQuery(convexQuery(api.today.get, {}))
  const { data: quickNote } = useSuspenseQuery(convexQuery(api.today.getQuickNote, {}))
  const { data: blocks } = useSuspenseQuery(
    convexQuery(api.timeBlocks.listForDay, { dateKey: data.dateKey }),
  )
  const { data: needingReview } = useSuspenseQuery(
    convexQuery(api.timeBlocks.listNeedingReview, { dateKey: data.dateKey }),
  )

  const updateTask = useMutation(api.tasks.update)
  const saveQuickNote = useMutation(api.today.saveQuickNote)
  const createFromTask = useMutation(api.timeBlocks.createFromTask)
  const updateBlock = useMutation(api.timeBlocks.update)
  const removeBlock = useMutation(api.timeBlocks.remove)

  const [addBlockOpen, setAddBlockOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<
    (typeof data.tasks)[number] | null
  >(null)
  const [noteBody, setNoteBody] = useState(quickNote?.body ?? '')
  const [shutdownOpen, setShutdownOpen] = useState(false)
  const [shutdownIndex, setShutdownIndex] = useState(0)
  const [railReviewBlock, setRailReviewBlock] = useState<
    Doc<'timeBlocks'> | null
  >(null)
  const [blockToDelete, setBlockToDelete] = useState<Doc<'timeBlocks'> | null>(
    null,
  )

  const taskMap = useMemo(
    () => new Map(data.tasks.map((task) => [task._id, task])),
    [data.tasks],
  )

  const currentShutdownBlock = needingReview[shutdownIndex] ?? null
  const currentShutdownTask =
    currentShutdownBlock && currentShutdownBlock.taskId
      ? (taskMap.get(currentShutdownBlock.taskId) ?? null)
      : null

  const startShutdown = () => {
    setShutdownIndex(0)
    setShutdownOpen(true)
  }

  const advanceShutdown = () => {
    const nextIndex = shutdownIndex + 1
    if (nextIndex >= needingReview.length) {
      setShutdownOpen(false)
      setShutdownIndex(0)
    } else {
      setShutdownIndex(nextIndex)
    }
  }

  return (
    <section>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Today</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDisplayDate(new Date())} · {data.tasks.length} tasks ·{' '}
            {blocks.length} time blocks
          </p>
        </div>
        <Button type="button" onClick={() => setAddBlockOpen(true)}>
          + Add time block
        </Button>
      </header>

      {needingReview.length > 0 ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-medium">
                {needingReview.length} block
                {needingReview.length === 1 ? '' : 's'} need review
              </span>
              <span className="ml-2 text-muted-foreground">
                {needingReview.map((b) => b.title).join(', ')}
              </span>
            </div>
            <Button type="button" size="sm" onClick={startShutdown}>
              Start shutdown
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-7 md:grid-cols-[1.1fr_1fr]">
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Today&apos;s Todo
          </h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {data.tasks.map((task) => (
              <TaskRow
                key={task._id}
                task={task}
                stats={task.stats}
                active={task.active}
                estimateMinutes={task.estimateMinutes}
                onToggleDone={(done) =>
                  void updateTask({
                    taskId: task._id,
                    status: done ? 'done' : 'backlog',
                  })
                }
                onOpenDetails={() => setEditingTask(task)}
              />
            ))}
          </ul>

          <div className="mt-6">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Quick note
            </h3>
            <Textarea
              className="min-h-[72px] bg-card shadow-soft"
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              onBlur={() => void saveQuickNote({ body: noteBody })}
              rows={4}
            />
          </div>
        </div>

        <div>
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Today&apos;s schedule{' '}
            <span className="font-normal normal-case text-muted-foreground">
              ↔ Google
            </span>
          </h3>
          <DayRail
            blocks={blocks}
            tasks={data.tasks}
            taskMap={taskMap}
            date={new Date()}
            onCreateFromTask={(taskId, start, end) =>
              void createFromTask({ taskId, start, end })
            }
            onUpdateBlock={(blockId, patch) =>
              void updateBlock({ blockId, ...patch })
            }
            onReviewBlock={setRailReviewBlock}
            onRemoveBlock={setBlockToDelete}
          />
        </div>
      </div>

      <AddTimeBlockModal
        open={addBlockOpen}
        onClose={() => setAddBlockOpen(false)}
        defaultDateKey={data.dateKey}
      />
      <EditTaskModal task={editingTask} onClose={() => setEditingTask(null)} />

      <ReviewBlockModal
        block={shutdownOpen ? currentShutdownBlock : null}
        task={currentShutdownTask}
        positionLabel={
          shutdownOpen && needingReview.length > 1
            ? `${shutdownIndex + 1} of ${needingReview.length}`
            : undefined
        }
        open={shutdownOpen}
        onClose={() => {
          setShutdownOpen(false)
          setShutdownIndex(0)
        }}
        onSaved={advanceShutdown}
      />

      <ReviewBlockModal
        block={railReviewBlock}
        task={
          railReviewBlock?.taskId
            ? taskMap.get(railReviewBlock.taskId) ?? null
            : null
        }
        open={railReviewBlock != null}
        onClose={() => setRailReviewBlock(null)}
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
