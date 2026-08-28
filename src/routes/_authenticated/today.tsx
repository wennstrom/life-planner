import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { TimeBlockView } from '../../../convex/lib/timeBlockMemberships'
import { DayRail } from '~/components/calendar/DayRail'
import { AddTimeBlockModal } from '~/components/time-block/AddTimeBlockModal'
import { ReviewBlockModal } from '~/components/time-block/ReviewBlockModal'
import { useAppForm } from '~/components/form/form-hook'
import { formatDisplayDate } from '~/lib/dates'
import { formatMinutes } from '~/lib/format'
import { shutdownNoteSchema } from '~/lib/forms/shutdown-note'
import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/button'
import { FieldGroup, Form } from '~/components/ui/field'
import { Textarea } from '~/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'

export const Route = createFileRoute('/_authenticated/today')({
  component: TodayPage,
})

function TodayPage() {
  const { data } = useSuspenseQuery(convexQuery(api.today.get, {}))
  const { data: blocks } = useSuspenseQuery(
    convexQuery(api.timeBlocks.listForDay, { dateKey: data.dateKey }),
  )
  const { data: needingReview } = useSuspenseQuery(
    convexQuery(api.timeBlocks.listNeedingReview, { dateKey: data.dateKey }),
  )

  const saveIntention = useMutation(api.today.saveIntention)
  const completeShutdown = useMutation(api.today.completeShutdown)
  const createFromTask = useMutation(api.timeBlocks.createFromTask)
  const updateBlock = useMutation(api.timeBlocks.update)

  const [blockModal, setBlockModal] = useState<{
    start?: number
    dateKey?: string
    block?: TimeBlockView | null
  } | null>(null)
  const [intentionBody, setIntentionBody] = useState(data.dayRecord?.intention ?? '')
  const [shutdownOpen, setShutdownOpen] = useState(false)
  const [shutdownNoteOpen, setShutdownNoteOpen] = useState(false)
  const [shutdownIndex, setShutdownIndex] = useState(0)
  const [railReviewBlock, setRailReviewBlock] = useState<TimeBlockView | null>(
    null,
  )

  const shutdownForm = useAppForm({
    defaultValues: { note: data.dayRecord?.shutdownNote ?? '' },
    validators: { onSubmit: shutdownNoteSchema },
    onSubmit: async ({ value }) => {
      try {
        await completeShutdown({
          note: value.note.trim(),
          dateKey: data.dateKey,
        })
        setShutdownNoteOpen(false)
      } catch {
        shutdownForm.setErrorMap({
          onSubmit: {
            form: 'Could not complete shutdown. Please try again.',
            fields: {},
          },
        })
      }
    },
  })

  const taskMap = useMemo(
    () => new Map(data.tasks.map((task) => [task._id, task])),
    [data.tasks],
  )

  const dayStats = useMemo(() => {
    const plannedMinutes = blocks.reduce(
      (sum, block) => sum + Math.round((block.end - block.start) / 60000),
      0,
    )
    return {
      plannedCount: blocks.length,
      reviewedCount: blocks.filter(
        (block) =>
          block.memberships.length > 0 &&
          block.memberships.every((m) => m.review != null),
      ).length,
      needReviewCount: needingReview.length,
      plannedMinutes,
    }
  }, [blocks, needingReview.length])

  useEffect(() => {
    setIntentionBody(data.dayRecord?.intention ?? '')
  }, [data.dayRecord?._id, data.dayRecord?.intention])

  useEffect(() => {
    if (!shutdownNoteOpen) return
    shutdownForm.reset({ note: data.dayRecord?.shutdownNote ?? '' })
  }, [shutdownNoteOpen, data.dayRecord?._id, data.dayRecord?.shutdownNote])

  const currentShutdownBlock = needingReview[shutdownIndex] ?? null
  const pendingMembershipTaskId = (block: TimeBlockView | null) =>
    block?.memberships.find((m) => m.review === undefined)?.taskId ??
    block?.memberships[0]?.taskId
  const currentShutdownTaskId = pendingMembershipTaskId(currentShutdownBlock)
  const currentShutdownTask = currentShutdownTaskId
    ? (taskMap.get(currentShutdownTaskId) ?? null)
    : null
  const railReviewTaskId = pendingMembershipTaskId(railReviewBlock)
  const railReviewTask = railReviewTaskId
    ? (taskMap.get(railReviewTaskId) ?? null)
    : null

  const startShutdown = () => {
    setShutdownIndex(0)
    if (needingReview.length > 0) {
      setShutdownOpen(true)
    } else {
      setShutdownNoteOpen(true)
    }
  }

  const advanceShutdown = () => {
    const nextIndex = shutdownIndex + 1
    if (nextIndex >= needingReview.length) {
      setShutdownOpen(false)
      setShutdownIndex(0)
      setShutdownNoteOpen(true)
    } else {
      setShutdownIndex(nextIndex)
    }
  }

  const shutdownCompletedAt = data.dayRecord?.shutdownCompletedAt
  const shutdownTimeLabel = shutdownCompletedAt
    ? new Date(shutdownCompletedAt).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null

  return (
    <section>
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Today</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDisplayDate(new Date())} · {blocks.length} time blocks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={startShutdown}>
            Start shutdown
          </Button>
          <Button type="button" onClick={() => setBlockModal({ dateKey: data.dateKey })}>
            + Add time block
          </Button>
        </div>
      </header>

      {shutdownCompletedAt ? (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40">
          <p className="text-sm font-medium">
            Shut down at {shutdownTimeLabel}
          </p>
          {data.dayRecord?.shutdownNote ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {data.dayRecord.shutdownNote}
            </p>
          ) : null}
        </div>
      ) : null}

      {!shutdownCompletedAt && needingReview.length > 0 ? (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-medium">
                {needingReview.length} block
                {needingReview.length === 1 ? '' : 's'} need review
              </span>
              <span className="ml-2 text-muted-foreground">
                {needingReview.map((b) => b.title).join(', ')}
              </span>
            </div>
            <Button type="button" size="sm" onClick={startShutdown}>
              Start shutdown
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mb-6">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Today&apos;s intention
        </h3>
        <Textarea
          className="min-h-[72px] bg-card shadow-soft"
          value={intentionBody}
          onChange={(e) => setIntentionBody(e.target.value)}
          onBlur={() =>
            void saveIntention({ intention: intentionBody, dateKey: data.dateKey })
          }
          placeholder="What matters today? What are you carrying over?"
          rows={2}
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TodayStat value={dayStats.plannedCount} label="Blocks planned" />
        <TodayStat
          value={dayStats.reviewedCount}
          label="Reviewed"
          tone="success"
        />
        <TodayStat
          value={dayStats.needReviewCount}
          label="Need review"
          tone="warning"
        />
        <TodayStat
          value={formatMinutes(dayStats.plannedMinutes)}
          label="Planned time"
        />
      </div>

      <div>
        <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Today&apos;s schedule{' '}
          <span className="font-normal normal-case text-muted-foreground">
            ↔ Google
          </span>
        </h3>
        <DayRail
          blocks={blocks}
          taskMap={taskMap}
          date={new Date()}
          now={Date.now()}
          onCreateFromTask={(taskId, start, end) =>
            void createFromTask({ taskId, start, end })
          }
          onUpdateBlock={(blockId, patch) =>
            void updateBlock({ blockId, ...patch })
          }
          onReviewBlock={setRailReviewBlock}
          onEmptySlotClick={({ startMs, dateKey }) =>
            setBlockModal({ start: startMs, dateKey })
          }
          onEditBlock={(block) => setBlockModal({ block })}
        />
      </div>

      <AddTimeBlockModal
        open={blockModal != null}
        onClose={() => setBlockModal(null)}
        block={blockModal?.block}
        defaultDateKey={blockModal?.dateKey ?? data.dateKey}
        defaultStart={blockModal?.start}
      />

      <ReviewBlockModal
        block={shutdownOpen ? currentShutdownBlock : null}
        task={currentShutdownTask}
        positionLabel={
          shutdownOpen && needingReview.length > 1
            ? `${shutdownIndex + 1} of ${needingReview.length}`
            : undefined
        }
        open={shutdownOpen}
        onClose={() => {
          setShutdownOpen(false)
          setShutdownIndex(0)
        }}
        onSaved={advanceShutdown}
      />

      <Dialog
        open={shutdownNoteOpen}
        onOpenChange={setShutdownNoteOpen}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Close the day</DialogTitle>
            <DialogDescription>
              Write a quick note about what happened today and what you&apos;ll
              pick up next.
            </DialogDescription>
          </DialogHeader>
          <shutdownForm.AppForm>
            <Form
              onSubmit={(event) => {
                event.preventDefault()
                event.stopPropagation()
                void shutdownForm.handleSubmit()
              }}
            >
              <FieldGroup>
                <shutdownForm.AppField name="note">
                  {(field) => (
                    <field.TextareaField
                      label="Shutdown note"
                      labelClassName="sr-only"
                      placeholder="Today I finished… Tomorrow I'll start with…"
                      rows={5}
                    />
                  )}
                </shutdownForm.AppField>
              </FieldGroup>
              <shutdownForm.FormError />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShutdownNoteOpen(false)}
                >
                  Cancel
                </Button>
                <shutdownForm.SubmitButton label="Shutdown complete" />
              </DialogFooter>
            </Form>
          </shutdownForm.AppForm>
        </DialogContent>
      </Dialog>

      <ReviewBlockModal
        block={railReviewBlock}
        task={railReviewTask}
        open={railReviewBlock != null}
        onClose={() => setRailReviewBlock(null)}
      />
    </section>
  )
}

function TodayStat({
  value,
  label,
  tone,
}: {
  value: string | number
  label: string
  tone?: 'success' | 'warning'
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-soft">
      <p
        className={cn(
          'text-2xl font-semibold tabular-nums',
          tone === 'success' && 'text-success',
          tone === 'warning' && 'text-warning',
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
