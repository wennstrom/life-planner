import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

import type { FormEvent } from 'react'
import type { Doc, Id } from '../../../convex/_generated/dataModel'

type EditTaskModalProps = {
  task: Doc<'tasks'> | null
  onClose: () => void
}

export function EditTaskModal({ task, onClose }: EditTaskModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  // Non-suspense useQuery: this component is always mounted at page level, so
  // it must not suspend the page while projects load.
  const projects = useQuery(api.projects.list, { status: 'active' })
  const updateTask = useMutation(api.tasks.update)
  const removeTask = useMutation(api.tasks.remove)

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [projectId, setProjectId] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (task && !dialog.open) {
      setTitle(task.title)
      setNotes(task.notes ?? '')
      setProjectId(task.projectId ?? '')
      setScheduledDate(task.scheduledDate ?? '')
      setDueDate(task.dueDate ?? '')
      setPriority(task.priority != null ? String(task.priority) : '')
      setError(null)
      setPending(false)
      setConfirmingDelete(false)
      dialog.showModal()
    } else if (!task && dialog.open) {
      dialog.close()
    }
  }, [task])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!task) return
    const trimmedTitle = title.trim()
    if (!trimmedTitle || pending) return

    setPending(true)
    setError(null)
    try {
      await updateTask({
        taskId: task._id,
        title: trimmedTitle,
        notes: notes.trim() || null,
        projectId: projectId ? (projectId as Id<'projects'>) : null,
        scheduledDate: scheduledDate || null,
        dueDate: dueDate || null,
        priority: priority ? Number(priority) : null,
      })
      onClose()
    } catch {
      setError('Could not save the task. Please try again.')
    } finally {
      setPending(false)
    }
  }

  const handleDelete = async () => {
    if (!task || pending) return
    setPending(true)
    setError(null)
    try {
      await removeTask({ taskId: task._id })
      onClose()
    } catch {
      setError('Could not delete the task. Please try again.')
      setPending(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 className="modal-title">Edit task</h2>
        <label className="field">
          <span>Title</span>
          <input
            required
            autoFocus
            placeholder="What needs doing?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Notes</span>
          <textarea
            rows={3}
            placeholder="Optional details"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Project</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No project</option>
            {(projects ?? []).map((project) => (
              <option key={project._id} value={project._id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Scheduled date</span>
          <input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Due date</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Priority</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">None</option>
            <option value="1">Low</option>
            <option value="2">Medium</option>
            <option value="3">High</option>
          </select>
        </label>
        {error ? <p className="modal-error">{error}</p> : null}
        <div className="modal-footer">
          {confirmingDelete ? (
            <div className="delete-confirm">
              <span>Delete this task?</span>
              <button
                type="button"
                className="btn danger"
                onClick={handleDelete}
                disabled={pending}
              >
                Delete
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setConfirmingDelete(false)}
              >
                Keep
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn danger"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </button>
          )}
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={pending}>
              Save changes
            </button>
          </div>
        </div>
      </form>
    </dialog>
  )
}
