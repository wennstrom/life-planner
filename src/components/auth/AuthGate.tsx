import { useConvexAuth } from '@convex-dev/auth/react'
import { Navigate } from '@tanstack/react-router'
import {  useEffect, useState } from 'react'
import type {ReactNode} from 'react';

export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth()
  const [authTimedOut, setAuthTimedOut] = useState(false)

  useEffect(() => {
    const timeout = window.setTimeout(() => setAuthTimedOut(true), 10_000)
    return () => window.clearTimeout(timeout)
  }, [])

  const waitingForAuth = isLoading && !authTimedOut

  if (waitingForAuth) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        Signing you in…
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/sign-in" replace />
  }

  return <>{children}</>
}
