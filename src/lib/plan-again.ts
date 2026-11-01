import { sameClockTimeNextDay } from '../../convex/lib/dates'
import { formatDateKey } from './dates'

type Outcome = 'done' | 'partial' | 'missed'

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

/** Same title, tasks, and duration, at the same clock time tomorrow. */
export function planAgainDraft(block: {
  title: string
  start: number
  end: number
  memberships: Array<{ taskId: string; taskTitle: string }>
}): PlanAgainDraft {
  const start = sameClockTimeNextDay(block.start)
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
