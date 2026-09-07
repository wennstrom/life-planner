import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouteContext,
} from '@tanstack/react-router'
import { ClerkProvider } from '@clerk/tanstack-react-start'
import { auth } from '@clerk/tanstack-react-start/server'
import { shadcn } from '@clerk/themes'
import { createServerFn } from '@tanstack/react-start'
import { ConvexProviderWithAuth } from 'convex/react'
import * as React from 'react'
import type { QueryClient } from '@tanstack/react-query'
import type { ConvexQueryClient } from '@convex-dev/react-query'
import type { ConvexReactClient } from 'convex/react'
import { getConvexClerkToken } from '~/lib/convexClerkToken'
import { useConvexAuthFromClerk } from '~/lib/useConvexAuthFromClerk'
import appCss from '~/styles/app.css?url'

const fetchClerkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const { userId, getToken } = await auth()
    const token = await getConvexClerkToken(getToken)
    return { userId, token }
  } catch (error) {
    console.error('Unable to load Clerk authentication state', error)
    return { userId: null, token: null }
  }
})

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
  convexClient: ConvexReactClient
  convexQueryClient: ConvexQueryClient
}>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Life Planner' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
      },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  notFoundComponent: () => <div>Route not found</div>,
  beforeLoad: async ({ context }) => {
    const { userId, token } = await fetchClerkAuth()
    if (token) {
      context.convexQueryClient.serverHttpClient?.setAuth(token)
    }
    return { userId }
  },
  component: RootComponent,
})

function RootComponent() {
  const { convexClient } = useRouteContext({ from: Route.id })
  return (
    <ClerkProvider appearance={{ theme: shadcn }}>
      <ConvexProviderWithAuth
        client={convexClient}
        useAuth={useConvexAuthFromClerk}
      >
        <RootDocument>
          <Outlet />
        </RootDocument>
      </ConvexProviderWithAuth>
    </ClerkProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
