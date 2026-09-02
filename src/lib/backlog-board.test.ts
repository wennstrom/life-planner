import { describe, expect, it } from 'vitest'
import {
  applyMoveToBoard,
  destOrderedIdsAfterDrop,
  filterBoardColumns,
  mergeBoardCatalog,
  toMoveOnBoardArgs,
  type BoardColumn,
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

describe('mergeBoardCatalog', () => {
  const catalog = [
    { _id: 'c-progress', name: 'In-Progress', color: '#3b82f6', isDone: false },
    { _id: 'c-done', name: 'Done', color: '#22c55e', isDone: true },
  ]

  it('rebuilds titles from the catalog and buckets tasks by columnId', () => {
    const nameless: { total: number; columns: Array<BoardColumn<Task>> } = {
      total: 2,
      columns: [
        { columnId: null, tasks: [], isBacklog: true },
        {
          columnId: 'c-progress',
          tasks: [{ _id: 'a', title: 'A', columnId: 'c-progress', project: null }],
        },
        {
          columnId: 'ghost',
          tasks: [{ _id: 'b', title: 'B', project: { _id: 'p1' } }],
        },
      ],
    }
    const merged = mergeBoardCatalog(nameless, catalog)
    expect(merged.columns.map((c) => c.name)).toEqual([
      'Backlog',
      'In-Progress',
      'Done',
    ])
    expect(merged.columns[0]?.tasks.map((t) => t._id)).toEqual(['b'])
    expect(merged.columns[1]?.tasks.map((t) => t._id)).toEqual(['a'])
    expect(merged.columns[2]?.tasks).toEqual([])
    expect(merged.total).toBe(2)
  })

  it('leaves grouping unchanged when the catalog is empty', () => {
    const merged = mergeBoardCatalog(board, [])
    expect(merged.columns.map((c) => c.columnId)).toEqual(
      board.columns.map((c) => c.columnId),
    )
    expect(merged.columns[0]?.name).toBe('Backlog')
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
