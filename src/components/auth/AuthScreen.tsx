import { SignIn, SignUp, useAuth } from '@clerk/tanstack-react-start'
import { Navigate } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'
import { ClerkJwtFailure } from './ClerkJwtFailure'
import type { ReactNode } from 'react'
import { getSafeRedirectPath } from '~/lib/authRedirect'

function AuthScreen({
  children,
  redirect,
  authMismatch,
}: {
  children: ReactNode
  redirect: string | undefined
  authMismatch: boolean
}) {
  const { isLoaded, isSignedIn } = useAuth()
  const { isLoading: convexLoading, isAuthenticated } = useConvexAuth()

  if (!isLoaded) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        Checking session…
      </div>
    )
  }

  // A server/client session mismatch must never navigate back to a protected route.
  if (authMismatch && (isSignedIn || isAuthenticated)) {
    return <ClerkJwtFailure variant="authMismatch" />
  }

  // Wait for Convex to accept or reject the Clerk JWT.
  if (isSignedIn && convexLoading) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        Checking session…
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to={getSafeRedirectPath(redirect)} replace />
  }

  // Clerk session exists but Convex rejected the JWT. Do NOT render <SignIn />
  // here — Clerk would force-redirect into the protected route repeatedly.
  if (isSignedIn) {
    return <ClerkJwtFailure />
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      {children}
    </div>
  )
}

/**
 * Rendered by both `/sign-in` and its catch-all child, because Clerk's path
 * routing walks the user through sub-paths such as `/sign-in/sso-callback` and
 * `/sign-in/factor-one`.
 */
export function SignInScreen({
  redirect,
  authMismatch = false,
}: {
  redirect: string | undefined
  authMismatch?: boolean
}) {
  const redirectPath = getSafeRedirectPath(redirect)

  return (
    <AuthScreen redirect={redirect} authMismatch={authMismatch}>
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        forceRedirectUrl={redirectPath}
      />
    </AuthScreen>
  )
}

/** Sign-up counterpart to {@link SignInScreen}, including `/sign-up/verify-email-address`. */
export function SignUpScreen({ redirect }: { redirect: string | undefined }) {
  const redirectPath = getSafeRedirectPath(redirect)

  return (
    <AuthScreen redirect={redirect} authMismatch={false}>
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl={redirectPath}
      />
    </AuthScreen>
  )
}
