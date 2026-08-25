import { describe, expect, it } from 'vitest'
import { shutdownNoteSchema } from './shutdown-note'

describe('shutdownNoteSchema', () => {
  it('accepts an empty note', () => {
    expect(shutdownNoteSchema.safeParse({ note: '' }).success).toBe(true)
  })
})
