import { z } from 'zod'

export const taskStatusSchema = z.enum([
  'backlog',
  'in-progress',
  'review',
  'test',
  'investigate',
  'done',
])

export const editTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  notes: z.string(),
  status: taskStatusSchema,
  projectId: z.string(),
  estimateHours: z.string().refine(
    (s) => s === '' || (!Number.isNaN(Number(s)) && Number(s) >= 0),
    'Enter a number 0 or greater',
  ),
  dueDate: z.string(),
  priority: z.enum(['', '1', '2', '3']),
})

export type EditTaskValues = z.input<typeof editTaskSchema>

export function valuesFromTask(task: {
  title: string
  notes?: string
  status: EditTaskValues['status']
  projectId?: string
  estimateMinutes?: number
  dueDate?: string
  priority?: number
}): EditTaskValues {
  return {
    title: task.title,
    notes: task.notes ?? '',
    status: task.status,
    projectId: task.projectId ?? '',
    estimateHours:
      task.estimateMinutes != null ? String(task.estimateMinutes / 60) : '',
    dueDate: task.dueDate ?? '',
    priority:
      task.priority === 1
        ? '1'
        : task.priority === 2
          ? '2'
          : task.priority === 3
            ? '3'
            : '',
  }
}

export function toUpdateTaskArgs(values: EditTaskValues) {
  return {
    title: values.title.trim(),
    notes: values.notes.trim() || null,
    status: values.status,
    projectId: values.projectId || null,
    estimateMinutes:
      values.estimateHours === ''
        ? null
        : Math.round(Number(values.estimateHours) * 60),
    dueDate: values.dueDate || null,
    priority: values.priority === '' ? null : Number(values.priority),
  }
}
