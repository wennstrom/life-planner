# Tasks and Time Blocks — Design

**Date:** 2026-08-13
**Status:** Approved (pending implementation)
**Amends:** `docs/superpowers/specs/2026-06-29-life-planner-design.md` (sections 3, 5)

## 1. Goal

Make the time block the unit of work. A task is a container that accumulates
blocks; a block is one concrete step with its own intent; a finished block gets
reviewed, and those reviews roll up into per-task tracking (time spent, block
count, history).

Inspired by Cal Newport's time-block planning and shutdown ritual, adapted for
software work. Deliberately smaller than his system.

## 2. Concepts

| Term | Meaning |
| --- | --- |
| **Task** | Something that needs doing. Lives in the backlog until blocks are planned against it. Owns an optional estimate and all tracking rollups. |
| **Block** | A scheduled sitting with its own intent — "Write refresh-token unit tests", not "Implement OAuth token refresh". Optionally linked to a task. May also be a personal block or a Google-sourced meeting with no task. |
| **Intent** | The block's own title: what you will get done in that sitting. |
| **Review** | What happened in one block. At most one per block. Absent means unreviewed. |
| **Active** (task) | Derived, never stored: not done and has at least one block. |
| **Shutdown** | End-of-day pass over today's unreviewed task-linked blocks. |

**Planning is adding a block.** `scheduledDate` and the `today` task status are
removed: a task is on today if and only if it has a block today. This is the
core behavioral change — with no blocks planned, Today is empty.

## 3. Data model

No new tables.

### 3.1 `tasks`

Removed:

- `scheduledDate` field and the `by_user_scheduledDate` index.
- The `"today"` member of the status union. `status` becomes
  `v.union(v.literal("backlog"), v.literal("done"))`.

Added:

- `estimateMinutes: v.optional(v.number())` — stored in minutes so every
  duration in the system shares one unit. The UI presents it as hours.

`active` is computed by the stats helper, not stored, so it cannot drift from
the blocks that justify it.

### 3.2 `timeBlocks`

`title` continues to hold the block's intent. Renaming it to `intent` would mean
migrating every existing block and rewriting the sync paths for no behavioral
gain; the UI labels the field "What will you get done?" instead.

Added index: `.index("by_task", ["taskId"])`.

Added field:

```typescript
review: v.optional(
  v.object({
    outcome: v.union(
      v.literal("done"),
      v.literal("partial"),
      v.literal("missed"),
    ),
    actualMinutes: v.number(),
    focus: v.optional(
      v.union(
        v.literal("deep"),
        v.literal("shallow"),
        v.literal("interrupted"),
      ),
    ),
    note: v.optional(v.string()),
    nextStep: v.optional(v.string()),
    blockedReason: v.optional(v.string()),
    reviewedAt: v.number(),
  }),
),
```

Rationale for embedding rather than a `blockReviews` table: a review is 1:1 with
a block, so there is no join for the history list, and "unreviewed" is an absent
field rather than a negative lookup across tables.

Blocked is represented solely by `blockedReason` being present — no companion
boolean that could contradict it.

## 4. Backend surface

### 4.1 `convex/timeBlocks.ts`

- `create` — gains `taskId: v.optional(v.id("tasks"))`. `title` is the intent.
  Ownership of the task is verified when supplied. Existing Google outbound
  scheduling is unchanged.
- `createFromTask` — unchanged; still backs drag-to-plan on the rail.
- `review` (new mutation) — args: `blockId`, `outcome`, `actualMinutes`,
  `focus?`, `note?`, `nextStep?`, `blockedReason?`, `taskDone?`,
  `scheduleNext?`. In one transaction it:
  1. Writes the `review` object with `reviewedAt: Date.now()`. Reviewing an
     already-reviewed block overwrites it (idempotent, no error).
  2. When `taskDone` is true and the block has a `taskId`, patches that task to
     `status: "done"` with `completedAt: Date.now()`.
  3. When `scheduleNext` is true, requires a non-empty `nextStep` and a
     `taskId`, and creates a follow-up block: same clock time on the next day,
     same planned duration as the reviewed block, `title` set to `nextStep`,
     same `taskId`. It syncs to Google like any created block. If either
     precondition is missing, the flag is ignored.
- `listNeedingReview` (new query) — args: `dateKey?`. Returns blocks where
  `origin === "app"`, `taskId != null`, `end <= Date.now()`, `review` is
  absent, and the block starts within that calendar day (default today).
  Scoped to a single day on purpose: an unbounded queue of missed reviews is
  noise. Older unreviewed blocks stay reachable from the task's History tab.
- `remove`, `update`, `markSynced`, `deleteInternal`, `listForDay`,
  `listForRange` — unchanged.

### 4.2 `convex/lib/taskStats.ts` (new)

One helper, used by every surface that lists tasks. It scans the user's blocks
once via `by_user` and returns:

```typescript
Map<Id<"tasks">, {
  blockCount: number;        // all blocks, planned included
  spentMinutes: number;      // sum of review.actualMinutes only
  focusCounts: { deep: number; shallow: number; interrupted: number };
  latestNextStep?: string;   // most recent review that carried a nextStep
  latestBlockedReason?: string; // set only if the single most recent review is blocked
}>
```

Unreviewed blocks contribute zero minutes, so the number never overstates what
you actually did. Callers derive `active` as `status !== "done" && blockCount > 0`.

A single grouped scan matches how `today.get` and `backlog.get` already work
(collect, then filter in memory) and avoids one index read per task. Known
limit: the scan grows with block history. If it becomes slow, the fix is
denormalized counters on the task, and that complexity is not worth paying yet.

### 4.3 `convex/today.ts`

`get` derives its task list from blocks: collect today's blocks, take the
distinct `taskId`s, and order the tasks by their first block's start time. Tasks
completed today stay in the list (they have blocks today) and render as done —
a day view that hides what you finished is a worse day view, and shutdown needs
them present. Each task carries its project and its stats.

### 4.4 `convex/backlog.ts`

`get` keeps returning every task that is not done, grouped by project, now
enriched with stats so rows can show the rollup and the derived active badge.

### 4.5 `convex/tasks.ts`

- `create` — drops the `scheduledDate` arg; always creates with
  `status: "backlog"`.
- `update` — drops `scheduledDate` and all status-derivation logic tied to it.
  Status edits remain explicit.
- `sendToToday` and `removeFromToday` — deleted. No UI calls them, and they
  encode the removed model.

## 5. Google Calendar sync

Two changes, both narrow:

- **Outbound.** The event summary becomes `${task.title} — ${block.title}` when
  the block has a task, and `block.title` alone otherwise.
  `google/outboundQueries.ts` extends its internal query to return the linked
  task's title alongside the block so `outbound.syncBlock` can compose it.
- **Inbound.** `google/inboundMutations.ts` stops patching `title` when the
  existing row has `origin === "app"`; it still applies `start`, `end`, sync
  metadata, and cancellations. Without this guard the composed summary is
  re-ingested as the block's intent and re-composed on the next push, growing
  each round trip.

Reviews never leave the app.

## 6. UI

### 6.1 Today (`src/routes/_authenticated/today.tsx`)

Layout, task list, quick note and rail all stay. Changes:

- Header button becomes **+ Add time block**, opening `AddTimeBlockModal`.
- A shutdown bar renders under the header only when `listNeedingReview` is
  non-empty: a count, the block intents, and a **Start shutdown** button. It
  walks the queue through `ReviewBlockModal` with Save & next. The queue lives
  here, not in the modal.
- The task list is fed by the derived `today.get`.
- `AddTaskModal` is no longer mounted here.

### 6.2 `src/components/time-block/AddTimeBlockModal.tsx` (rewrite)

The current file is a stub with a broken `import useState from 'react'` and
fields copied from the task modal. Fields, in order:

1. **Task** — searchable select, optional (empty means a personal block). The
   list offers a *create task* option that calls `tasks.create` with just a
   title and selects the result, so a thought arriving mid-planning does not
   force a detour to the Backlog page.
2. **What will you get done?** — required text; becomes `title`.
3. **Date** — defaults to today.
4. **Start** — time input.
5. **Duration** — number input in minutes, stepper, defaults to 60.

Props accept prefill (`defaultTaskId`, `defaultIntent`, `defaultStart`) so three
callers share one component: the Today header, a backlog row's plan action, and
a review's next step.

No notes field: reflection belongs in the review, not the plan.

### 6.3 `src/components/time-block/ReviewBlockModal.tsx` (new)

Reviews exactly one block. Shows the block's intent, task and planned time as
read-only context, then: outcome (segmented, three options), time spent (number
input in minutes, prefilled from the planned duration), focus (deep / shallow /
interrupted), optional note, optional next step with a *schedule it now*
checkbox, a *blocked* checkbox that reveals a reason field, and a *task is
finished* checkbox.

An optional position label ("1 of 2") and an `onSaved` callback let the Today
page drive it as a queue, while the rail opens it for a single block with no
queue involved. Outcome plus the prefilled time means a "went fine" review is
one click.

### 6.4 Task surfaces

- `TaskRow` — the three-way status select becomes a done toggle plus a derived
  **active** badge, and the row gains a compact `3h 10m / 5h · 3 blocks` line.
- `EditTaskModal` — loses the scheduled-date field, gains the estimate (entered
  in hours, stored as minutes), and is wrapped in **Details** / **History**
  tabs. The estimate lives on Details.
- `TaskHistory` (new component) — the History tab: a rollup strip (spent of
  estimate, block count, deep-block count) over a list of blocks newest first,
  each showing date, intent, outcome tag, time spent, and focus plus note
  beneath. Unreviewed past blocks expose a review affordance here.
- `src/components/ui/tabs.tsx` (new) — the shadcn tabs primitive, the only new
  dependency in this design.
- `AddTaskModal` — drops its `scheduledDate` prop.

### 6.5 Backlog (`src/routes/_authenticated/backlog.tsx`)

Grouping, filtering and delete confirmation stay. Each row gains a **plan**
action that opens `AddTimeBlockModal` with the task prefilled — the replacement
for the removed "send to Today". Rows show the same rollup and derived active
badge as elsewhere, via `TaskRow`.

### 6.6 Calendar surfaces

- `DayRail` and `WeekView` — a block renders its intent as the label with the
  task name as a small tag, and blocks needing review carry a marker that opens
  `ReviewBlockModal`.
- `src/routes/_authenticated/calendar.tsx` — its `window.prompt` block creation
  is replaced by `AddTimeBlockModal`. Its unscheduled-task sidebar, which
  currently filters on `scheduledDate`, filters on `status === "backlog"`.

## 7. Migration

`@convex-dev/migrations` is not installed, and for a single user with this
volume a one-off `internalMutation` in `convex/migrations.ts` is the right
weight. Convex validates existing documents against the schema, so the field
removal must run as widen → migrate → narrow across three deploys:

1. **Widen.** Add `estimateMinutes`, `review`, and the `by_task` index. Leave
   `scheduledDate` in place and keep `"today"` in the status union. Deploy.
2. **Migrate.** Run `migrations.dropScheduledDate`: for every task with
   `status: "today"`, patch to `"backlog"`; for every task with a
   `scheduledDate`, clear it.
3. **Narrow.** Remove `scheduledDate`, narrow the status union to
   `backlog | done`, drop `by_user_scheduledDate`. Deploy.

Narrowing before the data is clean is the one sequence that breaks the deploy,
so these stay separate steps.

The migration does not invent blocks for tasks that were scheduled for today —
it would have to guess at times. Those tasks return to the backlog to be
re-planned, so Today will be empty on first open after migrating.

Existing blocks have no `review`, which correctly reads as unreviewed. Because
`listNeedingReview` is scoped to a single day, historical blocks do not flood
the shutdown bar.

## 8. Testing

Convex function tests (`npm test`):

- `timeBlocks.review` — writes the review; overwrites on re-review; marks the
  task done under `taskDone`; creates the follow-up block under `scheduleNext`
  at the same clock time next day with the same duration; ignores
  `scheduleNext` without a `nextStep` or `taskId`; rejects another user's block.
- `timeBlocks.listNeedingReview` — excludes Google-origin blocks, task-less
  blocks, blocks that have not ended, and already-reviewed blocks.
- `taskStats` — sums only reviewed `actualMinutes`; unreviewed blocks count as
  zero minutes but do count toward `blockCount`; `active` derivation.
- `today.get` — derives tasks from today's blocks, dedupes repeats, orders by
  first block start, retains tasks completed today.
- Sync — outbound composes the summary from task title plus intent and uses the
  bare intent when unlinked; inbound leaves `title` untouched on an app-origin
  block while still applying `start` and `end`.
- `migrations.dropScheduledDate` — maps `today` to `backlog` and clears
  `scheduledDate`.

Existing assertions in `convex/tasks.test.ts` and `convex/sync.test.ts` that
reference `scheduledDate` or `status: "today"` are updated in the same pass.

Manual pass: plan a block from Today, confirm the task appears in the list and
the event appears in Google with the composed summary; edit the event's time in
Google and confirm the intent survives; let a block end, run shutdown, confirm
the rollup and history update; check that a task with no blocks stays out of
Today.

## 9. Risks

- **Sync title loop** — the composed summary being re-ingested. Guarded by the
  inbound `origin === "app"` title skip and covered by a test rather than by
  care.
- **Migration ordering** — narrowing the schema before clearing data fails the
  deploy. Mitigated by the three-step sequence.
- **Empty Today after migration** — expected and one-time; called out above.
- **Stats scan growth** — one full block scan per task-listing query. Acceptable
  now; documented escape hatch is denormalized counters.
- **Review friction** — six fields could go unused. Mitigated by making outcome
  plus prefilled time sufficient and everything else optional.

## 10. Non-goals

- Pushing review notes into the Google event description.
- Weekly, project-level or cross-task analytics.
- A live start/stop timer. Actual time comes from reviews.
- Recurring blocks or a recurring-task engine.
- Reviewing Google-sourced meetings or task-less personal blocks.
- Multi-day shutdown catch-up queues.

## 11. Files

**Convex**

- Modify: `schema.ts`, `timeBlocks.ts`, `tasks.ts`, `today.ts`, `backlog.ts`,
  `google/outbound.ts`, `google/outboundQueries.ts`, `google/inboundMutations.ts`
- Add: `lib/taskStats.ts`, `migrations.ts`
- Tests: `tasks.test.ts`, `sync.test.ts` (modify), plus new coverage for review,
  stats and migration

**Frontend**

- Modify: `routes/_authenticated/today.tsx`, `routes/_authenticated/calendar.tsx`,
  `routes/_authenticated/backlog.tsx`, `components/tasks/TaskRow.tsx`,
  `components/tasks/EditTaskModal.tsx`, `components/tasks/AddTaskModal.tsx`,
  `components/calendar/DayRail.tsx`, `components/calendar/WeekView.tsx`
- Rewrite: `components/time-block/AddTimeBlockModal.tsx`
- Add: `components/time-block/ReviewBlockModal.tsx`,
  `components/tasks/TaskHistory.tsx`, `components/ui/tabs.tsx`
