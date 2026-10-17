export type ConvexAuthUiState = 'pending' | 'ready' | 'signedOut' | 'failed'

/** The mismatch flag stays in the URL after a logged-out visit. It only
 * describes the session that was already present when the page loaded. */
export function shouldApplyAuthMismatch(
  authMismatch: boolean,
  signedInWhenLoaded: boolean,
): boolean {
  return authMismatch && signedInWhenLoaded
}

export function resolveConvexAuthUiState(input: {
  clerkLoaded: boolean
  clerkSignedIn: boolean
  convexLoading: boolean
  convexAuthenticated: boolean
  timedOut: boolean
  authMismatch?: boolean
}): ConvexAuthUiState {
  if (!input.clerkLoaded) return 'pending'

  if (input.authMismatch && (input.clerkSignedIn || input.convexAuthenticated)) {
    return 'failed'
  }

  if (input.convexAuthenticated) return 'ready'

  // Clerk can be signed in while Convex still reports isLoading=false and
  // isAuthenticated=false (setAuth has not finished). Wait until timeout.
  if (input.clerkSignedIn) {
    return input.timedOut ? 'failed' : 'pending'
  }

  return 'signedOut'
}
