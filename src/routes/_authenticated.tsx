import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { AuthGate } from '~/components/auth/AuthGate'
import { AppShell } from '~/components/layout/AppShell'
import { buildSignInSearch } from '~/lib/authRedirect'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => {
    // Root beforeLoad supplies the Clerk session. Convex remains gated by AuthGate.
    if (!context.userId) {
      throw redirect({
        to: '/sign-in',
        search: buildSignInSearch(location.pathname, true),
      })
    }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  return (
    <AuthGate>
      <AppShell>
        <Outlet />
      </AppShell>
    </AuthGate>
  )
}
