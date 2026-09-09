/**
 * Clerk tokens for Convex.
 *
 * Convex's ConvexProviderWithClerk decides session vs JWT-template from
 * `sessionClaims.aud === "convex"`, but memoizes that callback on orgId/orgRole
 * only. Personal accounts never change those fields, so after a client-side
 * sign-in the callback keeps requesting `getToken({ template: "convex" })`.
 * With the native Clerk Convex integration that template often does not exist,
 * the error is swallowed, and Convex stays unauthenticated while Clerk is
 * signed in — even though a decoded session JWT has the right iss/aud.
 */

export type ClerkGetToken = (options?: {
  template?: string
  skipCache?: boolean
}) => Promise<string | null>

export function clerkAudienceIsConvex(aud: unknown): boolean {
  if (aud === 'convex') return true
  return Array.isArray(aud) && aud.includes('convex')
}

export async function getConvexClerkToken(
  getToken: ClerkGetToken,
  options: { skipCache?: boolean; sessionAud?: unknown } = {},
): Promise<string | null> {
  const skipCache = options.skipCache
  const session = () => getToken({ skipCache })
  const template = () => getToken({ template: 'convex', skipCache })

  if (clerkAudienceIsConvex(options.sessionAud)) {
    return (await tryToken(session)) ?? (await tryToken(template))
  }

  return (await tryToken(template)) ?? (await tryToken(session))
}

async function tryToken(fetchToken: () => Promise<string | null>) {
  try {
    return (await fetchToken()) ?? null
  } catch {
    return null
  }
}
