import { z } from 'zod'

export const reviewBlockSchema = z.object({
  outcome: z.enum(['done', 'partial', 'missed']),
  actualMinutes: z
    .number({ error: 'Enter time spent in minutes' })
    .min(1, 'Enter time spent in minutes'),
  focus: z.enum(['', 'deep', 'shallow', 'interrupted']),
  note: z.string(),
  nextStep: z.string(),
  scheduleNext: z.boolean(),
  blocked: z.boolean(),
  blockedReason: z.string(),
})

export type ReviewBlockValues = z.input<typeof reviewBlockSchema>

export function emptyReviewBlockValues(
  actualMinutes: number,
): ReviewBlockValues {
  return {
    outcome: 'done',
    actualMinutes,
    focus: '',
    note: '',
    nextStep: '',
    scheduleNext: false,
    blocked: false,
    blockedReason: '',
  }
}

export function toReviewBlockArgs(values: ReviewBlockValues) {
  return {
    outcome: values.outcome,
    actualMinutes: values.actualMinutes,
    focus: values.focus || undefined,
    note: values.note.trim() || undefined,
    nextStep: values.nextStep.trim() || undefined,
    blockedReason: values.blocked
      ? values.blockedReason.trim() || undefined
      : undefined,
    scheduleNext: values.scheduleNext || undefined,
  }
}
