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
      status: 'backlog',
      projectId: '',
      estimateHours: '',
      dueDate: '',
      priority: '',
    })
    const result = addTaskSchema.safeParse({
      ...emptyAddTaskValues(),
      title: 'Buy milk',
    })
    expect(result.success).toBe(true)
  })

  it('accepts a custom status parameter', () => {
    expect(emptyAddTaskValues('', 'in-progress')).toEqual({
      title: '',
      notes: '',
      status: 'in-progress',
      projectId: '',
      estimateHours: '',
      dueDate: '',
      priority: '',
    })
    expect(emptyAddTaskValues('', 'done')).toEqual({
      title: '',
      notes: '',
      status: 'done',
      projectId: '',
      estimateHours: '',
      dueDate: '',
      priority: '',
    })
  })
})

describe('toCreateTaskArgs', () => {
  it('omits empty optional fields and sends default status', () => {
    expect(toCreateTaskArgs({ ...emptyAddTaskValues(), title: 'Buy milk' })).toEqual({
      title: 'Buy milk',
      notes: undefined,
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
        status: 'in-progress',
        projectId: 'proj1',
        estimateHours: '1.5',
        dueDate: '2026-08-21',
        priority: '3',
      }),
    ).toEqual({
      title: 'Buy milk',
      notes: '2%',
      status: 'in-progress',
      projectId: 'proj1',
      estimateMinutes: 90,
      dueDate: '2026-08-21',
      priority: 3,
    })
  })
})
