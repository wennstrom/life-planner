import { useEffect } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { BOARD_COLUMN_COLORS } from '../../../convex/lib/boardColumnColors'
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
  emptyCreateProjectValues,
} from '~/lib/forms/create-project'
import { nextProjectColor } from '~/lib/project-color'

type AddProjectModalProps = {
  open: boolean
  onClose: () => void
  usedColors: Array<string>
}

const MUTATION_ERROR = 'Could not create the project. Please try again.'

export function AddProjectModal({
  open,
  onClose,
  usedColors,
}: AddProjectModalProps) {
  const createProject = useMutation(api.projects.create)

  const form = useAppForm({
    defaultValues: emptyCreateProjectValues(nextProjectColor(usedColors)),
    validators: { onSubmit: createProjectSchema },
    onSubmit: async ({ value }) => {
      try {
        const description = value.description?.trim()
        await createProject({
          name: value.name.trim(),
          ...(description ? { description } : {}),
          color: value.color,
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
    form.reset(emptyCreateProjectValues(nextProjectColor(usedColors)))
  }, [open])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (!next ? onClose() : undefined)}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
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
            <form.FormError />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <form.SubmitButton label="Create" />
            </DialogFooter>
          </Form>
        </form.AppForm>
      </DialogContent>
    </Dialog>
  )
}
