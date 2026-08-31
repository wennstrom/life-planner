import { FieldGroup } from '~/components/ui/field'
import { withForm } from '~/components/form/form-hook'
import { emptyAddTaskValues } from '~/lib/forms/add-task'

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
              label="Notes"
              rows={3}
              placeholder="Optional details"
            />
          )}
        </form.AppField>
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
