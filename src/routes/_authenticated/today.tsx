import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { DayRail } from '~/components/calendar/DayRail'
import { AddTaskModal } from '~/components/tasks/AddTaskModal'
import { EditTaskModal } from '~/components/tasks/EditTaskModal'
import { TaskRow } from '~/components/tasks/TaskRow'
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

  const completeTask = useMutation(api.tasks.complete)
  const removeFromToday = useMutation(api.tasks.removeFromToday)
  const saveQuickNote = useMutation(api.today.saveQuickNote)
  const createFromTask = useMutation(api.timeBlocks.createFromTask)
  const updateBlock = useMutation(api.timeBlocks.update)

  const [addOpen, setAddOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Doc<'tasks'> | null>(null)
  const [noteBody, setNoteBody] = useState(quickNote?.body ?? '')

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
        <Button type="button" onClick={() => setAddOpen(true)}>
          + Add task
        </Button>
      </header>

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
                onToggle={() =>
                  void completeTask({ taskId: task._id, done: task.status !== 'done' })
                }
                onRemoveFromToday={() => void removeFromToday({ taskId: task._id })}
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
            date={new Date()}
            onCreateFromTask={(taskId, start, end) =>
              void createFromTask({ taskId, start, end })
            }
            onUpdateBlock={(blockId, patch) => void updateBlock({ blockId, ...patch })}
          />
        </div>
      </div>

      <AddTaskModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        scheduledDate={data.dateKey}
      />
      <EditTaskModal task={editingTask} onClose={() => setEditingTask(null)} />
    </section>
  )
}
