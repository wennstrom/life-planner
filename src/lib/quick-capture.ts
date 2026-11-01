type TargetLike = {
  tagName?: string
  isContentEditable?: boolean
}

type KeyEventLike = {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  repeat?: boolean
  isComposing?: boolean
  target: EventTarget | null
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/** True when typing a key there would type text, so `n` must not open capture. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (target == null || typeof target !== 'object') return false
  const element = target as TargetLike
  if (element.isContentEditable) return true
  return element.tagName != null && EDITABLE_TAGS.has(element.tagName)
}

/**
 * ⌘K / Ctrl+K anywhere, or a bare `n` outside text fields. Neither fires
 * while another dialog, menu, or list is open.
 */
export function isQuickCaptureShortcut(
  event: KeyEventLike,
  overlayOpen: boolean,
): boolean {
  if (event.isComposing || overlayOpen) return false
  const key = event.key.toLowerCase()
  if (key === 'k' && (event.metaKey || event.ctrlKey)) {
    return !event.altKey && !event.shiftKey
  }
  if (key !== 'n' || event.repeat) return false
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return false
  }
  return !isEditableTarget(event.target)
}

/** Pre-select the project when capturing from its page. */
export function projectIdFromPath(pathname: string): string | undefined {
  const match = /^\/projects\/([^/]+)/.exec(pathname)
  return match?.[1]
}
