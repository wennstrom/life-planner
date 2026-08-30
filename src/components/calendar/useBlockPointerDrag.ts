import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import {
  type BlockGesture,
  type WeekPointer,
  POINTER_COMMIT_MIN_PX,
  POINTER_DAY_CHANGE_MIN_PX,
  blockPointerRelease,
  dayDeltaFromWeekPointer,
  gestureLayout,
  gestureTimes,
} from '../../lib/calendarGeometry'
import { isBlockControl } from '../../lib/timeBlockAppearance'

type Preview = {
  top: number
  height: number
  kind: BlockGesture['kind']
  dayDelta: number
}

export type WeekDrag = {
  weekStartMs: number
  getGridRect: () => DOMRect | null
  onDraggingChange?: (dragging: boolean) => void
}

export function useBlockPointerDrag(args: {
  top: number
  height: number
  dayStartMs: number
  durationMs: number
  onCommit: (patch: { start: number; end: number }) => void
  onActivate?: () => void
  weekDrag?: WeekDrag
}) {
  const { top, height, dayStartMs, durationMs, onCommit, onActivate, weekDrag } =
    args
  const gestureRef = useRef<BlockGesture | null>(null)
  const captureRef = useRef<{
    target: HTMLDivElement
    pointerId: number
  } | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)

  const displayedTop = preview?.top ?? top
  const displayedHeight = preview?.height ?? height
  const displayedDayDelta = preview?.dayDelta ?? 0
  const dragging = preview?.kind === 'move'
  const resizing = preview?.kind === 'resize'

  function weekPointerFromX(clientX: number): WeekPointer | undefined {
    if (!weekDrag) return undefined
    const rect = weekDrag.getGridRect()
    if (!rect) return undefined
    return {
      clientX,
      gridLeft: rect.left,
      gridWidth: rect.width,
      weekStartMs: weekDrag.weekStartMs,
    }
  }

  function releaseCapture() {
    const capture = captureRef.current
    if (capture && capture.target.hasPointerCapture(capture.pointerId)) {
      capture.target.releasePointerCapture(capture.pointerId)
    }
    captureRef.current = null
  }

  function finish(clientY: number, clientX: number, shouldCommit: boolean) {
    const gesture = gestureRef.current
    if (!gesture) return
    if (shouldCommit) {
      const weekPointer = weekPointerFromX(clientX)
      const release = blockPointerRelease(
        gesture,
        clientY,
        dayStartMs,
        durationMs,
        weekPointer,
      )
      if (release === 'commit') {
        onCommit(
          gestureTimes(gesture, clientY, dayStartMs, durationMs, weekPointer),
        )
      } else if (release === 'activate') {
        onActivate?.()
      }
    }
    gestureRef.current = null
    releaseCapture()
    weekDrag?.onDraggingChange?.(false)
    setPreview(null)
  }

  const finishRef = useRef(finish)
  finishRef.current = finish

  const gestureActive = preview != null
  useEffect(() => {
    if (!gestureActive) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      finishRef.current(0, 0, false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [gestureActive])

  function begin(kind: BlockGesture['kind'], event: PointerEvent<HTMLDivElement>) {
    const gesture: BlockGesture = {
      kind,
      startClientY: event.clientY,
      startClientX: event.clientX,
      originTop: top,
      originHeight: height,
    }
    gestureRef.current = gesture
    captureRef.current = {
      target: event.currentTarget,
      pointerId: event.pointerId,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (kind === 'resize') {
      setPreview({ ...gestureLayout(gesture, event.clientY), kind, dayDelta: 0 })
    }
    // Note: onDraggingChange(true) is now called in onPointerMove after the gate
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    if (isBlockControl(event.target)) return
    const resize =
      event.target instanceof HTMLElement &&
      event.target.closest('[data-resize-handle="true"]')
    begin(resize ? 'resize' : 'move', event)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current
    if (!gesture) return
    const weekPointer = weekPointerFromX(event.clientX)
    const movedY = Math.abs(event.clientY - gesture.startClientY)
    const movedX =
      gesture.startClientX != null
        ? Math.abs(event.clientX - gesture.startClientX)
        : 0
    if (
      gesture.kind === 'move' &&
      movedY < POINTER_COMMIT_MIN_PX &&
      movedX < POINTER_COMMIT_MIN_PX
    ) {
      return
    }
    
    // Fire onDraggingChange(true) on first move past gate for move gestures
    if (gesture.kind === 'move' && preview === null) {
      weekDrag?.onDraggingChange?.(true)
    }
    
    // Only show day delta preview if horizontal movement exceeds threshold
    const rawDayDelta =
      gesture.kind === 'move' && weekPointer
        ? dayDeltaFromWeekPointer(dayStartMs, weekPointer)
        : 0
    const dayDelta =
      rawDayDelta !== 0 && movedX >= POINTER_DAY_CHANGE_MIN_PX
        ? rawDayDelta
        : 0
    
    setPreview({
      ...gestureLayout(gesture, event.clientY),
      kind: gesture.kind,
      dayDelta,
    })
  }

  return {
    displayedTop,
    displayedHeight,
    displayedDayDelta,
    dragging,
    resizing,
    onPointerDown,
    onPointerMove,
    onPointerUp: (event: PointerEvent<HTMLDivElement>) =>
      finish(event.clientY, event.clientX, true),
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) =>
      finish(event.clientY, event.clientX, false),
    onLostPointerCapture: () => finish(0, 0, false),
  }
}
