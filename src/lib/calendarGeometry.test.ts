import { describe, expect, it } from 'vitest'
import {
  CALENDAR_START_HOUR,
  DEFAULT_BLOCK_DURATION_MS,
  HOUR_HEIGHT,
  MIN_CHIP_HEIGHT,
  MS_PER_HOUR,
  blockLayout,
  dropRangeFromPointer,
  gestureLayout,
  gestureTimes,
  hoursInRange,
  msToTop,
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
})
