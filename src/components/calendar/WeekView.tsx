import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent, PointerEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import type { TimeBlockView } from '../../../convex/lib/timeBlockMemberships'
import { DayRail } from '~/components/calendar/DayRail'
import { Button } from '~/components/ui/button'
import {
  addDays,
  formatDateKey,
  isoWeekNumber,
  msToTimeLabel,
  startOfDayMs,
  startOfWeekMonday,
} from '~/lib/dates'
import {
  CALENDAR_END_HOUR,
  CALENDAR_START_HOUR,
  CALENDAR_VISIBLE_HOURS,
  HOUR_HEIGHT,
  MS_PER_DAY,
  blockLayout,
  calendarScrollTopForNow,
  dropRangeFromPointer,
  emptySlotStartFromPointer,
  formatHourLabel,
  hoursInRange,
  nowIndicatorTop,
  readTaskDragId,
} from '../../lib/calendarGeometry'
import {
  blockNeedsReview,
  isTimeBlockChipTarget,
} from '../../lib/timeBlockAppearance'
import { cn } from '~/lib/utils'
import { NowMarker } from './NowMarker'
import { TimeBlockChip } from './TimeBlockChip'
import { useTickingNow } from './useTickingNow'

type WeekViewProps = {
  blocks: Array<TimeBlockView>
  taskMap?: Map<Id<'tasks'>, Doc<'tasks'>>
  anchorDate: Date
  now: number
  onNavigate: (date: Date) => void
  onCreateFromTask: (taskId: Doc<'tasks'>['_id'], start: number, end: number) => void
  onUpdateBlock: (
    blockId: Doc<'timeBlocks'>['_id'],
    patch: { start?: number; end?: number },
  ) => void
  onReviewBlock?: (block: TimeBlockView) => void
  onEmptySlotClick: (args: { startMs: number; dateKey: string }) => void
  onEditBlock: (block: TimeBlockView) => void
}

function mondayWeekdayIndex(date: Date): number {
  const start = startOfWeekMonday(date)
  return Math.round((startOfDayMs(date) - startOfDayMs(start)) / MS_PER_DAY)
}

const EMPTY_TASK_MAP = new Map<Id<'tasks'>, Doc<'tasks'>>()

export function WeekView({
  blocks,
  taskMap,
  anchorDate,
  now: _now,
  onNavigate,
  onCreateFromTask,
  onUpdateBlock,
  onReviewBlock,
  onEmptySlotClick,
  onEditBlock,
}: WeekViewProps) {
  const clock = useTickingNow()
  const weekStart = startOfWeekMonday(anchorDate)
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart.getTime()],
  )
  const [dayIndex, setDayIndex] = useState(() => mondayWeekdayIndex(new Date()))
  const selectedDay = days[dayIndex] ?? days[0]!
  const selectedDayStart = startOfDayMs(selectedDay)
  const selectedDayBlocks = useMemo(
    () =>
      blocks.filter(
        (block) =>
          block.start < selectedDayStart + MS_PER_DAY &&
          block.end > selectedDayStart,
      ),
    [blocks, selectedDayStart],
  )
  const todayKey = formatDateKey(new Date(clock))
  const todayIndex = days.findIndex((day) => formatDateKey(day) === todayKey)
  const nowTop =
    todayIndex >= 0
      ? nowIndicatorTop(clock, startOfDayMs(days[todayIndex]!))
      : null

  const gridScrollRef = useRef<HTMLDivElement>(null)
  const weekHeaderRef = useRef<HTMLDivElement>(null)
  const weekGridRef = useRef<HTMLDivElement>(null)
  const ignoreNextColumnClickRef = useRef(false)
  const [draggingDayStart, setDraggingDayStart] = useState<number | null>(null)
  const hours = hoursInRange(CALENDAR_START_HOUR, CALENDAR_END_HOUR)

  useLayoutEffect(() => {
    const scroller = gridScrollRef.current
    if (!scroller) return
    const today = new Date()
    const viewingThisWeek =
      formatDateKey(startOfWeekMonday(today)) === formatDateKey(weekStart)
    scroller.scrollTop = calendarScrollTopForNow({
      now: today.getTime(),
      dayStartMs: viewingThisWeek
        ? startOfDayMs(today)
        : startOfDayMs(weekStart),
      viewportHeight: scroller.clientHeight,
    })
  }, [weekStart.getTime()])

  function goToToday() {
    const today = new Date()
    setDayIndex(mondayWeekdayIndex(today))
    onNavigate(today)
  }

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
          <Button type="button" variant="outline" onClick={goToToday}>
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
            Week {isoWeekNumber(weekStart)}
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

      <div className="md:hidden">
        <div
          className="mb-3 grid grid-cols-7 gap-1"
          role="tablist"
          aria-label="Days of the week"
        >
          {days.map((day, index) => {
            const key = formatDateKey(day)
            const selected = index === dayIndex
            const isToday = key === todayKey
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={selected}
                className={cn(
                  'flex flex-col items-center rounded-md px-0.5 py-1.5 text-[11px] text-muted-foreground',
                  selected && 'bg-primary/10 font-semibold text-primary',
                  !selected && isToday && 'font-semibold text-foreground',
                )}
                onClick={() => setDayIndex(index)}
              >
                {day.toLocaleDateString(undefined, { weekday: 'short' })}
                <strong className="text-sm">{day.getDate()}</strong>
              </button>
            )
          })}
        </div>
        <DayRail
          blocks={selectedDayBlocks}
          taskMap={taskMap ?? EMPTY_TASK_MAP}
          date={selectedDay}
          now={clock}
          onCreateFromTask={onCreateFromTask}
          onUpdateBlock={onUpdateBlock}
          onReviewBlock={onReviewBlock}
          onEmptySlotClick={onEmptySlotClick}
          onEditBlock={onEditBlock}
        />
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-soft md:block">
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
          <div className="relative grid grid-cols-[52px_1fr]">
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
            <div ref={weekGridRef} className="cal-grid grid grid-cols-7">
              {days.map((day) => {
                const dayStart = startOfDayMs(day)
                const dayEnd = dayStart + 24 * 60 * 60 * 1000
                const dayBlocks = blocks.filter(
                  (b) => b.start < dayEnd && b.end > dayStart,
                )
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'relative border-l border-border',
                      draggingDayStart === dayStart && 'z-20',
                    )}
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
                      return (
                        <TimeBlockChip
                          key={block._id}
                          block={block}
                          needsReview={blockNeedsReview(
                            {
                              origin: block.origin,
                              end: block.end,
                              memberships: block.memberships,
                            },
                            clock,
                          )}
                          top={top}
                          height={height}
                          dayStartMs={dayStart}
                          truncateTitle
                          weekDrag={
                            block.origin === 'app'
                              ? {
                                  weekStartMs: startOfDayMs(weekStart),
                                  getGridRect: () =>
                                    weekGridRef.current?.getBoundingClientRect() ??
                                    null,
                                  onDraggingChange: (dragging) =>
                                    setDraggingDayStart(dragging ? dayStart : null),
                                }
                              : undefined
                          }
                          onUpdateBlock={onUpdateBlock}
                          onReviewBlock={onReviewBlock}
                          onEditBlock={onEditBlock}
                        />
                      )
                    })}
                    {nowTop != null && formatDateKey(day) === todayKey ? (
                      <NowMarker top={nowTop} label={msToTimeLabel(clock)} />
                    ) : null}
                  </div>
                )
              })}
            </div>
            {nowTop != null ? (
              <span
                className="pointer-events-none absolute left-0 z-20 w-[52px] -translate-y-1/2 pr-1.5 text-right text-[11px] font-semibold tabular-nums text-secondary-foreground"
                style={{ top: nowTop }}
              >
                {msToTimeLabel(clock)}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
