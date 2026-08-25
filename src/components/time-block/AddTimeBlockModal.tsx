import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

import type { FormEvent } from 'react'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { TimeCombobox } from '~/components/time-block/TimeCombobox'
import { formatDateKey, startOfDayMs } from '~/lib/dates'
import {
  canonicalTime,
  endAfterDuration,
  endTimeOptions,
  isEndAfterStart,
  shiftEndPreservingDuration,
  startTimeOptions,
} from '~/lib/timeInput'

type AddTimeBlockModalProps = {
  open: boolean
  onClose: () => void
  block?: Doc<'timeBlocks'> | null
  defaultTaskId?: Id<'tasks'>
  defaultIntent?: string
  defaultStart?: number
  defaultDateKey?: string
}

const CREATE_TASK_VALUE = '__create_task__'

function msFromDateAndTime(dateKey: string, time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return startOfDayMs(new Date(dateKey + 'T00:00:00')) + hours * 3600000 + minutes * 60000
}

function timeFromMs(ms: number, dateKey: string) {
  const dayStart = startOfDayMs(new Date(dateKey + 'T00:00:00'))
  const offset = ms - dayStart
  const hours = Math.floor(offset / 3600000)
  const minutes = Math.floor((offset % 3600000) / 60000)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function AddTimeBlockModal({
  open,
  onClose,
  block,
  defaultTaskId,
  defaultIntent,
  defaultStart,
  defaultDateKey,
}: AddTimeBlockModalProps) {
  const tasks = useQuery(api.tasks.list, {})
  const createTask = useMutation(api.tasks.create)
  const createBlock = useMutation(api.timeBlocks.create)
  const updateBlock = useMutation(api.timeBlocks.update)
  const editing = block != null

  const initialDateKey = defaultDateKey ?? formatDateKey()
  const [taskId, setTaskId] = useState<string>('')
  const [intent, setIntent] = useState('')
  const [dateKey, setDateKey] = useState(initialDateKey)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const backlogTasks = useMemo(
    () => (tasks ?? []).filter((t) => t.status !== 'done'),
    [tasks],
  )
  const startOptions = useMemo(() => startTimeOptions(), [])
  const endOptions = useMemo(() => endTimeOptions(startTime), [startTime])

  useEffect(() => {
    if (!open) return
    if (block) {
      setTaskId(block.taskId ?? '')
      setIntent(block.title)
      const key = formatDateKey(new Date(block.start))
      setDateKey(key)
      setStartTime(timeFromMs(block.start, key))
      setEndTime(timeFromMs(block.end, key))
    } else {
      setTaskId(defaultTaskId ?? '')
      setIntent(defaultIntent ?? '')
      setDateKey(defaultDateKey ?? formatDateKey())
      if (defaultStart != null) {
        const start = timeFromMs(defaultStart, defaultDateKey ?? formatDateKey())
        setStartTime(start)
        setEndTime(endAfterDuration(start, 60))
      } else {
        setStartTime('09:00')
        setEndTime('10:00')
      }
    }
    setNewTaskTitle('')
    setCreatingTask(false)
    setError(null)
    setPending(false)
  }, [open, block, defaultTaskId, defaultIntent, defaultStart, defaultDateKey])

  const handleTaskChange = (value: string) => {
    if (value === CREATE_TASK_VALUE) {
      setCreatingTask(true)
      setTaskId('')
      return
    }
    setCreatingTask(false)
    setTaskId(value === 'none' ? '' : value)
  }

  const handleStartCommit = (next: string) => {
    const nextEnd = shiftEndPreservingDuration({
      previousStart: startTime,
      previousEnd: endTime,
      nextStart: next,
    })
    setStartTime(next)
    setEndTime(nextEnd)
  }

  const handleEndCommit = (next: string) => {
    setEndTime(next)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedIntent = intent.trim()
    if (!trimmedIntent || pending) return

    setPending(true)
    setError(null)
    try {
      let linkedTaskId = taskId ? (taskId as Id<'tasks'>) : undefined

      if (creatingTask) {
        const trimmedNewTitle = newTaskTitle.trim()
        if (!trimmedNewTitle) {
          setError('Enter a title for the new task.')
          setPending(false)
          return
        }
        linkedTaskId = await createTask({ title: trimmedNewTitle })
      }

      const startCanonical = canonicalTime(startTime)
      const endCanonical = canonicalTime(endTime)
      if (
        startCanonical == null ||
        endCanonical == null ||
        !isEndAfterStart(startCanonical, endCanonical)
      ) {
        setError('Enter a valid start and end time. End must be after start.')
        setPending(false)
        return
      }

      const start = msFromDateAndTime(dateKey, startCanonical)
      const end = msFromDateAndTime(dateKey, endCanonical)

      if (editing) {
        await updateBlock({
          blockId: block._id,
          title: trimmedIntent,
          start,
          end,
          taskId: linkedTaskId ?? null,
        })
      } else {
        await createBlock({
          title: trimmedIntent,
          start,
          end,
          taskId: linkedTaskId,
        })
      }
      onClose()
    } catch {
      setError(
        editing
          ? 'Could not update the time block. Please try again.'
          : 'Could not create the time block. Please try again.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit time block' : 'Add time block'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="block-task">Task</Label>
            <Select
              value={creatingTask ? CREATE_TASK_VALUE : taskId || 'none'}
              onValueChange={handleTaskChange}
            >
              <SelectTrigger id="block-task" className="w-full">
                <SelectValue placeholder="Personal block (no task)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Personal block (no task)</SelectItem>
                {backlogTasks.map((task) => (
                  <SelectItem key={task._id} value={task._id}>
                    {task.title}
                  </SelectItem>
                ))}
                <SelectItem value={CREATE_TASK_VALUE}>+ Create new task…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {creatingTask ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="block-new-task">New task title</Label>
              <Input
                id="block-new-task"
                placeholder="Task name"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="block-intent">What will you get done?</Label>
            <Input
              id="block-intent"
              required
              autoFocus
              placeholder="Concrete intent for this sitting"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="block-date">Date</Label>
            <Input
              id="block-date"
              type="date"
              value={dateKey}
              onChange={(e) => setDateKey(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="block-start">Start</Label>
              <TimeCombobox
                id="block-start"
                value={startTime}
                onCommit={handleStartCommit}
                options={startOptions}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="block-end">End</Label>
              <TimeCombobox
                id="block-end"
                value={endTime}
                onCommit={handleEndCommit}
                options={endOptions}
              />
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {editing ? 'Save' : 'Add block'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
