import { useLayoutEffect, useMemo, useRef } from 'react'
import type { MouseEvent, PointerEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { Button } from '~/components/ui/button'
import { addDays, formatDateKey, startOfDayMs, startOfWeekMonday } from '~/lib/dates'
import {
  CALENDAR_END_HOUR,
  CALENDAR_START_HOUR,
  CALENDAR_VISIBLE_HOURS,
  HOUR_HEIGHT,
  blockLayout,
  dropRangeFromPointer,
  emptySlotStartFromPointer,
  formatHourLabel,
  hoursInRange,
  initialCalendarScrollTop,
  readTaskDragId,
} from '../../lib/calendarGeometry'
import {
  blockNeedsReview,
  isTimeBlockChipTarget,
} from '../../lib/timeBlockAppearance'
import { TimeBlockChip } from './TimeBlockChip'

type WeekViewProps = {
  blocks: Array<Doc<'timeBlocks'>>
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
  onEmptySlotClick: (args: { startMs: number; dateKey: string }) => void
  onEditBlock: (block: Doc<'timeBlocks'>) => void
}

export function WeekView({
  blocks,
  taskMap,
  anchorDate,
  now,
  onNavigate,
  onCreateFromTask,
  onUpdateBlock,
  onReviewBlock,
  onEmptySlotClick,
  onEditBlock,
}: WeekViewProps) {
  const weekStart = startOfWeekMonday(anchorDate)
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart.getTime()],
  )

  const gridScrollRef = useRef<HTMLDivElement>(null)
  const weekHeaderRef = useRef<HTMLDivElement>(null)
  const ignoreNextColumnClickRef = useRef(false)
  const hours = hoursInRange(CALENDAR_START_HOUR, CALENDAR_END_HOUR)

  //Scroll to workday start
  useLayoutEffect(() => {
    const scroller = gridScrollRef.current
    if (scroller) scroller.scrollTop = initialCalendarScrollTop()
  }, [])

  function scrollerPointer() {
    const scroller = gridScrollRef.current
    if (!scroller) return null
    return {
      railTop: scroller.getBoundingClientRect().top,
      scrollTop: scroller.scrollTop,
      contentInsetTop: weekHeaderRef.current?.offsetHeight ?? 0,
    }
  }

  const handleGridPointerUpCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (isTimeBlockChipTarget(event.target)) {
      ignoreNextColumnClickRef.current = true
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
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
          <p className="text-xs text-muted-foreground">
            Week of {formatDateKey(weekStart)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
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
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
        {/* One scroller: sticky weekday header shares column width with the hour grid. */}
        <div
          ref={gridScrollRef}
          className="overflow-y-auto"
          style={{
            maxHeight: `min(70vh, ${CALENDAR_VISIBLE_HOURS * HOUR_HEIGHT}px)`,
          }}
          onPointerUpCapture={handleGridPointerUpCapture}
        >
          <div
            ref={weekHeaderRef}
            className="sticky top-0 z-10 grid grid-cols-[52px_1fr] border-b border-border bg-card"
          >
            <div />
            <div className="grid grid-cols-7">
              {days.map((day) => (
                  <div
                    key={day.toISOString()}
                    className="flex flex-col gap-0.5 border-l border-border px-1 py-2.5 text-center text-xs text-muted-foreground"
                  >
                    {day.toLocaleDateString(undefined, { weekday: 'short' })}
                    <strong className="text-base text-foreground">
                      {day.getDate()}
                    </strong>
                  </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[52px_1fr]">
            <div className="flex flex-col">
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="border-t border-border px-1.5 py-0.5 text-right text-[11px] text-muted-foreground first:border-t-0"
                  style={{ height: HOUR_HEIGHT }}
                >
                  {formatHourLabel(hour)}
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
                return (
                  <div
                    key={day.toISOString()}
                    className="relative border-l border-border"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault()
                      const taskId = readTaskDragId(event.dataTransfer)
                      if (!taskId) return
                      const pointer = scrollerPointer()
                      if (!pointer) return
                      const { start, end } = dropRangeFromPointer({
                        clientY: event.clientY,
                        railTop: pointer.railTop,
                        scrollTop: pointer.scrollTop,
                        contentInsetTop: pointer.contentInsetTop,
                        dayStartMs: dayStart,
                      })
                      onCreateFromTask(taskId as Doc<'tasks'>['_id'], start, end)
                    }}
                    onClick={(event: MouseEvent<HTMLDivElement>) => {
                      if (ignoreNextColumnClickRef.current) {
                        ignoreNextColumnClickRef.current = false
                        return
                      }
                      if (isTimeBlockChipTarget(event.target)) return
                      const pointer = scrollerPointer()
                      if (!pointer) return
                      const startMs = emptySlotStartFromPointer({
                        clientY: event.clientY,
                        railTop: pointer.railTop,
                        scrollTop: pointer.scrollTop,
                        contentInsetTop: pointer.contentInsetTop,
                        dayStartMs: dayStart,
                      })
                      onEmptySlotClick({
                        startMs,
                        dateKey: formatDateKey(day),
                      })
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
                          truncateTitle
                          onUpdateBlock={onUpdateBlock}
                          onReviewBlock={onReviewBlock}
                          onEditBlock={onEditBlock}
                        />
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
