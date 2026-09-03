import { describe, expect, it } from 'vitest'
import { projectProgress } from './project-progress'

const columns = [
  { _id: 'col_ip', isDone: false },
  { _id: 'col_done', isDone: true },
]

describe('projectProgress', () => {
  it('counts Done by isDone column', () => {
    expect(
      projectProgress(
        [{ columnId: 'col_done' }, { columnId: 'col_ip' }, {}],
        columns,
      ),
    ).toEqual({ leftover: 2, done: 1, total: 3, percent: 33 })
  })

  it('returns 0 percent when there are no tasks', () => {
    expect(projectProgress([], columns)).toEqual({
      leftover: 0,
      done: 0,
      total: 0,
      percent: 0,
    })
  })

  it('treats a stale columnId as leftover', () => {
    const result = projectProgress([{ columnId: 'col_gone' }], columns)
    expect(result).toEqual({ leftover: 1, done: 0, total: 1, percent: 0 })
  })
})
