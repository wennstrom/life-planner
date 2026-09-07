import { describe, expect, it, vi } from 'vitest'
import { clerkAudienceIsConvex, getConvexClerkToken } from './convexClerkToken'

describe('clerkAudienceIsConvex', () => {
  it('accepts the Convex native session audience', () => {
    expect(clerkAudienceIsConvex('convex')).toBe(true)
    expect(clerkAudienceIsConvex(['convex'])).toBe(true)
    expect(clerkAudienceIsConvex(['clerk', 'convex'])).toBe(true)
  })

  it('rejects other audiences', () => {
    expect(clerkAudienceIsConvex(undefined)).toBe(false)
    expect(clerkAudienceIsConvex('https://example.clerk.accounts.dev')).toBe(
      false,
    )
    expect(clerkAudienceIsConvex(['https://example.clerk.accounts.dev'])).toBe(
      false,
    )
  })
})

describe('getConvexClerkToken', () => {
  it('uses the session token when Clerk already minted aud=convex', async () => {
    const getToken = vi.fn(async (options?: { template?: string }) => {
      if (options?.template) {
        throw new Error('No JWT template exists with name: convex')
      }
      return 'session.jwt'
    })

    await expect(
      getConvexClerkToken(getToken, { sessionAud: 'convex' }),
    ).resolves.toBe('session.jwt')
    expect(getToken).toHaveBeenCalledWith({ skipCache: undefined })
    expect(getToken).not.toHaveBeenCalledWith(
      expect.objectContaining({ template: 'convex' }),
    )
  })

  it('treats aud=["convex"] as the native session token', async () => {
    const getToken = vi.fn(async () => 'session.jwt')

    await expect(
      getConvexClerkToken(getToken, { sessionAud: ['convex'] }),
    ).resolves.toBe('session.jwt')
  })

  it('falls back to the session token when the convex JWT template is missing', async () => {
    const getToken = vi.fn(async (options?: { template?: string }) => {
      if (options?.template === 'convex') {
        throw new Error('No JWT template exists with name: convex')
      }
      return 'session.jwt'
    })

    await expect(getConvexClerkToken(getToken, {})).resolves.toBe('session.jwt')
  })

  it('uses the JWT template when the session has a non-Convex audience', async () => {
    const getToken = vi.fn(async (options?: { template?: string }) => {
      if (options?.template === 'convex') return 'template.jwt'
      return 'session.jwt'
    })

    await expect(
      getConvexClerkToken(getToken, {
        sessionAud: 'https://example.clerk.accounts.dev',
      }),
    ).resolves.toBe('template.jwt')
  })

  it('returns null when Clerk cannot mint either token', async () => {
    const getToken = vi.fn(async () => {
      throw new Error('not signed in')
    })

    await expect(getConvexClerkToken(getToken, {})).resolves.toBeNull()
  })
})
