import { useEffect } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { useAppForm } from '~/components/form/form-hook'
import { Form } from '~/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { TaskFormFields } from '~/components/tasks/TaskFormFields'
import {
  addTaskSchema,
  emptyAddTaskValues,
  toCreateTaskArgs,
  type AddTaskValues,
} from '~/lib/forms/add-task'

type AddTaskModalProps = {
  open: boolean
  onClose: () => void
  defaultProjectId?: Id<'projects'>
  defaultStatus?: AddTaskValues['status']
  lockProject?: boolean
}

const MUTATION_ERROR = 'Could not create the task. Please try again.'

export function AddTaskModal({
  open,
  onClose,
  defaultProjectId,
  defaultStatus,
  lockProject = false,
}: AddTaskModalProps) {
  const projects = useQuery(api.projects.list, { status: 'active' })
  const createTask = useMutation(api.tasks.create)

  const form = useAppForm({
    defaultValues: emptyAddTaskValues(defaultProjectId ?? ''),
    validators: { onSubmit: addTaskSchema },
    onSubmit: async ({ value }) => {
      try {
        const args = toCreateTaskArgs(value)
        await createTask({
          title: args.title,
          notes: args.notes,
          status: args.status,
          projectId: args.projectId
            ? (args.projectId as Id<'projects'>)
            : undefined,
          dueDate: args.dueDate,
          estimateMinutes: args.estimateMinutes,
          priority: args.priority,
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
    form.reset(emptyAddTaskValues(defaultProjectId ?? '', defaultStatus))
  }, [open, defaultProjectId, defaultStatus])

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <form.AppForm>
          <Form
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void form.handleSubmit()
            }}
          >
            <TaskFormFields
              form={form}
              idPrefix="add"
              projects={projects}
              lockProject={lockProject}
            />
            <form.FormError />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <form.SubmitButton label="Add task" />
            </DialogFooter>
          </Form>
        </form.AppForm>
      </DialogContent>
    </Dialog>
  )
}
