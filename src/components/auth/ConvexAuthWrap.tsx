import { ConvexAuthProvider } from '@convex-dev/auth/react'
import type { ConvexReactClient } from 'convex/react'
import type { ReactNode } from 'react'

export function ConvexAuthWrap({
  client,
  children,
}: {
  client: ConvexReactClient
  children: ReactNode
}) {
  return (
    <ConvexAuthProvider
      client={client}
      replaceURL={(relativeUrl) => {
        // Convex Auth must clear ?code= from window.location; TanStack history
        // alone does not always update the browser URL during SSR/hydration.
        window.history.replaceState({}, '', relativeUrl)
      }}
    >
      {children}
    </ConvexAuthProvider>
  )
}
