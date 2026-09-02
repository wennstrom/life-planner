import { describe, expect, it } from 'vitest'
import { columnSelectOptions } from './board-columns'

describe('columnSelectOptions', () => {
  it('prefixes Backlog then lists columns in order', () => {
    expect(
      columnSelectOptions([
        { _id: '1', name: 'In-Progress', isDone: false },
        { _id: '2', name: 'Done', isDone: true },
      ]),
    ).toEqual([
      { value: '', label: 'Backlog' },
      { value: '1', label: 'In-Progress' },
      { value: '2', label: 'Done' },
    ])
  })
})
