// Pure helpers for the "Blocked by" section and the board's blocked badge.

type PickableTask = { _id: string; title: string; archived?: boolean }

/**
 * Tasks the user can add as blockers of `taskId`: not the task itself, not
 * archived, and not already a blocker. The server still checks for cycles.
 */
export function blockerPickerOptions<T extends PickableTask>(
  tasks: ReadonlyArray<T>,
  taskId: string,
  existingBlockerIds: ReadonlyArray<string>,
): Array<{ value: T['_id']; label: string }> {
  const taken = new Set(existingBlockerIds)
  return tasks
    .filter(
      (task) =>
        task._id !== taskId && task.archived !== true && !taken.has(task._id),
    )
    .map((task) => ({ value: task._id, label: task.title }))
}

/** "Blocked" or "Blocked by 3", or null when nothing open blocks the task. */
export function blockedBadgeLabel(openBlockerCount: number): string | null {
  if (openBlockerCount <= 0) return null
  return openBlockerCount === 1 ? 'Blocked' : `Blocked by ${openBlockerCount}`
}

/** "Done", "Archived" or null for an open blocker. */
export function blockerStateLabel(blocker: {
  open: boolean
  done: boolean
  archived: boolean
}): string | null {
  if (blocker.open) return null
  if (blocker.archived) return 'Archived'
  return blocker.done ? 'Done' : null
}

/** The server's message without Convex's request prefix. */
export function blockerErrorText(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const match = /Uncaught Error: (.+?)(?:\n|$)/.exec(error.message)
    if (match) return match[1]
  }
  return fallback
}
