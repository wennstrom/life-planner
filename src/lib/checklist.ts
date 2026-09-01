export const MAX_CHECKLIST_ITEMS = 50

export type ChecklistItem = {
  id: string
  text: string
  done: boolean
}

export function newChecklistItem(): ChecklistItem {
  return { id: crypto.randomUUID(), text: '', done: false }
}

export function checklistProgress(
  items: Array<{ done: boolean }> | undefined,
): { done: number; total: number } {
  const total = items?.length ?? 0
  const done = items?.filter((item) => item.done).length ?? 0
  return { done, total }
}

export function formatChecklistProgress(
  items: Array<{ done: boolean }> | undefined,
): string | null {
  const { done, total } = checklistProgress(items)
  if (total === 0) return null
  return `${done}/${total}`
}
