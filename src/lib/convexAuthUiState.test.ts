import { describe, expect, it } from 'vitest'
import { resolveConvexAuthUiState } from './convexAuthUiState'

describe('resolveConvexAuthUiState', () => {
  it('waits while Clerk is signed in and Convex is still connecting', () => {
    expect(
      resolveConvexAuthUiState({
        clerkLoaded: true,
        clerkSignedIn: true,
        convexLoading: true,
        convexAuthenticated: false,
        timedOut: false,
      }),
    ).toBe('pending')
  })

  it('does not treat the signed-in gap as a JWT failure', () => {
    // ConvexProviderWithAuth can report isLoading=false + isAuthenticated=false
    // after a client sign-in until setAuth finishes. That is not a rejection.
    expect(
      resolveConvexAuthUiState({
        clerkLoaded: true,
        clerkSignedIn: true,
        convexLoading: false,
        convexAuthenticated: false,
        timedOut: false,
      }),
    ).toBe('pending')
  })

  it('is ready only after Convex accepts the session', () => {
    expect(
      resolveConvexAuthUiState({
        clerkLoaded: true,
        clerkSignedIn: true,
        convexLoading: false,
        convexAuthenticated: true,
        timedOut: false,
      }),
    ).toBe('ready')
  })

  it('fails after waiting too long for Convex to accept the session', () => {
    expect(
      resolveConvexAuthUiState({
        clerkLoaded: true,
        clerkSignedIn: true,
        convexLoading: false,
        convexAuthenticated: false,
        timedOut: true,
      }),
    ).toBe('failed')
  })

  it('is signed out when Clerk has no session', () => {
    expect(
      resolveConvexAuthUiState({
        clerkLoaded: true,
        clerkSignedIn: false,
        convexLoading: false,
        convexAuthenticated: false,
        timedOut: false,
      }),
    ).toBe('signedOut')
  })

  it('fails immediately on a server/client session mismatch', () => {
    expect(
      resolveConvexAuthUiState({
        clerkLoaded: true,
        clerkSignedIn: true,
        convexLoading: false,
        convexAuthenticated: true,
        timedOut: false,
        authMismatch: true,
      }),
    ).toBe('failed')
  })
})
