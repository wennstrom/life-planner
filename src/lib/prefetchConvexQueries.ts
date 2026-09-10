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
  query: Parameters<QueryClient['ensureQueryData']>[0],
): Promise<T | undefined> {
  try {
    return (await queryClient.ensureQueryData(query)) as T
  } catch (error) {
    if (isConvexAuthError(error)) return undefined
    throw error
  }
}

export function prefetchConvexQueries(
  queryClient: QueryClient,
  queries: ReadonlyArray<object>,
) {
  return Promise.all(
    queries.map((query) =>
      ensureAuthenticatedQueryData(
        queryClient,
        query as Parameters<QueryClient['prefetchQuery']>[0],
      ),
    ),
  )
}
