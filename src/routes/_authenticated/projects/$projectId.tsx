import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useEffect, useState } from 'react'
import { Archive, Trash2 } from 'lucide-react'
import { api } from '../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../convex/_generated/dataModel'
import { AddTaskModal } from '~/components/tasks/AddTaskModal'
import { BacklogBoard } from '~/components/tasks/BacklogBoard'
import { ProjectColorPicker } from '~/components/projects/ProjectColorPicker'
import { ProjectDescription } from '~/components/projects/ProjectDescription'
import { ProjectName } from '~/components/projects/ProjectName'
import { EditTaskModal } from '~/components/tasks/EditTaskModal'
import { ProjectDeleteDialog } from '~/components/projects/ProjectDeleteDialog'
import { Button } from '~/components/ui/button'
import { Progress } from '~/components/ui/progress'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui/tooltip'
import { applyMoveToBoard } from '~/lib/backlog-board'
import {
  namedColumnIdSet,
  projectProgress,
  unassignedTaskCount,
} from '~/lib/project-progress'

export const Route = createFileRoute('/_authenticated/projects/$projectId')({
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const { projectId } = Route.useParams()
  const projectIdTyped = projectId as Id<'projects'>
  const { data } = useSuspenseQuery(
    convexQuery(api.projects.get, { projectId: projectIdTyped }),
  )
  const { data: boardData } = useSuspenseQuery(
    convexQuery(api.backlog.board, { projectId: projectIdTyped }),
  )
  const archiveProject = useMutation(api.projects.update)
  const removeProject = useMutation(api.projects.remove)
  const ensureDefaults = useMutation(api.boardColumns.ensureDefaults)
  const columns = useQuery(api.boardColumns.list)
  const placeOnBoard = useMutation(api.projects.placeOnBoard)
  const moveOnBoard = useMutation(api.tasks.moveOnBoard).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.backlog.board, {
        projectId: projectIdTyped,
      })
      if (!current) return
      localStore.setQuery(
        api.backlog.board,
        { projectId: projectIdTyped },
        applyMoveToBoard(current, args),
      )
    },
  )

  useEffect(() => {
    if (columns && columns.length === 0) {
      void ensureDefaults({})
    }
  }, [columns, ensureDefaults])

  const [addOpen, setAddOpen] = useState(false)
  const [addColumnId, setAddColumnId] = useState<
    Id<'boardColumns'> | null | undefined
  >(undefined)
  const [editingTask, setEditingTask] = useState<Doc<'tasks'> | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [placeError, setPlaceError] = useState<string | null>(null)

  const unassigned =
    columns == null
      ? 0
      : unassignedTaskCount(data.tasks, namedColumnIdSet(columns))
  const progress = Array.isArray(columns)
    ? projectProgress(data.tasks, columns)
    : null

  const closeAddTask = () => {
    setAddOpen(false)
    setAddColumnId(undefined)
  }

  return (
    <section>
      <header className="mb-6">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <Link
              to="/projects"
              className="text-[13px] text-muted-foreground hover:underline"
            >
              ← Projects
            </Link>
            <ProjectName
              projectId={projectIdTyped}
              name={data.project.name}
            />
            <ProjectColorPicker
              projectId={projectIdTyped}
              color={data.project.color}
            />
            {progress ? (
              <div className="mt-3">
                <div className="mb-2 flex gap-2 text-sm text-muted-foreground">
                  <span>{progress.leftover} leftover</span>
                  <span>·</span>
                  <span>{progress.done} done</span>
                </div>
                <Progress value={progress.percent} className="h-1.5" />
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Archive"
                  onClick={() =>
                    void archiveProject({
                      projectId: projectIdTyped,
                      status: 'archived',
                    }).then(() => window.history.back())
                  }
                >
                  <Archive />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Archive</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  aria-label="Delete"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Delete</TooltipContent>
            </Tooltip>
            <Button
              type="button"
              onClick={() => {
                setAddColumnId(null)
                setAddOpen(true)
              }}
            >
              + Add task
            </Button>
          </div>
        </div>
        <div className="mt-3 w-full max-w-none">
          <ProjectDescription
            projectId={projectIdTyped}
            description={data.project.description}
          />
        </div>
      </header>

      {columns != null && unassigned > 0 ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <p>{unassigned} tasks aren't on the board</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setPlaceError(null)
              void placeOnBoard({ projectId: projectIdTyped }).catch(() => {
                setPlaceError('Could not place tasks on the board.')
              })
            }}
          >
            Place on board
          </Button>
          {placeError ? (
            <p className="w-full text-sm text-destructive">{placeError}</p>
          ) : null}
        </div>
      ) : null}

      <BacklogBoard
        board={boardData}
        filter="all"
        showProjectBadge={false}
        onMove={(args) => moveOnBoard(args)}
        onAddTask={(columnId) => {
          setAddColumnId(columnId as Id<'boardColumns'> | null)
          setAddOpen(true)
        }}
        actions={{ openDetails: setEditingTask }}
      />

      <AddTaskModal
        open={addOpen}
        onClose={closeAddTask}
        defaultProjectId={projectIdTyped}
        lockProject
        defaultColumnId={addColumnId}
      />
      <EditTaskModal task={editingTask} onClose={() => setEditingTask(null)} />
      <ProjectDeleteDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        projectName={data.project.name}
        taskCount={data.tasks.length}
        onConfirm={async (deleteTasks) => {
          await removeProject({
            projectId: projectIdTyped,
            deleteTasks,
          })
          window.history.back()
        }}
      />
    </section>
  )
}
