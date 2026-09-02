import { z } from 'zod'
import type { ChecklistItem } from '~/lib/checklist'

export const checklistItemSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  done: z.boolean(),
})

export const editTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  notes: z.string(),
  checklist: z.array(checklistItemSchema),
  columnId: z.string(),
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
  checklist?: Array<ChecklistItem>
  columnId?: string
  projectId?: string
  estimateMinutes?: number
  dueDate?: string
  priority?: number
}): EditTaskValues {
  return {
    title: task.title,
    notes: task.notes ?? '',
    checklist: task.checklist ?? [],
    columnId: task.columnId ?? '',
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
    checklist: values.checklist,
    columnId: values.columnId || null,
    projectId: values.projectId || null,
    estimateMinutes:
      values.estimateHours === ''
        ? null
        : Math.round(Number(values.estimateHours) * 60),
    dueDate: values.dueDate || null,
    priority: values.priority === '' ? null : (Number(values.priority) as 1 | 2 | 3),
  }
}
