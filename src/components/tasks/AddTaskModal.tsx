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
import { columnSelectOptions } from '~/lib/board-columns'
import {
  addTaskSchema,
  emptyAddTaskValues,
  toCreateTaskArgs,
} from '~/lib/forms/add-task'

type AddTaskModalProps = {
  open: boolean
  onClose: () => void
  defaultProjectId?: Id<'projects'>
  defaultColumnId?: string | null
  lockProject?: boolean
}

const MUTATION_ERROR = 'Could not create the task. Please try again.'

export function AddTaskModal({
  open,
  onClose,
  defaultProjectId,
  defaultColumnId,
  lockProject = false,
}: AddTaskModalProps) {
  const projects = useQuery(api.projects.list, { status: 'active' })
  const columns = useQuery(api.boardColumns.list)
  const ensureDefaults = useMutation(api.boardColumns.ensureDefaults)
  const createTask = useMutation(api.tasks.create)
  const columnId = defaultColumnId ?? ''

  useEffect(() => {
    if (columns && columns.length === 0) void ensureDefaults({})
  }, [columns, ensureDefaults])

  const form = useAppForm({
    defaultValues: emptyAddTaskValues(defaultProjectId ?? '', columnId),
    validators: { onSubmit: addTaskSchema },
    onSubmit: async ({ value }) => {
      try {
        const args = toCreateTaskArgs(value)
        await createTask({
          title: args.title,
          notes: args.notes,
          checklist: args.checklist,
          columnId: args.columnId
            ? (args.columnId as Id<'boardColumns'>)
            : null,
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
    form.reset(emptyAddTaskValues(defaultProjectId ?? '', columnId))
  }, [open, defaultProjectId, columnId])

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
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
              columnOptions={columnSelectOptions(columns ?? [])}
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
