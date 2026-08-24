import { z } from 'zod'
import { formatDateKey, startOfDayMs } from '../dates'

export const addTimeBlockSchema = z
  .object({
    taskId: z.string(),
    creatingTask: z.boolean(),
    newTaskTitle: z.string(),
    intent: z.string().trim().min(1, 'Intent is required'),
    dateKey: z.string().min(1),
    startTime: z.string().min(1),
    durationMinutes: z
      .number({ error: 'Duration must be at least 15 minutes' })
      .min(15, 'Duration must be at least 15 minutes'),
  })
  .superRefine((value, ctx) => {
    if (value.creatingTask && value.newTaskTitle.trim() === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['newTaskTitle'],
        message: 'Enter a title for the new task.',
      })
    }
  })

export type AddTimeBlockValues = z.input<typeof addTimeBlockSchema>

export function emptyAddTimeBlockValues(
  overrides: {
    taskId?: string
    intent?: string
    dateKey?: string
    startTime?: string
  } = {},
): AddTimeBlockValues {
  return {
    taskId: overrides.taskId ?? '',
    creatingTask: false,
    newTaskTitle: '',
    intent: overrides.intent ?? '',
    dateKey: overrides.dateKey ?? formatDateKey(),
    startTime: overrides.startTime ?? '09:00',
    durationMinutes: 60,
  }
}

export function msFromDateAndTime(dateKey: string, time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return (
    startOfDayMs(new Date(dateKey + 'T00:00:00')) +
    hours * 3600000 +
    minutes * 60000
  )
}

export function timeFromMs(ms: number, dateKey: string) {
  const dayStart = startOfDayMs(new Date(dateKey + 'T00:00:00'))
  const offset = ms - dayStart
  const hours = Math.floor(offset / 3600000)
  const minutes = Math.floor((offset % 3600000) / 60000)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function toCreateBlockArgs(values: AddTimeBlockValues) {
  const start = msFromDateAndTime(values.dateKey, values.startTime)
  return {
    title: values.intent.trim(),
    start,
    end: start + values.durationMinutes * 60000,
    taskId: values.taskId || undefined,
  }
}
