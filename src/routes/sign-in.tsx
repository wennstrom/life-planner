import { createFileRoute, redirect } from '@tanstack/react-router'
import { convexQuery } from '@convex-dev/react-query'
import { useAuthActions } from '@convex-dev/auth/react'
import { api } from '../../convex/_generated/api'

export const Route = createFileRoute('/sign-in')({
  beforeLoad: async ({ context }) => {
    const authed = await context.queryClient.ensureQueryData(
      convexQuery(api.auth.isAuthenticated, {}),
    )
    if (authed) {
      throw redirect({ to: '/today' })
    }
  },
  component: SignInPage,
})

function SignInPage() {
  const { signIn } = useAuthActions()

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
          Sign in with Google to plan your day and sync your calendar.
        </p>
        <button
          type="button"
          className="btn primary"
          onClick={() => void signIn('google', { redirectTo: '/today' })}
        >
          Continue with Google
        </button>
        <p className="muted" style={{ marginTop: 16, fontSize: 12 }}>
          Requires Google OAuth credentials in Convex env (AUTH_GOOGLE_ID /
          AUTH_GOOGLE_SECRET).
        </p>
      </div>
    </div>
  )
}
