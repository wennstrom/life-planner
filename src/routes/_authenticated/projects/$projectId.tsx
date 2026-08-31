import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useState } from 'react'
import { api } from '../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../convex/_generated/dataModel'
import { AddTaskModal } from '~/components/tasks/AddTaskModal'
import { EditTaskModal } from '~/components/tasks/EditTaskModal'
import { TaskRow } from '~/components/tasks/TaskRow'
import { ProjectDeleteDialog } from '~/components/projects/ProjectDeleteDialog'
import { Button } from '~/components/ui/button'

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
  const archiveProject = useMutation(api.projects.update)
  const removeProject = useMutation(api.projects.remove)
  const removeNote = useMutation(api.notes.remove)

  const [addOpen, setAddOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Doc<'tasks'> | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  return (
    <section>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <Link to="/projects" className="text-[13px] text-muted-foreground hover:underline">
            ← Projects
          </Link>
          <h1 className="text-2xl font-bold">{data.project.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.project.description ?? 'Project detail'}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void archiveProject({
                projectId: projectIdTyped,
                status: 'archived',
              }).then(() => window.history.back())
            }
          >
            Archive
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            Delete
          </Button>
          <Button type="button" onClick={() => setAddOpen(true)}>
            + Add task
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-7 md:grid-cols-[1.1fr_1fr]">
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tasks
          </h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {data.tasks.map((task) => (
              <TaskRow
                key={task._id}
                task={{ ...task, project: data.project }}
                onToggleDone={(done) =>
                  void updateTask({
                    taskId: task._id,
                    status: done ? 'done' : 'backlog',
                  })
                }
                onOpenDetails={() => setEditingTask(task)}
              />
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Notes
          </h3>
          {data.notes.length === 0 ? (
            <p className="text-muted-foreground">
              No notes attached to this project yet.
            </p>
          ) : (
            data.notes.map((note) => (
              <div
                key={note._id}
                className="mb-2 rounded-md border border-border bg-card p-3 shadow-soft"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold">{note.title}</div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto px-2 py-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void removeNote({ noteId: note._id })}
                  >
                    Delete
                  </Button>
                </div>
                <div className="truncate text-[13px] text-muted-foreground">
                  {note.body.slice(0, 120)}
                </div>
              </div>
            ))
          )}
        </div>
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
