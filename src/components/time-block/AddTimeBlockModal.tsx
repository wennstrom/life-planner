import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import type { TimeBlockView } from '../../../convex/lib/timeBlockMemberships'
import { useAppForm } from '~/components/form/form-hook'
import { Field, FieldGroup, FieldLabel, Form } from '~/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { TimeCombobox } from '~/components/time-block/TimeCombobox'
import {
  addTimeBlockSchema,
  emptyAddTimeBlockValues,
  timeFromMs,
  toCreateBlockArgs,
} from '~/lib/forms/add-time-block'
import { formatDateKey } from '~/lib/dates'
import { SELECT_NONE, fromSelectValue } from '~/lib/forms/select-none'
import {
  endTimeOptions,
  shiftEndPreservingDuration,
  startTimeOptions,
} from '~/lib/timeInput'

type AddTimeBlockModalProps = {
  open: boolean
  onClose: () => void
  block?: TimeBlockView | Doc<'timeBlocks'> | null
  defaultTaskId?: Id<'tasks'>
  defaultIntent?: string
  defaultStart?: number
  defaultDateKey?: string
}

function membershipTaskIds(
  block: TimeBlockView | Doc<'timeBlocks'>,
): string[] {
  return 'memberships' in block && block.memberships
    ? block.memberships.map((membership) => membership.taskId)
    : []
}

function titleForTaskId(
  taskId: string,
  backlogTasks: Array<{ _id: string; title: string }>,
  block?: TimeBlockView | Doc<'timeBlocks'> | null,
) {
  const fromBacklog = backlogTasks.find((task) => task._id === taskId)
  if (fromBacklog) return fromBacklog.title
  if (block && 'memberships' in block && block.memberships) {
    const membership = block.memberships.find(
      (row) => row.taskId === taskId,
    )
    if (membership) return membership.taskTitle
  }
  return 'Task'
}

function moveTaskId(ids: string[], index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= ids.length) return ids
  const next = [...ids]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved)
  return next
}

const CREATE_TASK_VALUE = '__create_task__'
const CREATE_ERROR = 'Could not create the time block. Please try again.'
const UPDATE_ERROR = 'Could not update the time block. Please try again.'
const DELETE_ERROR = 'Could not delete the time block. Please try again.'

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
  const removeBlock = useMutation(api.timeBlocks.remove)
  const editing = block != null
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const backlogTasks = useMemo(
    () => (tasks ?? []).filter((task) => task.status !== 'done'),
    [tasks],
  )
  const startOptions = useMemo(() => startTimeOptions(), [])

  const form = useAppForm({
    defaultValues: emptyAddTimeBlockValues(),
    validators: { onSubmit: addTimeBlockSchema },
    onSubmit: async ({ value }) => {
      try {
        const taskIds = [...value.taskIds]
        if (value.creatingTask) {
          taskIds.push(await createTask({ title: value.newTaskTitle.trim() }))
        }
        const args = toCreateBlockArgs({ ...value, taskIds })
        if (editing) {
          await updateBlock({
            blockId: block._id,
            title: args.title,
            start: args.start,
            end: args.end,
            taskIds: args.taskIds as Id<'tasks'>[],
          })
        } else {
          await createBlock({
            title: args.title,
            start: args.start,
            end: args.end,
            taskIds: args.taskIds.length
              ? (args.taskIds as Id<'tasks'>[])
              : undefined,
          })
        }
        onClose()
      } catch {
        form.setErrorMap({
          onSubmit: {
            form: editing ? UPDATE_ERROR : CREATE_ERROR,
            fields: {},
          },
        })
      }
    },
  })

  useEffect(() => {
    if (!open) return
    setConfirmingDelete(false)
    if (block) {
      const dateKey = formatDateKey(new Date(block.start))
      form.reset(
        emptyAddTimeBlockValues({
          taskIds: membershipTaskIds(block),
          intent: block.title,
          dateKey,
          startTime: timeFromMs(block.start, dateKey),
          endTime: timeFromMs(block.end, dateKey),
        }),
      )
      return
    }
    const dateKey = defaultDateKey ?? formatDateKey()
    const startTime =
      defaultStart != null ? timeFromMs(defaultStart, dateKey) : '09:00'
    form.reset(
      emptyAddTimeBlockValues({
        taskIds: defaultTaskId ? [defaultTaskId] : [],
        intent: defaultIntent ?? '',
        dateKey,
        startTime,
      }),
    )
  }, [open, block, defaultTaskId, defaultIntent, defaultStart, defaultDateKey])

  const handleDelete = async () => {
    if (!block || form.state.isSubmitting) return
    try {
      await removeBlock({ blockId: block._id })
      onClose()
    } catch {
      form.setErrorMap({
        onSubmit: { form: DELETE_ERROR, fields: {} },
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit time block' : 'Add time block'}</DialogTitle>
        </DialogHeader>
        <form.AppForm>
          <Form
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void form.handleSubmit()
            }}
          >
            <FieldGroup>
              <form.Subscribe
                selector={(state) =>
                  [state.values.taskIds, state.values.creatingTask] as const
                }
              >
                {([taskIds, creatingTask]) => {
                  const selected = new Set(taskIds)
                  const addable = backlogTasks.filter(
                    (task) => !selected.has(task._id),
                  )
                  return (
                    <Field>
                      <FieldLabel htmlFor="block-task">Tasks</FieldLabel>
                      {taskIds.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Personal block (no task)
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {taskIds.map((taskId, index) => (
                            <li
                              key={taskId}
                              className="flex items-center gap-2 text-sm"
                            >
                              <span className="min-w-0 flex-1 truncate">
                                {titleForTaskId(taskId, backlogTasks, block)}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                disabled={index === 0}
                                onClick={() =>
                                  form.setFieldValue(
                                    'taskIds',
                                    moveTaskId(taskIds, index, -1),
                                  )
                                }
                              >
                                Move up
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                disabled={index === taskIds.length - 1}
                                onClick={() =>
                                  form.setFieldValue(
                                    'taskIds',
                                    moveTaskId(taskIds, index, 1),
                                  )
                                }
                              >
                                Move down
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                onClick={() =>
                                  form.setFieldValue(
                                    'taskIds',
                                    taskIds.filter((id) => id !== taskId),
                                  )
                                }
                              >
                                Remove
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <Select
                        value={
                          creatingTask ? CREATE_TASK_VALUE : SELECT_NONE
                        }
                        onValueChange={(value) => {
                          if (value === CREATE_TASK_VALUE) {
                            form.setFieldValue('creatingTask', true)
                            return
                          }
                          const added = fromSelectValue(value)
                          if (!added || selected.has(added)) return
                          form.setFieldValue('creatingTask', false)
                          form.setFieldValue('taskIds', [...taskIds, added])
                        }}
                      >
                        <SelectTrigger id="block-task" className="w-full">
                          <SelectValue placeholder="Add task…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SELECT_NONE}>
                            Add task…
                          </SelectItem>
                          {addable.map((task) => (
                            <SelectItem key={task._id} value={task._id}>
                              {task.title}
                            </SelectItem>
                          ))}
                          <SelectItem value={CREATE_TASK_VALUE}>
                            + Create new task…
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  )
                }}
              </form.Subscribe>
              <form.Subscribe selector={(state) => state.values.creatingTask}>
                {(creatingTask) =>
                  creatingTask ? (
                    <form.AppField name="newTaskTitle">
                      {(field) => (
                        <field.TextField
                          id="block-new-task"
                          label="New task title"
                          placeholder="Task name"
                        />
                      )}
                    </form.AppField>
                  ) : null
                }
              </form.Subscribe>
              <form.AppField name="intent">
                {(field) => (
                  <field.TextField
                    id="block-intent"
                    label="What will you get done?"
                    autoFocus
                    placeholder="Concrete intent for this sitting"
                  />
                )}
              </form.AppField>
              <form.AppField name="dateKey">
                {(field) => (
                  <field.TextField id="block-date" label="Date" type="date" />
                )}
              </form.AppField>
              <form.Subscribe
                selector={(state) =>
                  [state.values.startTime, state.values.endTime] as const
                }
              >
                {([startTime, endTime]) => {
                  const endOptions = endTimeOptions(startTime)
                  return (
                    <FieldGroup className="grid grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="block-start">Start</FieldLabel>
                        <TimeCombobox
                          id="block-start"
                          value={startTime}
                          onCommit={(next) => {
                            const nextEnd = shiftEndPreservingDuration({
                              previousStart: startTime,
                              previousEnd: endTime,
                              nextStart: next,
                            })
                            form.setFieldValue('startTime', next)
                            form.setFieldValue('endTime', nextEnd)
                          }}
                          options={startOptions}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="block-end">End</FieldLabel>
                        <TimeCombobox
                          id="block-end"
                          value={endTime}
                          onCommit={(next) => {
                            form.setFieldValue('endTime', next)
                          }}
                          options={endOptions}
                        />
                      </Field>
                    </FieldGroup>
                  )
                }}
              </form.Subscribe>
            </FieldGroup>
            <form.FormError />
            <DialogFooter className="sm:justify-between">
              {editing ? (
                confirmingDelete ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Delete this time block?</span>
                    <form.Subscribe
                      selector={(state) => state.isSubmitting}
                    >
                      {(isSubmitting) => (
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => void handleDelete()}
                          disabled={isSubmitting}
                        >
                          Delete
                        </Button>
                      )}
                    </form.Subscribe>
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
                )
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <form.SubmitButton label={editing ? 'Save' : 'Add block'} />
              </div>
            </DialogFooter>
          </Form>
        </form.AppForm>
      </DialogContent>
    </Dialog>
  )
}
