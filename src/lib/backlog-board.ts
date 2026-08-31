import type { BoardColumnStatus } from './task-status'

export type BoardFilter = 'all' | 'none' | string

export type BoardCard = {
  _id: string
  status: string
  project: { _id: string } | null
}

export type BoardColumn<T extends BoardCard> = {
  status: string
  tasks: Array<T>
}

export type BoardData<T extends BoardCard> = {
  total: number
  columns: Array<BoardColumn<T>>
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
  destStatus: BoardColumnStatus
  destOrderedIds: Array<string>
}): { taskId: string; status: BoardColumnStatus; beforeTaskId?: string } | null {
  const index = input.destOrderedIds.indexOf(input.movedId)
  if (index === -1) return null
  const beforeTaskId = input.destOrderedIds[index + 1]
  return beforeTaskId
    ? {
        taskId: input.movedId,
        status: input.destStatus,
        beforeTaskId,
      }
    : { taskId: input.movedId, status: input.destStatus }
}

export function applyMoveToBoard<T extends BoardCard>(
  board: BoardData<T>,
  args: { taskId: string; status: BoardColumnStatus; beforeTaskId?: string },
): BoardData<T> {
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
  const nextTask = { ...moved, status: args.status }
  const columns = stripped.map((column) => {
    if (column.status !== args.status) return column
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
