import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/button'
import { addDays, formatDateKey, startOfDayMs, startOfWeekMonday } from '~/lib/dates'
import {
  CALENDAR_START_HOUR,
  HOUR_HEIGHT,
  TASK_DRAG_TYPE,
  blockLayout,
  dropRangeFromPointer,
  hoursInRange,
  readTaskDragId,
} from '../../lib/calendarGeometry'
import { blockNeedsReview } from '../../lib/timeBlockAppearance'
import { TimeBlockChip } from './TimeBlockChip'

const WEEK_END_HOUR = 19

type WeekViewProps = {
  blocks: Array<Doc<'timeBlocks'>>
  unscheduledTasks: Array<Doc<'tasks'>>
  taskMap?: Map<Id<'tasks'>, Doc<'tasks'>>
  anchorDate: Date
  now: number
  onNavigate: (date: Date) => void
  onCreateFromTask: (taskId: Doc<'tasks'>['_id'], start: number, end: number) => void
  onUpdateBlock: (
    blockId: Doc<'timeBlocks'>['_id'],
    patch: { start?: number; end?: number },
  ) => void
  onReviewBlock?: (block: Doc<'timeBlocks'>) => void
  onRemoveBlock: (block: Doc<'timeBlocks'>) => void
}

export function WeekView({
  blocks,
  unscheduledTasks,
  taskMap,
  anchorDate,
  now,
  onNavigate,
  onCreateFromTask,
  onUpdateBlock,
  onReviewBlock,
  onRemoveBlock,
}: WeekViewProps) {
  const weekStart = startOfWeekMonday(anchorDate)
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart.getTime()],
  )

  const hours = hoursInRange(CALENDAR_START_HOUR, WEEK_END_HOUR)

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
                className="border-t border-border px-1.5 py-0.5 text-right text-[11px] text-muted-foreground first:border-t-0"
                style={{ height: HOUR_HEIGHT }}
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
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    const taskId = readTaskDragId(event.dataTransfer)
                    if (!taskId) return
                    const { start, end } = dropRangeFromPointer({
                      clientY: event.clientY,
                      railTop: event.currentTarget.getBoundingClientRect().top,
                      dayStartMs: dayStart,
                    })
                    onCreateFromTask(taskId as Doc<'tasks'>['_id'], start, end)
                  }}
                >
                  {dayBlocks.map((block) => {
                    const { top, height } = blockLayout(block.start, block.end, dayStart)
                    const linkedTask = block.taskId ? taskMap?.get(block.taskId) : null
                    return (
                      <TimeBlockChip
                        key={block._id}
                        block={block}
                        taskTitle={linkedTask?.title}
                        needsReview={blockNeedsReview(block, now)}
                        top={top}
                        height={height}
                        dayStartMs={dayStart}
                        onUpdateBlock={onUpdateBlock}
                        onReviewBlock={onReviewBlock}
                        onRemoveBlock={onRemoveBlock}
                      />
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
            onDragStart={(event) => {
              event.dataTransfer.setData(TASK_DRAG_TYPE, task._id)
              event.dataTransfer.effectAllowed = 'copy'
            }}
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
