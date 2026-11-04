// Pure helpers for the "Agents & MCP" settings section.

export const TOKEN_PLACEHOLDER = '<your-token>'
export const MCP_SERVER_NAME = 'life-planner'
export const CODEX_TOKEN_ENV_VAR = 'LIFE_PLANNER_TOKEN'

export type TokenScope = 'read' | 'read_write'
export type TokenExpiry = 30 | 90 | null

export const SCOPE_OPTIONS: Array<{
  value: TokenScope
  label: string
  description: string
}> = [
  {
    value: 'read',
    label: 'Read only',
    description: 'See tasks, projects and the calendar.',
  },
  {
    value: 'read_write',
    label: 'Read & write',
    description: 'Also create, update and archive tasks and plan blocks.',
  },
]

export const EXPIRY_OPTIONS: Array<{ value: TokenExpiry; label: string }> = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: null, label: 'Never' },
]

export const DEFAULT_EXPIRY: TokenExpiry = 90

/**
 * The MCP endpoint for a Convex deployment URL. HTTP actions live on the
 * deployment's `.site` host; a local backend serves them one port up.
 */
export function mcpEndpointUrl(convexUrl: string): string {
  const url = new URL(convexUrl)
  if (url.hostname.endsWith('.convex.cloud')) {
    url.hostname = url.hostname.replace(/\.convex\.cloud$/, '.convex.site')
  } else if (
    (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
    url.port !== ''
  ) {
    url.port = String(Number(url.port) + 1)
  } else {
    url.hostname = url.hostname.replace(/\.cloud$/, '.site')
  }
  url.pathname = '/mcp'
  url.search = ''
  url.hash = ''
  return url.toString()
}

export type ConnectionSnippet = {
  id: 'claude-code' | 'json' | 'codex'
  label: string
  language: 'shell' | 'json' | 'toml'
  code: string
}

/** Setup snippets for common agents. Pass the token only while it's shown. */
export function connectionSnippets(
  endpoint: string,
  token: string | null,
): Array<ConnectionSnippet> {
  const secret = token ?? TOKEN_PLACEHOLDER
  return [
    {
      id: 'claude-code',
      label: 'Claude Code',
      language: 'shell',
      code: `claude mcp add --transport http ${MCP_SERVER_NAME} ${endpoint} --header "Authorization: Bearer ${secret}"`,
    },
    {
      id: 'json',
      label: 'Cursor / JSON',
      language: 'json',
      code: JSON.stringify(
        {
          mcpServers: {
            [MCP_SERVER_NAME]: {
              url: endpoint,
              headers: { Authorization: `Bearer ${secret}` },
            },
          },
        },
        null,
        2,
      ),
    },
    {
      id: 'codex',
      label: 'Codex',
      language: 'toml',
      code: [
        `# ~/.codex/config.toml`,
        `[mcp_servers.${MCP_SERVER_NAME}]`,
        `url = "${endpoint}"`,
        `bearer_token_env_var = "${CODEX_TOKEN_ENV_VAR}"`,
        ``,
        `# In your shell profile:`,
        `# export ${CODEX_TOKEN_ENV_VAR}="${secret}"`,
      ].join('\n'),
    },
  ]
}

export type TokenStatus = 'active' | 'expired' | 'revoked'

export function tokenStatus(
  token: { revokedAt: number | null; expiresAt: number | null },
  now: number,
): TokenStatus {
  if (token.revokedAt !== null) return 'revoked'
  if (token.expiresAt !== null && token.expiresAt <= now) return 'expired'
  return 'active'
}

export function maskedToken(prefix: string): string {
  return `lp_${prefix}…`
}

export type RevealState = { tokenId: string; token: string; name: string } | null

/**
 * The newly created token is held only in component state: it is shown once
 * and dropped when the reveal is dismissed. Nothing refetches it.
 */
export function revealReducer(
  _state: RevealState,
  action:
    | { type: 'created'; tokenId: string; token: string; name: string }
    | { type: 'dismissed' },
): RevealState {
  if (action.type === 'dismissed') return null
  return { tokenId: action.tokenId, token: action.token, name: action.name }
}
