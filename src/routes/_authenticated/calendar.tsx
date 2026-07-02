import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { WeekView } from '~/components/calendar/WeekView'
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
  const createBlock = useMutation(api.timeBlocks.create)

  const unscheduledTasks = tasks.filter(
    (task) => !task.scheduledDate && task.status !== 'done',
  )

  return (
    <section className="view active">
      <header className="view-header">
        <div>
          <h1>Calendar</h1>
          <p className="view-sub">
            {formatDateKey(weekStart)} – {formatDateKey(addDays(weekStart, 6))}
          </p>
        </div>
        <div className="view-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              const title = window.prompt('Block title')
              if (!title) return
              const start = startOfDayMs(new Date()) + 10 * 3600000
              void createBlock({ title, start, end: start + 3600000 })
            }}
          >
            + New block
          </button>
        </div>
      </header>

      <WeekView
        blocks={blocks}
        unscheduledTasks={unscheduledTasks}
        anchorDate={anchorDate}
        onNavigate={setAnchorDate}
        onCreateFromTask={(taskId, start, end) =>
          void createFromTask({ taskId, start, end })
        }
        onUpdateBlock={(blockId, patch) => void updateBlock({ blockId, ...patch })}
      />
    </section>
  )
}
