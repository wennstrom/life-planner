import { useEffect, useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'

import type { TimeBlockView } from '../../../convex/lib/timeBlockMemberships'
import { useAppForm } from '~/components/form/form-hook'
import { Field, FieldGroup, FieldLabel, Form } from '~/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { AddTimeBlockModal } from '~/components/time-block/AddTimeBlockModal'
import { cn } from '~/lib/utils'
import { formatShortDate, msToTimeLabel } from '~/lib/dates'
import {
  calculateRemainingMinutes,
  emptyReviewBlockValues,
  firstReviewStepIndex,
  nextReviewStepIndex,
  reviewBlockSchema,
  toReviewBlockArgs,
  type ReviewBlockValues,
} from '~/lib/forms/review-block'
import {
  canPlanAgain,
  planAgainDraft,
  type PlanAgainDraft,
} from '~/lib/plan-again'

type Outcome = ReviewBlockValues['outcome']

type ReviewBlockModalProps = {
  block: TimeBlockView | null
  positionLabel?: string
  /** Show the block's date too, for blocks from earlier days. */
  showDate?: boolean
  open: boolean
  onClose: () => void
  onSaved?: (completedBlockId?: string) => void
}

const OUTCOMES: Array<{ value: Outcome; label: string }> = [
  { value: 'done', label: 'Done' },
  { value: 'partial', label: 'Partial' },
  { value: 'missed', label: 'Missed' },
]

const FOCUS_OPTIONS = [
  { value: '', label: 'Not specified' },
  { value: 'deep', label: 'Deep' },
  { value: 'shallow', label: 'Shallow' },
  { value: 'interrupted', label: 'Interrupted' },
]

const MUTATION_ERROR = 'Could not save the review. Please try again.'

function plannedMinutesFor(block: TimeBlockView) {
  return Math.round((block.end - block.start) / 60000)
}

export function ReviewBlockModal({
  block,
  positionLabel,
  showDate = false,
  open,
  onClose,
  onSaved,
}: ReviewBlockModalProps) {
  const reviewBlock = useMutation(api.timeBlocks.review)
  const reviewTaskless = useMutation(api.timeBlocks.reviewTaskless)
  const [stepIndex, setStepIndex] = useState(0)
  // "Plan again" is per block: any step can ask for it, it opens once at the end.
  const planAgainRequested = useRef(false)
  const [planAgain, setPlanAgain] = useState<{
    blockId: string
    draft: PlanAgainDraft
  } | null>(null)

  const finish = (completedBlockId: string) => {
    if (onSaved) onSaved(completedBlockId)
    else onClose()
  }

  const form = useAppForm({
    defaultValues: emptyReviewBlockValues(
      block ? plannedMinutesFor(block) : 60,
    ),
    validators: { onSubmit: reviewBlockSchema },
    onSubmit: async ({ value }) => {
      if (!block) return
      const membership = block.memberships[stepIndex]
      const taskless = block.memberships.length === 0
      if (!membership && !taskless) return
      try {
        if (membership) {
          await reviewBlock({
            timeBlockTaskId: membership._id,
            ...toReviewBlockArgs(value),
          })
        } else {
          // A block without tasks is reviewed once, on the block itself.
          await reviewTaskless({
            blockId: block._id,
            ...toReviewBlockArgs(value),
          })
        }
        if (value.planAgain && canPlanAgain(value.outcome)) {
          planAgainRequested.current = true
        }
        const nextIndex = nextReviewStepIndex(block.memberships, stepIndex)
        if (nextIndex !== undefined) {
          setStepIndex(nextIndex)
          const remainingMinutes = calculateRemainingMinutes(
            plannedMinutesFor(block),
            block.memberships,
            nextIndex,
          )
          form.reset(emptyReviewBlockValues(remainingMinutes))
        } else if (planAgainRequested.current) {
          // Open the re-plan now, then return to the caller (or the queue).
          setPlanAgain({ blockId: block._id, draft: planAgainDraft(block) })
        } else {
          finish(block._id)
        }
      } catch {
        form.setErrorMap({
          onSubmit: { form: MUTATION_ERROR, fields: {} },
        })
      }
    },
  })

  useEffect(() => {
    if (!block || !open) return
    planAgainRequested.current = false
    const initialIndex = firstReviewStepIndex(block.memberships)
    setStepIndex(initialIndex)
    const remainingMinutes = calculateRemainingMinutes(
      plannedMinutesFor(block),
      block.memberships,
      initialIndex,
    )
    form.reset(emptyReviewBlockValues(remainingMinutes))
  }, [block?._id, open])

  const primaryLabel = onSaved ? 'Save & next' : 'Save'
  const currentMembership = block?.memberships[stepIndex]
  const membershipCount = block?.memberships.length ?? 0

  return (
    <>
      <Dialog
        open={open && planAgain == null}
        onOpenChange={(next) => (!next ? onClose() : undefined)}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              Review block
              {positionLabel ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {positionLabel}
                </span>
              ) : null}
              {membershipCount > 0 ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  Task {stepIndex + 1} of {membershipCount}
                </span>
              ) : null}
            </DialogTitle>
          </DialogHeader>

          {block ? (
            <form.AppForm>
              <Form
                onSubmit={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  void form.handleSubmit()
                }}
              >
                <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                  <p className="font-medium">{block.title}</p>
                  {currentMembership ? (
                    <p className="mt-1 text-muted-foreground">
                      {currentMembership.taskTitle}
                    </p>
                  ) : null}
                  <p className="mt-1 text-muted-foreground">
                    {showDate ? `${formatShortDate(block.start)} · ` : null}
                    {msToTimeLabel(block.start)} – {msToTimeLabel(block.end)}
                  </p>
                </div>

                <FieldGroup>
                  <form.AppField name="outcome">
                    {(field) => (
                      <Field>
                        <FieldLabel>Outcome</FieldLabel>
                        <div className="flex rounded-md border border-input p-0.5">
                          {OUTCOMES.map((item) => (
                            <button
                              key={item.value}
                              type="button"
                              className={cn(
                                'flex-1 rounded-sm px-2 py-1.5 text-sm transition-colors',
                                field.state.value === item.value
                                  ? 'bg-primary text-primary-foreground'
                                  : 'text-muted-foreground hover:bg-accent',
                              )}
                              onClick={() => field.handleChange(item.value)}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </Field>
                    )}
                  </form.AppField>
                  <form.AppField name="actualMinutes">
                    {(field) => (
                      <field.TextField
                        id="review-minutes"
                        label="Time spent (minutes)"
                        type="number"
                        min={0}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="focus">
                    {(field) => (
                      <field.SelectField
                        id="review-focus"
                        label="Focus"
                        placeholder="Optional"
                        options={FOCUS_OPTIONS}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="note">
                    {(field) => (
                      <field.TextareaField
                        id="review-note"
                        label="Note"
                        rows={2}
                        placeholder="Optional reflection"
                      />
                    )}
                  </form.AppField>
                  <FieldGroup>
                    <form.AppField name="nextStep">
                      {(field) => (
                        <field.TextField
                          id="review-next"
                          label="Next step"
                          placeholder="What comes next?"
                        />
                      )}
                    </form.AppField>
                    <form.Subscribe selector={(state) => state.values.nextStep}>
                      {(nextStep) => (
                        <form.AppField name="scheduleNext">
                          {(field) => (
                            <field.CheckboxField
                              label="Schedule it now (same time tomorrow)"
                              disabled={!nextStep.trim()}
                            />
                          )}
                        </form.AppField>
                      )}
                    </form.Subscribe>
                  </FieldGroup>
                  <form.Subscribe selector={(state) => state.values.outcome}>
                    {(outcome) =>
                      canPlanAgain(outcome) ? (
                        <form.AppField name="planAgain">
                          {(field) => (
                            <field.CheckboxField label="Plan again: open a copy for tomorrow after saving" />
                          )}
                        </form.AppField>
                      ) : null
                    }
                  </form.Subscribe>
                  <FieldGroup>
                    <form.AppField name="blocked">
                      {(field) => <field.CheckboxField label="Blocked" />}
                    </form.AppField>
                    <form.Subscribe selector={(state) => state.values.blocked}>
                      {(blocked) =>
                        blocked ? (
                          <form.AppField name="blockedReason">
                            {(field) => (
                              <field.TextField
                                id="review-blocked-reason"
                                label="Blocked reason"
                                labelClassName="sr-only"
                                placeholder="What blocked you?"
                              />
                            )}
                          </form.AppField>
                        ) : null
                      }
                    </form.Subscribe>
                  </FieldGroup>
                </FieldGroup>

                <form.FormError />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <form.SubmitButton label={primaryLabel} />
                </DialogFooter>
              </Form>
            </form.AppForm>
          ) : null}
        </DialogContent>
      </Dialog>
      {planAgain ? (
        <AddTimeBlockModal
          open
          onClose={() => {
            const { blockId } = planAgain
            setPlanAgain(null)
            finish(blockId)
          }}
          defaultIntent={planAgain.draft.title}
          defaultTasks={planAgain.draft.tasks}
          defaultDateKey={planAgain.draft.dateKey}
          defaultStart={planAgain.draft.start}
          defaultEnd={planAgain.draft.end}
        />
      ) : null}
    </>
  )
}
