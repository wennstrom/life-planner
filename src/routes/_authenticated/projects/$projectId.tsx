import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useEffect, useState } from 'react'
import { Archive, Pencil, Trash2 } from 'lucide-react'
import { api } from '../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../convex/_generated/dataModel'
import { AddTaskModal } from '~/components/tasks/AddTaskModal'
import { BacklogBoard } from '~/components/tasks/BacklogBoard'
import { EditProjectModal } from '~/components/projects/EditProjectModal'
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
import { formatDateKey } from '~/lib/dates'
import {
  PROJECT_HEALTH_DOT_CLASS,
  PROJECT_HEALTH_LABEL,
  PROJECT_HEALTH_PILL_CLASS,
  goalDateCaption,
} from '~/lib/project-health'
import { projectProgress } from '~/lib/project-progress'
import { cn } from '~/lib/utils'

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
  const [settingsOpen, setSettingsOpen] = useState(false)

  const progress = Array.isArray(columns)
    ? projectProgress(data.tasks, columns)
    : null
  const health = data.project.health
  const caption = goalDateCaption(data.project.goalDate, formatDateKey())

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
            <h1 className="text-2xl font-bold">{data.project.name}</h1>
            {data.project.description ? (
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {data.project.description}
              </p>
            ) : null}
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
                  aria-label="Edit project"
                  onClick={() => setSettingsOpen(true)}
                >
                  <Pencil className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Edit</TooltipContent>
            </Tooltip>
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
        {health || caption ? (
          <div
            className={cn(
              'mt-3 flex items-center gap-2',
              health ? 'justify-between' : 'justify-end',
            )}
          >
            {health ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  PROJECT_HEALTH_PILL_CLASS[health],
                )}
              >
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    PROJECT_HEALTH_DOT_CLASS[health],
                  )}
                />
                {PROJECT_HEALTH_LABEL[health]}
              </span>
            ) : null}
            {caption ? (
              <span
                className={cn(
                  'text-xs text-muted-foreground',
                  caption.overdue && 'font-semibold text-destructive',
                )}
              >
                {caption.text}
              </span>
            ) : null}
          </div>
        ) : null}
      </header>

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
      <EditProjectModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        projectId={projectIdTyped}
        project={data.project}
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
