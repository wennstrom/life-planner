import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

import type { FormEvent } from 'react'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import {
  Dialog,
  DialogContent,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { TaskHistory } from '~/components/tasks/TaskHistory'

type EditTaskModalProps = {
  task: Doc<'tasks'> | null
  onClose: () => void
}

export function EditTaskModal({ task, onClose }: EditTaskModalProps) {
  const projects = useQuery(api.projects.list, { status: 'active' })
  const updateTask = useMutation(api.tasks.update)
  const removeTask = useMutation(api.tasks.remove)

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<Doc<'tasks'>['status']>('backlog')
  const [projectId, setProjectId] = useState('')
  const [estimateHours, setEstimateHours] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    if (!task) return
    setTitle(task.title)
    setNotes(task.notes ?? '')
    setStatus(task.status)
    setProjectId(task.projectId ?? '')
    setEstimateHours(
      task.estimateMinutes != null ? String(task.estimateMinutes / 60) : '',
    )
    setDueDate(task.dueDate ?? '')
    setPriority(task.priority != null ? String(task.priority) : '')
    setError(null)
    setPending(false)
    setConfirmingDelete(false)
  }, [task])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!task) return
    const trimmedTitle = title.trim()
    if (!trimmedTitle || pending) return

    setPending(true)
    setError(null)
    try {
      const estimateMinutes = estimateHours
        ? Math.round(Number(estimateHours) * 60)
        : null

      await updateTask({
        taskId: task._id,
        title: trimmedTitle,
        notes: notes.trim() || null,
        status,
        projectId: projectId ? (projectId as Id<'projects'>) : null,
        estimateMinutes,
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
    <Dialog
      open={task != null}
      onOpenChange={(next) => (!next ? onClose() : undefined)}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>

        {task ? (
          <Tabs defaultValue="details">
            <TabsList className="w-full">
              <TabsTrigger value="details" className="flex-1">
                Details
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-1">
                History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-4">
              <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-title">Title</Label>
                  <Input
                    id="edit-title"
                    required
                    autoFocus
                    placeholder="What needs doing?"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-notes">Notes</Label>
                  <Textarea
                    id="edit-notes"
                    rows={3}
                    placeholder="Optional details"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select
                    value={status}
                    onValueChange={(v) =>
                      setStatus(v as Doc<'tasks'>['status'])
                    }
                  >
                    <SelectTrigger id="edit-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="backlog">Backlog</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-estimate">Estimate (hours)</Label>
                  <Input
                    id="edit-estimate"
                    type="number"
                    min={0}
                    step={0.5}
                    placeholder="Optional"
                    value={estimateHours}
                    onChange={(e) => setEstimateHours(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-project">Project</Label>
                  <Select
                    value={projectId || 'none'}
                    onValueChange={(v) => setProjectId(v === 'none' ? '' : v)}
                  >
                    <SelectTrigger id="edit-project" className="w-full">
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
                  <Label htmlFor="edit-due">Due date</Label>
                  <Input
                    id="edit-due"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-priority">Priority</Label>
                  <Select
                    value={priority || 'none'}
                    onValueChange={(v) => setPriority(v === 'none' ? '' : v)}
                  >
                    <SelectTrigger id="edit-priority" className="w-full">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="1">Low</SelectItem>
                      <SelectItem value="2">Medium</SelectItem>
                      <SelectItem value="3">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {error ? (
                  <p className="text-sm text-destructive">{error}</p>
                ) : null}
                <div className="mt-1.5 flex items-center justify-between gap-2.5">
                  {confirmingDelete ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Delete this task?</span>
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={handleDelete}
                        disabled={pending}
                      >
                        Delete
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setConfirmingDelete(false)}
                      >
                        Keep
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setConfirmingDelete(true)}
                    >
                      Delete
                    </Button>
                  )}
                  <div className="flex items-center gap-2.5">
                    <Button type="button" variant="outline" onClick={onClose}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={pending}>
                      Save changes
                    </Button>
                  </div>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              <TaskHistory
                taskId={task._id}
                estimateMinutes={task.estimateMinutes}
              />
            </TabsContent>
          </Tabs>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
