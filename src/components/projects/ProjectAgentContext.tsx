import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Bot, ChevronDown } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '~/components/ui/button'
import { Textarea } from '~/components/ui/textarea'
import { AGENT_CONTEXT_HINT, agentContextCounter } from '~/lib/agent-context'
import { cn } from '~/lib/utils'

type ProjectAgentContextProps = {
  projectId: Id<'projects'>
  agentContext?: string
}

const SAVE_ERROR = "Couldn't save the context. Try again."

/** "Context for agents": markdown MCP agents read via get_project_context. */
export function ProjectAgentContext({
  projectId,
  agentContext,
}: ProjectAgentContextProps) {
  const setAgentContext = useMutation(api.projects.setAgentContext)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editing = draft !== null
  const counter = agentContextCounter(draft ?? '')

  const startEditing = () => {
    setOpen(true)
    setError(null)
    setDraft(agentContext ?? '')
  }

  const save = async () => {
    if (draft === null || counter.over) return
    setSaving(true)
    setError(null)
    try {
      await setAgentContext({ projectId, agentContext: draft })
      setDraft(null)
    } catch {
      setError(SAVE_ERROR)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm font-medium"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown
            className={cn('size-4 transition-transform', !open && '-rotate-90')}
            aria-hidden
          />
          Context for agents
        </button>
        {!open && agentContext ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Bot className="size-3.5" aria-hidden />
            Set
          </span>
        ) : null}
      </div>

      {open ? (
        <div className="mt-3 max-w-3xl">
          {editing ? (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
            >
              <label htmlFor="project-agent-context" className="sr-only">
                Context for agents
              </label>
              <Textarea
                id="project-agent-context"
                autoFocus
                rows={10}
                className="max-h-[60vh] font-mono"
                placeholder={
                  'Markdown. e.g.\nRepo: ~/code/launch\nRun tests with `bun test`\nAPI keys: 1Password vault "Launch"'
                }
                value={draft}
                aria-invalid={counter.over || undefined}
                aria-describedby="project-agent-context-hint"
                onChange={(event) => setDraft(event.target.value)}
              />
              <div
                id="project-agent-context-hint"
                className="mt-1.5 flex items-center justify-between gap-3 text-xs text-muted-foreground"
              >
                <span>{AGENT_CONTEXT_HINT}</span>
                <span
                  className={cn(
                    'shrink-0 tabular-nums',
                    counter.over && 'font-semibold text-destructive',
                  )}
                >
                  {counter.text}
                </span>
              </div>
              {error ? (
                <p role="alert" className="mt-2 text-xs text-destructive">
                  {error}
                </p>
              ) : null}
              <div className="mt-3 flex gap-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={saving || counter.over}
                >
                  {saving ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => {
                    setDraft(null)
                    setError(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <>
              {agentContext ? (
                <pre className="whitespace-pre-wrap break-words rounded-[7px] border border-border bg-muted/40 px-3 py-2 font-mono text-xs leading-relaxed">
                  {agentContext}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Notes agents read before working on this project's tasks:
                  where the code lives, how to run it, conventions.{' '}
                  {AGENT_CONTEXT_HINT}.
                </p>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={startEditing}
              >
                {agentContext ? 'Edit' : 'Add context'}
              </Button>
            </>
          )}
        </div>
      ) : null}
    </section>
  )
}
