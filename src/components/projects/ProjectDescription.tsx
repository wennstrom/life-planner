import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Textarea } from '~/components/ui/textarea'
import { cn } from '~/lib/utils'

type ProjectDescriptionProps = {
  projectId: Id<'projects'>
  description?: string
}

const SAVE_ERROR = 'Could not save description.'

export function ProjectDescription({
  projectId,
  description,
}: ProjectDescriptionProps) {
  const updateProject = useMutation(api.projects.update)
  const saved = description ?? ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(saved)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const trimmed = draft.trim()
    if (trimmed === saved.trim()) {
      setError(null)
      setEditing(false)
      setDraft(saved)
      return
    }
    try {
      await updateProject({ projectId, description: trimmed })
      setError(null)
      setEditing(false)
    } catch {
      setError(SAVE_ERROR)
    }
  }

  function cancel() {
    setDraft(saved)
    setError(null)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={cn(
          '-mx-1 mt-1 rounded-md px-1 text-left text-sm text-muted-foreground',
          'hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none',
          'cursor-pointer',
        )}
        onClick={() => {
          setDraft(saved)
          setError(null)
          setEditing(true)
        }}
      >
        {saved ? saved : 'Add a description…'}
      </button>
    )
  }

  return (
    <div className="mt-1">
      <Textarea
        autoFocus
        rows={3}
        value={draft}
        aria-invalid={error ? true : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          void save()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            cancel()
            return
          }
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void save()
          }
        }}
      />
      {error ? <p className="mt-1 text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
