import { useRef } from 'react'
import type { DragEvent } from 'react'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { startOfDayMs } from '~/lib/dates'
import {
  CALENDAR_START_HOUR,
  HOUR_HEIGHT,
  TASK_DRAG_TYPE,
  blockLayout,
  dropRangeFromPointer,
  hoursInRange,
} from '../../lib/calendarGeometry'
import { blockNeedsReview } from '../../lib/timeBlockAppearance'
import { TimeBlockChip } from './TimeBlockChip'

const DAY_RAIL_END_HOUR = 18

type DayRailProps = {
  blocks: Array<Doc<'timeBlocks'>>
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
  onReviewBlock?: (block: Doc<'timeBlocks'>) => void
  onRemoveBlock: (block: Doc<'timeBlocks'>) => void
}

export function DayRail({
  blocks,
  taskMap,
  date,
  now,
  tasks,
  onCreateFromTask,
  onUpdateBlock,
  onReviewBlock,
  onRemoveBlock,
}: DayRailProps) {
  const dayStartMs = startOfDayMs(date)
  const railRef = useRef<HTMLDivElement>(null)
  const hours = hoursInRange(CALENDAR_START_HOUR, DAY_RAIL_END_HOUR)

  const handleRailDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const taskId = event.dataTransfer.getData(TASK_DRAG_TYPE) as
      | Doc<'tasks'>['_id']
      | ''
    if (!taskId || !railRef.current) return
    const { start, end } = dropRangeFromPointer({
      clientY: event.clientY,
      railTop: railRef.current.getBoundingClientRect().top,
      dayStartMs,
    })
    onCreateFromTask(taskId, start, end)
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
        className="relative overflow-hidden rounded-xl border border-border bg-card shadow-soft"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleRailDrop}
      >
        {hours.map((hour) => (
          <div
            key={hour}
            className="relative border-t border-border first:border-t-0"
            style={{ height: HOUR_HEIGHT }}
          >
            <span className="absolute -top-2 left-2.5 bg-card px-1 text-[11px] text-muted-foreground">
              {String(hour).padStart(2, '0')}
            </span>
          </div>
        ))}
        {blocks.map((block) => {
          const { top, height } = blockLayout(block.start, block.end, dayStartMs)
          const linkedTask = block.taskId ? taskMap.get(block.taskId) : null
          return (
            <TimeBlockChip
              key={block._id}
              block={block}
              taskTitle={linkedTask?.title}
              needsReview={blockNeedsReview(block, now)}
              top={top}
              height={height}
              dayStartMs={dayStartMs}
              onUpdateBlock={onUpdateBlock}
              onReviewBlock={onReviewBlock}
              onRemoveBlock={onRemoveBlock}
            />
          )
        })}
      </div>
    </div>
  )
}
