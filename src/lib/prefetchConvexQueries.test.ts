import { describe, expect, it, vi } from 'vitest'
import { prefetchConvexQueries } from './prefetchConvexQueries'
import type { QueryClient } from '@tanstack/react-query'

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
    }

    await expect(
      prefetchConvexQueries(queryClient as unknown as QueryClient, [
        { queryKey: ['today'] },
      ]),
    ).resolves.toBeDefined()
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
