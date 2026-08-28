import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
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
import {
  SELECT_NONE,
  fromSelectValue,
  toSelectValue,
} from '~/lib/forms/select-none'
import {
  endTimeOptions,
  shiftEndPreservingDuration,
  startTimeOptions,
} from '~/lib/timeInput'

type AddTimeBlockModalProps = {
  open: boolean
  onClose: () => void
  block?: TimeBlockView | null
  defaultTaskId?: Id<'tasks'>
  defaultIntent?: string
  defaultStart?: number
  defaultDateKey?: string
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
        let taskId = value.taskId ? (value.taskId as Id<'tasks'>) : undefined
        if (value.creatingTask) {
          taskId = await createTask({ title: value.newTaskTitle.trim() })
        }
        const args = toCreateBlockArgs({ ...value, taskId: taskId ?? '' })
        if (editing) {
          await updateBlock({
            blockId: block._id,
            title: args.title,
            start: args.start,
            end: args.end,
            ...(taskId
              ? { taskIds: [taskId] }
              : (block.memberships?.length ?? 0) > 0
                ? { taskIds: [] }
                : {}),
          })
        } else {
          await createBlock({
            title: args.title,
            start: args.start,
            end: args.end,
            ...(taskId ? { taskIds: [taskId] } : {}),
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
          taskId: block.memberships[0]?.taskId ?? '',
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
        taskId: defaultTaskId ?? '',
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
                  [state.values.taskId, state.values.creatingTask] as const
                }
              >
                {([taskId, creatingTask]) => (
                  <Field>
                    <FieldLabel htmlFor="block-task">Task</FieldLabel>
                    <Select
                      value={
                        creatingTask ? CREATE_TASK_VALUE : toSelectValue(taskId)
                      }
                      onValueChange={(value) => {
                        if (value === CREATE_TASK_VALUE) {
                          form.setFieldValue('creatingTask', true)
                          form.setFieldValue('taskId', '')
                          return
                        }
                        form.setFieldValue('creatingTask', false)
                        form.setFieldValue('taskId', fromSelectValue(value))
                      }}
                    >
                      <SelectTrigger id="block-task" className="w-full">
                        <SelectValue placeholder="Personal block (no task)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SELECT_NONE}>
                          Personal block (no task)
                        </SelectItem>
                        {backlogTasks.map((task) => (
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
                )}
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
