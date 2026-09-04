import { useEffect } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { BOARD_COLUMN_COLORS } from '../../../convex/lib/boardColumnColors'
import type { Id } from '../../../convex/_generated/dataModel'
import { useAppForm } from '~/components/form/form-hook'
import { Field, FieldLabel, Form } from '~/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import {
  createProjectSchema,
  projectFormValues,
} from '~/lib/forms/create-project'
import { PROJECT_HEALTH_OPTIONS } from '~/lib/project-health'
import type { ProjectHealth } from '~/lib/project-health'

type EditProjectModalProps = {
  open: boolean
  onClose: () => void
  projectId: Id<'projects'>
  project: {
    name: string
    description?: string
    color: string
    health?: ProjectHealth
    goalDate?: string
  }
}

const MUTATION_ERROR = 'Could not save the project. Please try again.'

export function EditProjectModal({
  open,
  onClose,
  projectId,
  project,
}: EditProjectModalProps) {
  const updateProject = useMutation(api.projects.update)

  const form = useAppForm({
    defaultValues: projectFormValues(project),
    validators: { onSubmit: createProjectSchema },
    onSubmit: async ({ value }) => {
      try {
        await updateProject({
          projectId,
          name: value.name.trim(),
          description: value.description?.trim() ?? '',
          color: value.color,
          health: value.health ? value.health : null,
          goalDate: value.goalDate?.trim() ? value.goalDate : null,
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
    form.reset(projectFormValues(project))
  }, [
    open,
    project.name,
    project.description,
    project.color,
    project.health,
    project.goalDate,
  ])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (!next ? onClose() : undefined)}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
        </DialogHeader>
        <form.AppForm>
          <Form
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void form.handleSubmit()
            }}
          >
            <form.AppField name="name">
              {(field) => <field.TextField label="Name" autoFocus />}
            </form.AppField>
            <form.AppField name="description">
              {(field) => <field.TextareaField label="Description" rows={3} />}
            </form.AppField>
            <form.AppField name="color">
              {(field) => (
                <Field>
                  <FieldLabel>Color</FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    {BOARD_COLUMN_COLORS.map((color) => {
                      const selected = field.state.value === color
                      return (
                        <button
                          key={color}
                          type="button"
                          aria-label={color}
                          aria-pressed={selected}
                          className={cn(
                            'size-7 rounded-full border border-border/60',
                            selected &&
                              'ring-2 ring-ring ring-offset-2 ring-offset-background',
                          )}
                          style={{ background: color }}
                          onClick={() => field.handleChange(color)}
                        />
                      )
                    })}
                  </div>
                </Field>
              )}
            </form.AppField>
            <form.AppField name="health">
              {(field) => (
                <field.SelectField
                  label="Health"
                  placeholder="Not set"
                  options={PROJECT_HEALTH_OPTIONS}
                />
              )}
            </form.AppField>
            <form.AppField name="goalDate">
              {(field) => <field.TextField label="Goal date" type="date" />}
            </form.AppField>
            <form.FormError />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <form.SubmitButton label="Save" />
            </DialogFooter>
          </Form>
        </form.AppForm>
      </DialogContent>
    </Dialog>
  )
}
