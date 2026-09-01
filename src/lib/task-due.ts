import { startOfDayMs } from './dates'

export type DueTone = 'overdue' | 'thisWeek' | 'later'

export const DUE_TONE_CLASS: Record<DueTone, string> = {
  overdue: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  thisWeek: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  later: 'bg-muted text-muted-foreground',
}

function localDateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function dueDateBadge(
  dueDate: string | undefined,
  now: Date = new Date(),
): { label: string; tone: DueTone } | null {
  if (!dueDate) return null
  const dueStart = startOfDayMs(localDateFromKey(dueDate))
  const todayStart = startOfDayMs(now)
  const msPerDay = 86_400_000
  const daysUntil = Math.round((dueStart - todayStart) / msPerDay)
  const endOfWeek = new Date(todayStart)
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()))
  const tone: DueTone =
    daysUntil < 0 ? 'overdue' : dueStart <= endOfWeek.getTime() ? 'thisWeek' : 'later'
  const label = localDateFromKey(dueDate).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
  return { label, tone }
}
