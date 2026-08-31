import { z } from 'zod'

export const reviewBlockSchema = z.object({
  outcome: z.enum(['done', 'partial', 'missed']),
  actualMinutes: z
    .number({ error: 'Enter time spent in minutes' })
    .min(0, 'Enter time spent in minutes'),
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

export function calculateRemainingMinutes(
  totalMinutes: number,
  memberships: ReviewStepMembership[],
  currentIndex: number,
): number {
  let spent = 0
  for (let i = 0; i < currentIndex; i++) {
    if (memberships[i].review && typeof memberships[i].review === 'object') {
      spent += (memberships[i].review as { actualMinutes?: number }).actualMinutes ?? 0
    }
  }
  const remaining = Math.max(0, totalMinutes - spent)
  const unreviewedCount = memberships.slice(currentIndex).filter(m => m.review === undefined).length
  return unreviewedCount > 0 ? Math.floor(remaining / unreviewedCount) : remaining
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

type ReviewStepMembership = { review?: unknown }

export function firstReviewStepIndex(
  memberships: ReviewStepMembership[],
): number {
  const index = memberships.findIndex((m) => m.review === undefined)
  return index === -1 ? 0 : index
}

export function nextReviewStepIndex(
  memberships: ReviewStepMembership[],
  justSavedIndex: number,
): number | undefined {
  // Opening snapshot still has review === undefined on earlier rows; do not wrap.
  for (let i = justSavedIndex + 1; i < memberships.length; i++) {
    if (i !== justSavedIndex && memberships[i].review === undefined) return i
  }
  return undefined
}

/** After a sitting is reviewed, stay at the same index once it is removed from the queue. */
export function nextReviewQueueIndex(
  queue: ReadonlyArray<{ _id: string }>,
  currentIndex: number,
  completedBlockId: string,
): number | undefined {
  const remaining = queue.filter((block) => block._id !== completedBlockId)
  return currentIndex < remaining.length ? currentIndex : undefined
}
