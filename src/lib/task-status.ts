import type { Doc } from '../../convex/_generated/dataModel'
import {
  BOARD_COLUMN_STATUSES,
  type BoardColumnStatus,
} from '../../convex/lib/boardStatus'

export type TaskStatus = Doc<'tasks'>['status']
export { BOARD_COLUMN_STATUSES, type BoardColumnStatus }

export const TASK_STATUSES = [
  'backlog',
  'in-progress',
  'review',
  'test',
  'investigate',
  'done',
] as const satisfies ReadonlyArray<TaskStatus>

export const STATUS_CONFIG: Record<TaskStatus, { label: string; className: string }> = {
  backlog: {
    label: 'Backlog',
    className: 'bg-muted text-muted-foreground',
  },
  'in-progress': {
    label: 'In Progress',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  },
  review: {
    label: 'Review',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  },
  test: {
    label: 'Test',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  },
  investigate: {
    label: 'Investigate',
    className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  },
  done: {
    label: 'Done',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  },
}
