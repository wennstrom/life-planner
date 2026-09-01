import { Plus, Trash2 } from 'lucide-react'
import { FieldGroup } from '~/components/ui/field'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import { Input } from '~/components/ui/input'
import { withForm } from '~/components/form/form-hook'
import { emptyAddTaskValues } from '~/lib/forms/add-task'
import { MAX_CHECKLIST_ITEMS, newChecklistItem } from '~/lib/checklist'

export const TASK_STATUS_OPTIONS = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'test', label: 'Test' },
  { value: 'investigate', label: 'Investigate' },
  { value: 'done', label: 'Done' },
]

export const TASK_PRIORITY_OPTIONS = [
  { value: '', label: 'None' },
  { value: '1', label: 'Low' },
  { value: '2', label: 'Medium' },
  { value: '3', label: 'High' },
]

export const TaskFormFields = withForm({
  defaultValues: emptyAddTaskValues(),
  props: {
    idPrefix: 'task',
    projects: undefined as Array<{ _id: string; name: string }> | undefined,
    lockProject: false,
  },
  render: function Render({ form, idPrefix, projects, lockProject }) {
    return (
      <FieldGroup>
        <form.AppField name="title">
          {(field) => (
            <field.TextField
              id={`${idPrefix}-title`}
              label="Title"
              autoFocus
              placeholder="What needs doing?"
            />
          )}
        </form.AppField>
        <form.AppField name="notes">
          {(field) => (
            <field.TextareaField
              id={`${idPrefix}-notes`}
              label="Description"
              rows={3}
              placeholder="Optional details"
            />
          )}
        </form.AppField>
        <form.Field name="checklist" mode="array">
          {(field) => (
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Checklist</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={field.state.value.length >= MAX_CHECKLIST_ITEMS}
                  onClick={() => field.pushValue(newChecklistItem())}
                >
                  <Plus className="mr-1 size-3.5" />
                  Add item
                </Button>
              </div>
              {field.state.value.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Break the task into smaller steps.
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {field.state.value.map((item, index) => (
                    <li key={item.id} className="flex items-center gap-2">
                      <form.AppField name={`checklist[${index}].done`}>
                        {(doneField) => (
                          <Checkbox
                            checked={doneField.state.value}
                            aria-label={
                              doneField.state.value
                                ? 'Mark item incomplete'
                                : 'Mark item complete'
                            }
                            onCheckedChange={(checked) =>
                              doneField.handleChange(checked === true)
                            }
                          />
                        )}
                      </form.AppField>
                      <form.AppField name={`checklist[${index}].text`}>
                        {(textField) => (
                          <Input
                            id={`${idPrefix}-checklist-${index}`}
                            value={textField.state.value}
                            placeholder="Checklist item"
                            aria-label={`Checklist item ${index + 1}`}
                            onBlur={textField.handleBlur}
                            onChange={(event) =>
                              textField.handleChange(event.target.value)
                            }
                          />
                        )}
                      </form.AppField>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label="Remove checklist item"
                        onClick={() => field.removeValue(index)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </form.Field>
        <form.AppField name="status">
          {(field) => (
            <field.SelectField
              id={`${idPrefix}-status`}
              label="Status"
              options={TASK_STATUS_OPTIONS}
            />
          )}
        </form.AppField>
        <form.AppField name="estimateHours">
          {(field) => (
            <field.TextField
              id={`${idPrefix}-estimate`}
              label="Estimate (hours)"
              type="number"
              min={0}
              step={0.5}
              placeholder="Optional"
            />
          )}
        </form.AppField>
        <form.AppField name="projectId">
          {(field) => (
            <field.SelectField
              id={`${idPrefix}-project`}
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
            <field.TextField
              id={`${idPrefix}-due`}
              label="Due date"
              type="date"
            />
          )}
        </form.AppField>
        <form.AppField name="priority">
          {(field) => (
            <field.SelectField
              id={`${idPrefix}-priority`}
              label="Priority"
              placeholder="None"
              options={TASK_PRIORITY_OPTIONS}
            />
          )}
        </form.AppField>
      </FieldGroup>
    )
  },
})
