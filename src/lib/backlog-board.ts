export type BoardColumnKey = string | null

export type BoardCard = {
  _id: string
  columnId?: string
  isDone?: boolean
  project: { _id: string } | null
}

export type BoardColumn<T extends BoardCard> = {
  columnId: BoardColumnKey
  isDone?: boolean
  isBacklog?: boolean
  tasks: Array<T>
}

export type BoardData<T extends BoardCard> = {
  total: number
  columns: Array<BoardColumn<T>>
}

export type BoardFilter = 'all' | 'none' | string

export function columnDroppableId(columnId: BoardColumnKey) {
  return columnId == null ? 'column:backlog' : `column:${columnId}`
}

export function filterBoardColumns<T extends BoardCard>(
  columns: Array<BoardColumn<T>>,
  filter: BoardFilter,
): Array<BoardColumn<T>> {
  if (filter === 'all') return columns
  return columns.map((column) => ({
    ...column,
    tasks: column.tasks.filter((task) =>
      filter === 'none' ? task.project == null : task.project?._id === filter,
    ),
  }))
}

export function destOrderedIdsAfterDrop(input: {
  destTaskIds: Array<string>
  movedId: string
  overId: string
}): Array<string> {
  if (input.overId === input.movedId) {
    return input.destTaskIds.includes(input.movedId)
      ? [...input.destTaskIds]
      : [...input.destTaskIds, input.movedId]
  }
  const destIds = input.destTaskIds.filter((id) => id !== input.movedId)
  if (!input.overId.startsWith('column:')) {
    const overIndex = destIds.indexOf(input.overId)
    if (overIndex >= 0) destIds.splice(overIndex, 0, input.movedId)
    else destIds.push(input.movedId)
    return destIds
  }
  destIds.push(input.movedId)
  return destIds
}

export function toMoveOnBoardArgs(input: {
  movedId: string
  destColumnId: BoardColumnKey
  destOrderedIds: Array<string>
}): { taskId: string; columnId: BoardColumnKey; beforeTaskId?: string } | null {
  const index = input.destOrderedIds.indexOf(input.movedId)
  if (index === -1) return null
  const beforeTaskId = input.destOrderedIds[index + 1]
  return beforeTaskId
    ? {
        taskId: input.movedId,
        columnId: input.destColumnId,
        beforeTaskId,
      }
    : { taskId: input.movedId, columnId: input.destColumnId }
}

export function applyMoveToBoard<T extends BoardCard, C extends BoardColumn<T>>(
  board: { total: number; columns: Array<C> },
  args: { taskId: string; columnId: BoardColumnKey; beforeTaskId?: string },
): { total: number; columns: Array<C> } {
  let moved: T | undefined
  const stripped = board.columns.map((column) => ({
    ...column,
    tasks: column.tasks.filter((task) => {
      if (task._id === args.taskId) {
        moved = task
        return false
      }
      return true
    }),
  }))
  if (!moved) return board
  const dest = board.columns.find((column) => column.columnId == args.columnId)
  const nextTask = {
    ...moved,
    columnId: args.columnId ?? undefined,
    isDone: dest?.isDone ?? false,
  } as T
  const columns = stripped.map((column) => {
    if (column.columnId != args.columnId) return column
    const tasks = [...column.tasks]
    const insertAt = args.beforeTaskId
      ? tasks.findIndex((task) => task._id === args.beforeTaskId)
      : tasks.length
    const at = insertAt === -1 ? tasks.length : insertAt
    tasks.splice(at, 0, nextTask)
    return { ...column, tasks }
  })
  return {
    total: columns.reduce((sum, column) => sum + column.tasks.length, 0),
    columns,
  }
}
