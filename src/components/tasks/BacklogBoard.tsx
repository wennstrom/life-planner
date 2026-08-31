import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Id } from '../../../convex/_generated/dataModel'
import type { BacklogTask, BacklogTaskActions } from '~/components/tasks/BacklogTasksTable'
import { Badge } from '~/components/ui/badge'
import {
  destOrderedIdsAfterDrop,
  filterBoardColumns,
  toMoveOnBoardArgs,
} from '~/lib/backlog-board'
import { formatMinutes } from '~/lib/format'
import {
  BOARD_COLUMN_STATUSES,
  STATUS_CONFIG,
  type BoardColumnStatus,
} from '~/lib/task-status'
import { DUE_TONE_CLASS, dueDateBadge } from '~/lib/task-due'
import { cn } from '~/lib/utils'

export type BoardResult = {
  total: number
  columns: Array<{ status: BoardColumnStatus; tasks: Array<BacklogTask> }>
}

function columnDroppableId(status: BoardColumnStatus) {
  return `column:${status}`
}

function TaskCardBody({ task }: { task: BacklogTask }) {
  const done = task.status === 'done'
  const due = dueDateBadge(task.dueDate)
  return (
    <div className="space-y-1 sm:space-y-2">
      <div className="flex items-start gap-2">
        <span className={cn('text-sm', done && 'text-muted-foreground line-through')}>
          {task.title}
        </span>
        {task.active ? (
          <Badge variant="secondary" className="shrink-0 text-[11px]">
            Active
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {task.project ? (
          <Badge
            className="rounded-full border-0 px-2.5 py-0.5 text-[11px] font-semibold"
            style={{
              color: task.project.color,
              backgroundColor: `color-mix(in srgb, ${task.project.color} 14%, transparent)`,
            }}
          >
            {task.project.name}
          </Badge>
        ) : null}
        {due ? (
          <Badge className={cn('border-0 text-[11px]', DUE_TONE_CLASS[due.tone])}>
            {due.label}
          </Badge>
        ) : null}
        {task.estimateMinutes != null ? (
          <span className="text-xs text-muted-foreground">
            {formatMinutes(task.estimateMinutes)}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function SortableTaskCard({
  task,
  onOpen,
}: {
  task: BacklogTask
  onOpen: (task: BacklogTask) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: task._id,
      data: { type: 'card', status: task.status },
    })
  return (
    <button
      type="button"
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'w-full rounded-md border border-border bg-card p-2 text-left shadow-soft sm:p-3',
        isDragging && 'opacity-50',
      )}
      onClick={() => onOpen(task)}
      {...attributes}
      {...listeners}
    >
      <TaskCardBody task={task} />
    </button>
  )
}

function BoardColumn({
  status,
  tasks,
  onOpen,
}: {
  status: BoardColumnStatus
  tasks: Array<BacklogTask>
  onOpen: (task: BacklogTask) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDroppableId(status),
    data: { type: 'column', status },
  })
  const cfg = STATUS_CONFIG[status]
  return (
    <div className="flex min-w-[12rem] flex-1 flex-col p-1 sm:min-w-[14rem] sm:p-2 md:min-w-[16rem]">
      <div className={cn('mb-2 rounded-md px-2 py-1 text-xs font-semibold', cfg.className)}>
        {cfg.label} · {tasks.length}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-24 flex-1 flex-col gap-1.5 rounded-md p-1 sm:min-h-32 sm:gap-2',
          isOver && 'bg-accent/40',
        )}
      >
        <SortableContext items={tasks.map((t) => t._id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTaskCard key={task._id} task={task} onOpen={onOpen} />
          ))}
        </SortableContext>
        {tasks.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-2 py-6 text-center text-xs text-muted-foreground">
            No tasks
          </p>
        ) : null}
      </div>
    </div>
  )
}

export function BacklogBoard({
  board,
  filter,
  onMove,
  actions,
}: {
  board: BoardResult
  filter: 'all' | 'none' | Id<'projects'>
  onMove: (args: {
    taskId: Id<'tasks'>
    status: BoardColumnStatus
    beforeTaskId?: Id<'tasks'>
  }) => void | Promise<unknown>
  actions: Pick<BacklogTaskActions, 'openDetails'>
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const visibleColumns = useMemo(
    () => filterBoardColumns(board.columns, filter) as BoardResult['columns'],
    [board.columns, filter],
  )
  const taskById = useMemo(() => {
    const map = new Map<string, BacklogTask>()
    for (const column of board.columns) {
      for (const task of column.tasks) map.set(task._id, task)
    }
    return map
  }, [board.columns])
  const activeTask = activeId ? (taskById.get(activeId) ?? null) : null

  function statusOfOver(
    overId: string,
    overStatus?: BoardColumnStatus,
  ): BoardColumnStatus | null {
    if (overStatus) return overStatus
    if (overId.startsWith('column:')) {
      return overId.slice('column:'.length) as BoardColumnStatus
    }
    for (const column of board.columns) {
      if (column.tasks.some((task) => task._id === overId)) return column.status
    }
    return null
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    const destStatus = statusOfOver(
      String(over.id),
      over.data.current?.status as BoardColumnStatus | undefined,
    )
    if (!destStatus) return
    const dest = board.columns.find((column) => column.status === destStatus)
    if (!dest) return
    const movedId = String(active.id)
    const destOrderedIds = destOrderedIdsAfterDrop({
      destTaskIds: dest.tasks.map((task) => task._id),
      movedId,
      overId: String(over.id),
    })
    const args = toMoveOnBoardArgs({
      movedId,
      destStatus,
      destOrderedIds,
    })
    if (!args) return
    const from = taskById.get(movedId)
    if (!from) return
    const currentIndex = dest.tasks.findIndex((task) => task._id === movedId)
    const currentBefore =
      currentIndex >= 0 ? dest.tasks[currentIndex + 1]?._id : undefined
    if (from.status === destStatus && currentBefore === args.beforeTaskId) return
    void onMove({
      taskId: args.taskId as Id<'tasks'>,
      status: args.status,
      beforeTaskId: args.beforeTaskId as Id<'tasks'> | undefined,
    })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-1.5 overflow-x-auto rounded-md border border-border bg-card p-2 shadow-soft sm:gap-3 sm:p-3">
        {BOARD_COLUMN_STATUSES.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            tasks={visibleColumns.find((column) => column.status === status)?.tasks ?? []}
            onOpen={actions.openDetails}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="w-[12rem] rounded-md border border-border bg-card p-2 shadow-soft sm:w-[16rem] sm:p-3">
            <TaskCardBody task={activeTask} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
