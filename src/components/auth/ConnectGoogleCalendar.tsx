import { CalendarDays } from 'lucide-react'
import { useUser } from '@clerk/tanstack-react-start'
import { useMutation } from 'convex/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { Button } from '~/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover'
import { cn } from '~/lib/utils'
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
  collapsed = false,
  menu = false,
}: {
  googleConnected: boolean
  collapsed?: boolean
  menu?: boolean
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

  if (menu) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5 px-2.5"
            aria-label={
              googleConnected
                ? 'Google Calendar is connected'
                : 'Connect Google Calendar'
            }
          >
            <CalendarDays className="size-3.5" />
            <span>Google</span>
            <span
              className={cn(
                'size-2 rounded-full',
                googleConnected ? 'bg-success' : 'bg-slate-400',
              )}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-3">
          <p className="text-sm font-medium">Google Calendar</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {googleConnected
              ? 'Time blocks sync with your Google Calendar.'
              : 'Connect to sync time blocks with your Google Calendar.'}
          </p>
          <div className="mt-3 flex flex-col gap-1">
            {googleConnected ? (
              <>
                {repairFailed ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => void repairCalendarScopes()}
                  >
                    Retry permission
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => void onDisconnect()}
                >
                  Disconnect
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => void connect()}
              >
                {pending ? 'Connecting…' : 'Connect Google Calendar'}
              </Button>
            )}
          </div>
          {error ? (
            <p className="mt-2 text-[11px] text-destructive">{error}</p>
          ) : null}
        </PopoverContent>
      </Popover>
    )
  }

  if (collapsed) {
    return (
      <div className="flex shrink-0 flex-col items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10"
          disabled={pending}
          onClick={() => void (googleConnected ? onDisconnect() : connect())}
          aria-label={
            googleConnected
              ? 'Disconnect Google Calendar'
              : pending
                ? 'Connecting Google Calendar'
                : 'Connect Google Calendar'
          }
          title={
            googleConnected
              ? 'Disconnect Google Calendar'
              : 'Connect Google Calendar'
          }
        >
          <span
            className={cn(
              'size-3 rounded-full',
              googleConnected ? 'bg-success' : 'bg-slate-400',
            )}
          />
        </Button>
        {error ? (
          <p className="text-[9px] text-center text-destructive px-1">{error}</p>
        ) : null}
      </div>
    )
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
