import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import {
  keepPreviousData,
  useQuery as useReactQuery,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useEffect, useState } from 'react'
import {
  Archive,
  ChevronLeft,
  Clock,
  Flag,
  Pencil,
  Trash2,
} from 'lucide-react'
import { api } from '../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../convex/_generated/dataModel'
import { AddTaskModal } from '~/components/tasks/AddTaskModal'
import { BacklogBoard } from '~/components/tasks/BacklogBoard'
import { EditProjectModal } from '~/components/projects/EditProjectModal'
import { EditTaskModal } from '~/components/tasks/EditTaskModal'
import { ProjectDeleteDialog } from '~/components/projects/ProjectDeleteDialog'
import { ProjectLog } from '~/components/projects/ProjectLog'
import { ProjectTimeSummary } from '~/components/projects/ProjectTimeSummary'
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
import {
  STALLED_AFTER_DAYS_DEFAULT,
  formatLastBlock,
  isStalled,
  useStatsWindow,
} from '~/lib/project-stats'
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
  const statsArgs = useStatsWindow()
  const { data: stats } = useReactQuery({
    ...convexQuery(api.projects.statsFor, {
      projectId: projectIdTyped,
      ...statsArgs,
    }),
    placeholderData: keepPreviousData,
  })
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

  const lastBlock = stats
    ? formatLastBlock(stats.lastBlockStart, statsArgs.nowMs)
    : null
  const stalled =
    stats !== undefined &&
    isStalled(stats, data.project._creationTime, statsArgs.nowMs)
  const healthNote = data.project.healthNote

  return (
    <section>
      <header className="mb-8">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" aria-hidden />
          Projects
        </Link>

        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ background: data.project.color }}
                aria-hidden
              />
              <h1 className="truncate text-[30px] font-medium leading-tight tracking-[-1.1px] md:text-[33px]">
                {data.project.name}
              </h1>
            </div>
            {data.project.description ? (
              <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {data.project.description}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="flex items-center rounded-md border border-border">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="rounded-none rounded-l-md"
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
                    variant="ghost"
                    size="icon"
                    className="rounded-none border-x border-border"
                    aria-label="Archive"
                    onClick={() =>
                      void archiveProject({
                        projectId: projectIdTyped,
                        status: 'archived',
                      }).then(() => window.history.back())
                    }
                  >
                    <Archive className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Archive</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="rounded-none rounded-r-md text-destructive hover:text-destructive"
                    aria-label="Delete"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Delete</TooltipContent>
              </Tooltip>
            </div>
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

        {health || caption || lastBlock || stalled ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
            {health ? (
              <span
                className={cn(
                  'inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                  PROJECT_HEALTH_PILL_CLASS[health],
                )}
              >
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    PROJECT_HEALTH_DOT_CLASS[health],
                  )}
                />
                <span className="shrink-0">{PROJECT_HEALTH_LABEL[health]}</span>
                {healthNote ? (
                  <span className="truncate font-normal opacity-80">
                    · {healthNote}
                  </span>
                ) : null}
              </span>
            ) : null}
            {caption ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5',
                  caption.overdue && 'font-semibold text-destructive',
                )}
              >
                <Flag className="size-3.5" aria-hidden />
                {caption.text}
              </span>
            ) : null}
            {lastBlock || stalled ? (
              <span
                className="inline-flex items-center gap-1.5"
                title={
                  stalled
                    ? `No time blocked in ${STALLED_AFTER_DAYS_DEFAULT} days`
                    : undefined
                }
              >
                <Clock className="size-3.5" aria-hidden />
                {lastBlock ?? 'No blocks yet'}
                {stalled ? ' · stalled' : null}
              </span>
            ) : null}
          </div>
        ) : null}

        {progress ? (
          <div className="mt-5 flex items-center gap-3">
            <Progress value={progress.percent} className="h-1.5 flex-1" />
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {progress.done} of {progress.total} done · {progress.percent}%
            </span>
          </div>
        ) : null}

        {stats ? (
          <ProjectTimeSummary
            stats={stats}
            project={data.project}
            nowMs={statsArgs.nowMs}
          />
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

      <ProjectLog projectId={projectIdTyped} nowMs={statsArgs.nowMs} />

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
