import { useEffect, useMemo, useState, type ReactNode, type Ref } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Trash2 } from 'lucide-react'
import type { Id } from '../../../convex/_generated/dataModel'
import type { BacklogTask, BacklogTaskActions } from '~/components/tasks/BacklogTasksTable'
import type { NamedBoardColumn } from '~/lib/backlog-board'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import {
  columnDroppableId,
  columnSortableId,
  destOrderedIdsAfterDrop,
  filterBoardColumns,
  parseColumnSortableId,
  toMoveOnBoardArgs,
  type BoardColumnKey,
} from '~/lib/backlog-board'
import { reorderWorkflowColumnIds } from '~/lib/board-column-settings'
import { formatMinutes } from '~/lib/format'
import { DUE_TONE_CLASS, dueDateBadge } from '~/lib/task-due'
import { cn } from '~/lib/utils'

export type BoardResult = {
  total: number
  columns: Array<NamedBoardColumn<BacklogTask>>
}

function TaskCardBody({
  task,
  showProjectBadge = true,
}: {
  task: BacklogTask
  showProjectBadge?: boolean
}) {
  const done = task.isDone
  const due = dueDateBadge(task.dueDate)
  return (
    <div className="space-y-1 sm:space-y-2">
      <div className={cn('text-sm', done && 'text-muted-foreground line-through')}>
        {task.title}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {showProjectBadge && task.project ? (
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
  showProjectBadge = true,
}: {
  task: BacklogTask
  onOpen: (task: BacklogTask) => void
  showProjectBadge?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: task._id,
      data: { type: 'card', columnId: task.columnId ?? null },
    })
  return (
    <button
      type="button"
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'w-full cursor-pointer rounded-md border border-border bg-card p-2 text-left shadow-soft sm:p-3',
        isDragging && 'opacity-50',
      )}
      onClick={() => onOpen(task)}
      {...attributes}
      {...listeners}
      onPointerDown={(event) => {
        listeners?.onPointerDown?.(event)
        event.stopPropagation()
      }}
    >
      <TaskCardBody task={task} showProjectBadge={showProjectBadge} />
    </button>
  )
}

function ColumnHeading({
  name,
  count,
}: {
  name: string
  count: number
}) {
  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-1">
      {name ? <span className="truncate">{name}</span> : null}
      <span className="shrink-0 text-muted-foreground">
        {name ? `· ${count}` : count}
      </span>
    </span>
  )
}

function ColumnFrame({
  fill,
  color,
  heading,
  bodyRef,
  bodyClassName,
  children,
}: {
  fill?: boolean
  color?: string | null
  heading: ReactNode
  bodyRef?: Ref<HTMLDivElement>
  bodyClassName?: string
  children: ReactNode
}) {
  const tint = color
    ? { backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }
    : undefined
  return (
    <div
      className={cn(
        'flex flex-col p-1 sm:p-2',
        fill ? 'h-full min-h-0 w-full flex-1' : 'w-[14rem] shrink-0 sm:w-[16rem]',
      )}
    >
      <div
        className="mb-2 flex min-w-0 items-center justify-between gap-1 rounded-md px-2 py-1 text-xs font-semibold"
        style={tint}
      >
        {heading}
      </div>
      <div
        ref={bodyRef}
        className={cn(
          'flex min-h-24 flex-1 flex-col gap-1.5 rounded-md bg-card p-1 sm:min-h-32 sm:gap-2',
          bodyClassName,
        )}
      >
        {children}
      </div>
    </div>
  )
}

function ColumnDragPreview({
  column,
  showProjectBadge = true,
}: {
  column: BoardResult['columns'][number]
  showProjectBadge?: boolean
}) {
  const title = column.name || 'Column'
  return (
    <div className="rounded-md bg-card shadow-lg ring-1 ring-border">
      <ColumnFrame
        color={column.color}
        heading={
          <>
            <ColumnHeading name={title} count={column.tasks.length} />
            <div className="flex shrink-0 items-center opacity-70">
              {!column.isDone ? <Trash2 className="mx-1.5 size-3.5" /> : null}
              <Plus className="mx-1.5 size-3.5" />
            </div>
          </>
        }
      >
        {column.tasks.map((task) => (
          <div
            key={task._id}
            className="w-full rounded-md border border-border bg-card p-2 text-left shadow-soft sm:p-3"
          >
            <TaskCardBody task={task} showProjectBadge={showProjectBadge} />
          </div>
        ))}
        {column.tasks.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-2 py-6 text-center text-xs text-muted-foreground">
            No tasks
          </p>
        ) : null}
      </ColumnFrame>
    </div>
  )
}

const columnCollisionDetection: CollisionDetection = (args) => {
  if (args.active.data.current?.type === 'board-column') {
    const containers = args.droppableContainers.filter(
      (container) => container.data.current?.type === 'board-column',
    )
    return closestCorners({ ...args, droppableContainers: containers })
  }
  return closestCorners(args)
}

function BoardColumn({
  column,
  tasks,
  onOpen,
  onAddTask,
  onRename,
  onRemove,
  fill,
  showProjectBadge = true,
}: {
  column: BoardResult['columns'][number]
  tasks: Array<BacklogTask>
  onOpen: (task: BacklogTask) => void
  onAddTask: (columnId: BoardColumnKey) => void
  onRename?: (columnId: Id<'boardColumns'>, name: string) => void
  onRemove?: (columnId: Id<'boardColumns'>) => void
  fill?: boolean
  showProjectBadge?: boolean
}) {
  const droppableId = columnDroppableId(column.columnId)
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: { type: 'column', columnId: column.columnId },
  })
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(column.name ?? '')
  const title = column.name || 'Column'
  useEffect(() => {
    setName(column.name ?? '')
  }, [column.name])

  return (
    <ColumnFrame
      fill={fill}
      color={column.color}
      bodyRef={setNodeRef}
      bodyClassName={isOver ? 'bg-accent/40' : undefined}
      heading={
        <>
          {column.isBacklog || column.isDone || !onRename ? (
            <ColumnHeading name={title} count={tasks.length} />
          ) : editing ? (
            <Input
              value={name}
              className="h-7 min-w-0 flex-1 text-xs"
              autoFocus
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => {
                setEditing(false)
                const next = name.trim()
                if (column.columnId && next && next !== column.name) {
                  onRename(column.columnId as Id<'boardColumns'>, next)
                } else {
                  setName(column.name ?? '')
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
              }}
            />
          ) : (
            <button
              type="button"
              className="flex min-w-0 flex-1 cursor-pointer text-left"
              onClick={() => setEditing(true)}
            >
              <ColumnHeading name={title} count={tasks.length} />
            </button>
          )}
          <div className="flex shrink-0 items-center">
            {!column.isBacklog && !column.isDone && onRemove && column.columnId ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label={`Remove ${title}`}
                onClick={() => onRemove(column.columnId as Id<'boardColumns'>)}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <Trash2 className="size-3.5" />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={`Add task to ${title}`}
              onClick={() => onAddTask(column.columnId)}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        </>
      }
    >
      <SortableContext items={tasks.map((t) => t._id)} strategy={verticalListSortingStrategy}>
        {tasks.map((task) => (
          <SortableTaskCard
            key={task._id}
            task={task}
            onOpen={onOpen}
            showProjectBadge={showProjectBadge}
          />
        ))}
      </SortableContext>
      {tasks.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-2 py-6 text-center text-xs text-muted-foreground">
          No tasks
        </p>
      ) : null}
    </ColumnFrame>
  )
}

function SortableBoardColumn({
  column,
  disabled,
  ...props
}: {
  column: BoardResult['columns'][number]
  disabled?: boolean
} & Omit<Parameters<typeof BoardColumn>[0], 'column'>) {
  const sortable = useSortable({
    id: columnSortableId(String(column.columnId)),
    data: { type: 'board-column', columnId: column.columnId },
    disabled: disabled || !column.columnId || column.isDone || column.isBacklog,
  })
  const canDragColumn =
    !disabled && Boolean(column.columnId) && !column.isDone && !column.isBacklog
  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className={cn(
        'flex shrink-0',
        canDragColumn && 'cursor-pointer',
        sortable.isDragging && 'opacity-0',
      )}
      {...(canDragColumn ? sortable.attributes : {})}
      {...(canDragColumn ? sortable.listeners : {})}
    >
      <BoardColumn column={column} {...props} />
    </div>
  )
}

export function BacklogBoard({
  board,
  filter,
  onMove,
  onAddTask,
  onRename,
  onReorderColumns,
  onAddColumn,
  onRemoveColumn,
  actions,
  showProjectBadge = true,
}: {
  board: BoardResult
  filter: 'all' | 'none' | Id<'projects'>
  onMove: (args: {
    taskId: Id<'tasks'>
    columnId: Id<'boardColumns'> | null
    beforeTaskId?: Id<'tasks'>
  }) => void | Promise<unknown>
  onAddTask: (columnId: BoardColumnKey) => void
  onRename?: (columnId: Id<'boardColumns'>, name: string) => void
  onReorderColumns?: (orderedIds: Array<Id<'boardColumns'>>) => void
  onAddColumn?: () => void
  onRemoveColumn?: (columnId: Id<'boardColumns'>) => void
  actions: Pick<BacklogTaskActions, 'openDetails'>
  showProjectBadge?: boolean
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
  const backlogColumn = visibleColumns.find(
    (column) => column.isBacklog || column.columnId == null,
  )
  const workflowColumns = visibleColumns.filter(
    (column) => !column.isBacklog && column.columnId != null,
  )
  const doneIndex = workflowColumns.findIndex((column) => column.isDone)
  const sortableColumnIds = workflowColumns
    .filter((column) => column.columnId)
    .map((column) => columnSortableId(String(column.columnId)))
  const activeColumnId = activeId ? parseColumnSortableId(activeId) : null
  const activeTask = activeId && !activeColumnId ? (taskById.get(activeId) ?? null) : null
  const activeColumn = activeColumnId
    ? (visibleColumns.find((column) => column.columnId === activeColumnId) ?? null)
    : null

  function columnIdOfOver(
    overId: string,
    overColumnId?: BoardColumnKey,
  ): BoardColumnKey | undefined {
    if (overColumnId !== undefined) return overColumnId
    const sorted = parseColumnSortableId(overId)
    if (sorted) return sorted
    if (overId === 'column:backlog') return null
    if (overId.startsWith('column:')) return overId.slice('column:'.length)
    for (const column of board.columns) {
      if (column.tasks.some((task) => task._id === overId)) return column.columnId
    }
    return undefined
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    const movedColumnId = parseColumnSortableId(String(active.id))
    if (movedColumnId) {
      const overColumnId = columnIdOfOver(
        String(over.id),
        over.data.current?.columnId as BoardColumnKey | undefined,
      )
      if (!overColumnId || overColumnId === movedColumnId) return
      const orderedIds = workflowColumns
        .map((column) => column.columnId)
        .filter((id): id is string => id != null)
      const doneId = workflowColumns.find((column) => column.isDone)?.columnId ?? undefined
      const next = reorderWorkflowColumnIds({
        orderedIds,
        activeId: movedColumnId,
        overId: overColumnId,
        doneId: doneId ?? undefined,
      })
      if (!next) return
      onReorderColumns?.(next as Array<Id<'boardColumns'>>)
      return
    }
    const destColumnId = columnIdOfOver(
      String(over.id),
      over.data.current?.columnId as BoardColumnKey | undefined,
    )
    if (destColumnId === undefined) return
    const dest = board.columns.find((column) => column.columnId == destColumnId)
    if (!dest) return
    const movedId = String(active.id)
    const destOrderedIds = destOrderedIdsAfterDrop({
      destTaskIds: dest.tasks.map((task) => task._id),
      movedId,
      overId: String(over.id),
    })
    const args = toMoveOnBoardArgs({
      movedId,
      destColumnId,
      destOrderedIds,
    })
    if (!args) return
    const from = taskById.get(movedId)
    if (!from) return
    const currentIndex = dest.tasks.findIndex((task) => task._id === movedId)
    const currentBefore =
      currentIndex >= 0 ? dest.tasks[currentIndex + 1]?._id : undefined
    if ((from.columnId ?? null) == destColumnId && currentBefore === args.beforeTaskId) {
      return
    }
    void onMove({
      taskId: args.taskId as Id<'tasks'>,
      columnId: args.columnId as Id<'boardColumns'> | null,
      beforeTaskId: args.beforeTaskId as Id<'tasks'> | undefined,
    })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={columnCollisionDetection}
      onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex items-stretch gap-3">
        {backlogColumn ? (
          <section
            aria-label="Backlog"
            className="flex w-[16rem] shrink-0 flex-col rounded-xl border border-border bg-card p-2 shadow-soft sm:w-[18rem]"
          >
            <BoardColumn
              column={backlogColumn}
              tasks={backlogColumn.tasks}
              onOpen={actions.openDetails}
              onAddTask={onAddTask}
              fill
              showProjectBadge={showProjectBadge}
            />
          </section>
        ) : null}
        <section
          aria-label="Board"
          className="flex min-h-[20rem] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-soft"
        >
          <div className="flex min-h-0 flex-1 gap-1.5 overflow-x-auto p-2 sm:gap-3 sm:p-3">
            <SortableContext items={sortableColumnIds} strategy={horizontalListSortingStrategy}>
              {workflowColumns.map((column, index) => (
                <div key={column.columnId} className="flex shrink-0">
                  {onAddColumn && index === doneIndex ? (
                    <div className="flex shrink-0 items-start pt-8">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8 shrink-0"
                        aria-label="Add column"
                        onClick={onAddColumn}
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                  ) : null}
                  <SortableBoardColumn
                    column={column}
                    tasks={column.tasks}
                    onOpen={actions.openDetails}
                    onAddTask={onAddTask}
                    onRename={onRename}
                    onRemove={onRemoveColumn}
                    disabled={column.isDone}
                    showProjectBadge={showProjectBadge}
                  />
                </div>
              ))}
            </SortableContext>
          </div>
        </section>
      </div>
      <DragOverlay>
        {activeColumn ? (
          <ColumnDragPreview column={activeColumn} showProjectBadge={showProjectBadge} />
        ) : null}
        {activeTask ? (
          <div className="w-[12rem] rounded-md border border-border bg-card p-2 shadow-soft sm:w-[14rem] sm:p-3">
            <TaskCardBody task={activeTask} showProjectBadge={showProjectBadge} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
