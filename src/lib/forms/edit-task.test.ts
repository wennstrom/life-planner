import { describe, expect, it } from 'vitest'
import {
  editTaskSchema,
  toUpdateTaskArgs,
  valuesFromTask,
} from './edit-task'

const valid = {
  title: 'Ship it',
  notes: '',
  checklist: [] as Array<{ id: string; text: string; done: boolean }>,
  status: 'backlog' as const,
  projectId: '',
  estimateHours: '',
  dueDate: '',
  priority: '' as const,
}

describe('editTaskSchema', () => {
  it('accepts an empty estimate', () => {
    expect(editTaskSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a negative estimate', () => {
    expect(
      editTaskSchema.safeParse({ ...valid, estimateHours: '-1' }).success,
    ).toBe(false)
  })

  it('rejects a non-numeric estimate', () => {
    expect(
      editTaskSchema.safeParse({ ...valid, estimateHours: 'abc' }).success,
    ).toBe(false)
  })
})

describe('toUpdateTaskArgs', () => {
  it('converts hours to minutes and empty optionals to null', () => {
    expect(
      toUpdateTaskArgs({ ...valid, estimateHours: '1.5', priority: '3' }),
    ).toEqual({
      title: 'Ship it',
      notes: null,
      checklist: [],
      status: 'backlog',
      projectId: null,
      estimateMinutes: 90,
      dueDate: null,
      priority: 3,
    })
  })
})

describe('valuesFromTask', () => {
  it('converts minutes back to hours string', () => {
    expect(
      valuesFromTask({
        title: 'Ship it',
        status: 'in-progress',
        estimateMinutes: 90,
      }),
    ).toMatchObject({
      title: 'Ship it',
      status: 'in-progress',
      estimateHours: '1.5',
      priority: '',
    })
  })
})
