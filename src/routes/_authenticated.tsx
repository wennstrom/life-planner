import { Outlet, createFileRoute } from '@tanstack/react-router'
import { AuthGate } from '~/components/auth/AuthGate'
import { AppShell } from '~/components/layout/AppShell'

export const Route = createFileRoute('/_authenticated')({
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
