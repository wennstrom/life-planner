import type { QueryClient } from '@tanstack/react-query'

export function isConvexAuthError(error: unknown): boolean {
  if (error instanceof Error && error.message.includes('Not authenticated')) {
    return true
  }
  if (error instanceof Error && error.cause !== undefined) {
    return isConvexAuthError(error.cause)
  }
  return false
}

export async function ensureAuthenticatedQueryData<T>(
  queryClient: QueryClient,
  query: object,
): Promise<T | undefined> {
  const options = query as Parameters<QueryClient['ensureQueryData']>[0]
  try {
    return (await queryClient.ensureQueryData(options)) as T
  } catch (error) {
    if (isConvexAuthError(error)) {
      // Right after sign-in, Clerk navigates before the Convex socket has
      // authenticated. Drop the failed entry: a suspense query never retries a
      // cached error on mount, and ConvexQueryClient ignores subscription
      // results for queries without data, so the page would stay broken until
      // a reload. AuthGate holds the page until Convex is ready to refetch.
      queryClient.removeQueries({ queryKey: options.queryKey, exact: true })
      return undefined
    }
    throw error
  }
}

export function prefetchConvexQueries(
  queryClient: QueryClient,
  queries: ReadonlyArray<object>,
) {
  return Promise.all(
    queries.map((query) =>
      ensureAuthenticatedQueryData(queryClient, query),
    ),
  )
}
