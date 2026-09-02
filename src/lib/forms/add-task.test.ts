import { describe, expect, it } from 'vitest'
import { addTaskSchema, emptyAddTaskValues, toCreateTaskArgs } from './add-task'
import { editTaskSchema } from './edit-task'

describe('addTaskSchema', () => {
  it('is the same schema as edit', () => {
    expect(addTaskSchema).toBe(editTaskSchema)
  })

  it('rejects a blank title', () => {
    const result = addTaskSchema.safeParse(emptyAddTaskValues())
    expect(result.success).toBe(false)
  })

  it('defaults to Backlog columnId', () => {
    expect(emptyAddTaskValues()).toEqual({
      title: '',
      notes: '',
      checklist: [],
      columnId: '',
      projectId: '',
      estimateHours: '',
      dueDate: '',
      priority: '',
    })
    expect(emptyAddTaskValues('proj1', 'k1')).toMatchObject({
      projectId: 'proj1',
      columnId: 'k1',
      checklist: [],
    })
  })
})

describe('toCreateTaskArgs', () => {
  it('omits empty optional fields and sends null columnId', () => {
    expect(toCreateTaskArgs({ ...emptyAddTaskValues(), title: 'Buy milk' })).toMatchObject({
      columnId: null,
    })
  })

  it('passes through filled optional fields including columnId', () => {
    expect(
      toCreateTaskArgs({
        title: 'Buy milk',
        notes: '  2%',
        checklist: [{ id: '1', text: 'Organic', done: false }],
        columnId: 'k1',
        projectId: 'proj1',
        estimateHours: '1.5',
        dueDate: '2026-08-21',
        priority: '3',
      }),
    ).toEqual({
      title: 'Buy milk',
      notes: '2%',
      checklist: [{ id: '1', text: 'Organic', done: false }],
      columnId: 'k1',
      projectId: 'proj1',
      estimateMinutes: 90,
      dueDate: '2026-08-21',
      priority: 3,
    })
  })
})
