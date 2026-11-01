import { describe, expect, it } from 'vitest'
import {
  isEditableTarget,
  isQuickCaptureShortcut,
  projectIdFromPath,
} from './quick-capture'

const body = { tagName: 'BODY' } as unknown as EventTarget
const input = { tagName: 'INPUT' } as unknown as EventTarget
const textarea = { tagName: 'TEXTAREA' } as unknown as EventTarget
const editable = {
  tagName: 'DIV',
  isContentEditable: true,
} as unknown as EventTarget

function key(
  value: string,
  overrides: Partial<Parameters<typeof isQuickCaptureShortcut>[0]> = {},
) {
  return {
    key: value,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    target: body,
    ...overrides,
  }
}

describe('isEditableTarget', () => {
  it('matches inputs, textareas, and contenteditable', () => {
    expect(isEditableTarget(input)).toBe(true)
    expect(isEditableTarget(textarea)).toBe(true)
    expect(isEditableTarget(editable)).toBe(true)
    expect(isEditableTarget(body)).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})

describe('isQuickCaptureShortcut', () => {
  it('opens on ⌘K and Ctrl+K, even from a text field', () => {
    expect(isQuickCaptureShortcut(key('k', { metaKey: true }), false)).toBe(true)
    expect(isQuickCaptureShortcut(key('K', { ctrlKey: true }), false)).toBe(true)
    expect(
      isQuickCaptureShortcut(key('k', { metaKey: true, target: input }), false),
    ).toBe(true)
  })

  it('ignores ⌘K with other modifiers', () => {
    expect(
      isQuickCaptureShortcut(key('k', { metaKey: true, shiftKey: true }), false),
    ).toBe(false)
  })

  it('opens on a bare n outside text fields only', () => {
    expect(isQuickCaptureShortcut(key('n'), false)).toBe(true)
    expect(isQuickCaptureShortcut(key('n', { target: input }), false)).toBe(
      false,
    )
    expect(isQuickCaptureShortcut(key('n', { target: editable }), false)).toBe(
      false,
    )
    expect(isQuickCaptureShortcut(key('N', { shiftKey: true }), false)).toBe(
      false,
    )
    expect(isQuickCaptureShortcut(key('n', { metaKey: true }), false)).toBe(
      false,
    )
    expect(isQuickCaptureShortcut(key('n', { repeat: true }), false)).toBe(
      false,
    )
  })

  it('stays out of the way while another overlay is open or text is composing', () => {
    expect(isQuickCaptureShortcut(key('n'), true)).toBe(false)
    expect(isQuickCaptureShortcut(key('k', { metaKey: true }), true)).toBe(
      false,
    )
    expect(isQuickCaptureShortcut(key('n', { isComposing: true }), false)).toBe(
      false,
    )
  })
})

describe('projectIdFromPath', () => {
  it('reads the project id from a project page', () => {
    expect(projectIdFromPath('/projects/abc123')).toBe('abc123')
    expect(projectIdFromPath('/projects')).toBeUndefined()
    expect(projectIdFromPath('/today')).toBeUndefined()
  })
})
