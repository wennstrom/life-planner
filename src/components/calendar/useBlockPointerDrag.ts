import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import {
  type BlockGesture,
  gestureLayout,
  gestureTimes,
} from '../../lib/calendarGeometry'
import { isBlockControl } from '../../lib/timeBlockAppearance'

export function useBlockPointerDrag(args: {
  top: number
  height: number
  dayStartMs: number
  durationMs: number
  onCommit: (patch: { start: number; end: number }) => void
}) {
  const { top, height, dayStartMs, durationMs, onCommit } = args
  const gestureRef = useRef<BlockGesture | null>(null)
  const [preview, setPreview] = useState<{ top: number; height: number } | null>(
    null,
  )

  const displayedTop = preview?.top ?? top
  const displayedHeight = preview?.height ?? height
  const dragging = preview != null && gestureRef.current?.kind === 'move'

  function begin(kind: BlockGesture['kind'], event: PointerEvent<HTMLDivElement>) {
    const gesture: BlockGesture = {
      kind,
      startClientY: event.clientY,
      originTop: top,
      originHeight: height,
    }
    gestureRef.current = gesture
    event.currentTarget.setPointerCapture(event.pointerId)
    setPreview(gestureLayout(gesture, event.clientY))
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
    setPreview(gestureLayout(gesture, event.clientY))
  }

  function finish(
    event: PointerEvent<HTMLDivElement>,
    shouldCommit: boolean,
  ) {
    const gesture = gestureRef.current
    if (!gesture) return
    if (shouldCommit) {
      onCommit(gestureTimes(gesture, event.clientY, dayStartMs, durationMs))
    }
    gestureRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setPreview(null)
  }

  return {
    displayedTop,
    displayedHeight,
    dragging,
    onPointerDown,
    onPointerMove,
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => finish(event, true),
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) =>
      finish(event, false),
  }
}
