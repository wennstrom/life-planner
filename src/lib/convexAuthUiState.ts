export type ConvexAuthUiState = 'pending' | 'ready' | 'signedOut' | 'failed'

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
