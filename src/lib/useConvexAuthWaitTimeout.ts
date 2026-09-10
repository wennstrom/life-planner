import { useEffect, useState } from 'react'

const AUTH_WAIT_MS = 10_000

/** Starts a wait timer only while Convex is catching up to a Clerk session. */
export function useConvexAuthWaitTimeout(isWaiting: boolean) {
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (!isWaiting) {
      setTimedOut(false)
      return
    }

    const timeout = window.setTimeout(() => setTimedOut(true), AUTH_WAIT_MS)
    return () => window.clearTimeout(timeout)
  }, [isWaiting])

  return timedOut
}
