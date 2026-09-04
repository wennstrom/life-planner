import {
  PROJECT_HEALTH,
  type ProjectHealth,
} from '../../convex/lib/projectHealth'

export type { ProjectHealth }
export { PROJECT_HEALTH }

export const PROJECT_HEALTH_LABEL: Record<ProjectHealth, string> = {
  onTrack: 'On track',
  atRisk: 'At risk',
  offTrack: 'Off track',
}

export const PROJECT_HEALTH_OPTIONS = [
  { value: '', label: 'Not set' },
  ...PROJECT_HEALTH.map((health) => ({
    value: health,
    label: PROJECT_HEALTH_LABEL[health],
  })),
]

export const PROJECT_HEALTH_PILL_CLASS: Record<ProjectHealth, string> = {
  onTrack: 'bg-emerald-50 text-emerald-800',
  atRisk: 'bg-amber-50 text-amber-800',
  offTrack: 'bg-red-50 text-red-800',
}

export const PROJECT_HEALTH_DOT_CLASS: Record<ProjectHealth, string> = {
  onTrack: 'bg-emerald-600',
  atRisk: 'bg-amber-600',
  offTrack: 'bg-red-600',
}

export function isGoalOverdue(
  goalDate: string | undefined,
  today: string,
): boolean {
  if (!goalDate) return false
  return goalDate < today
}

function shortDay(goalDate: string): string {
  const [year, month, day] = goalDate.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function goalDateCaption(
  goalDate: string | undefined,
  today: string,
): { text: string; overdue: boolean } | null {
  if (!goalDate) return null
  const overdue = isGoalOverdue(goalDate, today)
  const day = shortDay(goalDate)
  return {
    text: overdue ? `Overdue · ${day}` : `Goal · ${day}`,
    overdue,
  }
}
