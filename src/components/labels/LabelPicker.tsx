import { Check } from 'lucide-react'
import type { LabelChipData } from '~/components/labels/LabelChip'
import { MAX_LABELS_PER_TASK, toggleLabelId } from '~/lib/labels'
import { cn } from '~/lib/utils'

/** Toggle chips for assigning labels to a task. */
export function LabelPicker({
  id,
  labels,
  value,
  onChange,
}: {
  id: string
  labels: Array<LabelChipData> | undefined
  value: Array<string>
  onChange: (next: Array<string>) => void
}) {
  const atCap = value.length >= MAX_LABELS_PER_TASK
  return (
    <div className="grid gap-2" role="group" aria-labelledby={id}>
      <span id={id} className="text-sm font-medium">
        Labels
      </span>
      {labels === undefined ? null : labels.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No labels yet. Add them in Settings → Labels.
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
      {atCap ? (
        <p className="text-xs text-muted-foreground">
          A task can have at most {MAX_LABELS_PER_TASK} labels.
        </p>
      ) : null}
    </div>
  )
}
