import { BOARD_COLUMN_COLORS } from '../../convex/lib/boardColumnColors'

export type SettingsRow = {
  key: string
  id?: string
  name: string
  color: string
  isDone: boolean
}

export function rowsFromColumns(
  columns: Array<{
    _id: string
    name: string
    color: string
    isDone: boolean
    order: number
  }>,
): Array<SettingsRow> {
  return [...columns]
    .sort((a, b) => a.order - b.order)
    .map((column) => ({
      key: column._id,
      id: column._id,
      name: column.name,
      color: column.color,
      isDone: column.isDone,
    }))
}

export function canAddColumn(rows: Array<SettingsRow>) {
  return rows.length < 8
}

export function insertWorkflowRow(
  rows: Array<SettingsRow>,
  row: SettingsRow,
): Array<SettingsRow> {
  const doneIndex = rows.findIndex((item) => item.isDone)
  if (doneIndex === -1) return [...rows, row]
  return [...rows.slice(0, doneIndex), row, ...rows.slice(doneIndex)]
}

export function moveRow(
  rows: Array<SettingsRow>,
  index: number,
  dir: -1 | 1,
): Array<SettingsRow> {
  const current = rows[index]
  if (!current || current.isDone) return rows
  const nextIndex = index + dir
  const swap = rows[nextIndex]
  if (!swap || swap.isDone) return rows
  const next = [...rows]
  next[index] = swap
  next[nextIndex] = current
  return next
}

export function toSavePayload(rows: Array<SettingsRow>) {
  return {
    columns: rows.map((row) => ({
      ...(row.id ? { id: row.id } : {}),
      name: row.name,
      color: row.color,
    })),
  }
}

export function reorderWorkflowColumnIds(input: {
  orderedIds: Array<string>
  activeId: string
  overId: string
  doneId: string | undefined
}): Array<string> | null {
  const { orderedIds, activeId, overId, doneId } = input
  if (!activeId || activeId === doneId || activeId === overId) return null
  const workflow = orderedIds.filter((id) => id !== doneId)
  const from = workflow.indexOf(activeId)
  if (from === -1) return null
  let to = workflow.indexOf(overId)
  if (overId === doneId) to = workflow.length
  if (to === -1) return null
  const next = [...workflow]
  const [moved] = next.splice(from, 1)
  if (!moved) return null
  next.splice(to, 0, moved)
  return doneId ? [...next, doneId] : next
}

export function nextNewColumnName(rows: Array<SettingsRow>) {
  const names = new Set(rows.map((row) => row.name.toLowerCase()))
  if (!names.has('new column')) return 'New column'
  let n = 2
  while (names.has(`new column ${n}`)) n += 1
  return `New column ${n}`
}

export const SETTINGS_PALETTE = BOARD_COLUMN_COLORS
