import { describe, expect, it } from 'vitest'
import { addTaskSchema, emptyAddTaskValues, toCreateTaskArgs } from './add-task'

describe('addTaskSchema', () => {
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

  it('accepts optional empty notes, project, and due date', () => {
    const result = addTaskSchema.safeParse({
      ...emptyAddTaskValues(),
      title: 'Buy milk',
    })
    expect(result.success).toBe(true)
  })
})

describe('toCreateTaskArgs', () => {
  it('omits empty optional fields', () => {
    expect(toCreateTaskArgs({ ...emptyAddTaskValues(), title: 'Buy milk' })).toEqual({
      title: 'Buy milk',
      notes: undefined,
      projectId: undefined,
      dueDate: undefined,
    })
  })

  it('passes through filled optional fields', () => {
    expect(
      toCreateTaskArgs({
        title: 'Buy milk',
        notes: '  2%',
        projectId: 'proj1',
        dueDate: '2026-08-21',
      }),
    ).toEqual({
      title: 'Buy milk',
      notes: '2%',
      projectId: 'proj1',
      dueDate: '2026-08-21',
    })
  })
})
