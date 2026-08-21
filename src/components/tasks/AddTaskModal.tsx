import { useEffect } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { useAppForm } from '~/components/form/form-hook'
import { FieldGroup } from '~/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import {
  addTaskSchema,
  emptyAddTaskValues,
  toCreateTaskArgs,
} from '~/lib/forms/add-task'

type AddTaskModalProps = {
  open: boolean
  onClose: () => void
  defaultProjectId?: Id<'projects'>
  lockProject?: boolean
}

const MUTATION_ERROR = 'Could not create the task. Please try again.'

export function AddTaskModal({
  open,
  onClose,
  defaultProjectId,
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
          projectId: args.projectId
            ? (args.projectId as Id<'projects'>)
            : undefined,
          dueDate: args.dueDate,
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
    form.reset(emptyAddTaskValues(defaultProjectId ?? ''))
  }, [open, defaultProjectId])

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <form.AppForm>
          <form
            className="flex flex-col gap-3.5"
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void form.handleSubmit()
            }}
          >
            <FieldGroup>
              <form.AppField name="title">
                {(field) => (
                  <field.TextField
                    id="add-title"
                    label="Title"
                    autoFocus
                    placeholder="What needs doing?"
                  />
                )}
              </form.AppField>
              <form.AppField name="notes">
                {(field) => (
                  <field.TextareaField
                    id="add-notes"
                    label="Notes"
                    rows={3}
                    placeholder="Optional details"
                  />
                )}
              </form.AppField>
              <form.AppField name="projectId">
                {(field) => (
                  <field.SelectField
                    id="add-project"
                    label="Project"
                    placeholder="No project"
                    disabled={lockProject}
                    options={[
                      { value: '', label: 'No project' },
                      ...(projects ?? []).map((project) => ({
                        value: project._id,
                        label: project.name,
                      })),
                    ]}
                  />
                )}
              </form.AppField>
              <form.AppField name="dueDate">
                {(field) => (
                  <field.TextField id="add-due" label="Due date" type="date" />
                )}
              </form.AppField>
            </FieldGroup>
            <form.FormError />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <form.SubmitButton label="Add task" />
            </DialogFooter>
          </form>
        </form.AppForm>
      </DialogContent>
    </Dialog>
  )
}
