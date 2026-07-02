import { useMemo, useState } from 'react'
import type { Doc } from '../../../convex/_generated/dataModel'
import { addDays, formatDateKey, startOfDayMs, startOfWeekMonday } from '~/lib/dates'

const HOUR_HEIGHT = 54
const START_HOUR = 9
const END_HOUR = 16

type WeekViewProps = {
  blocks: Array<Doc<'timeBlocks'>>
  unscheduledTasks: Array<Doc<'tasks'>>
  anchorDate: Date
  onNavigate: (date: Date) => void
  onCreateFromTask: (taskId: Doc<'tasks'>['_id'], start: number, end: number) => void
  onUpdateBlock: (
    blockId: Doc<'timeBlocks'>['_id'],
    patch: { start?: number; end?: number },
  ) => void
}

function msToTop(ms: number, dayStartMs: number) {
  const hours = (ms - dayStartMs) / 3600000
  return (hours - START_HOUR) * HOUR_HEIGHT
}

export function WeekView({
  blocks,
  unscheduledTasks,
  anchorDate,
  onNavigate,
  onCreateFromTask,
  onUpdateBlock,
}: WeekViewProps) {
  const [dragTaskId, setDragTaskId] = useState<Doc<'tasks'>['_id'] | null>(null)
  const weekStart = startOfWeekMonday(anchorDate)
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart.getTime()],
  )

  const hours = useMemo(
    () => Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i),
    [],
  )

  return (
    <div className="calendar-wrap">
      <div className="calendar">
        <div className="cal-head">
          <div className="cal-gutter" />
          {days.map((day) => {
            const weekend = day.getDay() === 0 || day.getDay() === 6
            return (
              <div key={day.toISOString()} className={`cal-day${weekend ? ' weekend' : ''}`}>
                {day.toLocaleDateString(undefined, { weekday: 'short' })}
                <strong>{day.getDate()}</strong>
              </div>
            )
          })}
        </div>
        <div className="cal-body">
          <div className="cal-gutter-col">
            {hours.map((hour) => (
              <div key={hour} className="cal-time">
                {hour}
              </div>
            ))}
          </div>
          <div className="cal-grid">
            {days.map((day) => {
              const dayStart = startOfDayMs(day)
              const dayEnd = dayStart + 24 * 60 * 60 * 1000
              const dayBlocks = blocks.filter(
                (b) => b.start < dayEnd && b.end > dayStart,
              )
              return (
                <div
                  key={day.toISOString()}
                  className={`cal-col${day.getDay() === 0 || day.getDay() === 6 ? ' weekend' : ''}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    if (!dragTaskId) return
                    const rect = (event.currentTarget).getBoundingClientRect()
                    const top = event.clientY - rect.top
                    const hoursFromStart = top / HOUR_HEIGHT + START_HOUR
                    const start = dayStart + hoursFromStart * 3600000
                    onCreateFromTask(dragTaskId, start, start + 3600000)
                    setDragTaskId(null)
                  }}
                >
                  {dayBlocks.map((block) => {
                    const top = msToTop(block.start, dayStart)
                    const height = Math.max(
                      24,
                      ((block.end - block.start) / 3600000) * HOUR_HEIGHT,
                    )
                    const className =
                      block.origin === 'google'
                        ? 'cal-event google'
                        : block.taskId
                          ? 'cal-event work'
                          : 'cal-event personal'
                    return (
                      <div
                        key={block._id}
                        className={className}
                        style={{ top, height }}
                        onMouseDown={(event) => {
                          const startY = event.clientY
                          const startTop = top
                          const onMove = (moveEvent: MouseEvent) => {
                            const delta = moveEvent.clientY - startY
                            const newTop = Math.max(0, startTop + delta)
                            const hoursOffset = newTop / HOUR_HEIGHT + START_HOUR
                            const newStart = dayStart + hoursOffset * 3600000
                            onUpdateBlock(block._id, {
                              start: newStart,
                              end: newStart + (block.end - block.start),
                            })
                          }
                          const onUp = () => {
                            window.removeEventListener('mousemove', onMove)
                            window.removeEventListener('mouseup', onUp)
                          }
                          window.addEventListener('mousemove', onMove)
                          window.addEventListener('mouseup', onUp)
                        }}
                      >
                        {block.title}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <aside className="cal-drawer">
        <h4 className="col-title">
          Unscheduled <span className="muted">drag →</span>
        </h4>
        {unscheduledTasks.map((task) => (
          <div
            key={task._id}
            className="drawer-task"
            draggable
            onDragStart={() => setDragTaskId(task._id)}
          >
            ⠿ {task.title}
          </div>
        ))}
        <div className="legend">
          <span>
            <i style={{ background: '#22c55e' }} />Work
          </span>
          <span>
            <i style={{ background: '#6366f1' }} />Personal
          </span>
          <span>
            <i style={{ background: '#eab308' }} />From Google
          </span>
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn ghost icon"
            onClick={() => onNavigate(addDays(anchorDate, -7))}
          >
            ‹
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => onNavigate(new Date())}
          >
            Today
          </button>
          <button
            type="button"
            className="btn ghost icon"
            onClick={() => onNavigate(addDays(anchorDate, 7))}
          >
            ›
          </button>
        </div>
        <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
          Week of {formatDateKey(weekStart)}
        </p>
      </aside>
    </div>
  )
}
