import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

import type { FormEvent } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'

type AddTaskModalProps = {
  open: boolean
  onClose: () => void
  defaultProjectId?: Id<'projects'>
  lockProject?: boolean
  defaultScheduledDate?: string
}

export function AddTaskModal({
  open,
  onClose,
  defaultProjectId,
  lockProject = false,
  defaultScheduledDate,
}: AddTaskModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  // Non-suspense useQuery: this component is always mounted, so it must not
  // suspend the page while projects load.
  const projects = useQuery(api.projects.list, { status: 'active' })
  const createTask = useMutation(api.tasks.create)

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [projectId, setProjectId] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setTitle('')
      setNotes('')
      setProjectId(defaultProjectId ?? '')
      setScheduledDate(defaultScheduledDate ?? '')
      setError(null)
      setPending(false)
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open, defaultProjectId, defaultScheduledDate])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedTitle = title.trim()
    if (!trimmedTitle || pending) return

    setPending(true)
    setError(null)
    try {
      await createTask({
        title: trimmedTitle,
        notes: notes.trim() || undefined,
        projectId: projectId ? (projectId as Id<'projects'>) : undefined,
        scheduledDate: scheduledDate || undefined,
      })
      onClose()
    } catch {
      setError('Could not create the task. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 className="modal-title">New task</h2>
        <label className="field">
          <span>Title</span>
          <input
            required
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
          <select
            value={projectId}
            disabled={lockProject}
            onChange={(e) => setProjectId(e.target.value)}
          >
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
        {error ? <p className="modal-error">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={pending}>
            Add task
          </button>
        </div>
      </form>
    </dialog>
  )
}
