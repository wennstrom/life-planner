import { z } from 'zod'

export const addTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  notes: z.string(),
  projectId: z.string(),
  dueDate: z.string(),
})

export type AddTaskValues = z.input<typeof addTaskSchema>

export function emptyAddTaskValues(projectId = ''): AddTaskValues {
  return { title: '', notes: '', projectId, dueDate: '' }
}

export function toCreateTaskArgs(values: AddTaskValues) {
  return {
    title: values.title.trim(),
    notes: values.notes.trim() || undefined,
    projectId: values.projectId || undefined,
    dueDate: values.dueDate || undefined,
  }
}
