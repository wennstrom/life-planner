import { describe, expect, it } from 'vitest'
import { parseClerkOAuthTokens } from './clerkTokens'

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar'

describe('parseClerkOAuthTokens', () => {
  it('reads a bare array response', () => {
    expect(
      parseClerkOAuthTokens([{ token: 'ya29.abc', scopes: [CALENDAR_SCOPE] }]),
    ).toEqual({ token: 'ya29.abc', scopes: [CALENDAR_SCOPE] })
  })

  it('reads a paginated envelope response', () => {
    expect(
      parseClerkOAuthTokens({
        data: [{ token: 'ya29.abc', scopes: [CALENDAR_SCOPE] }],
        total_count: 1,
      }),
    ).toEqual({ token: 'ya29.abc', scopes: [CALENDAR_SCOPE] })
  })

  it('prefers the calendar-scoped token when multiple entries exist', () => {
    expect(
      parseClerkOAuthTokens([
        { token: 'no-scope', scopes: [] },
        { token: 'cal', scopes: [CALENDAR_SCOPE] },
      ]),
    ).toEqual({ token: 'cal', scopes: [CALENDAR_SCOPE] })
  })

  it('skips entries without a usable token', () => {
    expect(
      parseClerkOAuthTokens({
        data: [
          { scopes: [CALENDAR_SCOPE] },
          { token: '', scopes: [] },
          { token: 'ya29.second' },
        ],
      }),
    ).toEqual({ token: 'ya29.second', scopes: [] })
  })

  it('defaults missing or malformed scopes to an empty list', () => {
    expect(parseClerkOAuthTokens([{ token: 'ya29.abc' }])).toEqual({
      token: 'ya29.abc',
      scopes: [],
    })
    expect(
      parseClerkOAuthTokens([
        { token: 'ya29.abc', scopes: [CALENDAR_SCOPE, 7] },
      ]),
    ).toEqual({ token: 'ya29.abc', scopes: [CALENDAR_SCOPE] })
  })

  it('returns null for empty, unexpected, or error-shaped payloads', () => {
    expect(parseClerkOAuthTokens([])).toBeNull()
    expect(parseClerkOAuthTokens({ data: [] })).toBeNull()
    expect(
      parseClerkOAuthTokens({ errors: [{ message: 'not found' }] }),
    ).toBeNull()
    expect(parseClerkOAuthTokens(null)).toBeNull()
    expect(parseClerkOAuthTokens('nope')).toBeNull()
  })
})
