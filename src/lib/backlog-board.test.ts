import { describe, expect, it } from 'vitest'
import {
  applyMoveToBoard,
  destOrderedIdsAfterDrop,
  filterBoardColumns,
  toMoveOnBoardArgs,
} from './backlog-board'
import { BOARD_COLUMN_STATUSES } from './task-status'

type Task = {
  _id: string
  title: string
  status: string
  project: { _id: string } | null
}

function col(status: string, tasks: Array<Task>) {
  return { status, tasks }
}

const board = {
  total: 3,
  columns: [
    col('investigate', [
      { _id: 'a', title: 'A', status: 'investigate', project: { _id: 'p1' } },
    ]),
    col('in-progress', []),
    col('review', [
      { _id: 'c', title: 'C', status: 'review', project: null },
    ]),
    col('test', []),
    col('done', [
      { _id: 'd', title: 'D', status: 'done', project: { _id: 'p1' } },
    ]),
  ],
}

describe('filterBoardColumns', () => {
  it('keeps all columns when filter is all', () => {
    const result = filterBoardColumns(board.columns, 'all')
    expect(result.map((c) => c.tasks.length)).toEqual([1, 0, 1, 0, 1])
  })

  it('keeps none-project tasks only', () => {
    const result = filterBoardColumns(board.columns, 'none')
    expect(result.find((c) => c.status === 'review')?.tasks).toHaveLength(1)
    expect(result.find((c) => c.status === 'investigate')?.tasks).toHaveLength(0)
  })

  it('filters to one project without dropping columns', () => {
    const result = filterBoardColumns(board.columns, 'p1')
    expect(result).toHaveLength(BOARD_COLUMN_STATUSES.length)
    expect(result.find((c) => c.status === 'review')?.tasks).toHaveLength(0)
    expect(result.find((c) => c.status === 'done')?.tasks[0]?._id).toBe('d')
  })
})

describe('toMoveOnBoardArgs', () => {
  it('omits beforeTaskId when appending', () => {
    expect(
      toMoveOnBoardArgs({
        movedId: 'a',
        destStatus: 'review',
        destOrderedIds: ['c', 'a'],
      }),
    ).toEqual({ taskId: 'a', status: 'review' })
  })

  it('sets beforeTaskId to the following card', () => {
    expect(
      toMoveOnBoardArgs({
        movedId: 'a',
        destStatus: 'review',
        destOrderedIds: ['a', 'c'],
      }),
    ).toEqual({ taskId: 'a', status: 'review', beforeTaskId: 'c' })
  })

  it('returns null when destOrderedIds does not contain the moved task', () => {
    expect(
      toMoveOnBoardArgs({
        movedId: 'a',
        destStatus: 'review',
        destOrderedIds: ['c'],
      }),
    ).toBeNull()
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
        overId: 'column:review',
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
  it('moves a card before a target and updates status', () => {
    const next = applyMoveToBoard(board, {
      taskId: 'a',
      status: 'review',
      beforeTaskId: 'c',
    })
    expect(next.columns.find((c) => c.status === 'investigate')?.tasks).toEqual([])
    expect(
      next.columns.find((c) => c.status === 'review')?.tasks.map((t) => t._id),
    ).toEqual(['a', 'c'])
    expect(next.columns.find((c) => c.status === 'review')?.tasks[0]?.status).toBe(
      'review',
    )
    expect(next.total).toBe(3)
  })
})
