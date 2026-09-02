import { useEffect, useMemo, useState } from 'react'
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
  type DraggableAttributes,
  type DraggableSyntheticListeners,
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

function TaskCardBody({ task }: { task: BacklogTask }) {
  const done = task.isDone
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
      data: { type: 'card', columnId: task.columnId ?? null },
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

function BoardColumn({
  column,
  tasks,
  onOpen,
  onAddTask,
  onRename,
  onRemove,
  fill,
  dragHandle,
}: {
  column: BoardResult['columns'][number]
  tasks: Array<BacklogTask>
  onOpen: (task: BacklogTask) => void
  onAddTask: (columnId: BoardColumnKey) => void
  onRename?: (columnId: Id<'boardColumns'>, name: string) => void
  onRemove?: (columnId: Id<'boardColumns'>) => void
  fill?: boolean
  dragHandle?: {
    attributes: DraggableAttributes
    listeners: DraggableSyntheticListeners
  }
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
  const tint = column.color
    ? { backgroundColor: `color-mix(in srgb, ${column.color} 16%, transparent)` }
    : undefined

  return (
    <div
      className={cn(
        'flex flex-col p-1 sm:p-2',
        fill ? 'h-full min-h-0 w-full flex-1' : 'w-[14rem] shrink-0 sm:w-[16rem]',
      )}
    >
      <div
        className={cn(
          'mb-2 flex min-w-0 items-center justify-between gap-1 rounded-md px-2 py-1 text-xs font-semibold',
          dragHandle && 'cursor-grab active:cursor-grabbing',
        )}
        style={tint}
        {...(dragHandle?.attributes ?? {})}
        {...(dragHandle?.listeners ?? {})}
      >
        {column.isBacklog || column.isDone || !onRename ? (
          <ColumnHeading
            name={column.isBacklog ? '' : title}
            count={tasks.length}
          />
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
            onPointerDown={(event) => event.stopPropagation()}
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
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-24 flex-1 flex-col gap-1.5 rounded-md p-1 sm:min-h-32 sm:gap-2',
          column.isBacklog ? 'bg-background/70' : !column.color && 'bg-muted/40',
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

function SortableBoardColumn({
  column,
  disabled,
  ...props
}: {
  column: BoardResult['columns'][number]
  disabled?: boolean
} & Omit<Parameters<typeof BoardColumn>[0], 'column' | 'dragHandle'>) {
  const sortable = useSortable({
    id: columnSortableId(String(column.columnId)),
    data: { type: 'board-column', columnId: column.columnId },
    disabled: disabled || !column.columnId || column.isDone || column.isBacklog,
  })
  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className={cn('flex shrink-0', sortable.isDragging && 'opacity-50')}
    >
      <BoardColumn
        column={column}
        dragHandle={
          disabled || column.isDone
            ? undefined
            : { attributes: sortable.attributes, listeners: sortable.listeners }
        }
        {...props}
      />
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
    ? (board.columns.find((column) => column.columnId === activeColumnId) ?? null)
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
      collisionDetection={closestCorners}
      onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex items-stretch gap-3">
        {backlogColumn ? (
          <section
            aria-label="Backlog"
            className="flex w-[16rem] shrink-0 flex-col rounded-xl border border-border bg-muted/70 p-2 shadow-soft sm:w-[18rem]"
          >
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Backlog
            </p>
            <BoardColumn
              column={backlogColumn}
              tasks={backlogColumn.tasks}
              onOpen={actions.openDetails}
              onAddTask={onAddTask}
              fill
            />
          </section>
        ) : null}
        <div
          className="hidden w-px shrink-0 self-stretch bg-border sm:block"
          role="separator"
          aria-hidden
        />
        <section
          aria-label="Board"
          className="flex min-h-[20rem] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-soft"
        >
          <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Board
          </p>
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
                  />
                </div>
              ))}
            </SortableContext>
          </div>
        </section>
      </div>
      <DragOverlay>
        {activeColumn ? (
          <div className="w-[14rem] rounded-xl border border-border bg-card p-3 text-xs font-semibold shadow-soft sm:w-[16rem]">
            {activeColumn.name}
          </div>
        ) : null}
        {activeTask ? (
          <div className="w-[12rem] rounded-md border border-border bg-card p-2 shadow-soft sm:w-[14rem] sm:p-3">
            <TaskCardBody task={activeTask} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
