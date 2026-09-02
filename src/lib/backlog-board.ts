export type BoardColumnKey = string | null

export type BoardCard = {
  _id: string
  columnId?: string
  isDone?: boolean
  project: { _id: string } | null
}

export type BoardColumn<T extends BoardCard> = {
  columnId: BoardColumnKey
  name?: string
  color?: string | null
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

export type CatalogColumn = {
  _id: string
  name: string
  color: string
  isDone: boolean
}

export type NamedBoardColumn<T extends BoardCard> = BoardColumn<T> & {
  name: string
  color: string | null
}

export function mergeBoardCatalog<T extends BoardCard>(
  board: { total: number; columns: Array<BoardColumn<T>> },
  catalog: Array<CatalogColumn>,
): { total: number; columns: Array<NamedBoardColumn<T>> } {
  if (catalog.length === 0) {
    return {
      total: board.total,
      columns: board.columns.map((column) => ({
        ...column,
        name:
          column.name || (column.columnId == null ? 'Backlog' : 'Column'),
        color: column.color ?? null,
      })),
    }
  }

  const buckets = new Map<string | null, Array<T>>()
  buckets.set(null, [])
  for (const column of catalog) buckets.set(column._id, [])
  for (const column of board.columns) {
    for (const task of column.tasks) {
      const key =
        task.columnId && buckets.has(task.columnId) ? task.columnId : null
      buckets.get(key)!.push(task)
    }
  }

  const backlog = board.columns.find((column) => column.columnId == null)
  const columns: Array<NamedBoardColumn<T>> = [
    {
      ...(backlog ?? { columnId: null, isBacklog: true, isDone: false, tasks: [] }),
      columnId: null,
      name: 'Backlog',
      color: null,
      isBacklog: true,
      isDone: false,
      tasks: buckets.get(null)!,
    },
    ...catalog.map((column) => {
      const existing = board.columns.find((item) => item.columnId === column._id)
      return {
        ...(existing ?? {
          columnId: column._id,
          isBacklog: false,
          isDone: column.isDone,
          tasks: [],
        }),
        columnId: column._id,
        name: column.name,
        color: column.color,
        isDone: column.isDone,
        isBacklog: false,
        tasks: buckets.get(column._id)!,
      }
    }),
  ]

  return {
    total: columns.reduce((sum, column) => sum + column.tasks.length, 0),
    columns,
  }
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
