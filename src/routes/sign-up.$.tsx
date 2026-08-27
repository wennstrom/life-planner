import { createFileRoute } from '@tanstack/react-router'
import { SignUpScreen } from '~/components/auth/AuthScreen'

export const Route = createFileRoute('/sign-up/$')({
  validateSearch: (raw: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof raw.redirect === 'string' ? raw.redirect : undefined,
  }),
  component: SignUpRoute,
})

function SignUpRoute() {
  const { redirect } = Route.useSearch()
  return <SignUpScreen redirect={redirect} />
}
