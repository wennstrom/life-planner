import { useUser } from '@clerk/tanstack-react-start'
import { useMutation } from 'convex/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { Button } from '~/components/ui/button'
import { googleCalendarAttempts } from '~/lib/googleCalendarAttempts'
import {
  GOOGLE_CALENDAR_SCOPE,
  googleAccountHasCalendarScope,
  shouldMarkGoogleCalendarConnected,
  shouldRepairGoogleCalendarScopes,
} from '~/lib/googleCalendarScopes'

function followVerificationRedirect(redirect: URL | null | undefined): boolean {
  if (!redirect) return false
  window.location.href = redirect.href
  return true
}

export function ConnectGoogleCalendar({
  googleConnected,
}: {
  googleConnected: boolean
}) {
  const { user } = useUser()
  const markConnected = useMutation(api.google.connection.markConnected)
  const disconnect = useMutation(api.google.connection.disconnect)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [repairFailed, setRepairFailed] = useState(false)
  const markConnectedInFlight = useRef(false)
  const repairInFlight = useRef(false)
  const userId = user?.id
  const google = user?.externalAccounts.find(
    (account) => account.provider === 'google',
  )
  const hasCalendarScope = google
    ? googleAccountHasCalendarScope(google.approvedScopes)
    : false

  useEffect(() => {
    if (
      markConnectedInFlight.current ||
      !shouldMarkGoogleCalendarConnected({
        googleConnected,
        hasCalendarScope,
        hasConnectAttempt: googleCalendarAttempts.hasConnectAttempt(),
      })
    ) {
      return
    }

    markConnectedInFlight.current = true
    setError(null)
    setPending(true)
    void markConnected({})
      .then(() => {
        googleCalendarAttempts.clearConnectAttempt()
      })
      .catch((err: unknown) => {
        markConnectedInFlight.current = false
        setError(
          err instanceof Error
            ? err.message
            : 'Could not finish connecting Google Calendar',
        )
      })
      .finally(() => {
        setPending(false)
      })
  }, [googleConnected, hasCalendarScope, markConnected])

  const repairCalendarScopes = useCallback(async () => {
    if (!google || !userId || repairInFlight.current) return

    repairInFlight.current = true
    setRepairFailed(false)
    setError(null)
    setPending(true)
    // Recorded before the redirect so the return trip knows an attempt happened.
    googleCalendarAttempts.markRepairAttempt(userId)
    try {
      const reauthorized = await google.reauthorize({
        redirectUrl: window.location.href,
        additionalScopes: [GOOGLE_CALENDAR_SCOPE],
      })
      if (
        followVerificationRedirect(
          reauthorized.verification?.externalVerificationRedirectURL,
        )
      ) {
        return
      }
      if (!googleAccountHasCalendarScope(reauthorized.approvedScopes)) {
        throw new Error('Google Calendar permission was not granted')
      }
      googleCalendarAttempts.clearRepairAttempt(userId)
    } catch (err) {
      setRepairFailed(true)
      setError(
        err instanceof Error
          ? err.message
          : 'Could not restore Google Calendar access',
      )
    } finally {
      repairInFlight.current = false
      setPending(false)
    }
  }, [google, userId])

  useEffect(() => {
    if (!userId) return

    if (hasCalendarScope) {
      googleCalendarAttempts.clearRepairAttempt(userId)
      return
    }

    const hasRepairAttempt = googleCalendarAttempts.hasRepairAttempt(userId)
    if (
      shouldRepairGoogleCalendarScopes({
        googleConnected,
        hasGoogleAccount: Boolean(google),
        hasCalendarScope,
        hasRepairAttempt,
      })
    ) {
      void repairCalendarScopes()
      return
    }

    // An attempt already came back without the scope, so wait for an explicit
    // Retry instead of bouncing the user to Google again.
    if (hasRepairAttempt && googleConnected && google) {
      setRepairFailed(true)
    }
  }, [google, googleConnected, hasCalendarScope, repairCalendarScopes, userId])

  async function connect() {
    if (!user) return
    setError(null)
    setPending(true)
    // Set before any redirect: on the way back this is what distinguishes a
    // deliberate connect from an ordinary page load.
    googleCalendarAttempts.markConnectAttempt()
    try {
      let googleAccount = user.externalAccounts.find(
        (account) => account.provider === 'google',
      )

      if (!googleAccount) {
        const created = await user.createExternalAccount({
          strategy: 'oauth_google',
          redirectUrl: window.location.href,
          additionalScopes: [GOOGLE_CALENDAR_SCOPE],
        })
        if (
          followVerificationRedirect(
            created.verification?.externalVerificationRedirectURL,
          )
        ) {
          return
        }
        googleAccount = created
      }

      if (!googleAccountHasCalendarScope(googleAccount.approvedScopes)) {
        const reauthorized = await googleAccount.reauthorize({
          redirectUrl: window.location.href,
          additionalScopes: [GOOGLE_CALENDAR_SCOPE],
        })
        if (
          followVerificationRedirect(
            reauthorized.verification?.externalVerificationRedirectURL,
          )
        ) {
          return
        }
        googleAccount = reauthorized
      }

      if (!googleAccountHasCalendarScope(googleAccount.approvedScopes)) {
        throw new Error('Google Calendar permission was not granted')
      }
      await markConnected({})
      googleCalendarAttempts.clearConnectAttempt()
    } catch (err) {
      googleCalendarAttempts.clearConnectAttempt()
      setError(
        err instanceof Error
          ? err.message
          : 'Could not connect Google Calendar',
      )
    } finally {
      setPending(false)
    }
  }

  async function onDisconnect() {
    setPending(true)
    setError(null)
    try {
      await disconnect({})
      // Drop any lingering intent so a reload cannot reconnect the account.
      googleCalendarAttempts.clearConnectAttempt()
      markConnectedInFlight.current = false
      if (userId) {
        googleCalendarAttempts.clearRepairAttempt(userId)
      }
      setRepairFailed(false)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not disconnect calendar',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-1 px-3">
      {googleConnected ? (
        <>
          {repairFailed ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => void repairCalendarScopes()}
            >
              Retry Google Calendar permission
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => void onDisconnect()}
          >
            Disconnect Google Calendar
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => void connect()}
        >
          {pending ? 'Connecting…' : 'Connect Google Calendar'}
        </Button>
      )}
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  )
}
