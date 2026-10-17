export type FocusColumn = {
  _id: string
  order: number
  isDone: boolean
}

export function focusColumnTarget(
  columns: Array<FocusColumn>,
  checked: boolean,
): string | null {
  const sorted = [...columns].sort((a, b) => a.order - b.order)
  const match = sorted.find((column) => column.isDone === checked)
  return match?._id ?? null
}
