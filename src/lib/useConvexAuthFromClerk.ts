import { useAuth } from '@clerk/tanstack-react-start'
import { useCallback, useMemo } from 'react'
import { getConvexClerkToken } from './convexClerkToken'

/**
 * ConvexProviderWithAuth hook. Replaces ConvexProviderWithClerk so token
 * fetches re-run when Clerk session claims appear after sign-in.
 */
export function useConvexAuthFromClerk() {
  const {
    isLoaded,
    isSignedIn,
    getToken,
    orgId,
    orgRole,
    sessionId,
    sessionClaims,
  } = useAuth()

  const audience = sessionClaims?.aud
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      return await getConvexClerkToken(getToken, {
        skipCache: forceRefreshToken,
        sessionAud: audience,
      })
    },
    [audience, getToken, orgId, orgRole, sessionId],
  )

  return useMemo(
    () => ({
      isLoading: !isLoaded,
      isAuthenticated: isSignedIn ?? false,
      fetchAccessToken,
    }),
    [fetchAccessToken, isLoaded, isSignedIn],
  )
}
