import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Doc } from '../../../convex/_generated/dataModel'
import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/button'
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

function eventColor(block: Doc<'timeBlocks'>) {
  if (block.origin === 'google') return 'bg-event-google'
  if (block.taskId) return 'bg-event-work'
  return 'bg-event-personal'
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
    <div className="flex items-start gap-5 max-md:flex-col">
      <div className="flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-soft">
        <div className="grid grid-cols-[44px_repeat(7,1fr)] border-b border-border">
          <div />
          {days.map((day) => {
            const weekend = day.getDay() === 0 || day.getDay() === 6
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'flex flex-col gap-0.5 border-l border-border px-1 py-2.5 text-center text-xs text-muted-foreground',
                  weekend && 'bg-secondary',
                )}
              >
                {day.toLocaleDateString(undefined, { weekday: 'short' })}
                <strong className="text-base text-foreground">
                  {day.getDate()}
                </strong>
              </div>
            )
          })}
        </div>
        <div className="grid grid-cols-[44px_1fr]">
          <div className="flex flex-col">
            {hours.map((hour) => (
              <div
                key={hour}
                className="h-[54px] border-t border-border px-1.5 py-0.5 text-right text-[11px] text-muted-foreground first:border-t-0"
              >
                {hour}
              </div>
            ))}
          </div>
          <div className="cal-grid grid grid-cols-7">
            {days.map((day) => {
              const dayStart = startOfDayMs(day)
              const dayEnd = dayStart + 24 * 60 * 60 * 1000
              const dayBlocks = blocks.filter(
                (b) => b.start < dayEnd && b.end > dayStart,
              )
              const weekend = day.getDay() === 0 || day.getDay() === 6
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'relative min-h-[406px] border-l border-border',
                    weekend && 'bg-secondary',
                  )}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    if (!dragTaskId) return
                    const rect = event.currentTarget.getBoundingClientRect()
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
                    return (
                      <div
                        key={block._id}
                        className={cn(
                          'absolute inset-x-[3px] overflow-hidden rounded-md px-1.5 py-1 text-[11.5px] font-medium text-white',
                          eventColor(block),
                        )}
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

      <aside className="w-[210px] shrink-0 rounded-xl border border-border bg-card p-4 shadow-soft max-md:w-full">
        <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Unscheduled{' '}
          <span className="font-normal normal-case text-muted-foreground">
            drag →
          </span>
        </h4>
        {unscheduledTasks.map((task) => (
          <div
            key={task._id}
            className="mb-2 cursor-grab rounded-md border border-dashed border-slate-300 bg-secondary px-2.5 py-2 text-[13px]"
            draggable
            onDragStart={() => setDragTaskId(task._id)}
          >
            ⠿ {task.title}
          </div>
        ))}
        <div className="mt-4 flex flex-col gap-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <i className="inline-block size-2.5 rounded-[3px] bg-event-work" />
            Work
          </span>
          <span className="flex items-center gap-2">
            <i className="inline-block size-2.5 rounded-[3px] bg-event-personal" />
            Personal
          </span>
          <span className="flex items-center gap-2">
            <i className="inline-block size-2.5 rounded-[3px] bg-event-google" />
            From Google
          </span>
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => onNavigate(addDays(anchorDate, -7))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onNavigate(new Date())}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => onNavigate(addDays(anchorDate, 7))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Week of {formatDateKey(weekStart)}
        </p>
      </aside>
    </div>
  )
}
