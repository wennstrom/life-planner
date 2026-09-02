import { describe, expect, it } from 'vitest'
import {
  canAddColumn,
  insertWorkflowRow,
  moveRow,
  rowsFromColumns,
  toSavePayload,
} from './board-column-settings'

const columns = [
  { _id: '1', name: 'In-Progress', color: '#3b82f6', isDone: false, order: 0 },
  { _id: '2', name: 'Test', color: '#eab308', isDone: false, order: 1 },
  { _id: '3', name: 'Done', color: '#22c55e', isDone: true, order: 2 },
]

describe('board-column-settings', () => {
  it('inserts before Done', () => {
    const rows = insertWorkflowRow(rowsFromColumns(columns), {
      key: 'new',
      name: 'Review',
      color: '#a855f7',
      isDone: false,
    })
    expect(rows.map((r) => r.name)).toEqual([
      'In-Progress',
      'Test',
      'Review',
      'Done',
    ])
  })

  it('does not move Done', () => {
    const rows = rowsFromColumns(columns)
    expect(moveRow(rows, 2, -1)).toEqual(rows)
  })

  it('caps at 8 columns', () => {
    const eight = Array.from({ length: 7 }, (_, i) => ({
      _id: String(i),
      name: `C${i}`,
      color: '#3b82f6',
      isDone: false,
      order: i,
    }))
    eight.push(columns[2]!)
    expect(canAddColumn(rowsFromColumns(eight))).toBe(false)
  })

  it('omits client-only keys from save payload', () => {
    expect(toSavePayload(rowsFromColumns(columns)).columns[0]).toEqual({
      id: '1',
      name: 'In-Progress',
      color: '#3b82f6',
    })
  })
})
