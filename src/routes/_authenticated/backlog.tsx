import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ConfirmDialog } from '~/components/ConfirmDialog'
import { AddTaskModal } from '~/components/tasks/AddTaskModal'
import { BacklogBoard } from '~/components/tasks/BacklogBoard'
import { BoardColumnSettingsDialog } from '~/components/tasks/BoardColumnSettingsDialog'
import { AddTimeBlockModal } from '~/components/time-block/AddTimeBlockModal'
import { EditTaskModal } from '~/components/tasks/EditTaskModal'
import {
  BacklogTasksTable,
  type BacklogTask,
} from '~/components/tasks/BacklogTasksTable'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { applyMoveToBoard, filterBoardColumns } from '~/lib/backlog-board'
import { columnSelectOptions } from '~/lib/board-columns'
import {
  nextNewColumnName,
  rowsFromColumns,
  toSavePayload,
} from '~/lib/board-column-settings'
import type { BoardColumnKey } from '~/lib/backlog-board'

export const Route = createFileRoute('/_authenticated/backlog')({
  validateSearch: (raw: Record<string, unknown>): { view?: 'table' | 'board' } => ({
    view: raw.view === 'board' ? 'board' : raw.view === 'table' ? 'table' : undefined,
  }),
  component: BacklogPage,
})

function BacklogPage() {
  const [showArchived, setShowArchived] = useState(false)
  const { view } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const activeView = view ?? 'board'
  const { data } = useSuspenseQuery(
    convexQuery(api.backlog.get, { archived: showArchived }),
  )
  const { data: boardData } = useSuspenseQuery(convexQuery(api.backlog.board, {}))
  const { data: projects } = useSuspenseQuery(
    convexQuery(api.projects.list, { status: 'active' }),
  )
  const columns = useQuery(api.boardColumns.list)
  const ensureDefaults = useMutation(api.boardColumns.ensureDefaults)
  const saveColumns = useMutation(api.boardColumns.save)
  const removeColumn = useMutation(api.boardColumns.remove)
  const updateTask = useMutation(api.tasks.update)
  const removeTask = useMutation(api.tasks.remove)
  const moveOnBoard = useMutation(api.tasks.moveOnBoard).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.backlog.board, {})
      if (!current) return
      localStore.setQuery(api.backlog.board, {}, applyMoveToBoard(current, args))
    },
  )

  useEffect(() => {
    if (columns && columns.length === 0) void ensureDefaults({})
  }, [columns, ensureDefaults])

  const [filter, setFilter] = useState<Id<'projects'> | 'all' | 'none'>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [addColumnId, setAddColumnId] = useState<BoardColumnKey | undefined>()
  const [planTaskId, setPlanTaskId] = useState<Id<'tasks'> | null>(null)
  const [editingTask, setEditingTask] = useState<BacklogTask | null>(null)
  const [taskToDelete, setTaskToDelete] = useState<BacklogTask | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<{
    id: Id<'boardColumns'>
    count: number
  } | null>(null)
  const defaultProjectId =
    filter !== 'all' && filter !== 'none' ? filter : undefined

  const openAddTask = (columnId?: BoardColumnKey) => {
    setAddColumnId(columnId)
    setAddOpen(true)
  }

  const closeAddTask = () => {
    setAddOpen(false)
    setAddColumnId(undefined)
  }

  const filteredTasks = useMemo(() => {
    const groups =
      filter === 'all'
        ? data.groups
        : filter === 'none'
          ? data.groups.filter((group) => group.key === 'none')
          : data.groups.filter((group) => group.key === filter)

    return groups.flatMap((group) => group.tasks)
  }, [data.groups, filter])

  const filteredBoardColumns = filterBoardColumns(boardData.columns, filter)
  const boardCount = filteredBoardColumns.reduce(
    (sum, column) => sum + column.tasks.length,
    0,
  )
  const visibleCount = activeView === 'board' ? boardCount : filteredTasks.length

  const taskCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const column of boardData.columns) {
      if (column.columnId) counts[column.columnId] = column.tasks.length
    }
    return counts
  }, [boardData.columns])

  const columnOptions = columnSelectOptions(columns ?? [])

  async function renameColumn(columnId: Id<'boardColumns'>, name: string) {
    const rows = rowsFromColumns(columns ?? [])
    const payload = toSavePayload(
      rows.map((row) => (row.id === columnId ? { ...row, name } : row)),
    )
    await saveColumns(
      payload as {
        columns: Array<{ id?: Id<'boardColumns'>; name: string; color: string }>
      },
    )
  }

  async function addColumn() {
    const rows = rowsFromColumns(columns ?? [])
    const payload = toSavePayload(
      [...rows.slice(0, -1), {
        key: 'new',
        name: nextNewColumnName(rows),
        color: '#6366f1',
        isDone: false,
      }, ...rows.slice(-1)],
    )
    await saveColumns(
      payload as {
        columns: Array<{ id?: Id<'boardColumns'>; name: string; color: string }>
      },
    )
  }

  return (
    <section>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Backlog</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {visibleCount} {visibleCount === 1 ? 'task' : 'tasks'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setSettingsOpen(true)}>
            Settings
          </Button>
          <Button type="button" onClick={() => openAddTask()}>
            + Add task
          </Button>
        </div>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Select
          value={showArchived ? 'archived' : 'active'}
          onValueChange={(v) => setShowArchived(v === 'archived')}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filter}
          onValueChange={(v) => setFilter(v as Id<'projects'> | 'all' | 'none')}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Show All</SelectItem>
            <SelectItem value="none">Tasks without a project</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project._id} value={project._id}>
                <span
                  className="mr-2 inline-block size-2.5 rounded-full align-middle"
                  style={{ background: project.color }}
                />
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs
        value={activeView}
        onValueChange={(next) =>
          void navigate({
            search: (prev) => ({ ...prev, view: next as 'table' | 'board' }),
            replace: true,
          })
        }
      >
        <TabsList>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="table">Table</TabsTrigger>
        </TabsList>
        <TabsContent value="table">
          <BacklogTasksTable
            tasks={filteredTasks}
            columnOptions={columnOptions}
            emptyMessage={
              showArchived ? 'No archived tasks.' : 'No tasks yet.'
            }
            actions={{
              setColumnId: (taskId, columnId) =>
                void updateTask({
                  taskId,
                  columnId: columnId as Id<'boardColumns'> | null,
                }),
              plan: showArchived ? undefined : setPlanTaskId,
              openDetails: setEditingTask,
              remove: setTaskToDelete,
            }}
          />
        </TabsContent>
        <TabsContent value="board">
          <BacklogBoard
            board={boardData}
            filter={filter}
            onMove={(args) => moveOnBoard(args)}
            onAddTask={openAddTask}
            onRename={renameColumn}
            onAddColumn={() => void addColumn()}
            onRemoveColumn={(columnId) =>
              setRemoveTarget({
                id: columnId,
                count: taskCounts[columnId] ?? 0,
              })
            }
            actions={{ openDetails: setEditingTask }}
          />
        </TabsContent>
      </Tabs>

      <AddTaskModal
        open={addOpen}
        onClose={closeAddTask}
        defaultProjectId={defaultProjectId}
        defaultColumnId={addColumnId}
      />
      <AddTimeBlockModal
        open={planTaskId != null}
        onClose={() => setPlanTaskId(null)}
        defaultTaskId={planTaskId ?? undefined}
      />
      <EditTaskModal task={editingTask} onClose={() => setEditingTask(null)} />
      <BoardColumnSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        columns={columns ?? []}
        taskCounts={taskCounts}
      />
      <ConfirmDialog
        open={taskToDelete != null}
        onClose={() => setTaskToDelete(null)}
        onConfirm={() => removeTask({ taskId: taskToDelete!._id })}
        title="Delete task?"
        description={
          taskToDelete ? (
            <>
              <span className="font-medium text-foreground">
                {taskToDelete.title}
              </span>{' '}
              will be permanently deleted. This cannot be undone.
            </>
          ) : null
        }
        confirmLabel="Delete"
        cancelLabel="Keep"
        confirmVariant="destructive"
        errorMessage="Could not delete the task. Please try again."
      />
      {removeTarget && removeTarget.count === 0 ? (
        <ConfirmDialog
          open
          onClose={() => setRemoveTarget(null)}
          title="Delete column?"
          confirmLabel="Delete"
          confirmVariant="destructive"
          onConfirm={() => removeColumn({ columnId: removeTarget.id })}
        />
      ) : null}
      <Dialog
        open={removeTarget != null && removeTarget.count > 0}
        onOpenChange={(next) => (!next ? setRemoveTarget(null) : undefined)}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete column?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This column has {removeTarget?.count} tasks.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                if (!removeTarget) return
                await removeColumn({
                  columnId: removeTarget.id,
                  disposition: 'move-to-backlog',
                })
                setRemoveTarget(null)
              }}
            >
              Move {removeTarget?.count} tasks to Backlog
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                if (!removeTarget) return
                await removeColumn({
                  columnId: removeTarget.id,
                  disposition: 'delete-tasks',
                })
                setRemoveTarget(null)
              }}
            >
              Delete {removeTarget?.count} tasks
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
