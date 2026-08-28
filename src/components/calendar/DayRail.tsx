import { useLayoutEffect, useRef } from 'react'
import type { DragEvent, MouseEvent, PointerEvent } from 'react'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import type { TimeBlockView } from '../../../convex/lib/timeBlockMemberships'
import { formatDateKey, startOfDayMs } from '~/lib/dates'
import {
  CALENDAR_END_HOUR,
  CALENDAR_START_HOUR,
  CALENDAR_VISIBLE_HOURS,
  HOUR_HEIGHT,
  TASK_DRAG_TYPE,
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

type DayRailProps = {
  blocks: Array<TimeBlockView>
  taskMap: Map<Id<'tasks'>, Doc<'tasks'>>
  date: Date
  now: number
  tasks?: Array<Doc<'tasks'>>
  onCreateFromTask: (
    taskId: Doc<'tasks'>['_id'],
    start: number,
    end: number,
  ) => void
  onUpdateBlock: (
    blockId: Doc<'timeBlocks'>['_id'],
    patch: { start?: number; end?: number },
  ) => void
  onReviewBlock?: (block: TimeBlockView) => void
  onEmptySlotClick: (args: { startMs: number; dateKey: string }) => void
  onEditBlock: (block: TimeBlockView) => void
}

export function DayRail({
  blocks,
  date,
  now,
  tasks,
  onCreateFromTask,
  onUpdateBlock,
  onReviewBlock,
  onEmptySlotClick,
  onEditBlock,
}: DayRailProps) {
  const dayStartMs = startOfDayMs(date)
  const railRef = useRef<HTMLDivElement>(null)
  const ignoreNextRailClickRef = useRef(false)
  const hours = hoursInRange(CALENDAR_START_HOUR, CALENDAR_END_HOUR)

  useLayoutEffect(() => {
    const rail = railRef.current
    if (rail) rail.scrollTop = initialCalendarScrollTop()
  }, [])

  function scrollerPointer() {
    const rail = railRef.current
    if (!rail) return null
    return {
      railTop: rail.getBoundingClientRect().top,
      scrollTop: rail.scrollTop,
    }
  }

  const handleRailDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const taskId = readTaskDragId(event.dataTransfer)
    if (!taskId) return
    const pointer = scrollerPointer()
    if (!pointer) return
    const { start, end } = dropRangeFromPointer({
      clientY: event.clientY,
      railTop: pointer.railTop,
      scrollTop: pointer.scrollTop,
      dayStartMs,
    })
    onCreateFromTask(taskId as Doc<'tasks'>['_id'], start, end)
  }

  const handleRailPointerUpCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (isTimeBlockChipTarget(event.target)) {
      ignoreNextRailClickRef.current = true
    }
  }

  const handleRailClick = (event: MouseEvent<HTMLDivElement>) => {
    if (ignoreNextRailClickRef.current) {
      ignoreNextRailClickRef.current = false
      return
    }
    if (isTimeBlockChipTarget(event.target)) return
    const pointer = scrollerPointer()
    if (!pointer) return
    const startMs = emptySlotStartFromPointer({
      clientY: event.clientY,
      railTop: pointer.railTop,
      scrollTop: pointer.scrollTop,
      dayStartMs,
    })
    onEmptySlotClick({ startMs, dateKey: formatDateKey(date) })
  }

  return (
    <div>
      {tasks && tasks.length > 0 ? (
        <div className="mb-3 flex flex-col gap-2">
          {tasks.map((task) => (
            <div
              key={task._id}
              className="cursor-grab rounded-md border border-dashed border-slate-300 bg-secondary px-2.5 py-2 text-[13px]"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(TASK_DRAG_TYPE, task._id)
                event.dataTransfer.effectAllowed = 'copy'
              }}
            >
              ⠿ {task.title}
            </div>
          ))}
        </div>
      ) : null}
      <div
        ref={railRef}
        className="overflow-y-auto rounded-xl border border-border bg-card shadow-soft"
        style={{
          maxHeight: `min(70vh, ${CALENDAR_VISIBLE_HOURS * HOUR_HEIGHT}px)`,
        }}
        onPointerUpCapture={handleRailPointerUpCapture}
      >
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
          <div
            className="cal-grid relative border-l border-border"
            style={{ minHeight: hours.length * HOUR_HEIGHT }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleRailDrop}
            onClick={handleRailClick}
          >
            {blocks.map((block) => {
              const { top, height } = blockLayout(
                block.start,
                block.end,
                dayStartMs,
              )
              return (
                <TimeBlockChip
                  key={block._id}
                  block={block}
                  needsReview={blockNeedsReview(
                    {
                      origin: block.origin,
                      end: block.end,
                      hasTasks: block.memberships.length > 0,
                      review: block.memberships.every((m) => m.review)
                        ? block.memberships[0]?.review
                        : undefined,
                    },
                    now,
                  )}
                  top={top}
                  height={height}
                  dayStartMs={dayStartMs}
                  onUpdateBlock={onUpdateBlock}
                  onReviewBlock={onReviewBlock}
                  onEditBlock={onEditBlock}
                />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
