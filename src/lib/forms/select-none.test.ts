import { describe, expect, it } from 'vitest'
import { fromSelectValue, toSelectValue } from './select-none'

describe('select none mapping', () => {
  it('maps empty schema value to the Select sentinel', () => {
    expect(toSelectValue('')).toBe('none')
  })

  it('passes through real ids', () => {
    expect(toSelectValue('abc')).toBe('abc')
    expect(fromSelectValue('abc')).toBe('abc')
  })

  it('maps the Select sentinel back to empty string', () => {
    expect(fromSelectValue('none')).toBe('')
  })
})
