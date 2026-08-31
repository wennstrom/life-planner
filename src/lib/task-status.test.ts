import { describe, expect, it } from 'vitest'
import { BOARD_COLUMN_STATUSES, STATUS_CONFIG, TASK_STATUSES } from './task-status'

describe('task-status', () => {
  it('lists all six statuses for the table dropdown', () => {
    expect(TASK_STATUSES).toEqual([
      'backlog',
      'in-progress',
      'review',
      'test',
      'investigate',
      'done',
    ])
  })

  it('lists board columns in workflow order without backlog', () => {
    expect(BOARD_COLUMN_STATUSES).toEqual([
      'investigate',
      'in-progress',
      'review',
      'test',
      'done',
    ])
  })

  it('has a label and className for every table status', () => {
    for (const status of TASK_STATUSES) {
      expect(STATUS_CONFIG[status].label.length).toBeGreaterThan(0)
      expect(STATUS_CONFIG[status].className.length).toBeGreaterThan(0)
    }
  })
})
