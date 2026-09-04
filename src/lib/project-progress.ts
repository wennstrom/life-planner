export function namedColumnIdSet(
  columns: Array<{ _id: string }>,
): Set<string> {
  return new Set(columns.map((column) => column._id))
}

export function isUnassignedOnBoard(
  columnId: string | undefined,
  namedIds: ReadonlySet<string>,
): boolean {
  return columnId === undefined || !namedIds.has(columnId)
}

export function unassignedTaskCount(
  tasks: Array<{ columnId?: string }>,
  namedIds: ReadonlySet<string>,
): number {
  return tasks.filter((task) =>
    isUnassignedOnBoard(task.columnId, namedIds),
  ).length
}

export function projectProgress(
  tasks: Array<{ columnId?: string }>,
  columns: Array<{ _id: string; isDone: boolean }>,
): {
  leftover: number
  done: number
  total: number
  percent: number
} {
  const doneId = columns.find((column) => column.isDone)?._id
  let done = 0
  let leftover = 0
  for (const task of tasks) {
    if (
      task.columnId !== undefined &&
      doneId !== undefined &&
      task.columnId === doneId
    ) {
      done += 1
    } else {
      leftover += 1
    }
  }
  const total = leftover + done
  return {
    leftover,
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  }
}
