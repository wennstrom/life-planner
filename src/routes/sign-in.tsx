import { Navigate, createFileRoute } from '@tanstack/react-router'
import { useAuthActions, useConvexAuth } from '@convex-dev/auth/react'
import { useEffect, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { Card } from '~/components/ui/card'
import { Button } from '~/components/ui/button'

export const Route = createFileRoute('/sign-in')({
  component: SignInPage,
})

function SignInPage() {
  const { isLoading, isAuthenticated } = useConvexAuth()
  const { signIn } = useAuthActions()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authTimedOut, setAuthTimedOut] = useState(false)

  useEffect(() => {
    const timeout = window.setTimeout(() => setAuthTimedOut(true), 10_000)
    return () => window.clearTimeout(timeout)
  }, [])

  const convexSiteUrl = (import.meta as any).env.VITE_CONVEX_SITE_URL as
    | string
    | undefined
  const googleRedirectUri = convexSiteUrl
    ? `${convexSiteUrl}/api/auth/callback/google`
    : null

  if (isLoading && !authTimedOut) {
    return <AuthScreen message="Checking session…" />
  }

  if (isAuthenticated) {
    return <Navigate to="/today" replace />
  }

  async function handleSignIn() {
    setError(null)
    setIsSigningIn(true)
    try {
      const result = await signIn('google', { redirectTo: '/today' })
      if (result.redirect) {
        return
      }
      if (result.signingIn) {
        window.location.href = '/today'
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Sign-in failed. Please try again.'
      setError(message)
    } finally {
      setIsSigningIn(false)
    }
  }

  return (
    <AuthScreen
      error={error}
      googleRedirectUri={googleRedirectUri}
      isSigningIn={isSigningIn}
      onSignIn={() => void handleSignIn()}
    />
  )
}

function AuthScreen({
  message,
  error,
  googleRedirectUri,
  isSigningIn,
  onSignIn,
}: {
  message?: string
  error?: string | null
  googleRedirectUri?: string | null
  isSigningIn?: boolean
  onSignIn?: () => void
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-background text-foreground">
      <Card className="w-[420px] p-8 text-center shadow-soft">
        <div className="flex items-center justify-center gap-2.5 pb-2 text-lg font-bold">
          <span className="grid size-7 place-items-center rounded-[9px] bg-primary text-primary-foreground">
            <CalendarClock className="size-4" />
          </span>
          <span>Life Planner</span>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">
          {message ??
            'Sign in with Google to plan your day and sync your calendar.'}
        </p>
        {onSignIn ? (
          <Button
            type="button"
            className="w-full"
            disabled={isSigningIn}
            onClick={onSignIn}
          >
            {isSigningIn ? 'Redirecting…' : 'Continue with Google'}
          </Button>
        ) : null}
        {error ? (
          <p className="mt-4 text-[13px] text-destructive">{error}</p>
        ) : null}
        {googleRedirectUri ? (
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            If Google shows <strong>redirect_uri_mismatch</strong>, add this exact
            URI under Authorized redirect URIs in Google Cloud Console:
            <br />
            <code className="break-all text-[11px]">{googleRedirectUri}</code>
          </p>
        ) : null}
      </Card>
    </div>
  )
}
