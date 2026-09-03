import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useEffect, useState } from 'react'
import { Archive, Trash2 } from 'lucide-react'
import { api } from '../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../convex/_generated/dataModel'
import { AddTaskModal } from '~/components/tasks/AddTaskModal'
import { ProjectDescription } from '~/components/projects/ProjectDescription'
import { ProjectGoalDate } from '~/components/projects/ProjectGoalDate'
import { ProjectHealthPills } from '~/components/projects/ProjectHealthPills'
import { EditTaskModal } from '~/components/tasks/EditTaskModal'
import { TaskRow } from '~/components/tasks/TaskRow'
import { ProjectDeleteDialog } from '~/components/projects/ProjectDeleteDialog'
import { Button } from '~/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui/tooltip'

export const Route = createFileRoute('/_authenticated/projects/$projectId')({
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const { projectId } = Route.useParams()
  const projectIdTyped = projectId as Id<'projects'>
  const { data } = useSuspenseQuery(
    convexQuery(api.projects.get, { projectId: projectIdTyped }),
  )
  const updateTask = useMutation(api.tasks.update)
  const updateProject = useMutation(api.projects.update)
  const removeProject = useMutation(api.projects.remove)
  const ensureDefaults = useMutation(api.boardColumns.ensureDefaults)
  const columns = useQuery(api.boardColumns.list)

  useEffect(() => {
    if (columns && columns.length === 0) {
      void ensureDefaults({})
    }
  }, [columns, ensureDefaults])

  const doneColumnId = columns?.find((column) => column.isDone)?._id

  const [addOpen, setAddOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Doc<'tasks'> | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [healthError, setHealthError] = useState<string | null>(null)

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
                    void updateProject({
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
            <Button type="button" onClick={() => setAddOpen(true)}>
              + Add task
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <ProjectHealthPills
            value={data.project.health ?? 'onTrack'}
            onChange={(health) => {
              void updateProject({ projectId: projectIdTyped, health })
                .then(() => setHealthError(null))
                .catch(() => {
                  setHealthError('Could not save health.')
                })
            }}
          />
          {healthError ? (
            <p className="text-sm text-destructive">{healthError}</p>
          ) : null}
          <ProjectGoalDate
            projectId={projectIdTyped}
            goalDate={data.project.goalDate}
          />
        </div>
        <div className="mt-3 w-full max-w-none">
          <ProjectDescription
            projectId={projectIdTyped}
            description={data.project.description}
          />
        </div>
      </header>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Tasks
        </h3>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {data.tasks.map((task) => (
            <TaskRow
              key={task._id}
              task={{ ...task, project: data.project }}
              onToggleDone={(done) => {
                if (done && !doneColumnId) return
                void updateTask({
                  taskId: task._id,
                  columnId: done ? doneColumnId! : null,
                })
              }}
              onOpenDetails={() => setEditingTask(task)}
            />
          ))}
        </ul>
      </div>

      <AddTaskModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultProjectId={projectIdTyped}
        lockProject
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
