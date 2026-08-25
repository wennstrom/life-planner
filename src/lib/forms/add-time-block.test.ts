import { describe, expect, it } from 'vitest'
import {
  addTimeBlockSchema,
  emptyAddTimeBlockValues,
  toCreateBlockArgs,
} from './add-time-block'

describe('addTimeBlockSchema', () => {
  it('rejects a blank intent', () => {
    const result = addTimeBlockSchema.safeParse(emptyAddTimeBlockValues())
    expect(result.success).toBe(false)
  })

  it('does not require a new-task title unless creating', () => {
    const result = addTimeBlockSchema.safeParse({
      ...emptyAddTimeBlockValues(),
      intent: 'Write tests',
    })
    expect(result.success).toBe(true)
  })

  it('requires a new-task title when creatingTask is true', () => {
    const result = addTimeBlockSchema.safeParse({
      ...emptyAddTimeBlockValues(),
      intent: 'Write tests',
      creatingTask: true,
      newTaskTitle: '  ',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path[0] === 'newTaskTitle'),
      ).toBe(true)
    }
  })

  it('rejects when end is not after start', () => {
    const result = addTimeBlockSchema.safeParse({
      ...emptyAddTimeBlockValues(),
      intent: 'Write tests',
      startTime: '10:00',
      endTime: '09:00',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['endTime'],
          message: 'Enter a valid start and end time. End must be after start.',
        }),
      )
    }
  })

  it('rejects invalid clock times', () => {
    const result = addTimeBlockSchema.safeParse({
      ...emptyAddTimeBlockValues(),
      intent: 'Write tests',
      startTime: '25:00',
      endTime: '10:00',
    })
    expect(result.success).toBe(false)
  })
})

describe('toCreateBlockArgs', () => {
  it('computes start and end from clock times', () => {
    const args = toCreateBlockArgs({
      ...emptyAddTimeBlockValues(),
      intent: 'Write tests',
      dateKey: '2026-08-21',
      startTime: '09:00',
      endTime: '10:00',
      taskId: 'task1',
    })
    expect(args.title).toBe('Write tests')
    expect(args.end - args.start).toBe(60 * 60000)
    expect(args.taskId).toBe('task1')
  })

  it('omits taskId when empty', () => {
    const args = toCreateBlockArgs({
      ...emptyAddTimeBlockValues(),
      intent: 'Break',
      dateKey: '2026-08-21',
      startTime: '09:00',
      endTime: '10:00',
    })
    expect(args.taskId).toBeUndefined()
  })
})
