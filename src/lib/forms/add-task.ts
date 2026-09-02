import {
  editTaskSchema,
  toUpdateTaskArgs,
  type EditTaskValues,
} from './edit-task'

export const addTaskSchema = editTaskSchema

export type AddTaskValues = EditTaskValues

export function emptyAddTaskValues(
  projectId = '',
  columnId = '',
): AddTaskValues {
  return {
    title: '',
    notes: '',
    checklist: [],
    columnId,
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
    checklist: updated.checklist,
    columnId: updated.columnId,
    projectId: updated.projectId ?? undefined,
    estimateMinutes: updated.estimateMinutes ?? undefined,
    dueDate: updated.dueDate ?? undefined,
    priority: updated.priority ?? undefined,
  }
}
