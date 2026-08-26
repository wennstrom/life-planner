import { createClerkClient } from '@clerk/backend'

export type ClerkGoogleToken = {
  token: string
  scopes: Array<string>
}

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar'

/**
 * Clerk returns either a bare array or a paginated `{ data, total_count }`
 * envelope depending on the `paginated` flag and API version, so accept both
 * rather than trusting one shape.
 */
export function parseClerkOAuthTokens(
  payload: unknown,
): ClerkGoogleToken | null {
  const entries = Array.isArray(payload)
    ? payload
    : isPaginatedEnvelope(payload)
      ? payload.data
      : null
  if (!entries) {
    return null
  }

  let fallback: ClerkGoogleToken | null = null
  for (const entry of entries) {
    const token = readToken(entry)
    if (token) {
      const parsed = { token, scopes: readScopes(entry) }
      if (parsed.scopes.includes(CALENDAR_SCOPE)) {
        return parsed
      }
      fallback ??= parsed
    }
  }
  return fallback
}

function isPaginatedEnvelope(
  payload: unknown,
): payload is { data: Array<unknown> } {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'data' in payload &&
    Array.isArray(payload.data)
  )
}

function readProperty(entry: unknown, key: string): unknown {
  if (typeof entry !== 'object' || entry === null || !(key in entry)) {
    return undefined
  }
  return (entry as Record<string, unknown>)[key]
}

function readToken(entry: unknown): string | null {
  const token = readProperty(entry, 'token')
  return typeof token === 'string' && token.length > 0 ? token : null
}

function readScopes(entry: unknown): Array<string> {
  const scopes = readProperty(entry, 'scopes')
  if (!Array.isArray(scopes)) {
    return []
  }
  return scopes.filter((scope): scope is string => typeof scope === 'string')
}

export async function fetchClerkGoogleAccessToken(
  clerkUserId: string,
): Promise<ClerkGoogleToken | null> {
  const secret = process.env.CLERK_SECRET_KEY
  if (!secret) {
    console.error('CLERK_SECRET_KEY is not set')
    return null
  }

  try {
    const clerk = createClerkClient({ secretKey: secret })
    const result = await clerk.users.getUserOauthAccessToken(
      clerkUserId,
      'google',
    )
    const parsed = parseClerkOAuthTokens(result)
    if (!parsed) {
      console.error(
        `Clerk returned no usable Google access token for user ${clerkUserId}`,
      )
    }
    return parsed
  } catch (error) {
    console.error('Clerk oauth_access_tokens request failed', error)
    return null
  }
}
