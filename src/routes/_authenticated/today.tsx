import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import type { FunctionReturnType } from 'convex/server'
import type { TimeBlockView } from '../../../convex/lib/timeBlockMemberships'
import { DayRail } from '~/components/calendar/DayRail'
import { IntentionBar } from '~/components/today/IntentionBar'
import { TodayContext } from '~/components/today/TodayContext'
import { WeekStrip } from '~/components/today/WeekStrip'
import { AddTimeBlockModal } from '~/components/time-block/AddTimeBlockModal'
import { ReviewBlockModal } from '~/components/time-block/ReviewBlockModal'
import { useAppForm } from '~/components/form/form-hook'
import { PagePending } from '~/components/layout/PagePending'
import { dateFromDateKey, formatDisplayDate } from '~/lib/dates'
import { focusColumnTarget } from '~/lib/focus-column'
import {
  ensureAuthenticatedQueryData,
  prefetchConvexQueries,
} from '~/lib/prefetchConvexQueries'
import { formatMinutes } from '~/lib/format'
import { shutdownNoteSchema } from '~/lib/forms/shutdown-note'
import { nextReviewQueueIndex } from '~/lib/forms/review-block'
import { projectProgress } from '~/lib/project-progress'
import { Button } from '~/components/ui/button'
import { FieldGroup, Form } from '~/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'

export const Route = createFileRoute('/_authenticated/today')({
  loader: async ({ context: { queryClient } }) => {
    const today = await ensureAuthenticatedQueryData<
      FunctionReturnType<typeof api.today.get>
    >(queryClient, convexQuery(api.today.get, {}))
    if (!today) return
    await prefetchConvexQueries(queryClient, [
      convexQuery(api.timeBlocks.listForDay, { dateKey: today.dateKey }),
      convexQuery(api.timeBlocks.listNeedingReview, { dateKey: today.dateKey }),
      convexQuery(api.boardColumns.list, {}),
      convexQuery(api.projects.list, { status: 'active' }),
      convexQuery(api.tasks.list, {}),
    ])
  },
  component: TodayPage,
})

function TodayPage() {
  const queryClient = useQueryClient()
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)
  const selection = useRef(0)

  function onSelectDate(dateKey: string) {
    const request = ++selection.current
    const dayArgs = { dateKey }
    void prefetchConvexQueries(queryClient, [
      convexQuery(api.today.get, dayArgs),
      convexQuery(api.timeBlocks.listForDay, dayArgs),
      convexQuery(api.timeBlocks.listNeedingReview, dayArgs),
    ]).finally(() => {
      if (selection.current === request) setSelectedDateKey(dateKey)
    })
  }

  return (
    <Suspense fallback={<PagePending />}>
      <TodayForDay
        selectedDateKey={selectedDateKey}
        onSelectDate={onSelectDate}
      />
    </Suspense>
  )
}

function TodayForDay({
  selectedDateKey,
  onSelectDate,
}: {
  selectedDateKey: string | null
  onSelectDate: (dateKey: string) => void
}) {
  const { data } = useSuspenseQuery(
    convexQuery(
      api.today.get,
      selectedDateKey ? { dateKey: selectedDateKey } : {},
    ),
  )
  const { data: blocks } = useSuspenseQuery(
    convexQuery(api.timeBlocks.listForDay, { dateKey: data.dateKey }),
  )
  const { data: needingReview } = useSuspenseQuery(
    convexQuery(api.timeBlocks.listNeedingReview, { dateKey: data.dateKey }),
  )
  const { data: boardColumns } = useSuspenseQuery(
    convexQuery(api.boardColumns.list, {}),
  )
  const { data: activeProjects } = useSuspenseQuery(
    convexQuery(api.projects.list, { status: 'active' }),
  )
  const { data: allTasks } = useSuspenseQuery(convexQuery(api.tasks.list, {}))

  const saveIntention = useMutation(api.today.saveIntention)
  const completeShutdown = useMutation(api.today.completeShutdown)
  const createFromTask = useMutation(api.timeBlocks.createFromTask)
  const updateBlock = useMutation(api.timeBlocks.update)
  const updateTask = useMutation(api.tasks.update)
  const ensureDefaults = useMutation(api.boardColumns.ensureDefaults)

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
  const [focusOverrides, setFocusOverrides] = useState<Record<string, boolean>>(
    {},
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
      needReviewCount: needingReview.length,
      plannedMinutes,
    }
  }, [blocks, needingReview.length])

  const doneColumnId = focusColumnTarget(boardColumns, true) ?? undefined

  const timeblockedTaskIds = useMemo(() => {
    const firstStart = new Map<Id<'tasks'>, number>()
    for (const block of blocks) {
      for (const membership of block.memberships) {
        const previous = firstStart.get(membership.taskId)
        if (previous === undefined || block.start < previous) {
          firstStart.set(membership.taskId, block.start)
        }
      }
    }
    return firstStart
  }, [blocks])

  const focusTasks = useMemo(
    () =>
      data.tasks
        .filter((task) => timeblockedTaskIds.has(task._id))
        .sort(
          (a, b) =>
            (timeblockedTaskIds.get(a._id) ?? 0) -
            (timeblockedTaskIds.get(b._id) ?? 0),
        )
        .map((task) => {
          if (!(task._id in focusOverrides)) return task
          if (focusOverrides[task._id]) {
            return {
              ...task,
              columnId: doneColumnId as Id<'boardColumns'> | undefined,
            }
          }
          return doneColumnId != null && task.columnId === doneColumnId
            ? { ...task, columnId: undefined }
            : task
        }),
    [data.tasks, timeblockedTaskIds, focusOverrides, doneColumnId],
  )

  const movingForward = useMemo(
    () =>
      [...activeProjects]
        .sort((a, b) => a.order - b.order)
        .slice(0, 2)
        .map((project) => {
          const { done, total } = projectProgress(
            allTasks.filter((task) => task.projectId === project._id),
            boardColumns,
          )
          return {
            _id: project._id,
            name: project.name,
            order: project.order,
            health: project.health,
            done,
            total,
          }
        }),
    [activeProjects, allTasks, boardColumns],
  )

  useEffect(() => {
    setIntentionBody(data.dayRecord?.intention ?? '')
  }, [data.dateKey, data.dayRecord?._id, data.dayRecord?.intention])

  useEffect(() => {
    setFocusOverrides({})
    setShutdownOpen(false)
    setShutdownNoteOpen(false)
    setShutdownIndex(0)
    setRailReviewBlock(null)
  }, [data.dateKey])

  useEffect(() => {
    if (boardColumns.length === 0) void ensureDefaults({})
  }, [boardColumns, ensureDefaults])

  async function onIntentionBlur() {
    try {
      await saveIntention({ intention: intentionBody, dateKey: data.dateKey })
    } catch {
      // Leave the field on the text the user typed.
    }
  }

  function clearFocusOverride(taskId: Id<'tasks'>) {
    setFocusOverrides(({ [taskId]: _cleared, ...rest }) => rest)
  }

  async function onToggleTask(taskId: Id<'tasks'>, checked: boolean) {
    setFocusOverrides((current) => ({ ...current, [taskId]: checked }))
    try {
      let columns = boardColumns
      if (focusColumnTarget(columns, checked) == null) {
        columns = await ensureDefaults({})
      }
      const columnId = focusColumnTarget(columns, checked)
      if (columnId == null) {
        clearFocusOverride(taskId)
        return
      }
      await updateTask({
        taskId,
        columnId: columnId as Id<'boardColumns'>,
      })
      clearFocusOverride(taskId)
    } catch {
      // Leave the checkbox on the value the user chose.
    }
  }

  useEffect(() => {
    if (!shutdownNoteOpen) return
    shutdownForm.reset({ note: data.dayRecord?.shutdownNote ?? '' })
  }, [shutdownNoteOpen, data.dayRecord?._id, data.dayRecord?.shutdownNote])

  const currentShutdownBlock = needingReview[shutdownIndex] ?? null

  const startShutdown = () => {
    setShutdownIndex(0)
    if (needingReview.length > 0) {
      setShutdownOpen(true)
    } else {
      setShutdownNoteOpen(true)
    }
  }

  const advanceShutdown = (completedBlockId: string) => {
    const nextIndex = nextReviewQueueIndex(
      needingReview,
      shutdownIndex,
      completedBlockId,
    )
    if (nextIndex === undefined) {
      setShutdownOpen(false)
      setShutdownIndex(0)
      setShutdownNoteOpen(true)
    } else {
      setShutdownIndex(nextIndex)
    }
  }

  const shutdownCompleted = data.dayRecord?.shutdownCompletedAt != null

  return (
    <section>
      <header className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="sr-only text-[30px] font-medium tracking-[-1.1px] md:not-sr-only md:text-[33px]">
            Today
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDisplayDate(dateFromDateKey(data.dateKey))} · {blocks.length}{' '}
            time blocks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={startShutdown}
          >
            Start shutdown
          </Button>
          <Button
            type="button"
            className="flex-1 sm:flex-none"
            onClick={() => setBlockModal({ dateKey: data.dateKey })}
          >
            + Add time block
          </Button>
        </div>
      </header>

      <IntentionBar
        value={intentionBody}
        onChange={setIntentionBody}
        onBlur={() => void onIntentionBlur()}
      />

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.48fr)_minmax(280px,1fr)]">
        <section aria-labelledby="today-schedule-heading" className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="today-schedule-heading" className="text-base font-medium">
              Your schedule
            </h2>
            <Link
              to="/calendar"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Week view
            </Link>
          </div>
          <div className="overflow-hidden rounded-[14px] border border-border bg-white">
            <WeekStrip
              today={new Date()}
              selectedDateKey={data.dateKey}
              onSelect={(dateKey) => {
                if (dateKey !== data.dateKey) onSelectDate(dateKey)
              }}
            />
            <DayRail
              blocks={blocks}
              taskMap={taskMap}
              date={dateFromDateKey(data.dateKey)}
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
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
              <ul className="flex flex-wrap items-center gap-4" aria-label="Legend">
                <li className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-event-work" aria-hidden />
                  Work
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-event-personal" aria-hidden />
                  Personal
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-event-google" aria-hidden />
                  Google
                </li>
              </ul>
              <span className="tabular-nums">
                {`${blocks.length} blocks · ${formatMinutes(dayStats.plannedMinutes)} planned`}
              </span>
            </div>
          </div>
        </section>

        <TodayContext
          tasks={focusTasks}
          doneColumnId={doneColumnId}
          projects={movingForward}
          shutdownCompleted={shutdownCompleted}
          shutdownNote={data.dayRecord?.shutdownNote}
          needReviewCount={dayStats.needReviewCount}
          onToggleTask={(taskId, checked) => void onToggleTask(taskId, checked)}
          onAddBlock={() => setBlockModal({ dateKey: data.dateKey })}
          onStartShutdown={startShutdown}
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
        onSaved={(completedBlockId) => {
          if (completedBlockId) {
            advanceShutdown(completedBlockId)
          }
        }}
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
        open={railReviewBlock != null}
        onClose={() => setRailReviewBlock(null)}
      />
    </section>
  )
}
