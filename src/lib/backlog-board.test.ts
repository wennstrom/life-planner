import { describe, expect, it } from 'vitest'
import {
  applyMoveToBoard,
  destOrderedIdsAfterDrop,
  filterBoardColumns,
  toMoveOnBoardArgs,
} from './backlog-board'

type Task = {
  _id: string
  title: string
  columnId?: string
  isDone?: boolean
  project: { _id: string } | null
}

function col(columnId: string | null, tasks: Array<Task>, isDone = false) {
  return { columnId, isDone, isBacklog: columnId == null, tasks }
}

const board = {
  total: 3,
  columns: [
    col(null, [{ _id: 'a', title: 'A', project: { _id: 'p1' } }]),
    col('c-progress', []),
    col('c-review', [
      { _id: 'c', title: 'C', columnId: 'c-review', project: null },
    ]),
    col('c-done', [
      { _id: 'd', title: 'D', columnId: 'c-done', isDone: true, project: { _id: 'p1' } },
    ], true),
  ],
}

describe('filterBoardColumns', () => {
  it('keeps all columns when filter is all', () => {
    const result = filterBoardColumns(board.columns, 'all')
    expect(result.map((c) => c.tasks.length)).toEqual([1, 0, 1, 1])
  })

  it('keeps none-project tasks only', () => {
    const result = filterBoardColumns(board.columns, 'none')
    expect(result.find((c) => c.columnId === 'c-review')?.tasks).toHaveLength(1)
    expect(result.find((c) => c.columnId == null)?.tasks).toHaveLength(0)
  })

  it('filters to one project without dropping columns', () => {
    const result = filterBoardColumns(board.columns, 'p1')
    expect(result).toHaveLength(4)
    expect(result.find((c) => c.columnId === 'c-review')?.tasks).toHaveLength(0)
    expect(result.find((c) => c.columnId === 'c-done')?.tasks[0]?._id).toBe('d')
  })
})

describe('toMoveOnBoardArgs', () => {
  it('omits beforeTaskId when appending', () => {
    expect(
      toMoveOnBoardArgs({
        movedId: 'a',
        destColumnId: 'c-review',
        destOrderedIds: ['c', 'a'],
      }),
    ).toEqual({ taskId: 'a', columnId: 'c-review' })
  })

  it('sets beforeTaskId to the following card', () => {
    expect(
      toMoveOnBoardArgs({
        movedId: 'a',
        destColumnId: 'c-review',
        destOrderedIds: ['a', 'c'],
      }),
    ).toEqual({ taskId: 'a', columnId: 'c-review', beforeTaskId: 'c' })
  })

  it('uses null columnId for Backlog', () => {
    expect(
      toMoveOnBoardArgs({
        movedId: 'c',
        destColumnId: null,
        destOrderedIds: ['c'],
      }),
    ).toEqual({ taskId: 'c', columnId: null })
  })
})

describe('destOrderedIdsAfterDrop', () => {
  it('inserts before the over card using the full destination column', () => {
    expect(
      destOrderedIdsAfterDrop({
        destTaskIds: ['hidden', 'c'],
        movedId: 'a',
        overId: 'c',
      }),
    ).toEqual(['hidden', 'a', 'c'])
  })

  it('appends when dropping on the column', () => {
    expect(
      destOrderedIdsAfterDrop({
        destTaskIds: ['hidden', 'c'],
        movedId: 'a',
        overId: 'column:c-review',
      }),
    ).toEqual(['hidden', 'c', 'a'])
  })

  it('keeps original order on self-over instead of appending', () => {
    expect(
      destOrderedIdsAfterDrop({
        destTaskIds: ['a', 'b'],
        movedId: 'a',
        overId: 'a',
      }),
    ).toEqual(['a', 'b'])
  })
})

describe('applyMoveToBoard', () => {
  it('moves a card before a target and updates columnId', () => {
    const next = applyMoveToBoard(board, {
      taskId: 'a',
      columnId: 'c-review',
      beforeTaskId: 'c',
    })
    expect(next.columns.find((c) => c.columnId == null)?.tasks).toEqual([])
    expect(
      next.columns.find((c) => c.columnId === 'c-review')?.tasks.map((t) => t._id),
    ).toEqual(['a', 'c'])
    expect(
      next.columns.find((c) => c.columnId === 'c-review')?.tasks[0]?.columnId,
    ).toBe('c-review')
    expect(next.total).toBe(3)
  })
})
