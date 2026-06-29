import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { convexQuery } from '@convex-dev/react-query'
import { api } from '../../convex/_generated/api'
import { AppShell } from '~/components/layout/AppShell'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context }) => {
    const authed = await context.queryClient.ensureQueryData(
      convexQuery(api.auth.isAuthenticated, {}),
    )
    if (!authed) {
      throw redirect({ to: '/sign-in' })
    }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
