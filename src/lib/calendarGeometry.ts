export const HOUR_HEIGHT = 54
export const CALENDAR_START_HOUR = 0
export const CALENDAR_END_HOUR = 24
export const CALENDAR_INITIAL_HOUR = 7
export const CALENDAR_VISIBLE_HOURS = 12
export const SLOT_SNAP_MS = 15 * 60 * 1000
export const MIN_CHIP_HEIGHT = 24
export const SUBTITLE_MIN_HEIGHT = 32
export const MS_PER_HOUR = 3_600_000
export const DEFAULT_BLOCK_DURATION_MS = MS_PER_HOUR
export const TASK_DRAG_TYPE = 'application/x-life-planner-task'
export const POINTER_COMMIT_MIN_PX = 4

export function readTaskDragId(dataTransfer: {
  getData: (type: string) => string
}): string | null {
  const id = dataTransfer.getData(TASK_DRAG_TYPE)
  if (!id) return null
  return id
}

export function hoursInRange(startHour: number, endHour: number): number[] {
  return Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
}

export function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

export function initialCalendarScrollTop(): number {
  return (CALENDAR_INITIAL_HOUR - CALENDAR_START_HOUR) * HOUR_HEIGHT
}

export function msToTop(ms: number, dayStartMs: number): number {
  const hours = (ms - dayStartMs) / MS_PER_HOUR
  return (hours - CALENDAR_START_HOUR) * HOUR_HEIGHT
}

export function topToMs(top: number, dayStartMs: number): number {
  const hours = top / HOUR_HEIGHT + CALENDAR_START_HOUR
  return dayStartMs + hours * MS_PER_HOUR
}

export function blockLayout(
  start: number,
  end: number,
  dayStartMs: number,
): { top: number; height: number } {
  return {
    top: msToTop(start, dayStartMs),
    height: Math.max(MIN_CHIP_HEIGHT, ((end - start) / MS_PER_HOUR) * HOUR_HEIGHT),
  }
}

export function snapMs(ms: number, stepMs: number): number {
  return Math.round(ms / stepMs) * stepMs
}

export function clampBlockStart(startMs: number, dayStartMs: number): number {
  const latest = dayStartMs + (CALENDAR_END_HOUR - 1) * MS_PER_HOUR
  return Math.min(Math.max(startMs, dayStartMs), latest)
}

export function emptySlotStartFromPointer(args: {
  clientY: number
  railTop: number
  scrollTop: number
  dayStartMs: number
  /** Sticky/in-flow chrome above the hour grid inside the same scroller. */
  contentInsetTop?: number
}): number {
  const { start } = dropRangeFromPointer({
    clientY: args.clientY,
    railTop: args.railTop,
    scrollTop: args.scrollTop,
    contentInsetTop: args.contentInsetTop,
    dayStartMs: args.dayStartMs,
  })
  const offset = start - args.dayStartMs
  const snapped = args.dayStartMs + snapMs(offset, SLOT_SNAP_MS)
  return clampBlockStart(snapped, args.dayStartMs)
}

export function dropRangeFromPointer(args: {
  clientY: number
  railTop: number
  dayStartMs: number
  scrollTop?: number
  /** Sticky/in-flow chrome above the hour grid inside the same scroller. */
  contentInsetTop?: number
}): { start: number; end: number } {
  const top = Math.max(
    0,
    args.clientY -
      args.railTop +
      (args.scrollTop ?? 0) -
      (args.contentInsetTop ?? 0),
  )
  const start = clampBlockStart(topToMs(top, args.dayStartMs), args.dayStartMs)
  return { start, end: start + DEFAULT_BLOCK_DURATION_MS }
}

export type BlockGesture = {
  kind: 'move' | 'resize'
  startClientY: number
  originTop: number
  originHeight: number
}

export function gestureLayout(
  gesture: BlockGesture,
  clientY: number,
): { top: number; height: number } {
  const delta = clientY - gesture.startClientY
  if (gesture.kind === 'move') {
    return {
      top: Math.max(0, gesture.originTop + delta),
      height: gesture.originHeight,
    }
  }
  return {
    top: gesture.originTop,
    height: Math.max(MIN_CHIP_HEIGHT, gesture.originHeight + delta),
  }
}

export function durationToHeight(durationMs: number): number {
  return (durationMs / MS_PER_HOUR) * HOUR_HEIGHT
}

export function gestureTimes(
  gesture: BlockGesture,
  clientY: number,
  dayStartMs: number,
  durationMs: number,
): { start: number; end: number } {
  if (gesture.kind === 'move') {
    const { top } = gestureLayout(gesture, clientY)
    const start = topToMs(top, dayStartMs)
    return { start, end: start + durationMs }
  }
  const delta = clientY - gesture.startClientY
  const height = Math.max(1, durationToHeight(durationMs) + delta)
  return {
    start: topToMs(gesture.originTop, dayStartMs),
    end: topToMs(gesture.originTop + height, dayStartMs),
  }
}

export function shouldCommitGesture(
  gesture: BlockGesture,
  clientY: number,
  dayStartMs: number,
  durationMs: number,
): boolean {
  if (Math.abs(clientY - gesture.startClientY) < POINTER_COMMIT_MIN_PX) {
    return false
  }
  if (gesture.kind === 'resize') {
    const height = durationToHeight(durationMs) + (clientY - gesture.startClientY)
    if (height <= 0) return false
  }
  const next = gestureTimes(gesture, clientY, dayStartMs, durationMs)
  if (next.end <= next.start) return false
  const originalStart = topToMs(gesture.originTop, dayStartMs)
  return next.start !== originalStart || next.end !== originalStart + durationMs
}

export type BlockPointerRelease = 'commit' | 'activate' | 'ignore'

export function blockPointerRelease(
  gesture: BlockGesture,
  clientY: number,
  dayStartMs: number,
  durationMs: number,
): BlockPointerRelease {
  if (shouldCommitGesture(gesture, clientY, dayStartMs, durationMs)) {
    return 'commit'
  }
  if (gesture.kind === 'move') return 'activate'
  return 'ignore'
}
