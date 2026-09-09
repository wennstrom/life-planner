import type { QueryClient } from '@tanstack/react-query'

export function prefetchConvexQueries(
  queryClient: QueryClient,
  queries: ReadonlyArray<object>,
) {
  return Promise.all(
    queries.map((query) =>
      queryClient.ensureQueryData(
        query as Parameters<QueryClient['prefetchQuery']>[0],
      ),
    ),
  )
}
