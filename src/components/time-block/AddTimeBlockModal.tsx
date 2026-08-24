import { useEffect, useMemo } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
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

type AddTimeBlockModalProps = {
  open: boolean
  onClose: () => void
  defaultTaskId?: Id<'tasks'>
  defaultIntent?: string
  defaultStart?: number
  defaultDateKey?: string
}

const CREATE_TASK_VALUE = '__create_task__'
const MUTATION_ERROR = 'Could not create the time block. Please try again.'

export function AddTimeBlockModal({
  open,
  onClose,
  defaultTaskId,
  defaultIntent,
  defaultStart,
  defaultDateKey,
}: AddTimeBlockModalProps) {
  const tasks = useQuery(api.tasks.list, {})
  const createTask = useMutation(api.tasks.create)
  const createBlock = useMutation(api.timeBlocks.create)

  const backlogTasks = useMemo(
    () => (tasks ?? []).filter((task) => task.status !== 'done'),
    [tasks],
  )

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
        await createBlock({
          title: args.title,
          start: args.start,
          end: args.end,
          taskId,
        })
        onClose()
      } catch {
        form.setErrorMap({
          onSubmit: { form: MUTATION_ERROR, fields: {} },
        })
      }
    },
  })

  useEffect(() => {
    if (!open) return
    const dateKey = defaultDateKey ?? formatDateKey()
    form.reset(
      emptyAddTimeBlockValues({
        taskId: defaultTaskId ?? '',
        intent: defaultIntent ?? '',
        dateKey,
        startTime:
          defaultStart != null ? timeFromMs(defaultStart, dateKey) : '09:00',
      }),
    )
  }, [open, defaultTaskId, defaultIntent, defaultStart, defaultDateKey])

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Add time block</DialogTitle>
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
                selector={(state) => [
                  state.values.taskId,
                  state.values.creatingTask,
                ] as const}
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
              <FieldGroup className="grid grid-cols-2">
                <form.AppField name="startTime">
                  {(field) => (
                    <field.TextField
                      id="block-start"
                      label="Start"
                      type="time"
                    />
                  )}
                </form.AppField>
                <form.AppField name="durationMinutes">
                  {(field) => (
                    <field.TextField
                      id="block-duration"
                      label="Duration (minutes)"
                      type="number"
                      min={15}
                      step={15}
                    />
                  )}
                </form.AppField>
              </FieldGroup>
            </FieldGroup>
            <form.FormError />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <form.SubmitButton label="Add block" />
            </DialogFooter>
          </Form>
        </form.AppForm>
      </DialogContent>
    </Dialog>
  )
}
