import { describe, expect, it } from 'vitest'
import {
  CALENDAR_START_HOUR,
  DEFAULT_BLOCK_DURATION_MS,
  HOUR_HEIGHT,
  MIN_CHIP_HEIGHT,
  MS_PER_HOUR,
  POINTER_COMMIT_MIN_PX,
  TASK_DRAG_TYPE,
  blockLayout,
  dropRangeFromPointer,
  gestureLayout,
  gestureTimes,
  hoursInRange,
  msToTop,
  readTaskDragId,
  shouldCommitGesture,
  topToMs,
} from './calendarGeometry'

const dayStart = Date.UTC(2026, 7, 24)

describe('hoursInRange', () => {
  it('returns each hour in [start, end)', () => {
    expect(hoursInRange(7, 10)).toEqual([7, 8, 9])
  })
})

describe('msToTop / topToMs', () => {
  it('maps calendar start hour to top 0', () => {
    const startHourMs = dayStart + CALENDAR_START_HOUR * MS_PER_HOUR
    expect(msToTop(startHourMs, dayStart)).toBe(0)
  })

  it('is invertible for on-grid times', () => {
    const top = HOUR_HEIGHT * 2
    expect(msToTop(topToMs(top, dayStart), dayStart)).toBe(top)
  })
})

describe('blockLayout', () => {
  it('sizes a 1-hour block to HOUR_HEIGHT', () => {
    const start = dayStart + 9 * MS_PER_HOUR
    const end = start + MS_PER_HOUR
    expect(blockLayout(start, end, dayStart)).toEqual({
      top: (9 - CALENDAR_START_HOUR) * HOUR_HEIGHT,
      height: HOUR_HEIGHT,
    })
  })

  it('clamps very short blocks to MIN_CHIP_HEIGHT', () => {
    const start = dayStart + 9 * MS_PER_HOUR
    const end = start + 5 * 60 * 1000
    expect(blockLayout(start, end, dayStart).height).toBe(MIN_CHIP_HEIGHT)
  })
})

describe('dropRangeFromPointer', () => {
  it('creates a 1-hour block from a pointer Y inside the rail', () => {
    const railTop = 100
    const { start, end } = dropRangeFromPointer({
      clientY: 100 + HOUR_HEIGHT,
      railTop,
      dayStartMs: dayStart,
    })
    expect(start).toBe(dayStart + (CALENDAR_START_HOUR + 1) * MS_PER_HOUR)
    expect(end - start).toBe(DEFAULT_BLOCK_DURATION_MS)
  })

  it('does not allow a drop above the rail', () => {
    const { start } = dropRangeFromPointer({
      clientY: 50,
      railTop: 100,
      dayStartMs: dayStart,
    })
    expect(start).toBe(dayStart + CALENDAR_START_HOUR * MS_PER_HOUR)
  })
})

describe('gestureLayout / gestureTimes', () => {
  it('moves a block down by delta Y and keeps duration', () => {
    const durationMs = MS_PER_HOUR
    const originTop = 0
    const layout = gestureLayout(
      {
        kind: 'move',
        startClientY: 200,
        originTop,
        originHeight: HOUR_HEIGHT,
      },
      200 + HOUR_HEIGHT,
    )
    expect(layout).toEqual({ top: HOUR_HEIGHT, height: HOUR_HEIGHT })

    const times = gestureTimes(
      {
        kind: 'move',
        startClientY: 200,
        originTop,
        originHeight: HOUR_HEIGHT,
      },
      200 + HOUR_HEIGHT,
      dayStart,
      durationMs,
    )
    expect(times.end - times.start).toBe(durationMs)
    expect(times.start).toBe(topToMs(HOUR_HEIGHT, dayStart))
  })

  it('does not move a block above the rail', () => {
    const layout = gestureLayout(
      {
        kind: 'move',
        startClientY: 200,
        originTop: 10,
        originHeight: HOUR_HEIGHT,
      },
      100,
    )
    expect(layout.top).toBe(0)
  })

  it('resizes from the bottom and clamps to MIN_CHIP_HEIGHT', () => {
    const layout = gestureLayout(
      {
        kind: 'resize',
        startClientY: 300,
        originTop: 0,
        originHeight: HOUR_HEIGHT,
      },
      250,
    )
    expect(layout.height).toBe(MIN_CHIP_HEIGHT)
    expect(layout.top).toBe(0)
  })

  it('keeps start fixed while resizing', () => {
    const originTop = HOUR_HEIGHT
    const times = gestureTimes(
      {
        kind: 'resize',
        startClientY: 400,
        originTop,
        originHeight: HOUR_HEIGHT,
      },
      400 + HOUR_HEIGHT,
      dayStart,
      MS_PER_HOUR,
    )
    expect(times.start).toBe(topToMs(originTop, dayStart))
    expect(times.end).toBe(topToMs(originTop + HOUR_HEIGHT * 2, dayStart))
  })

  it('returns the original end for a zero-delta resize of a 15-minute block', () => {
    const durationMs = 15 * 60 * 1000
    const originTop = HOUR_HEIGHT * 2
    const start = topToMs(originTop, dayStart)
    const originalEnd = start + durationMs
    const times = gestureTimes(
      {
        kind: 'resize',
        startClientY: 400,
        originTop,
        originHeight: MIN_CHIP_HEIGHT,
      },
      400,
      dayStart,
      durationMs,
    )
    expect(times.start).toBe(start)
    expect(times.end).toBe(originalEnd)
  })

  it('returns the original start for a zero-delta move', () => {
    const durationMs = 15 * 60 * 1000
    const originTop = HOUR_HEIGHT * 2
    const times = gestureTimes(
      {
        kind: 'move',
        startClientY: 200,
        originTop,
        originHeight: MIN_CHIP_HEIGHT,
      },
      200,
      dayStart,
      durationMs,
    )
    expect(times.start).toBe(topToMs(originTop, dayStart))
    expect(times.end - times.start).toBe(durationMs)
  })

  it('does not invert times when shrinking a 15-minute block past its true height', () => {
    const durationMs = 15 * 60 * 1000
    const originTop = HOUR_HEIGHT * 2
    const startClientY = 400
    const shrinkPx = 14
    const gesture = {
      kind: 'resize' as const,
      startClientY,
      originTop,
      originHeight: MIN_CHIP_HEIGHT,
    }
    const times = gestureTimes(
      gesture,
      startClientY - shrinkPx,
      dayStart,
      durationMs,
    )
    expect(times.end).toBeGreaterThan(times.start)
  })
})

describe('shouldCommitGesture', () => {
  const originTop = HOUR_HEIGHT
  const durationMs = MS_PER_HOUR
  const move = {
    kind: 'move' as const,
    startClientY: 200,
    originTop,
    originHeight: HOUR_HEIGHT,
  }

  it('does not commit a click with no movement', () => {
    expect(shouldCommitGesture(move, 200, dayStart, durationMs)).toBe(false)
  })

  it('does not commit when the pointer moved less than a few pixels', () => {
    expect(
      shouldCommitGesture(
        move,
        200 + POINTER_COMMIT_MIN_PX - 1,
        dayStart,
        durationMs,
      ),
    ).toBe(false)
  })

  it('does not commit when computed times equal the original times', () => {
    const atTop = {
      ...move,
      originTop: 0,
    }
    expect(
      shouldCommitGesture(atTop, 200 - HOUR_HEIGHT, dayStart, durationMs),
    ).toBe(false)
  })

  it('commits a real move that changes start', () => {
    expect(
      shouldCommitGesture(move, 200 + HOUR_HEIGHT, dayStart, durationMs),
    ).toBe(true)
  })

  it('does not commit a resize that would invert start and end', () => {
    const shortDurationMs = 15 * 60 * 1000
    const resize = {
      kind: 'resize' as const,
      startClientY: 400,
      originTop: HOUR_HEIGHT * 2,
      originHeight: MIN_CHIP_HEIGHT,
    }
    expect(
      shouldCommitGesture(resize, 400 - 14, dayStart, shortDurationMs),
    ).toBe(false)
  })
})

describe('readTaskDragId', () => {
  it('uses a private MIME type rather than text/plain', () => {
    expect(TASK_DRAG_TYPE).toBe('application/x-life-planner-task')
    expect(TASK_DRAG_TYPE).not.toBe('text/plain')
  })

  it('returns the task id from the private MIME type', () => {
    expect(
      readTaskDragId({
        getData: (type) => (type === TASK_DRAG_TYPE ? 'task_abc' : ''),
      }),
    ).toBe('task_abc')
  })

  it('rejects empty or missing ids', () => {
    expect(readTaskDragId({ getData: () => '' })).toBeNull()
    expect(
      readTaskDragId({
        getData: (type) => (type === 'text/plain' ? 'plain-id' : ''),
      }),
    ).toBeNull()
  })
})
