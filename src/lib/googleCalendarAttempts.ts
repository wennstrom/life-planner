/**
 * Records Google Calendar OAuth attempts so they survive the redirect to
 * Google's consent screen and back. Without this, a remount cannot tell an
 * intentional connect from a page load that merely happens to see the Calendar
 * scope on the Clerk account, which made "Disconnect" reconnect on reload and
 * made a declined consent screen redirect forever.
 */

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const CONNECT_KEY = 'googleCalendar.connectAttempt'
const REPAIR_KEY_PREFIX = 'googleCalendar.repairAttempt.'

/** A connect intent older than this is treated as abandoned, not as a redirect return. */
const CONNECT_ATTEMPT_TTL_MS = 10 * 60 * 1000

export type GoogleCalendarAttemptStore = {
  markConnectAttempt: () => void
  hasConnectAttempt: () => boolean
  clearConnectAttempt: () => void
  markRepairAttempt: (userId: string) => void
  hasRepairAttempt: (userId: string) => boolean
  clearRepairAttempt: (userId: string) => void
}

export function createGoogleCalendarAttemptStore(
  storage: StorageLike | null,
  now: () => number = Date.now,
): GoogleCalendarAttemptStore {
  function read(key: string): string | null {
    try {
      return storage?.getItem(key) ?? null
    } catch {
      return null
    }
  }

  function write(key: string, value: string): void {
    try {
      storage?.setItem(key, value)
    } catch {
      // Storage is unavailable (SSR, private mode, quota); attempts simply do
      // not persist and the user falls back to the manual buttons.
    }
  }

  function remove(key: string): void {
    try {
      storage?.removeItem(key)
    } catch {
      // See write().
    }
  }

  function repairKey(userId: string): string {
    return `${REPAIR_KEY_PREFIX}${userId}`
  }

  return {
    markConnectAttempt() {
      write(CONNECT_KEY, String(now()))
    },
    hasConnectAttempt() {
      const raw = read(CONNECT_KEY)
      if (raw === null) return false
      const startedAt = Number(raw)
      if (!Number.isFinite(startedAt)) {
        remove(CONNECT_KEY)
        return false
      }
      if (now() - startedAt > CONNECT_ATTEMPT_TTL_MS) {
        remove(CONNECT_KEY)
        return false
      }
      return true
    },
    clearConnectAttempt() {
      remove(CONNECT_KEY)
    },
    markRepairAttempt(userId) {
      write(repairKey(userId), '1')
    },
    hasRepairAttempt(userId) {
      return read(repairKey(userId)) !== null
    },
    clearRepairAttempt(userId) {
      remove(repairKey(userId))
    },
  }
}

function resolveSessionStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

export const googleCalendarAttempts = createGoogleCalendarAttemptStore(
  resolveSessionStorage(),
)
