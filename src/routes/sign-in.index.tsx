import { createFileRoute } from '@tanstack/react-router'
import { SignInScreen } from '~/components/auth/AuthScreen'

export const Route = createFileRoute('/sign-in/')({
  validateSearch: (
    raw: Record<string, unknown>,
  ): { redirect?: string; authMismatch?: 1 } => ({
    redirect: typeof raw.redirect === 'string' ? raw.redirect : undefined,
    authMismatch:
      raw.authMismatch === 1 || raw.authMismatch === '1' ? 1 : undefined,
  }),
  component: SignInRoute,
})

function SignInRoute() {
  const { redirect, authMismatch } = Route.useSearch()
  return <SignInScreen redirect={redirect} authMismatch={authMismatch === 1} />
}
