import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Input } from '~/components/ui/input'
import { cn } from '~/lib/utils'

type ProjectNameProps = {
  projectId: Id<'projects'>
  name: string
}

const EMPTY_ERROR = 'Name is required'
const SAVE_ERROR = 'Could not save name.'

export function ProjectName({ projectId, name }: ProjectNameProps) {
  const updateProject = useMutation(api.projects.update)
  const saved = name
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(saved)
  const [committed, setCommitted] = useState(saved)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setCommitted(saved)
  }, [saved])

  async function save() {
    const trimmed = draft.trim()
    if (trimmed === '') {
      setError(EMPTY_ERROR)
      return
    }
    if (trimmed === committed.trim()) {
      setError(null)
      setEditing(false)
      setDraft(committed)
      return
    }
    try {
      await updateProject({ projectId, name: trimmed })
      setCommitted(trimmed)
      setDraft(trimmed)
      setError(null)
      setEditing(false)
    } catch {
      setError(SAVE_ERROR)
    }
  }

  function beginEdit() {
    setDraft(committed)
    setError(null)
    setEditing(true)
  }

  function cancel() {
    setDraft(committed)
    setError(null)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={cn(
          'block w-full rounded-md text-left',
          'hover:bg-accent/60 focus-visible:bg-accent/60',
          'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        onClick={beginEdit}
      >
        <h1 className="text-2xl font-bold">{committed}</h1>
      </button>
    )
  }

  return (
    <div className="w-full">
      <Input
        autoFocus
        className="text-2xl font-bold"
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
          if (event.key === 'Enter') {
            event.preventDefault()
            void save()
          }
        }}
      />
      {error ? <p className="mt-1 text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
