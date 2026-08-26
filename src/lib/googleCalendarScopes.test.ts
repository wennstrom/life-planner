import { describe, expect, it } from 'vitest'
import {
  GOOGLE_CALENDAR_SCOPE,
  googleAccountHasCalendarScope,
  shouldMarkGoogleCalendarConnected,
  shouldRepairGoogleCalendarScopes,
} from './googleCalendarScopes'

describe('googleAccountHasCalendarScope', () => {
  it('recognizes the Google Calendar scope among approved scopes', () => {
    expect(
      googleAccountHasCalendarScope(
        `openid email ${GOOGLE_CALENDAR_SCOPE} profile`,
      ),
    ).toBe(true)
  })

  it('rejects identity-only and similarly named scopes', () => {
    expect(googleAccountHasCalendarScope('openid email profile')).toBe(false)
    expect(
      googleAccountHasCalendarScope(
        'https://www.googleapis.com/auth/calendar.readonly',
      ),
    ).toBe(false)
  })
})

describe('Google Calendar connection reconciliation', () => {
  it('marks an unconnected account only while a connect attempt is in flight', () => {
    expect(
      shouldMarkGoogleCalendarConnected({
        googleConnected: false,
        hasCalendarScope: true,
        hasConnectAttempt: true,
      }),
    ).toBe(true)
    expect(
      shouldMarkGoogleCalendarConnected({
        googleConnected: false,
        hasCalendarScope: false,
        hasConnectAttempt: true,
      }),
    ).toBe(false)
    expect(
      shouldMarkGoogleCalendarConnected({
        googleConnected: true,
        hasCalendarScope: true,
        hasConnectAttempt: true,
      }),
    ).toBe(false)
  })

  it('leaves a disconnected account alone on reload even though the scope remains granted', () => {
    expect(
      shouldMarkGoogleCalendarConnected({
        googleConnected: false,
        hasCalendarScope: true,
        hasConnectAttempt: false,
      }),
    ).toBe(false)
  })

  it('repairs only connected Google accounts missing Calendar scope', () => {
    expect(
      shouldRepairGoogleCalendarScopes({
        googleConnected: true,
        hasGoogleAccount: true,
        hasCalendarScope: false,
        hasRepairAttempt: false,
      }),
    ).toBe(true)
    expect(
      shouldRepairGoogleCalendarScopes({
        googleConnected: false,
        hasGoogleAccount: true,
        hasCalendarScope: false,
        hasRepairAttempt: false,
      }),
    ).toBe(false)
    expect(
      shouldRepairGoogleCalendarScopes({
        googleConnected: true,
        hasGoogleAccount: false,
        hasCalendarScope: false,
        hasRepairAttempt: false,
      }),
    ).toBe(false)
    expect(
      shouldRepairGoogleCalendarScopes({
        googleConnected: true,
        hasGoogleAccount: true,
        hasCalendarScope: true,
        hasRepairAttempt: false,
      }),
    ).toBe(false)
  })

  it('does not redirect again after a declined consent screen', () => {
    expect(
      shouldRepairGoogleCalendarScopes({
        googleConnected: true,
        hasGoogleAccount: true,
        hasCalendarScope: false,
        hasRepairAttempt: true,
      }),
    ).toBe(false)
  })
})
