import { describe, expect, it } from 'vitest'
import { createProjectSchema } from './create-project'

describe('createProjectSchema', () => {
  it('rejects a blank name', () => {
    expect(createProjectSchema.safeParse({ name: '  ' }).success).toBe(false)
  })

  it('accepts a trimmed name', () => {
    expect(createProjectSchema.safeParse({ name: 'Life planner' }).success).toBe(
      true,
    )
  })
})
