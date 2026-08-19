import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'

import type { FormEvent } from 'react'
import type { Doc } from '../../../convex/_generated/dataModel'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { Label } from '~/components/ui/label'
import { Checkbox } from '~/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { cn } from '~/lib/utils'
import { msToTimeLabel } from '~/lib/dates'

type Outcome = 'done' | 'partial' | 'missed'
type Focus = 'deep' | 'shallow' | 'interrupted'

type ReviewBlockModalProps = {
  block: Doc<'timeBlocks'> | null
  task?: Doc<'tasks'> | null
  positionLabel?: string
  open: boolean
  onClose: () => void
  onSaved?: () => void
}

const OUTCOMES: Array<{ value: Outcome; label: string }> = [
  { value: 'done', label: 'Done' },
  { value: 'partial', label: 'Partial' },
  { value: 'missed', label: 'Missed' },
]

export function ReviewBlockModal({
  block,
  task,
  positionLabel,
  open,
  onClose,
  onSaved,
}: ReviewBlockModalProps) {
  const reviewBlock = useMutation(api.timeBlocks.review)

  const [outcome, setOutcome] = useState<Outcome>('done')
  const [actualMinutes, setActualMinutes] = useState(60)
  const [focus, setFocus] = useState<Focus | ''>('')
  const [note, setNote] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [scheduleNext, setScheduleNext] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [blockedReason, setBlockedReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!block || !open) return
    const plannedMinutes = Math.round((block.end - block.start) / 60000)
    setOutcome('done')
    setActualMinutes(plannedMinutes)
    setFocus('')
    setNote('')
    setNextStep('')
    setScheduleNext(false)
    setBlocked(false)
    setBlockedReason('')
    setError(null)
    setPending(false)
  }, [block, open])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!block || pending) return

    setPending(true)
    setError(null)
    try {
      await reviewBlock({
        blockId: block._id,
        outcome,
        actualMinutes,
        focus: focus || undefined,
        note: note.trim() || undefined,
        nextStep: nextStep.trim() || undefined,
        blockedReason: blocked ? blockedReason.trim() || undefined : undefined,
        scheduleNext: scheduleNext || undefined,
      })
      if (onSaved) {
        onSaved()
      } else {
        onClose()
      }
    } catch {
      setError('Could not save the review. Please try again.')
      setPending(false)
    }
  }

  const primaryLabel = onSaved ? 'Save & next' : 'Save'

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            Review block
            {positionLabel ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {positionLabel}
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        {block ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <p className="font-medium">{block.title}</p>
              {task ? (
                <p className="mt-1 text-muted-foreground">{task.title}</p>
              ) : null}
              <p className="mt-1 text-muted-foreground">
                {msToTimeLabel(block.start)} – {msToTimeLabel(block.end)}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Outcome</Label>
              <div className="flex rounded-md border border-input p-0.5">
                {OUTCOMES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={cn(
                      'flex-1 rounded-sm px-2 py-1.5 text-sm transition-colors',
                      outcome === item.value
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent',
                    )}
                    onClick={() => setOutcome(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="review-minutes">Time spent (minutes)</Label>
              <Input
                id="review-minutes"
                type="number"
                min={1}
                value={actualMinutes}
                onChange={(e) => setActualMinutes(Number(e.target.value))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="review-focus">Focus</Label>
              <Select
                value={focus || 'none'}
                onValueChange={(v) => setFocus(v === 'none' ? '' : (v as Focus))}
              >
                <SelectTrigger id="review-focus" className="w-full">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  <SelectItem value="deep">Deep</SelectItem>
                  <SelectItem value="shallow">Shallow</SelectItem>
                  <SelectItem value="interrupted">Interrupted</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="review-note">Note</Label>
              <Textarea
                id="review-note"
                rows={2}
                placeholder="Optional reflection"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="review-next">Next step</Label>
                <Input
                  id="review-next"
                  placeholder="What comes next?"
                  value={nextStep}
                  onChange={(e) => setNextStep(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={scheduleNext}
                  onCheckedChange={(v) => setScheduleNext(v === true)}
                  disabled={!nextStep.trim() || !block.taskId}
                />
                Schedule it now (same time tomorrow)
              </label>
            </div>

            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={blocked}
                  onCheckedChange={(v) => setBlocked(v === true)}
                />
                Blocked
              </label>
              {blocked ? (
                <Input
                  placeholder="What blocked you?"
                  value={blockedReason}
                  onChange={(e) => setBlockedReason(e.target.value)}
                />
              ) : null}
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {primaryLabel}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
