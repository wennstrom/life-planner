import { describe, expect, it } from 'vitest'
import { buildSignInSearch, getSafeRedirectPath } from './authRedirect'

describe('getSafeRedirectPath', () => {
  it('defaults to /today', () => {
    expect(getSafeRedirectPath(undefined)).toBe('/today')
    expect(getSafeRedirectPath('')).toBe('/today')
  })

  it('allows same-origin relative paths', () => {
    expect(getSafeRedirectPath('/projects')).toBe('/projects')
  })

  it('rejects open redirects', () => {
    expect(getSafeRedirectPath('https://evil.example')).toBe('/today')
    expect(getSafeRedirectPath('//evil.example')).toBe('/today')
    expect(getSafeRedirectPath('/\\evil.example')).toBe('/today')
    expect(getSafeRedirectPath('/projects\\evil.example')).toBe('/today')
  })
})

describe('buildSignInSearch', () => {
  it('omits redirect when path is /today', () => {
    expect(buildSignInSearch('/today')).toEqual({})
  })

  it('includes redirect for other paths', () => {
    expect(buildSignInSearch('/projects')).toEqual({
      redirect: '/projects',
    })
  })

  it('marks server and client authentication mismatches', () => {
    expect(buildSignInSearch('/projects', true)).toEqual({
      redirect: '/projects',
      authMismatch: 1,
    })
  })
})
