import { addDays, dateFromDateKey, formatDateKey } from './dates'
import { sameClockTimeInDays } from './repeat-block'

type Outcome = 'done' | 'partial' | 'missed'

const DAY = 24 * 60 * 60 * 1000

/** "Plan again" is offered only when the sitting didn't fully happen. */
export function canPlanAgain(outcome: Outcome): boolean {
  return outcome === 'partial' || outcome === 'missed'
}

export type PlanAgainDraft = {
  title: string
  tasks: Array<{ taskId: string; taskTitle: string }>
  start: number
  end: number
  dateKey: string
}

/**
 * Same title, tasks, and duration, at the same clock time tomorrow.
 * "Tomorrow" is relative to today, so re-planning a block from an earlier
 * day doesn't land in the past.
 */
export function planAgainDraft(
  block: {
    title: string
    start: number
    end: number
    memberships: Array<{ taskId: string; taskTitle: string }>
  },
  nowMs: number,
): PlanAgainDraft {
  const blockDay = dateFromDateKey(formatDateKey(new Date(block.start)))
  const tomorrow = addDays(dateFromDateKey(formatDateKey(new Date(nowMs))), 1)
  // Round: a DST change makes one day 23 or 25 hours long.
  const days = Math.max(
    1,
    Math.round((tomorrow.getTime() - blockDay.getTime()) / DAY),
  )
  const start = sameClockTimeInDays(block.start, days)
  return {
    title: block.title,
    tasks: block.memberships.map(({ taskId, taskTitle }) => ({
      taskId,
      taskTitle,
    })),
    start,
    end: start + (block.end - block.start),
    dateKey: formatDateKey(new Date(start)),
  }
}
