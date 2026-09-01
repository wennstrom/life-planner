import {
  editTaskSchema,
  toUpdateTaskArgs,
  type EditTaskValues,
} from './edit-task'

export const addTaskSchema = editTaskSchema

export type AddTaskValues = EditTaskValues

export function emptyAddTaskValues(
  projectId = '',
  status: AddTaskValues['status'] = 'backlog',
): AddTaskValues {
  return {
    title: '',
    notes: '',
    status,
    projectId,
    estimateHours: '',
    dueDate: '',
    priority: '',
  }
}

export function toCreateTaskArgs(values: AddTaskValues) {
  const updated = toUpdateTaskArgs(values)
  return {
    title: updated.title,
    notes: updated.notes ?? undefined,
    status: updated.status,
    projectId: updated.projectId ?? undefined,
    estimateMinutes: updated.estimateMinutes ?? undefined,
    dueDate: updated.dueDate ?? undefined,
    priority: updated.priority ?? undefined,
  }
}
