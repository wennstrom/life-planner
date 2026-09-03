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
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  return { leftover, done, total, percent }
}
