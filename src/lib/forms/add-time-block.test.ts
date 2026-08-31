import { describe, expect, it } from 'vitest'
import {
  addTimeBlockSchema,
  emptyAddTimeBlockValues,
  toCreateBlockArgs,
  toggleTaskId,
} from './add-time-block'

describe('addTimeBlockSchema', () => {
  it('defaults to an empty taskIds list', () => {
    expect(emptyAddTimeBlockValues().taskIds).toEqual([])
  })

  it('rejects a blank intent', () => {
    const result = addTimeBlockSchema.safeParse(emptyAddTimeBlockValues())
    expect(result.success).toBe(false)
  })

  it('accepts a personal block with no tasks', () => {
    const result = addTimeBlockSchema.safeParse({
      ...emptyAddTimeBlockValues(),
      intent: 'Write tests',
    })
    expect(result.success).toBe(true)
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
      taskIds: ['task1'],
    })
    expect(args.title).toBe('Write tests')
    expect(args.end - args.start).toBe(60 * 60000)
    expect(args.taskIds).toEqual(['task1'])
  })

  it('returns an empty taskIds list when none are selected', () => {
    const args = toCreateBlockArgs({
      ...emptyAddTimeBlockValues(),
      intent: 'Break',
      dateKey: '2026-08-21',
      startTime: '09:00',
      endTime: '10:00',
    })
    expect(args.taskIds).toEqual([])
  })
})

describe('toggleTaskId', () => {
  it('appends on check so order is click order', () => {
    expect(toggleTaskId(['a'], 'b')).toEqual(['a', 'b'])
  })

  it('removes on uncheck without reordering the rest', () => {
    expect(toggleTaskId(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })
})
