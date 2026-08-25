import { z } from 'zod'
import { formatDateKey, startOfDayMs } from '../dates'
import {
  canonicalTime,
  endAfterDuration,
  isEndAfterStart,
} from '../timeInput'

export const addTimeBlockSchema = z
  .object({
    taskId: z.string(),
    creatingTask: z.boolean(),
    newTaskTitle: z.string(),
    intent: z.string().trim().min(1, 'Intent is required'),
    dateKey: z.string().min(1),
    startTime: z.string().min(1),
    endTime: z.string().min(1),
  })
  .superRefine((value, ctx) => {
    if (value.creatingTask && value.newTaskTitle.trim() === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['newTaskTitle'],
        message: 'Enter a title for the new task.',
      })
    }

    const startCanonical = canonicalTime(value.startTime)
    const endCanonical = canonicalTime(value.endTime)
    if (
      startCanonical == null ||
      endCanonical == null ||
      !isEndAfterStart(startCanonical, endCanonical)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['endTime'],
        message: 'Enter a valid start and end time. End must be after start.',
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
    endTime?: string
  } = {},
): AddTimeBlockValues {
  const startTime = overrides.startTime ?? '09:00'
  return {
    taskId: overrides.taskId ?? '',
    creatingTask: false,
    newTaskTitle: '',
    intent: overrides.intent ?? '',
    dateKey: overrides.dateKey ?? formatDateKey(),
    startTime,
    endTime: overrides.endTime ?? endAfterDuration(startTime, 60),
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
  const startCanonical = canonicalTime(values.startTime)
  const endCanonical = canonicalTime(values.endTime)
  if (startCanonical == null || endCanonical == null) {
    throw new Error('Invalid start or end time')
  }
  return {
    title: values.intent.trim(),
    start: msFromDateAndTime(values.dateKey, startCanonical),
    end: msFromDateAndTime(values.dateKey, endCanonical),
    taskId: values.taskId || undefined,
  }
}
