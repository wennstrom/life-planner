import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Bot } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { claimMinutesRemaining } from '~/lib/task-claims'

/** The supplied client clock also expires claims without a database write. */
export function TaskClaim({
  taskId,
  compact = false,
}: {
  taskId: Id<'tasks'>
  compact?: boolean
}) {
  const [now, setNow] = useState(() => Date.now())
  const claim = useQuery(api.taskClaims.get, { taskId, now })
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const interval = window.setInterval(tick, 30_000)
    const expiry = claim?.expiresAt
    const timeout =
      expiry && expiry > Date.now()
        ? window.setTimeout(tick, expiry - Date.now())
        : undefined
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [claim?.expiresAt])
  const release = useMutation(api.taskClaims.forceRelease)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (compact) {
    if (!claim || claim.expiresAt <= now) return null
    return (
      <Badge
        variant="secondary"
        className="gap-1 text-[11px]"
        title={`Claimed by ${claim.agent} · ${claim.sessionId} · expires ${new Date(claim.expiresAt).toLocaleString()}`}
      >
        <Bot className="size-3" aria-hidden />
        Claimed · {claimMinutesRemaining(claim.expiresAt, now)} min
      </Badge>
    )
  }
  return (
    <section aria-label="Agent claim" className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Agent claim</h3>
      {claim === undefined ? (
        <p className="text-xs text-muted-foreground">Loading claim…</p>
      ) : claim && claim.expiresAt > now ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-sm">
            <p className="break-words">Claimed by {claim.agent}</p>
            <p className="break-all text-xs text-muted-foreground">
              {claim.sessionId}
            </p>
            <p
              className="text-xs text-muted-foreground"
              title={new Date(claim.expiresAt).toLocaleString()}
            >
              Expires in {claimMinutesRemaining(claim.expiresAt, now)} min
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={async () => {
              setPending(true)
              setError(null)
              try {
                await release({ taskId })
              } catch {
                setError('Could not release the claim. Please try again.')
              } finally {
                setPending(false)
              }
            }}
          >
            {pending ? 'Releasing…' : 'Release'}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No active agent claim.</p>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
}
