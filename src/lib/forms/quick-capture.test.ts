import { describe, expect, it } from 'vitest'
import {
  emptyQuickCaptureValues,
  quickCaptureSchema,
  toQuickCaptureArgs,
} from './quick-capture'

describe('quickCaptureSchema', () => {
  it('requires a title', () => {
    expect(
      quickCaptureSchema.safeParse(emptyQuickCaptureValues()).success,
    ).toBe(false)
    expect(
      quickCaptureSchema.safeParse({ title: '   ', projectId: '' }).success,
    ).toBe(false)
    expect(
      quickCaptureSchema.safeParse({ title: 'Call the bank', projectId: '' })
        .success,
    ).toBe(true)
  })
})

describe('toQuickCaptureArgs', () => {
  it('trims the title and leaves out an empty project', () => {
    expect(toQuickCaptureArgs({ title: '  Buy milk ', projectId: '' })).toEqual(
      { title: 'Buy milk', projectId: undefined },
    )
  })

  it('keeps the chosen project', () => {
    expect(
      toQuickCaptureArgs({ title: 'Draft', projectId: 'p1' }).projectId,
    ).toBe('p1')
  })

  it('starts empty with an optional project', () => {
    expect(emptyQuickCaptureValues('p1')).toEqual({ title: '', projectId: 'p1' })
  })
})
