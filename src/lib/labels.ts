import { MAX_LABELS_PER_TASK } from '../../convex/lib/labels'

export {
  LABEL_COLORS,
  MAX_LABELS_PER_TASK,
  MAX_LABELS_PER_USER,
  MAX_LABEL_NAME_LENGTH,
} from '../../convex/lib/labels'

/** Board/table label filter: every task, tasks with no label, or one label. */
export type LabelFilter = 'all' | 'none' | string

/** Adds or removes `labelId`, never going over the per-task cap. */
export function toggleLabelId(
  labelIds: ReadonlyArray<string>,
  labelId: string,
  max = MAX_LABELS_PER_TASK,
): Array<string> {
  if (labelIds.includes(labelId)) return labelIds.filter((id) => id !== labelId)
  if (labelIds.length >= max) return [...labelIds]
  return [...labelIds, labelId]
}

/** Drops IDs of labels that were deleted since the task was loaded. */
export function existingLabelIds(
  labelIds: ReadonlyArray<string>,
  labels: ReadonlyArray<{ _id: string }>,
): Array<string> {
  const known = new Set(labels.map((label) => label._id))
  return labelIds.filter((id) => known.has(id))
}

export function matchesLabelFilter(
  task: { labelIds?: ReadonlyArray<string> },
  filter: LabelFilter,
): boolean {
  if (filter === 'all') return true
  const ids = task.labelIds ?? []
  if (filter === 'none') return ids.length === 0
  return ids.includes(filter)
}
