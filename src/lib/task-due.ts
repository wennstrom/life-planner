export type DueTone = 'overdue' | 'thisWeek' | 'later'

export const DUE_TONE_CLASS: Record<DueTone, string> = {
  overdue: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  thisWeek: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  later: 'bg-muted text-muted-foreground',
}

export function dueDateBadge(
  dueDate: string | undefined,
  now: Date = new Date(),
): { label: string; tone: DueTone } | null {
  if (!dueDate) return null
  const date = new Date(dueDate)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const msPerDay = 86_400_000
  const daysUntil = Math.ceil((date.getTime() - today.getTime()) / msPerDay)
  const endOfWeek = new Date(today)
  endOfWeek.setDate(today.getDate() + (7 - today.getDay()))
  const tone: DueTone =
    daysUntil < 0 ? 'overdue' : date <= endOfWeek ? 'thisWeek' : 'later'
  const label = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return { label, tone }
}
