import { describe, expect, it } from 'vitest'
import {
  SIDEBAR_COLLAPSED_KEY,
  parseSidebarCollapsed,
} from './sidebarCollapsed'

describe('parseSidebarCollapsed', () => {
  it('treats missing storage as expanded', () => {
    expect(parseSidebarCollapsed(null)).toBe(false)
  })

  it('treats 1 and true as collapsed', () => {
    expect(parseSidebarCollapsed('1')).toBe(true)
    expect(parseSidebarCollapsed('true')).toBe(true)
  })

  it('treats other values as expanded', () => {
    expect(parseSidebarCollapsed('0')).toBe(false)
    expect(parseSidebarCollapsed('false')).toBe(false)
  })
})

describe('SIDEBAR_COLLAPSED_KEY', () => {
  it('uses a stable localStorage key', () => {
    expect(SIDEBAR_COLLAPSED_KEY).toBe('life-planner.sidebar-collapsed')
  })
})
