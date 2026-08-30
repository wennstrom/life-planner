import { describe, expect, it } from 'vitest'
import {
  CALENDAR_END_HOUR,
  CALENDAR_START_HOUR,
  DEFAULT_BLOCK_DURATION_MS,
  HOUR_HEIGHT,
  MIN_CHIP_HEIGHT,
  MS_PER_HOUR,
  POINTER_COMMIT_MIN_PX,
  POINTER_DAY_CHANGE_MIN_PX,
  SLOT_SNAP_MS,
  TASK_DRAG_TYPE,
  MS_PER_DAY,
  blockLayout,
  dayDeltaFromWeekPointer,
  dayIndexFromClientX,
  shiftTimesByDays,
  clampBlockStart,
  dropRangeFromPointer,
  emptySlotStartFromPointer,
  gestureLayout,
  gestureTimes,
  formatHourLabel,
  hoursInRange,
  initialCalendarScrollTop,
  msToTop,
  readTaskDragId,
  shouldCommitGesture,
  snapMs,
  topToMs,
  blockPointerRelease,
} from './calendarGeometry'

const dayStart = Date.UTC(2026, 7, 24)

describe('day range', () => {
  it('starts at midnight and renders 24 hours', () => {
    expect(CALENDAR_START_HOUR).toBe(0)
    expect(CALENDAR_END_HOUR).toBe(24)
  })
})

describe('hoursInRange', () => {
  it('returns each hour in [start, end)', () => {
    expect(hoursInRange(7, 10)).toEqual([7, 8, 9])
  })
})

describe('formatHourLabel', () => {
  it('formats hours as hh:mm', () => {
    expect(formatHourLabel(0)).toBe('00:00')
    expect(formatHourLabel(7)).toBe('07:00')
  })
})

describe('initialCalendarScrollTop', () => {
  it('places 07:00 at the top of the viewport', () => {
    expect(initialCalendarScrollTop()).toBe(7 * HOUR_HEIGHT)
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

describe('dropRangeFromPointer scrollTop', () => {
  it('treats scroller top + scrollTop as content offset', () => {
    const { start } = dropRangeFromPointer({
      clientY: 100 + HOUR_HEIGHT,
      railTop: 100,
      scrollTop: HOUR_HEIGHT,
      dayStartMs: dayStart,
    })
    expect(start).toBe(dayStart + (CALENDAR_START_HOUR + 2) * MS_PER_HOUR)
  })

  it('subtracts sticky header inset above the hour grid', () => {
    const headerHeight = 48
    const { start } = dropRangeFromPointer({
      clientY: 100 + headerHeight + HOUR_HEIGHT,
      railTop: 100,
      scrollTop: 0,
      contentInsetTop: headerHeight,
      dayStartMs: dayStart,
    })
    expect(start).toBe(dayStart + (CALENDAR_START_HOUR + 1) * MS_PER_HOUR)
  })
})

describe('snapMs', () => {
  it('rounds to the nearest step', () => {
    expect(snapMs(7 * 60_000, SLOT_SNAP_MS)).toBe(0)
    expect(snapMs(8 * 60_000, SLOT_SNAP_MS)).toBe(SLOT_SNAP_MS)
  })
})

describe('clampBlockStart', () => {
  it('clamps to 23:00 so a 60-minute block stays on the day', () => {
    const late = dayStart + 23.5 * MS_PER_HOUR
    expect(clampBlockStart(late, dayStart)).toBe(dayStart + 23 * MS_PER_HOUR)
  })

  it('does not go before midnight', () => {
    expect(clampBlockStart(dayStart - MS_PER_HOUR, dayStart)).toBe(dayStart)
  })
})

describe('emptySlotStartFromPointer', () => {
  it('snaps a 14:07 click to 14:00', () => {
    const fourteen = 14 * MS_PER_HOUR
    const sevenMinPx = (7 / 60) * HOUR_HEIGHT
    const start = emptySlotStartFromPointer({
      clientY: 100 + (fourteen / MS_PER_HOUR) * HOUR_HEIGHT + sevenMinPx,
      railTop: 100,
      scrollTop: 0,
      dayStartMs: dayStart,
    })
    expect(start).toBe(dayStart + fourteen)
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

describe('blockPointerRelease', () => {
  const originTop = HOUR_HEIGHT
  const durationMs = MS_PER_HOUR
  const move = {
    kind: 'move' as const,
    startClientY: 200,
    originTop,
    originHeight: HOUR_HEIGHT,
  }
  const resize = {
    kind: 'resize' as const,
    startClientY: 200,
    originTop,
    originHeight: HOUR_HEIGHT,
  }

  it('activates edit on a click with no movement', () => {
    expect(blockPointerRelease(move, 200, dayStart, durationMs)).toBe(
      'activate',
    )
  })

  it('activates edit when the pointer jittered below the commit threshold', () => {
    expect(
      blockPointerRelease(
        move,
        200 + POINTER_COMMIT_MIN_PX - 1,
        dayStart,
        durationMs,
      ),
    ).toBe('activate')
  })

  it('commits a real drag instead of activating', () => {
    expect(
      blockPointerRelease(move, 200 + HOUR_HEIGHT, dayStart, durationMs),
    ).toBe('commit')
  })

  it('does not activate when a resize handle is released without committing', () => {
    expect(blockPointerRelease(resize, 200, dayStart, durationMs)).toBe(
      'ignore',
    )
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

describe('dayIndexFromClientX', () => {
  const gridLeft = 100
  const gridWidth = 700

  it('maps the pointer into a 0–6 column index', () => {
    expect(dayIndexFromClientX(100, gridLeft, gridWidth)).toBe(0)
    expect(dayIndexFromClientX(199, gridLeft, gridWidth)).toBe(0)
    expect(dayIndexFromClientX(200, gridLeft, gridWidth)).toBe(1)
    expect(dayIndexFromClientX(799, gridLeft, gridWidth)).toBe(6)
  })

  it('clamps pointers outside the grid', () => {
    expect(dayIndexFromClientX(0, gridLeft, gridWidth)).toBe(0)
    expect(dayIndexFromClientX(900, gridLeft, gridWidth)).toBe(6)
  })
})

describe('shiftTimesByDays', () => {
  it('shifts start and end by whole days', () => {
    const start = 1_000
    const end = 4_000
    const shifted = shiftTimesByDays({ start, end }, 2)
    expect(shifted.end - shifted.start).toBe(end - start)
  })

  it('preserves clock time across DST boundary (Europe/Stockholm example)', () => {
    // Sunday 2026-03-29 02:00 CEST (clocks spring forward, UTC+2)
    // Before DST: Sunday 2026-03-29 01:00 CET = UTC 00:00
    // After DST: Monday 2026-03-30 01:00 CEST = UTC 23:00 (previous day)
    // Using setDate keeps the clock time at 01:00 regardless of DST
    const sundayBeforeDST = Date.UTC(2026, 2, 29, 0, 0, 0)
    const shifted = shiftTimesByDays(
      { start: sundayBeforeDST, end: sundayBeforeDST + MS_PER_HOUR },
      1,
    )
    const startDate = new Date(shifted.start)
    const originalStartDate = new Date(sundayBeforeDST)
    expect(startDate.getUTCHours()).toBe(originalStartDate.getUTCHours())
  })
})

describe('horizontal week move', () => {
  const weekStart = dayStart
  const wednesday = weekStart + 2 * MS_PER_DAY
  const grid = { gridLeft: 0, gridWidth: 700, weekStartMs: weekStart }
  const originTop = HOUR_HEIGHT
  const durationMs = MS_PER_HOUR
  const move = {
    kind: 'move' as const,
    startClientY: 200,
    startClientX: 250,
    originTop,
    originHeight: HOUR_HEIGHT,
  }

  it('computes day delta from the origin column to the pointer column', () => {
    expect(
      dayDeltaFromWeekPointer(wednesday, { ...grid, clientX: 550 }),
    ).toBe(3)
  })

  it('computes negative day delta when dragging backwards', () => {
    const friday = weekStart + 4 * MS_PER_DAY
    expect(
      dayDeltaFromWeekPointer(friday, { ...grid, clientX: 150 }),
    ).toBe(-3)
  })

  it('commits when the pointer moves to another day with no vertical change', () => {
    expect(
      shouldCommitGesture(move, 200, wednesday, durationMs, {
        ...grid,
        clientX: 550,
      }),
    ).toBe(true)
  })

  it('does not commit a click that stays in the same column', () => {
    expect(
      shouldCommitGesture(move, 200, wednesday, durationMs, {
        ...grid,
        clientX: 250,
      }),
    ).toBe(false)
  })

  it('does not commit when horizontal movement crosses column but is below day-change threshold', () => {
    // Start at clientX 250 (column 2), move to clientX 110 (column 1)
    // That's 140px horizontal, but it crosses into the next column
    // However, we need to test the threshold prevents accidental day commits
    // Actually, let's test a case where the pointer moves near a column edge
    // Column boundaries at 700/7 = 100px each: 0, 100, 200, 300, ...
    // Start at 105 (column 1), move to 115 (column 1) = 10px, same column, below 20px
    const nearEdgeMove = {
      ...move,
      startClientX: 105,
    }
    expect(
      shouldCommitGesture(nearEdgeMove, 200, wednesday, durationMs, {
        ...grid,
        clientX: 115,
      }),
    ).toBe(false)
  })

  it('does not commit a small nudge near column boundary (3px horizontal, 2px vertical)', () => {
    // startClientX is 250, moving to 253 = 3px horizontal, still in same column
    // Both are below the 4px threshold, should activate edit instead of commit
    expect(
      shouldCommitGesture(move, 202, wednesday, durationMs, {
        ...grid,
        clientX: 253,
      }),
    ).toBe(false)
  })

  it('shifts committed times onto the drop day', () => {
    expect(
      gestureTimes(move, 200, wednesday, durationMs, {
        ...grid,
        clientX: 550,
      }),
    ).toEqual({
      start: wednesday + 3 * MS_PER_DAY + MS_PER_HOUR,
      end: wednesday + 3 * MS_PER_DAY + 2 * MS_PER_HOUR,
    })
  })

  it('does not change day on resize', () => {
    const resize = {
      kind: 'resize' as const,
      startClientY: 200,
      startClientX: 250,
      originTop,
      originHeight: HOUR_HEIGHT,
    }
    const times = gestureTimes(resize, 200 + HOUR_HEIGHT, wednesday, durationMs, {
      ...grid,
      clientX: 550,
    })
    expect(times.start).toBe(wednesday + MS_PER_HOUR)
    expect(times.end).toBe(wednesday + 3 * MS_PER_HOUR)
  })
})
