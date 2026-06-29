import { Navigate, createFileRoute } from '@tanstack/react-router'
import { useAuthActions, useConvexAuth } from '@convex-dev/auth/react'
import { useEffect, useState } from 'react'

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
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--bg)',
      }}
    >
      <div
        className="project-card"
        style={{
          width: 420,
          padding: 32,
          textAlign: 'center',
          ['--accent' as string]: '#6366f1',
        }}
      >
        <div className="brand" style={{ justifyContent: 'center', paddingBottom: 8 }}>
          <span className="brand-mark">◷</span>
          <span className="brand-name">Life Planner</span>
        </div>
        <p className="view-sub" style={{ marginBottom: 24 }}>
          {message ?? 'Sign in with Google to plan your day and sync your calendar.'}
        </p>
        {onSignIn ? (
          <button
            type="button"
            className="btn primary"
            disabled={isSigningIn}
            onClick={onSignIn}
          >
            {isSigningIn ? 'Redirecting…' : 'Continue with Google'}
          </button>
        ) : null}
        {error ? (
          <p style={{ marginTop: 16, fontSize: 13, color: '#dc2626' }}>{error}</p>
        ) : null}
        {googleRedirectUri ? (
          <p className="muted" style={{ marginTop: 16, fontSize: 12, lineHeight: 1.5 }}>
            If Google shows <strong>redirect_uri_mismatch</strong>, add this exact URI
            under Authorized redirect URIs in Google Cloud Console:
            <br />
            <code style={{ fontSize: 11, wordBreak: 'break-all' }}>
              {googleRedirectUri}
            </code>
          </p>
        ) : null}
      </div>
    </div>
  )
}
