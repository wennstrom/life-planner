import { useMutation, useQuery } from 'convex/react'
import { useEffect, useRef } from 'react'
import { api } from '../../convex/_generated/api'

/** The browser zone to save, or null if there is nothing to save. */
export function timezoneToSync(
  stored: string | null | undefined,
  browser: string | undefined,
): string | null {
  if (stored === undefined || !browser) return null
  return stored === browser ? null : browser
}

function browserTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return undefined
  }
}

/**
 * Saves the browser's IANA zone to `userSettings` when it differs from the
 * stored one, at most once per mount. The server needs it to show agents
 * local times; the UI itself keeps using the browser clock.
 */
export function useSyncTimezone() {
  const settings = useQuery(api.userSettings.get)
  const setTimezone = useMutation(api.userSettings.setTimezone)
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current || settings === undefined) return
    const timezone = timezoneToSync(settings.timezone, browserTimezone())
    attempted.current = true
    if (timezone === null) return
    setTimezone({ timezone }).catch((error: unknown) => {
      console.warn('Could not save timezone', error)
    })
  }, [settings, setTimezone])
}
