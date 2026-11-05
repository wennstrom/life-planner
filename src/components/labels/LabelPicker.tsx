import { useState } from 'react'
import { Check } from 'lucide-react'
import { LabelManager } from './LabelManager'
import type { EditableLabel } from './LabelManager'
import { MAX_LABELS_PER_TASK, toggleLabelId } from '~/lib/labels'
import { cn } from '~/lib/utils'

/** Radix handles Escape before React's input key handler; keep rename local. */
export function keepTaskOpenForLabelRename(event: KeyboardEvent) {
  if (event.target instanceof Element && event.target.hasAttribute('data-label-name')) {
    event.preventDefault()
  }
}

/** Toggle chips for assigning labels to a task. */
export function LabelPicker({
  id,
  labels,
  value,
  onChange,
}: {
  id: string
  labels: Array<EditableLabel> | undefined
  value: Array<string>
  onChange: (next: Array<string>) => void
}) {
  const [managing, setManaging] = useState(false)
  const atCap = value.length >= MAX_LABELS_PER_TASK
  return (
    <div className="grid gap-2" role="group" aria-labelledby={id}>
      <div className="flex items-center justify-between gap-2">
        <span id={id} className="text-sm font-medium">
          Labels
        </span>
        <button
          type="button"
          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          aria-expanded={managing}
          aria-controls={`${id}-manager`}
          disabled={labels === undefined}
          onClick={() => setManaging((current) => !current)}
        >
          {managing ? 'Close label editor' : 'Manage labels'}
        </button>
      </div>
      {labels === undefined ? (
        <p className="text-xs text-muted-foreground">Loading labels…</p>
      ) : labels.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No labels yet. Create one using Manage labels.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {labels.map((label) => {
            const selected = value.includes(label._id)
            return (
              <button
                key={label._id}
                type="button"
                aria-pressed={selected}
                disabled={!selected && atCap}
                onClick={() => onChange(toggleLabelId(value, label._id))}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  selected
                    ? 'border-foreground/30 bg-accent font-medium text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ background: label.color }}
                />
                {label.name}
                {selected ? <Check aria-hidden className="size-3" /> : null}
              </button>
            )
          })}
        </div>
      )}
      {managing && labels !== undefined ? (
        <div id={`${id}-manager`} className="border-t border-border pt-3">
          <LabelManager labels={labels} />
        </div>
      ) : null}
      {atCap ? (
        <p className="text-xs text-muted-foreground">
          A task can have at most {MAX_LABELS_PER_TASK} labels.
        </p>
      ) : null}
    </div>
  )
}
