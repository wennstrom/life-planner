import { SignOutButton } from '@clerk/tanstack-react-start'
import { Button } from '~/components/ui/button'
import type { ReactNode } from 'react'

type FailureVariant = 'jwt' | 'authMismatch' | 'connecting'

const failureCopy: Record<
  FailureVariant,
  { message: string; guidance: ReactNode }
> = {
  jwt: {
    message:
      'You’re signed in with Clerk, but Convex could not verify the session JWT.',
    guidance: (
      <>
        Confirm the Clerk Convex integration (JWT template{' '}
        <code className="rounded bg-muted px-1">convex</code>) and{' '}
        <code className="rounded bg-muted px-1">CLERK_JWT_ISSUER_DOMAIN</code>{' '}
        on the Convex deployment.
      </>
    ),
  },
  authMismatch: {
    message: 'Your browser and server session state are inconsistent.',
    guidance:
      'Sign out, then sign in again. If this continues, verify the Clerk server keys.',
  },
  connecting: {
    message: 'Still connecting to Convex…',
    guidance:
      'The connection is taking longer than expected. Sign out and try again.',
  },
}

export function ClerkJwtFailure({
  variant = 'jwt',
}: {
  variant?: FailureVariant
}) {
  const copy = failureCopy[variant]

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <p className="text-sm text-foreground">{copy.message}</p>
      <p className="text-xs text-muted-foreground">{copy.guidance}</p>
      <SignOutButton>
        <Button type="button" variant="outline" size="sm">
          Sign out and try again
        </Button>
      </SignOutButton>
    </div>
  )
}
