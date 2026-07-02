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

export const Route = createFileRoute('/_authenticated/projects/$projectId')({
  component: ProjectDetailPage,
})

function ProjectDetailPage() {
  const { projectId } = Route.useParams()
  const projectIdTyped = projectId as Id<'projects'>
  const { data } = useSuspenseQuery(
    convexQuery(api.projects.get, { projectId: projectIdTyped }),
  )
  const completeTask = useMutation(api.tasks.complete)
  const archiveProject = useMutation(api.projects.update)

  const [addOpen, setAddOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Doc<'tasks'> | null>(null)

  return (
    <section className="view active">
      <header className="view-header">
        <div>
          <Link to="/projects" className="muted" style={{ fontSize: 13 }}>
            ← Projects
          </Link>
          <h1>{data.project.name}</h1>
          <p className="view-sub">{data.project.description ?? 'Project detail'}</p>
        </div>
        <div className="view-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              void archiveProject({ projectId: projectIdTyped, status: 'archived' }).then(() =>
                window.history.back(),
              )
            }
          >
            Archive
          </button>
          <button type="button" className="btn primary" onClick={() => setAddOpen(true)}>
            + Add task
          </button>
        </div>
      </header>

      <div className="today-grid">
        <div className="col">
          <h3 className="col-title">Tasks</h3>
          <ul className="task-list">
            {data.tasks.map((task) => (
              <TaskRow
                key={task._id}
                task={{ ...task, project: data.project }}
                onToggle={() =>
                  void completeTask({ taskId: task._id, done: task.status !== 'done' })
                }
                onOpenDetails={() => setEditingTask(task)}
              />
            ))}
          </ul>
        </div>
        <div className="col">
          <h3 className="col-title">Notes</h3>
          {data.notes.length === 0 ? (
            <p className="muted">No notes attached to this project yet.</p>
          ) : (
            data.notes.map((note) => (
              <div key={note._id} className="note-item" style={{ marginBottom: 8 }}>
                <div className="note-item-title">{note.title}</div>
                <div className="note-item-prev">{note.body.slice(0, 120)}</div>
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
    </section>
  )
}
