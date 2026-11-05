import { useAction, useMutation, useQuery } from 'convex/react'
import { Fragment, useReducer, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Copy, Plus } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import type { FormEvent } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'
import type { TokenExpiry, TokenScope } from '~/lib/mcp-settings'
import { ConfirmDialog } from '~/components/ConfirmDialog'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
  DEFAULT_EXPIRY,
  EXPIRY_OPTIONS,
  SCOPE_OPTIONS,
  connectionSnippets,
  maskedToken,
  mcpEndpointUrl,
  revealReducer,
  tokenStatus,
} from '~/lib/mcp-settings'
import { formatShortDate, msToTimeLabel, relativeTime } from '~/lib/dates'
import { cn } from '~/lib/utils'

type TokenRow = {
  _id: Id<'apiTokens'>
  name: string
  prefix: string
  scope: TokenScope
  createdAt: number
  lastUsedAt: number | null
  expiresAt: number | null
  revokedAt: number | null
}

function endpointUrl(): string {
  return mcpEndpointUrl(import.meta.env.VITE_CONVEX_URL as string)
}

function errorText(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    // Convex prefixes server errors with request details; keep the message.
    const match = /Uncaught Error: (.+?)(?:\n|$)/.exec(error.message)
    if (match) return match[1]
  }
  return fallback
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 2000)
        })
      }}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}

function ConnectionSnippets({
  endpoint,
  token,
}: {
  endpoint: string
  token: string | null
}) {
  const snippets = connectionSnippets(endpoint, token)
  const [active, setActive] = useState(snippets[0].id)
  const snippet = snippets.find((s) => s.id === active) ?? snippets[0]

  return (
    <div className="rounded-lg border border-border">
      <div
        role="tablist"
        aria-label="Agent"
        className="flex gap-1 border-b border-border px-2 pt-2"
      >
        {snippets.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === active}
            onClick={() => setActive(s.id)}
            className={cn(
              'rounded-t-md px-3 py-1.5 text-xs',
              s.id === active
                ? 'bg-accent font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex items-start gap-2 p-3" role="tabpanel">
        <pre
          className="min-w-0 flex-1 overflow-x-auto font-mono text-xs leading-5 whitespace-pre"
          data-testid="connection-snippet"
        >
          {snippet.code}
        </pre>
        <CopyButton text={snippet.code} label={`Copy ${snippet.label} setup`} />
      </div>
    </div>
  )
}

function NewTokenDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (created: { tokenId: string; token: string; name: string }) => void
}) {
  const createToken = useAction(api.apiTokens.create)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<TokenScope>('read_write')
  const [expiry, setExpiry] = useState<TokenExpiry>(DEFAULT_EXPIRY)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setName('')
    setScope('read_write')
    setExpiry(DEFAULT_EXPIRY)
    setError(null)
    setPending(false)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Name the token, e.g. after the agent that will use it.')
      return
    }
    setPending(true)
    setError(null)
    try {
      const { tokenId, token } = await createToken({
        name: trimmed,
        scope,
        expiresInDays: expiry,
      })
      onCreated({ tokenId, token, name: trimmed })
      reset()
      onClose()
    } catch (err) {
      setError(errorText(err, "Couldn't create the token. Try again."))
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) {
          reset()
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-[440px]" showCloseButton={!pending}>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader>
            <DialogTitle>New token</DialogTitle>
            <DialogDescription>
              Agents use the token to act as you in Life Planner.
            </DialogDescription>
          </DialogHeader>

          <div className="my-5 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="token-name">Name</Label>
              <Input
                id="token-name"
                value={name}
                maxLength={60}
                placeholder="Claude Code on my laptop"
                onChange={(event) => setName(event.target.value)}
                disabled={pending}
                autoFocus
              />
            </div>

            <fieldset className="flex flex-col gap-2" disabled={pending}>
              <legend className="mb-2 text-sm font-medium">Access</legend>
              {SCOPE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-2.5 text-sm"
                >
                  <input
                    type="radio"
                    name="token-scope"
                    value={option.value}
                    checked={scope === option.value}
                    onChange={() => setScope(option.value)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">{option.label}</span>
                    <span className="block text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            <fieldset className="flex flex-col gap-2" disabled={pending}>
              <legend className="mb-2 text-sm font-medium">Expires</legend>
              <div className="flex gap-4">
                {EXPIRY_OPTIONS.map((option) => (
                  <label
                    key={option.label}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="token-expiry"
                      checked={expiry === option.value}
                      onChange={() => setExpiry(option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset()
                onClose()
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Creating…' : 'Create token'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TokenReveal({
  name,
  token,
  endpoint,
  onDismiss,
}: {
  name: string
  token: string
  endpoint: string
  onDismiss: () => void
}) {
  return (
    <div
      className="flex flex-col gap-4 rounded-lg border border-amber-300 bg-amber-50 p-4"
      aria-label="New token"
      role="region"
    >
      <div>
        <p className="text-sm font-medium">Token “{name}” created</p>
        <p className="text-sm text-[#7a5a00]">
          Copy it now. You won't see this again.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          readOnly
          value={token}
          aria-label="Token"
          className="bg-white font-mono text-xs"
          onFocus={(event) => event.currentTarget.select()}
          data-testid="revealed-token"
        />
        <CopyButton text={token} label="Copy token" />
      </div>
      <ConnectionSnippets endpoint={endpoint} token={token} />
      <div>
        <Button type="button" variant="outline" onClick={onDismiss}>
          Done, I've saved it
        </Button>
      </div>
    </div>
  )
}

function TokenActivity({ tokenId }: { tokenId: Id<'apiTokens'> }) {
  const rows = useQuery(api.mcpActivity.listForToken, { tokenId })
  if (rows === undefined) {
    return <p className="text-xs text-muted-foreground">Loading…</p>
  }
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">No calls yet.</p>
  }
  return (
    <ol className="flex flex-col gap-1" aria-label="Recent calls">
      {rows.map((row) => (
        <li
          key={row._id}
          className={cn(
            'grid grid-cols-[7.5rem_8.5rem_8rem_1fr] gap-3 text-xs',
            !row.ok && 'text-destructive',
          )}
        >
          <span className="text-muted-foreground">
            {formatShortDate(row.at)} {msToTimeLabel(row.at)}
          </span>
          <span className="font-mono">{row.tool}</span>
          <span
            className="min-w-0 truncate font-mono text-muted-foreground"
            title={row.sessionId ? `Session ${row.sessionId}` : 'No session'}
            data-testid="activity-session"
          >
            {row.sessionId ?? '—'}
          </span>
          <span className="min-w-0 truncate" title={row.summary}>
            {row.ok ? null : <span className="font-medium">Failed: </span>}
            {row.summary}
          </span>
        </li>
      ))}
    </ol>
  )
}

const STATUS_LABEL = {
  active: null,
  expired: 'Expired',
  revoked: 'Revoked',
} as const

function TokenTable({
  tokens,
  onRevoke,
}: {
  tokens: Array<TokenRow>
  onRevoke: (token: TokenRow) => void
}) {
  const [expanded, setExpanded] = useState<Id<'apiTokens'> | null>(null)
  const now = Date.now()

  if (tokens.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No tokens yet. Create one to connect an agent.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Token</th>
            <th className="px-3 py-2 font-medium">Access</th>
            <th className="px-3 py-2 font-medium">Last used</th>
            <th className="px-3 py-2 font-medium">Expires</th>
            <th className="px-3 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token) => {
            const status = tokenStatus(token, now)
            const isOpen = expanded === token._id
            return (
              <Fragment key={token._id}>
                <tr
                  className={cn(
                    'border-b border-border last:border-0',
                    status !== 'active' && 'text-muted-foreground',
                  )}
                  data-testid="token-row"
                >
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-left font-medium"
                      aria-expanded={isOpen}
                      onClick={() => setExpanded(isOpen ? null : token._id)}
                    >
                      {isOpen ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                      {token.name}
                    </button>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {maskedToken(token.prefix)}
                  </td>
                  <td className="px-3 py-2">
                    {token.scope === 'read' ? 'Read only' : 'Read & write'}
                  </td>
                  <td className="px-3 py-2">
                    {token.lastUsedAt !== null
                      ? relativeTime(token.lastUsedAt)
                      : 'Never'}
                  </td>
                  <td className="px-3 py-2">
                    {token.expiresAt !== null
                      ? formatShortDate(token.expiresAt)
                      : 'Never'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {STATUS_LABEL[status] ? (
                      <Badge variant="secondary">{STATUS_LABEL[status]}</Badge>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onRevoke(token)}
                      >
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
                {isOpen ? (
                  <tr className="border-b border-border bg-nav last:border-0">
                    <td colSpan={6} className="px-3 py-3">
                      <TokenActivity tokenId={token._id} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AgentsCanMarkDoneToggle({ value }: { value: boolean }) {
  const setAgentsCanMarkDone = useMutation(api.userSettings.setAgentsCanMarkDone)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle(next: boolean) {
    setPending(true)
    setError(null)
    try {
      await setAgentsCanMarkDone({ value: next })
    } catch (err) {
      setError(errorText(err, "Couldn't save the setting. Try again."))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-2.5">
        <Checkbox
          id="agents-can-mark-done"
          checked={value}
          disabled={pending}
          onCheckedChange={(checked) => void toggle(checked === true)}
          className="mt-0.5"
        />
        <Label
          htmlFor="agents-can-mark-done"
          className="flex-col items-start gap-1 leading-snug"
        >
          <span>Agents can mark tasks done</span>
          <span className="text-sm font-normal text-muted-foreground">
            Off: agents move finished work to Review, and you move it to Done.
          </span>
        </Label>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function AgentsSettings({
  tokens,
  agentsCanMarkDone,
}: {
  tokens: Array<TokenRow>
  agentsCanMarkDone: boolean
}) {
  const revokeToken = useMutation(api.apiTokens.revoke)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [reveal, dispatch] = useReducer(revealReducer, null)
  const [revoking, setRevoking] = useState<TokenRow | null>(null)
  const endpoint = endpointUrl()

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Let AI agents such as Claude Code, Cursor and Codex read and plan your
        tasks and calendar through the Model Context Protocol. They act as you,
        with the same rules as the app. They can archive tasks but not delete
        them, and they can't change events imported from Google Calendar.
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="mcp-endpoint">Server URL</Label>
        <div className="flex items-center gap-2">
          <Input
            id="mcp-endpoint"
            readOnly
            value={endpoint}
            className="font-mono text-xs"
          />
          <CopyButton text={endpoint} label="Copy server URL" />
        </div>
      </div>

      {reveal ? (
        <TokenReveal
          name={reveal.name}
          token={reveal.token}
          endpoint={endpoint}
          onDismiss={() => dispatch({ type: 'dismissed' })}
        />
      ) : (
        <ConnectionSnippets endpoint={endpoint} token={null} />
      )}

      <AgentsCanMarkDoneToggle value={agentsCanMarkDone} />

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Tokens</h3>
        <Button type="button" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          New token
        </Button>
      </div>

      <TokenTable tokens={tokens} onRevoke={setRevoking} />

      <NewTokenDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={(created) => dispatch({ type: 'created', ...created })}
      />

      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        onConfirm={async () => {
          if (revoking) await revokeToken({ tokenId: revoking._id })
        }}
        title={`Revoke “${revoking?.name ?? ''}”?`}
        description="Agents using this token stop working right away. This can't be undone."
        confirmLabel="Revoke"
        confirmVariant="destructive"
        errorMessage="Couldn't revoke the token. Try again."
      />
    </div>
  )
}
