import { useAuth } from '@clerk/tanstack-react-start'
import { useConvexAuth } from 'convex/react'
import { Navigate, useLocation } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ClerkJwtFailure } from './ClerkJwtFailure'
import type { ReactNode } from 'react'
import { buildSignInSearch } from '~/lib/authRedirect'

export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  const { isLoading, isAuthenticated } = useConvexAuth()
  const location = useLocation()
  const [authTimedOut, setAuthTimedOut] = useState(false)

  useEffect(() => {
    const timeout = window.setTimeout(() => setAuthTimedOut(true), 10_000)
    return () => window.clearTimeout(timeout)
  }, [])

  const waitingForClerk = !isLoaded
  const waitingForConvex = isSignedIn && isLoading && !authTimedOut

  if (waitingForClerk || waitingForConvex) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        Signing you in…
      </div>
    )
  }

  if (isSignedIn && isLoading && authTimedOut) {
    return <ClerkJwtFailure variant="connecting" />
  }

  if (isAuthenticated) {
    return <>{children}</>
  }

  // Clerk session present but Convex JWT rejected — avoid Navigate to /sign-in
  // (SignIn forceRedirect would loop with this gate).
  if (isSignedIn) {
    return <ClerkJwtFailure />
  }

  return (
    <Navigate
      to="/sign-in"
      search={buildSignInSearch(location.pathname)}
      replace
    />
  )
}
