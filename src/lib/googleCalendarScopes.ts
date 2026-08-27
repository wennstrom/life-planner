export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar'

export function googleAccountHasCalendarScope(approvedScopes: string): boolean {
  return approvedScopes.split(' ').includes(GOOGLE_CALENDAR_SCOPE)
}

/**
 * Only reconcile the backend row when the user actually asked to connect: the
 * Calendar scope can be present on the Clerk account long after a Disconnect,
 * and marking it connected on every mount would undo that.
 */
export function shouldMarkGoogleCalendarConnected({
  googleConnected,
  hasCalendarScope,
  hasConnectAttempt,
}: {
  googleConnected: boolean
  hasCalendarScope: boolean
  hasConnectAttempt: boolean
}): boolean {
  return !googleConnected && hasCalendarScope && hasConnectAttempt
}

/**
 * Auto-repair runs at most once per session: a declined consent screen returns
 * to the same state, so a second automatic redirect would loop.
 */
export function shouldRepairGoogleCalendarScopes({
  googleConnected,
  hasGoogleAccount,
  hasCalendarScope,
  hasRepairAttempt,
}: {
  googleConnected: boolean
  hasGoogleAccount: boolean
  hasCalendarScope: boolean
  hasRepairAttempt: boolean
}): boolean {
  return (
    googleConnected &&
    hasGoogleAccount &&
    !hasCalendarScope &&
    !hasRepairAttempt
  )
}
