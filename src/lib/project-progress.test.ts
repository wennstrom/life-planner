import { describe, expect, it } from 'vitest'
import {
  isUnassignedOnBoard,
  namedColumnIdSet,
  projectProgress,
  unassignedTaskCount,
} from './project-progress'

const columns = [
  { _id: 'col_ip', isDone: false },
  { _id: 'col_done', isDone: true },
]

describe('projectProgress', () => {
  it('counts Done by isDone column, not by presence of a column', () => {
    const result = projectProgress(
      [
        { columnId: 'col_done' },
        { columnId: 'col_ip' },
        {},
      ],
      columns,
    )
    expect(result).toEqual({ leftover: 2, done: 1, total: 3, percent: 33 })
  })

  it('returns 0 percent when there are no tasks', () => {
    expect(projectProgress([], columns)).toEqual({
      leftover: 0,
      done: 0,
      total: 0,
      percent: 0,
    })
  })

  it('treats a stale columnId as leftover, not done', () => {
    const result = projectProgress([{ columnId: 'col_gone' }], columns)
    expect(result.done).toBe(0)
    expect(result.leftover).toBe(1)
  })
})

describe('unassignedTaskCount', () => {
  it('counts missing and stale column ids', () => {
    const named = namedColumnIdSet(columns)
    expect(isUnassignedOnBoard(undefined, named)).toBe(true)
    expect(isUnassignedOnBoard('col_gone', named)).toBe(true)
    expect(isUnassignedOnBoard('col_ip', named)).toBe(false)
    expect(
      unassignedTaskCount(
        [{}, { columnId: 'col_gone' }, { columnId: 'col_ip' }],
        named,
      ),
    ).toBe(2)
  })
})
