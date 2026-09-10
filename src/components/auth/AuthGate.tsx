import { useAuth } from '@clerk/tanstack-react-start'
import { useConvexAuth } from 'convex/react'
import { Navigate, useLocation } from '@tanstack/react-router'
import { ClerkJwtFailure } from './ClerkJwtFailure'
import type { ReactNode } from 'react'
import { buildSignInSearch } from '~/lib/authRedirect'
import { resolveConvexAuthUiState } from '~/lib/convexAuthUiState'
import { useConvexAuthWaitTimeout } from '~/lib/useConvexAuthWaitTimeout'

export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  const { isLoading, isAuthenticated } = useConvexAuth()
  const location = useLocation()
  const waitingForConvex =
    isLoaded && (isSignedIn ?? false) && !isAuthenticated
  const timedOut = useConvexAuthWaitTimeout(waitingForConvex)

  const state = resolveConvexAuthUiState({
    clerkLoaded: isLoaded,
    clerkSignedIn: isSignedIn ?? false,
    convexLoading: isLoading,
    convexAuthenticated: isAuthenticated,
    timedOut,
  })

  if (state === 'pending') {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        Signing you in…
      </div>
    )
  }

  if (state === 'failed') {
    return (
      <ClerkJwtFailure variant={isLoading ? 'connecting' : 'jwt'} />
    )
  }

  if (state === 'ready') {
    return <>{children}</>
  }

  return (
    <Navigate
      to="/sign-in"
      search={buildSignInSearch(location.pathname)}
      replace
    />
  )
}
