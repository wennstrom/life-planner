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

  it('rejects a whitespace-only title', () => {
    const result = addTaskSchema.safeParse({
      ...emptyAddTaskValues(),
      title: '   ',
    })
    expect(result.success).toBe(false)
  })

  it('defaults to backlog with the same optional fields as edit', () => {
    expect(emptyAddTaskValues()).toEqual({
      title: '',
      notes: '',
      checklist: [],
      status: 'backlog',
      projectId: '',
      estimateHours: '',
      dueDate: '',
      priority: '',
    })
    expect(
      emptyAddTaskValues('proj1', 'in-progress'),
    ).toMatchObject({
      projectId: 'proj1',
      status: 'in-progress',
      checklist: [],
    })
    const result = addTaskSchema.safeParse({
      ...emptyAddTaskValues(),
      title: 'Buy milk',
    })
    expect(result.success).toBe(true)
  })
})

describe('toCreateTaskArgs', () => {
  it('omits empty optional fields and sends default status', () => {
    expect(toCreateTaskArgs({ ...emptyAddTaskValues(), title: 'Buy milk' })).toEqual({
      title: 'Buy milk',
      notes: undefined,
      checklist: [],
      status: 'backlog',
      projectId: undefined,
      estimateMinutes: undefined,
      dueDate: undefined,
      priority: undefined,
    })
  })

  it('passes through filled optional fields including estimate, status, and priority', () => {
    expect(
      toCreateTaskArgs({
        title: 'Buy milk',
        notes: '  2%',
        checklist: [{ id: '1', text: 'Organic', done: false }],
        status: 'in-progress',
        projectId: 'proj1',
        estimateHours: '1.5',
        dueDate: '2026-08-21',
        priority: '3',
      }),
    ).toEqual({
      title: 'Buy milk',
      notes: '2%',
      checklist: [{ id: '1', text: 'Organic', done: false }],
      status: 'in-progress',
      projectId: 'proj1',
      estimateMinutes: 90,
      dueDate: '2026-08-21',
      priority: 3,
    })
  })
})
