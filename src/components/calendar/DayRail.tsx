import { useMemo, useRef, useState } from 'react'
import type { Doc } from '../../../convex/_generated/dataModel'
import { startOfDayMs } from '~/lib/dates'

const HOUR_HEIGHT = 54
const START_HOUR = 8
const END_HOUR = 16

type DayRailProps = {
  blocks: Array<Doc<'timeBlocks'>>
  tasks: Array<Doc<'tasks'>>
  date: Date
  onCreateFromTask: (taskId: Doc<'tasks'>['_id'], start: number, end: number) => void
  onUpdateBlock: (
    blockId: Doc<'timeBlocks'>['_id'],
    patch: { start?: number; end?: number; title?: string },
  ) => void
}

function msToTop(ms: number, dayStartMs: number) {
  const hours = (ms - dayStartMs) / 3600000
  return (hours - START_HOUR) * HOUR_HEIGHT
}

function topToMs(top: number, dayStartMs: number) {
  const hours = top / HOUR_HEIGHT + START_HOUR
  return dayStartMs + hours * 3600000
}

export function DayRail({
  blocks,
  tasks,
  date,
  onCreateFromTask,
  onUpdateBlock,
}: DayRailProps) {
  const dayStartMs = startOfDayMs(date)
  const railRef = useRef<HTMLDivElement>(null)
  const [dragTaskId, setDragTaskId] = useState<Doc<'tasks'>['_id'] | null>(null)

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
      <div className="task-list" style={{ marginBottom: 12 }}>
        {tasks.map((task) => (
          <div
            key={task._id}
            className="drawer-task"
            draggable
            onDragStart={() => setDragTaskId(task._id)}
          >
            ⠿ {task.title}
          </div>
        ))}
      </div>
      <div
        ref={railRef}
        className="day-rail"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleRailDrop}
      >
        {hours.map((hour, index) => (
          <div key={hour} className="rail-hour" style={{ ['--h' as string]: index }}>
            <span>{String(hour).padStart(2, '0')}</span>
          </div>
        ))}
        {blocks.map((block) => {
          const top = msToTop(block.start, dayStartMs)
          const height = Math.max(
            24,
            ((block.end - block.start) / 3600000) * HOUR_HEIGHT,
          )
          const className =
            block.origin === 'google'
              ? 'event google'
              : block.taskId
                ? 'event work'
                : 'event personal'
          return (
            <DraggableBlock
              key={block._id}
              block={block}
              className={className}
              top={top}
              height={height}
              dayStartMs={dayStartMs}
              onUpdateBlock={onUpdateBlock}
            />
          )
        })}
      </div>
    </div>
  )
}

function DraggableBlock({
  block,
  className,
  top,
  height,
  dayStartMs,
  onUpdateBlock,
}: {
  block: Doc<'timeBlocks'>
  className: string
  top: number
  height: number
  dayStartMs: number
  onUpdateBlock: DayRailProps['onUpdateBlock']
}) {
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const startY = useRef(0)
  const startTop = useRef(top)
  const startHeight = useRef(height)

  const onMouseDownDrag = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).classList.contains('resize-handle')) {
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
      className={className}
      style={{ top, height, cursor: dragging ? 'grabbing' : 'grab' }}
      onMouseDown={onMouseDownDrag}
      onMouseMove={dragging || resizing ? onMouseMove : undefined}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {block.title}
      {block.origin === 'google' ? <span className="src">Google</span> : null}
      <span className="resize-handle" onMouseDown={onMouseDownResize} />
    </div>
  )
}
