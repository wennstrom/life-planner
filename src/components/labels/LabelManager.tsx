import { useMutation } from 'convex/react'
import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ConfirmDialog } from '~/components/ConfirmDialog'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import {
  LABEL_COLORS,
  MAX_LABELS_PER_USER,
  MAX_LABEL_NAME_LENGTH,
} from '~/lib/labels'
import { cn } from '~/lib/utils'

export type EditableLabel = {
  _id: Id<'labels'>
  name: string
  color: string
}

function errorText(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    // Convex prefixes server errors with request details; keep the message.
    const match = /Uncaught Error: (.+?)(?:\n|$)/.exec(error.message)
    if (match) return match[1]
  }
  return fallback
}

function ColorSwatches({
  value,
  onChange,
  labelName,
}: {
  value: string
  onChange: (color: string) => void
  labelName: string
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${labelName} colour`}>
      {LABEL_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={color}
          className={cn(
            'size-5 cursor-pointer rounded-full border border-border',
            value === color && 'ring-2 ring-ring ring-offset-2',
          )}
          style={{ background: color }}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  )
}

function LabelRow({
  label,
  onError,
  onDelete,
}: {
  label: EditableLabel
  onError: (message: string | null) => void
  onDelete: () => void
}) {
  const update = useMutation(api.labels.update)
  const [name, setName] = useState(label.name)

  useEffect(() => setName(label.name), [label.name])

  async function saveName() {
    if (name.trim() === label.name) {
      setName(label.name)
      return
    }
    try {
      await update({ labelId: label._id, name })
      onError(null)
    } catch (error) {
      setName(label.name)
      onError(errorText(error, "Couldn't rename the label. Try again."))
    }
  }

  async function saveColor(color: string) {
    try {
      await update({ labelId: label._id, color })
      onError(null)
    } catch (error) {
      onError(errorText(error, "Couldn't change the colour. Try again."))
    }
  }

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
      <Input
        aria-label="Label name"
        data-label-name
        value={name}
        maxLength={MAX_LABEL_NAME_LENGTH}
        className="sm:w-56"
        onChange={(event) => setName(event.target.value)}
        onBlur={() => void saveName()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            setName(label.name)
          }
        }}
      />
      <ColorSwatches
        value={label.color}
        labelName={label.name}
        onChange={(color) => void saveColor(color)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="ml-auto text-muted-foreground hover:text-destructive"
        aria-label={`Delete ${label.name}`}
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
      </Button>
    </li>
  )
}

export function LabelManager({ labels }: { labels: Array<EditableLabel> }) {
  const create = useMutation(api.labels.create)
  const remove = useMutation(api.labels.remove)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{
    id: Id<'labels'>
    name: string
  } | null>(null)
  const full = labels.length >= MAX_LABELS_PER_USER

  async function onCreate() {
    if (!newName.trim() || creating) return
    setCreating(true)
    try {
      await create({ name: newName })
      setNewName('')
      setError(null)
    } catch (err) {
      setError(errorText(err, "Couldn't add the label. Try again."))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Changes to label names and colours apply to every task using them.
        Up to {MAX_LABELS_PER_USER} labels.
      </p>
      {labels.length > 0 ? (
        <ul className="max-h-64 overflow-y-auto divide-y divide-border" aria-label="Manage labels">
          {labels.map((label) => (
            <LabelRow
              key={label._id}
              label={label}
              onError={setError}
              onDelete={() =>
                setPendingDelete({ id: label._id, name: label.name })
              }
            />
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Input
          aria-label="New label name"
          placeholder={full ? 'Label limit reached' : 'New label'}
          value={newName}
          maxLength={MAX_LABEL_NAME_LENGTH}
          disabled={full}
          className="sm:w-56"
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.stopPropagation()
              void onCreate()
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => void onCreate()}
          disabled={full || creating || !newName.trim()}
        >
          <Plus className="size-4" />
          {creating ? 'Creating…' : 'Create label'}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <ConfirmDialog
        open={pendingDelete != null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => remove({ labelId: pendingDelete!.id })}
        title="Delete label?"
        description={
          pendingDelete ? (
            <>
              <span className="font-medium text-foreground">
                {pendingDelete.name}
              </span>{' '}
              will be removed from every task. The tasks are kept.
            </>
          ) : null
        }
        confirmLabel="Delete"
        cancelLabel="Keep"
        confirmVariant="destructive"
        errorMessage="Could not delete the label. Please try again."
      />
    </div>
  )
}
