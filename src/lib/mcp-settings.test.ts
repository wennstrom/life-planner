import { describe, expect, it } from 'vitest'
import {
  TOKEN_PLACEHOLDER,
  connectionSnippets,
  maskedToken,
  mcpEndpointUrl,
  revealReducer,
  tokenStatus,
} from './mcp-settings'

describe('mcpEndpointUrl', () => {
  it('points at the deployment .site host', () => {
    expect(mcpEndpointUrl('https://happy-otter-123.convex.cloud')).toBe(
      'https://happy-otter-123.convex.site/mcp',
    )
    expect(mcpEndpointUrl('https://happy-otter-123.eu-west-1.convex.cloud/')).toBe(
      'https://happy-otter-123.eu-west-1.convex.site/mcp',
    )
  })

  it('uses the next port for a local backend', () => {
    expect(mcpEndpointUrl('http://127.0.0.1:3210')).toBe(
      'http://127.0.0.1:3211/mcp',
    )
  })
})

describe('connectionSnippets', () => {
  const endpoint = 'https://happy-otter-123.convex.site/mcp'

  it('fills in the endpoint and the token while it is on screen', () => {
    const snippets = connectionSnippets(endpoint, 'lp_secret')
    const claude = snippets.find((s) => s.id === 'claude-code')
    expect(claude?.code).toBe(
      `claude mcp add --transport http life-planner ${endpoint} --header "Authorization: Bearer lp_secret"`,
    )
    const json = JSON.parse(snippets.find((s) => s.id === 'json')!.code)
    expect(json).toEqual({
      mcpServers: {
        'life-planner': {
          url: endpoint,
          headers: { Authorization: 'Bearer lp_secret' },
        },
      },
    })
    const codex = snippets.find((s) => s.id === 'codex')!.code
    expect(codex).toContain('[mcp_servers.life-planner]')
    expect(codex).toContain(`url = "${endpoint}"`)
    expect(codex).toContain('bearer_token_env_var = "LIFE_PLANNER_TOKEN"')
  })

  it('uses a placeholder once the token is gone', () => {
    for (const snippet of connectionSnippets(endpoint, null)) {
      expect(snippet.code).toContain(TOKEN_PLACEHOLDER)
      expect(snippet.code).not.toContain('lp_')
    }
  })
})

describe('revealReducer', () => {
  it('shows a new token once and forgets it when dismissed', () => {
    const shown = revealReducer(null, {
      type: 'created',
      tokenId: 't1',
      token: 'lp_secret',
      name: 'Claude',
    })
    expect(shown?.token).toBe('lp_secret')
    expect(revealReducer(shown, { type: 'dismissed' })).toBeNull()
  })
})

describe('tokenStatus', () => {
  const now = 1_000_000
  it('reports revoked before expired', () => {
    expect(tokenStatus({ revokedAt: 5, expiresAt: 10 }, now)).toBe('revoked')
    expect(tokenStatus({ revokedAt: null, expiresAt: now }, now)).toBe('expired')
    expect(tokenStatus({ revokedAt: null, expiresAt: now + 1 }, now)).toBe(
      'active',
    )
    expect(tokenStatus({ revokedAt: null, expiresAt: null }, now)).toBe('active')
  })

  it('masks tokens to their prefix', () => {
    expect(maskedToken('abcd1234')).toBe('lp_abcd1234…')
  })
})
