import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

import type { FormEvent } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { Label } from '~/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'

type AddTaskModalProps = {
  open: boolean
  onClose: () => void
  defaultProjectId?: Id<'projects'>
  lockProject?: boolean
  // Non-visible schedule pass-through: pages (e.g. Today) can auto-schedule
  // the created task so it lands in the day's list, independent of due date.
  scheduledDate?: string
}

export function AddTaskModal({
  open,
  onClose,
  defaultProjectId,
  lockProject = false,
  scheduledDate,
}: AddTaskModalProps) {
  // Non-suspense useQuery: this component is always mounted, so it must not
  // suspend the page while projects load.
  const projects = useQuery(api.projects.list, { status: 'active' })
  const createTask = useMutation(api.tasks.create)

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [projectId, setProjectId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form each time the dialog opens.
  useEffect(() => {
    if (!open) return
    setTitle('')
    setNotes('')
    setProjectId(defaultProjectId ?? '')
    setDueDate('')
    setError(null)
    setPending(false)
  }, [open, defaultProjectId])

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
        dueDate: dueDate || undefined,
      })
      onClose()
    } catch {
      setError('Could not create the task. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-title">Title</Label>
            <Input
              id="add-title"
              required
              autoFocus
              placeholder="What needs doing?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-notes">Notes</Label>
            <Textarea
              id="add-notes"
              rows={3}
              placeholder="Optional details"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-project">Project</Label>
            <Select
              value={projectId || 'none'}
              disabled={lockProject}
              onValueChange={(v) => setProjectId(v === 'none' ? '' : v)}
            >
              <SelectTrigger id="add-project" className="w-full">
                <SelectValue placeholder="No project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {(projects ?? []).map((project) => (
                  <SelectItem key={project._id} value={project._id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-due">Due date</Label>
            <Input
              id="add-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              Add task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
