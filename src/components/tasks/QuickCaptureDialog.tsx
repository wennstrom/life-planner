import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { useAppForm } from '~/components/form/form-hook'
import { FieldGroup, Form } from '~/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import {
  emptyQuickCaptureValues,
  quickCaptureSchema,
  toQuickCaptureArgs,
} from '~/lib/forms/quick-capture'

type QuickCaptureDialogProps = {
  open: boolean
  onClose: () => void
  defaultProjectId?: string
}

const TITLE_ID = 'quick-capture-title'
const MUTATION_ERROR = 'Could not add the task. Please try again.'

/** Capture a task into Backlog without leaving the page. Stays open for more. */
export function QuickCaptureDialog({
  open,
  onClose,
  defaultProjectId,
}: QuickCaptureDialogProps) {
  const projects = useQuery(
    api.projects.list,
    open ? { status: 'active' } : 'skip',
  )
  const createTask = useMutation(api.tasks.create)
  const [lastAdded, setLastAdded] = useState<string | null>(null)

  const form = useAppForm({
    defaultValues: emptyQuickCaptureValues(defaultProjectId),
    validators: { onSubmit: quickCaptureSchema },
    onSubmit: async ({ value }) => {
      try {
        const args = toQuickCaptureArgs(value)
        await createTask({
          title: args.title,
          projectId: args.projectId as Id<'projects'> | undefined,
        })
        setLastAdded(args.title)
        // Keep the project for the next item; clear the title.
        form.reset(emptyQuickCaptureValues(value.projectId))
        document.getElementById(TITLE_ID)?.focus()
      } catch {
        form.setErrorMap({
          onSubmit: { form: MUTATION_ERROR, fields: {} },
        })
      }
    },
  })

  useEffect(() => {
    if (!open) return
    setLastAdded(null)
    form.reset(emptyQuickCaptureValues(defaultProjectId))
  }, [open, defaultProjectId])

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Quick add task</DialogTitle>
          <DialogDescription>
            Goes to Backlog. Enter adds it and keeps this open; Esc closes.
          </DialogDescription>
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
              <form.AppField name="title">
                {(field) => (
                  <field.TextField
                    id={TITLE_ID}
                    label="Task"
                    autoFocus
                    placeholder="What needs doing?"
                  />
                )}
              </form.AppField>
              <form.AppField name="projectId">
                {(field) => (
                  <field.SelectField
                    id="quick-capture-project"
                    label="Project (optional)"
                    placeholder="No project"
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
            </FieldGroup>
            <form.FormError />
            <p
              aria-live="polite"
              className="min-h-4 truncate text-xs text-muted-foreground"
            >
              {lastAdded ? `Added “${lastAdded}”` : null}
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
              <form.SubmitButton label="Add" />
            </DialogFooter>
          </Form>
        </form.AppForm>
      </DialogContent>
    </Dialog>
  )
}
