import { describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { prefetchConvexQueries } from './prefetchConvexQueries'

describe('prefetchConvexQueries', () => {
  it('starts every query before waiting for the first to finish', async () => {
    const started: string[] = []
    const queryClient = {
      ensureQueryData: vi.fn(async (query: { queryKey: readonly [string] }) => {
        started.push(query.queryKey[0])
        await new Promise((resolve) => setTimeout(resolve, 20))
        return query.queryKey[0]
      }),
    }

    const pending = prefetchConvexQueries(queryClient as unknown as QueryClient, [
      { queryKey: ['a'] },
      { queryKey: ['b'] },
      { queryKey: ['c'] },
    ])

    await Promise.resolve()
    expect(started).toEqual(['a', 'b', 'c'])
    await pending
  })

  it('does not fail the route when Convex is not authenticated yet', async () => {
    const queryClient = {
      ensureQueryData: vi.fn(async () => {
        throw new Error('Not authenticated')
      }),
      removeQueries: vi.fn(),
    }

    await expect(
      prefetchConvexQueries(queryClient as unknown as QueryClient, [
        { queryKey: ['today'] },
      ]),
    ).resolves.toBeDefined()
  })

  it('drops a query that failed before Convex authenticated so the page refetches', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const queryKey = ['convexQuery', 'today:get', {}]

    await prefetchConvexQueries(queryClient, [
      {
        queryKey,
        queryFn: () => Promise.reject(new Error('Not authenticated')),
      },
    ])

    expect(queryClient.getQueryCache().find({ queryKey, exact: true })).toBe(
      undefined,
    )
  })

  it('keeps unrelated cached queries when one is not authenticated yet', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryClient.setQueryData(['other'], 'kept')

    await prefetchConvexQueries(queryClient, [
      {
        queryKey: ['today'],
        queryFn: () => Promise.reject(new Error('Not authenticated')),
      },
    ])

    expect(queryClient.getQueryData(['other'])).toBe('kept')
  })

  it('still throws unexpected query errors', async () => {
    const queryClient = {
      ensureQueryData: vi.fn(async () => {
        throw new Error('boom')
      }),
    }

    await expect(
      prefetchConvexQueries(queryClient as unknown as QueryClient, [
        { queryKey: ['today'] },
      ]),
    ).rejects.toThrow('boom')
  })
})
