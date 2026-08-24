import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import {
  type BlockGesture,
  gestureLayout,
  gestureTimes,
  shouldCommitGesture,
} from '../../lib/calendarGeometry'
import { isBlockControl } from '../../lib/timeBlockAppearance'

type Preview = {
  top: number
  height: number
  kind: BlockGesture['kind']
}

export function useBlockPointerDrag(args: {
  top: number
  height: number
  dayStartMs: number
  durationMs: number
  onCommit: (patch: { start: number; end: number }) => void
}) {
  const { top, height, dayStartMs, durationMs, onCommit } = args
  const gestureRef = useRef<BlockGesture | null>(null)
  const captureRef = useRef<{
    target: HTMLDivElement
    pointerId: number
  } | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)

  const displayedTop = preview?.top ?? top
  const displayedHeight = preview?.height ?? height
  const dragging = preview?.kind === 'move'
  const resizing = preview?.kind === 'resize'

  function releaseCapture() {
    const capture = captureRef.current
    if (capture && capture.target.hasPointerCapture(capture.pointerId)) {
      capture.target.releasePointerCapture(capture.pointerId)
    }
    captureRef.current = null
  }

  function finish(clientY: number, shouldCommit: boolean) {
    const gesture = gestureRef.current
    if (!gesture) return
    if (
      shouldCommit &&
      shouldCommitGesture(gesture, clientY, dayStartMs, durationMs)
    ) {
      onCommit(gestureTimes(gesture, clientY, dayStartMs, durationMs))
    }
    gestureRef.current = null
    releaseCapture()
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
      finishRef.current(0, false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [gestureActive])

  function begin(kind: BlockGesture['kind'], event: PointerEvent<HTMLDivElement>) {
    const gesture: BlockGesture = {
      kind,
      startClientY: event.clientY,
      originTop: top,
      originHeight: height,
    }
    gestureRef.current = gesture
    captureRef.current = {
      target: event.currentTarget,
      pointerId: event.pointerId,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setPreview({ ...gestureLayout(gesture, event.clientY), kind })
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
    setPreview({ ...gestureLayout(gesture, event.clientY), kind: gesture.kind })
  }

  return {
    displayedTop,
    displayedHeight,
    dragging,
    resizing,
    onPointerDown,
    onPointerMove,
    onPointerUp: (event: PointerEvent<HTMLDivElement>) =>
      finish(event.clientY, true),
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) =>
      finish(event.clientY, false),
    onLostPointerCapture: () => finish(0, false),
  }
}
