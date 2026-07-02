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
    <section className="view active">
      <header className="view-header">
        <div>
          <h1>Today</h1>
          <p className="view-sub">
            {formatDisplayDate(new Date())} · {data.tasks.length} tasks ·{' '}
            {blocks.length} time blocks
          </p>
        </div>
        <div className="view-actions">
          <button type="button" className="btn primary" onClick={() => setAddOpen(true)}>
            + Add task
          </button>
        </div>
      </header>

      <div className="today-grid">
        <div className="col">
          <h3 className="col-title">Today&apos;s Todo</h3>
          <ul className="task-list">
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

          <div className="quick-note">
            <h3 className="col-title">Quick note</h3>
            <textarea
              className="note-box"
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              onBlur={() => void saveQuickNote({ body: noteBody })}
              rows={4}
            />
          </div>
        </div>

        <div className="col">
          <h3 className="col-title">
            Today&apos;s schedule <span className="muted">↔ Google</span>
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
