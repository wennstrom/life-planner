import { useEffect, useId, useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { cn } from '~/lib/utils'
import {
  MAX_REPEAT_WEEKS,
  REPEAT_WEEKDAYS,
  clampRepeatWeeks,
  mondayIndex,
  repeatStarts,
  sameClockTimeInDays,
} from '~/lib/repeat-block'

type DuplicateBlockActionsProps = {
  block: { _id: Id<'timeBlocks'>; start: number }
  disabled?: boolean
  onDone: () => void
}

const DUPLICATE_ERROR = 'Could not copy the time block. Please try again.'

/**
 * Copies of a saved app block: tomorrow, or on chosen weekdays for a few
 * weeks. Each copy is an independent block, not a recurrence rule.
 */
export function DuplicateBlockActions({
  block,
  disabled = false,
  onDone,
}: DuplicateBlockActionsProps) {
  const duplicate = useMutation(api.timeBlocks.duplicate)
  const weeksId = useId()
  const [repeatOpen, setRepeatOpen] = useState(false)
  const [weekdays, setWeekdays] = useState<number[]>(() => [
    mondayIndex(block.start),
  ])
  const [weeks, setWeeks] = useState('1')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setRepeatOpen(false)
    setWeekdays([mondayIndex(block.start)])
    setWeeks('1')
    setError(null)
  }, [block._id, block.start])

  const repeatCount = repeatStarts(block.start, weekdays, Number(weeks)).length

  async function copyTo(starts: number[]) {
    if (starts.length === 0 || pending) return
    setPending(true)
    setError(null)
    try {
      await duplicate({ blockId: block._id, starts })
      onDone()
    } catch {
      setError(DUPLICATE_ERROR)
    } finally {
      setPending(false)
    }
  }

  function toggleWeekday(index: number) {
    setWeekdays((current) =>
      current.includes(index)
        ? current.filter((day) => day !== index)
        : [...current, index],
    )
  }

  const busy = disabled || pending

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void copyTo([sameClockTimeInDays(block.start, 1)])}
        >
          Duplicate to tomorrow
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={repeatOpen}
          onClick={() => setRepeatOpen((open) => !open)}
        >
          Repeat…
        </Button>
        <span className="text-xs text-muted-foreground">
          Copies the saved block.
        </span>
      </div>

      {repeatOpen ? (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 p-3">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Repeat on</legend>
            <div className="flex flex-wrap gap-1">
              {REPEAT_WEEKDAYS.map((label, index) => {
                const pressed = weekdays.includes(index)
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={pressed}
                    className={cn(
                      'min-w-10 rounded-sm border px-2 py-1 text-xs transition-colors',
                      pressed
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input text-muted-foreground hover:bg-accent',
                    )}
                    onClick={() => toggleWeekday(index)}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </fieldset>
          <div className="flex items-center gap-2">
            <Label htmlFor={weeksId} className="text-sm font-medium">
              For
            </Label>
            <Input
              id={weeksId}
              type="number"
              min={1}
              max={MAX_REPEAT_WEEKS}
              value={weeks}
              className="h-8 w-16"
              onChange={(event) => setWeeks(event.target.value)}
              onBlur={() => setWeeks(String(clampRepeatWeeks(Number(weeks))))}
            />
            <span className="text-sm text-muted-foreground">
              {clampRepeatWeeks(Number(weeks)) === 1 ? 'week' : 'weeks'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {repeatCount === 1 ? '1 copy' : `${repeatCount} copies`}
            </span>
            <Button
              type="button"
              size="sm"
              disabled={busy || repeatCount === 0}
              onClick={() =>
                void copyTo(repeatStarts(block.start, weekdays, Number(weeks)))
              }
            >
              Create copies
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
