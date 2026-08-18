import { useMemo, useRef, useState } from 'react'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { cn } from '~/lib/utils'
import { startOfDayMs } from '~/lib/dates'

const HOUR_HEIGHT = 54
const START_HOUR = 7
const END_HOUR = 18

type DayRailProps = {
  blocks: Array<Doc<'timeBlocks'>>
  tasks: Array<Doc<'tasks'>>
  taskMap?: Map<Id<'tasks'>, Doc<'tasks'>>
  date: Date
  onCreateFromTask: (taskId: Doc<'tasks'>['_id'], start: number, end: number) => void
  onUpdateBlock: (
    blockId: Doc<'timeBlocks'>['_id'],
    patch: { start?: number; end?: number; title?: string },
  ) => void
  onReviewBlock?: (block: Doc<'timeBlocks'>) => void
}

function msToTop(ms: number, dayStartMs: number) {
  const hours = (ms - dayStartMs) / 3600000
  return (hours - START_HOUR) * HOUR_HEIGHT
}

function topToMs(top: number, dayStartMs: number) {
  const hours = top / HOUR_HEIGHT + START_HOUR
  return dayStartMs + hours * 3600000
}

function eventColor(block: Doc<'timeBlocks'>) {
  if (block.origin === 'google') return 'bg-event-google'
  if (block.taskId) return 'bg-event-work'
  return 'bg-event-personal'
}

function needsReview(block: Doc<'timeBlocks'>) {
  return (
    block.origin === 'app' &&
    block.taskId != null &&
    block.end <= Date.now() &&
    block.review === undefined
  )
}

export function DayRail({
  blocks,
  tasks,
  taskMap,
  date,
  onCreateFromTask,
  onUpdateBlock,
  onReviewBlock,
}: DayRailProps) {
  const dayStartMs = startOfDayMs(date)
  const railRef = useRef<HTMLDivElement>(null)
  const [dragTaskId, setDragTaskId] = useState<Doc<'tasks'>['_id'] | null>(null)

  const resolvedTaskMap = useMemo(() => {
    if (taskMap) return taskMap
    return new Map(tasks.map((task) => [task._id, task]))
  }, [taskMap, tasks])

  const hours = useMemo(
    () => Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i),
    [],
  )

  const handleRailDrop = (event: React.DragEvent) => {
    event.preventDefault()
    if (!dragTaskId || !railRef.current) return
    const rect = railRef.current.getBoundingClientRect()
    const top = event.clientY - rect.top
    const start = topToMs(Math.max(0, top), dayStartMs)
    const end = start + 60 * 60 * 1000
    onCreateFromTask(dragTaskId, start, end)
    setDragTaskId(null)
  }

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2">
        {tasks.map((task) => (
          <div
            key={task._id}
            className="cursor-grab rounded-md border border-dashed border-slate-300 bg-secondary px-2.5 py-2 text-[13px]"
            draggable
            onDragStart={() => setDragTaskId(task._id)}
          >
            ⠿ {task.title}
          </div>
        ))}
      </div>
      <div
        ref={railRef}
        className="relative overflow-hidden rounded-xl border border-border bg-card shadow-soft"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleRailDrop}
      >
        {hours.map((hour) => (
          <div
            key={hour}
            className="relative h-[62px] border-t border-border first:border-t-0"
          >
            <span className="absolute -top-2 left-2.5 bg-card px-1 text-[11px] text-muted-foreground">
              {String(hour).padStart(2, '0')}
            </span>
          </div>
        ))}
        {blocks.map((block) => {
          const top = msToTop(block.start, dayStartMs)
          const height = Math.max(
            24,
            ((block.end - block.start) / 3600000) * HOUR_HEIGHT,
          )
          const linkedTask = block.taskId
            ? resolvedTaskMap.get(block.taskId)
            : null
          return (
            <DraggableBlock
              key={block._id}
              block={block}
              taskTitle={linkedTask?.title}
              needsReview={needsReview(block)}
              className={eventColor(block)}
              top={top}
              height={height}
              dayStartMs={dayStartMs}
              onUpdateBlock={onUpdateBlock}
              onReviewBlock={onReviewBlock}
            />
          )
        })}
      </div>
    </div>
  )
}

function DraggableBlock({
  block,
  taskTitle,
  needsReview: showReview,
  className,
  top,
  height,
  dayStartMs,
  onUpdateBlock,
  onReviewBlock,
}: {
  block: Doc<'timeBlocks'>
  taskTitle?: string
  needsReview: boolean
  className: string
  top: number
  height: number
  dayStartMs: number
  onUpdateBlock: DayRailProps['onUpdateBlock']
  onReviewBlock?: DayRailProps['onReviewBlock']
}) {
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const startY = useRef(0)
  const startTop = useRef(top)
  const startHeight = useRef(height)

  const onMouseDownDrag = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).dataset.reviewButton === 'true') return
    if ((event.target as HTMLElement).dataset.resizeHandle === 'true') {
      return
    }
    setDragging(true)
    startY.current = event.clientY
    startTop.current = top
  }

  const onMouseDownResize = (event: React.MouseEvent) => {
    event.stopPropagation()
    setResizing(true)
    startY.current = event.clientY
    startHeight.current = height
  }

  const onMouseMove = (event: React.MouseEvent) => {
    if (dragging) {
      const delta = event.clientY - startY.current
      const newTop = Math.max(0, startTop.current + delta)
      const newStart = topToMs(newTop, dayStartMs)
      onUpdateBlock(block._id, { start: newStart, end: newStart + (block.end - block.start) })
    }
    if (resizing) {
      const delta = event.clientY - startY.current
      const newHeight = Math.max(24, startHeight.current + delta)
      const newEnd = topToMs(top + newHeight, dayStartMs)
      onUpdateBlock(block._id, { end: newEnd })
    }
  }

  const onMouseUp = () => {
    setDragging(false)
    setResizing(false)
  }

  return (
    <div
      className={cn(
        'absolute inset-x-2 overflow-hidden rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-white',
        className,
      )}
      style={{ top, height, cursor: dragging ? 'grabbing' : 'grab' }}
      onMouseDown={onMouseDownDrag}
      onMouseMove={dragging || resizing ? onMouseMove : undefined}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <div className="truncate">{block.title}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        {taskTitle ? (
          <span className="rounded bg-white/20 px-1 py-0.5 text-[10px] font-normal">
            {taskTitle}
          </span>
        ) : null}
        {block.origin === 'google' ? (
          <span className="rounded border border-white/50 px-1 py-0.5 text-[10px] opacity-85">
            Google
          </span>
        ) : null}
        {showReview && onReviewBlock ? (
          <button
            type="button"
            data-review-button="true"
            className="rounded bg-white/30 px-1 py-0.5 text-[10px] font-semibold hover:bg-white/50"
            onClick={(e) => {
              e.stopPropagation()
              onReviewBlock(block)
            }}
          >
            Review
          </button>
        ) : null}
      </div>
      <span
        data-resize-handle="true"
        className="absolute bottom-1 right-1.5 size-2.5 cursor-ns-resize opacity-50"
        onMouseDown={onMouseDownResize}
      />
    </div>
  )
}
