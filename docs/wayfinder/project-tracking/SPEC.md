# Project tracking: connect projects to time — Spec

**Labels:** `wayfinder:map`
**Status:** Draft (2026-10-24)
**Source:** `backlog.md` → section 1

---

## Destination

A project shows where your time went and what to do next, without asking you to enter anything new. Each card and project page answers four questions from data the app already records:

1. **How much time is this getting?** Planned and spent minutes, this week and all-time, split into deep and shallow work.
2. **Is it moving?** When you last worked on it, plus a quiet hint if it has stalled.
3. **What's next?** The next unfinished task and the latest "next step" from a review.
4. **Will it make the goal date?** Estimated hours left against working days left.

There's also a project log of reviewed blocks, and an optional note explaining the health you set.

## Principles that apply here

From `backlog.md`:

- **Information only.** Nothing here changes `health`, blocks a save, or sends a notification. The stalled flag and the remaining-work line are hints.
- **Calm by default.** No scores or streaks. Use plain numbers and relative dates in muted text. Only an overdue goal uses the existing destructive colour.
- **No new input required.** Everything except the health note comes from `timeBlocks`, `timeBlockTasks.review` and `tasks`.

## Current state (what we build on)

| Piece | Where | Notes |
|---|---|---|
| Project ↔ task | `tasks.projectId`, index `by_project` | A task belongs to at most one project. |
| Block ↔ task | `timeBlockTasks` (`blockId`, `taskId`, `order`, `review?`) | **A block can hold several tasks.** These may come from different projects. |
| Review | `timeBlockTasks.review` (`outcome`, `actualMinutes`, `focus?`, `note?`, `nextStep?`, `blockedReason?`, `reviewedAt`) | Recorded per membership, not per block. `ReviewBlockModal` already splits the block's minutes across memberships (`calculateRemainingMinutes`), so `actualMinutes` is already per task. |
| Per-task rollup | `convex/lib/taskStats.ts` → `buildTaskStatsMap` | Scans every `timeBlockTasks` row for the user. Used by `backlog.ts` and `today.ts`. |
| Per-task history | `src/components/tasks/TaskHistory.tsx` + `timeBlocks.listForTask` | The UI the project log reuses. |
| Progress | `src/lib/project-progress.ts` → `projectProgress` | Done tasks out of all tasks, by the `isDone` column. |
| Health / goal | `projects.health?`, `projects.goalDate?`, `src/lib/project-health.ts` | Set by hand in `EditProjectModal`. |
| Projects list | `routes/_authenticated/projects/index.tsx` | Loads `projects.list`, `tasks.list`, `boardColumns.list` and filters tasks per card on the client. |
| Settings | — | **`userSettings` doesn't exist yet** (Foundation item in `backlog.md`). |

## Core definitions

These rules hold for every feature below. Implement them once, in `convex/lib/projectStats.ts`.

### Attributing a block to a project

A membership (`timeBlockTasks` row) counts toward project **P** when the membership's task has `projectId === P` **at query time**.

- If you move a task to another project, its history moves too. This matches how `projectProgress` already works, and avoids storing a `projectId` on memberships.
- Archived tasks (`archived === true`) **still count** toward time. The time was spent. They're left out of next action and remaining work.
- Tasks with no project are ignored.

### Planned minutes

A block's planned duration is `block.end − block.start`. It's **split evenly across the block's memberships**, so a 90-minute block with three tasks gives 30 minutes to each task's project. Leftover minutes from the split go to the lowest `order`. Without this split, a mixed block would be counted in full for each project, and planned time would add up to more than the time you blocked.

Planned counts every block that has a membership, past or future, reviewed or not, and from either origin (`app` or `google`).

### Spent minutes

Spent is the sum of `review.actualMinutes` across the project's memberships. Unreviewed blocks add nothing to spent, because the app doesn't guess. This is the same rule `buildTaskStatsMap` uses.

### "This week"

The week runs from local Monday 00:00 to the next Monday 00:00 (`startOfWeekMonday` in `src/lib/dates`). A block belongs to the week its `block.start` falls in. **The client computes `weekStartMs` and `weekEndMs` and passes them in**, because the Convex runtime doesn't know the user's timezone. When `userSettings.weekStartDay` exists it replaces Monday. Until then Monday is hard-coded in one helper.

### Focus split

| Bucket | From `review.focus` |
|---|---|
| Deep | `"deep"` |
| Shallow | `"shallow"` |
| Other | `"interrupted"` or unset |

Each bucket is measured in **minutes** (`actualMinutes`), not block counts. All-time is shown, and this week is too when it isn't zero. When Optional block kind (backlog §3) lands, the review's `focus` will be pre-filled from it. No change is needed here.

### "Now"

Queries never read `Date.now()` (`convex/_generated/ai/guidelines.md`). The client passes `nowMs` **rounded down to the minute** and refreshes it once a minute through a small `useNowMinute()` hook. That keeps cached results reusable and lets "3 days ago" stay current.

## Data model changes

```ts
projects: defineTable({
  // …existing fields
  healthNote: v.optional(v.string()), // ≤ 140 chars, trimmed; cleared when health is cleared
})
```

That's the only schema change. Everything else is computed on read.

**Why compute on read:** this is a single-user planner, and `buildTaskStatsMap` already scans every membership row the user has on each backlog and Today load. The project stats do the same scan **once per query** and bucket by project. Guidelines prefer `@convex-dev/aggregate` for sums over large ranges. We note it as the scale-up path (see Risks) and don't adopt it now.

## Backend

### `convex/lib/projectStats.ts` (new, pure where possible)

```ts
export type ProjectTimeStats = {
  plannedWeekMinutes: number
  spentWeekMinutes: number
  spentAllTimeMinutes: number
  focusAllTime: { deep: number; shallow: number; other: number }
  focusWeek: { deep: number; shallow: number; other: number }
  lastBlockStart?: number        // latest block.start ≤ nowMs
  nextBlockStart?: number        // earliest block.start > nowMs (keeps a project from being flagged stalled)
  nextAction?: { taskId: Id<"tasks">; title: string }
  latestNextStep?: { taskId: Id<"tasks">; text: string; reviewedAt: number }
  remaining: {
    estimatedMinutes: number     // Σ max(estimate − spent, 0) over open tasks with an estimate
    unestimatedCount: number     // open tasks with no estimate
    openCount: number
  }
}

export async function buildProjectStatsMap(
  ctx: QueryCtx,
  userId: string,
  window: { weekStartMs: number; weekEndMs: number; nowMs: number },
): Promise<Map<Id<"projects">, ProjectTimeStats>>
```

Build it as one pass over the user's `tasks` (`by_user`), board columns, and `timeBlockTasks` (`by_user`). Blocks are fetched once per distinct `blockId`. Put the even-split, week bucketing, and next-action ordering in plain exported functions so `vitest` can test them without `convex-test`.

### Queries

| Query | Args | Returns | Used by |
|---|---|---|---|
| `projects.stats` | `weekStartMs`, `weekEndMs`, `nowMs` | `Record<Id<"projects">, ProjectTimeStats>` for the user's **active** projects | Projects grid |
| `projects.statsFor` | `projectId`, `weekStartMs`, `weekEndMs`, `nowMs` | `ProjectTimeStats` | Project page |
| `projects.log` | `projectId`, `limit` (default 30, max 200) | `TimeBlockView[]`, newest first, holding only past blocks (`end ≤ nowMs`) with at least one membership in the project, plus `hasMore` | Project log |

`projects.log` also takes `nowMs`, so unreviewed past blocks can show a **Review** button the way `TaskHistory` does. Use **Show more** to raise `limit`. It's a simple cap, not cursor pagination. Each block is grouped once, even when several of the project's tasks share it.

All three check ownership with `requireUserId` and `project.userId === userId`, the same way `projects.get` does.

### Mutation change

`projects.update` gains `healthNote: v.optional(v.union(v.string(), v.null()))`:

- Trim it. An empty value or `null` clears it, using the same `replace` path as clearing `description` or `goalDate`, so add it to `storedProjectFields`'s `omit` set.
- Reject notes over 140 characters.
- Clearing `health` (`health: null`) **also clears `healthNote`**. A reason without a health value means nothing.
- Changing `health` from one value to another **keeps** the note. The modal shows it so you can edit it.

`projects.create` takes the same optional `healthNote`.

## Features

Rough build order. Each item can ship as its own PR.

### F1 — Time per project

**Card** (`ProjectCard.tsx`): add one muted line under the progress row.

```
2h 30m this week · 18h total
```

- "this week" is spent this week. Planned is shown only when it differs from spent: `2h 30m / 4h planned this week · 18h total`.
- If the project has no blocks at all, leave the line out. Don't show `0m`.

**Project page** (`$projectId.tsx`): add a compact stats strip under the progress bar, matching the card's typography.

| This week | All-time |
|---|---|
| 4h planned · 2h 30m spent | 18h spent |
| Deep 1h 45m · Shallow 45m | Deep 12h · Shallow 4h · Other 2h |

Leave out any focus bucket that's zero. If every bucket is zero (nothing reviewed with a focus), leave the focus row out.

Formatting uses `formatMinutes` from `src/lib/format.ts`.

### F2 — Last worked on and stalled projects

- Show `Last block: 3 days ago` on each **active** project, on both the card and the page. "Today" and "Yesterday" are written as words. After that use `N days ago`, and past 60 days switch to the date (`formatDisplayDate`). If the project has never had a block, show nothing.
- **Stalled** means all of these are true:
  - the project is `active`
  - it has at least one open (not-done, not-archived) task
  - it has **no future block** (`nextBlockStart` undefined)
  - `nowMs − (lastBlockStart ?? project._creationTime) ≥ N days`
- When a project is stalled, the "Last block" text gets a small muted `· stalled` suffix, with a tooltip saying "No time blocked in N days". It uses no colour and no icon, and **never touches `health`**.
- `N = userSettings.stalledAfterDays ?? 14`. Until `userSettings` exists, this is a constant `STALLED_AFTER_DAYS_DEFAULT = 14` in `src/lib/project-stats.ts`. The setting should allow 0 (or off) to switch the hint off.

### F3 — Next action per project

- **Next task** is the first open, non-archived task by board position, read right to left: the named non-done column closest to Done comes first, then earlier columns, then the unassigned Backlog bucket. Within a column, tasks go by `order`. The reasoning is that work already in progress is your next action before anything new.
- **Next step** is the newest `review.nextStep` (by `reviewedAt`) among the project's memberships **whose task is still open**. Steps for done tasks are dropped.
- Display:
  - Card: `Next: <task title>` on one line, truncated.
  - Page: `Next: <task title>`, and below it, if there is one, `↳ "<next step>"` with the task it came from when that differs from the next task.
  - Clicking the task opens `EditTaskModal`. This is on the page only. On the card the whole card is a link.
- If no open tasks remain, show nothing. Don't show "All done!" either.

### F4 — Remaining work against the goal date

Only shown on the **project page**, and only when `goalDate` is set and there's at least one open task.

- `estimatedMinutes` = Σ `max(estimateMinutes − spentMinutes, 0)` over open tasks that have an estimate. Spent comes from the per-task rollup, so a task estimated at 4h with 3h spent counts as 1h.
- Working days = Monday–Friday dates from **today through `goalDate` inclusive**, computed on the client from date keys. Weekend days are skipped. When Optional working hours (backlog §3) exists, it decides which weekdays count.
- Copy:
  - All open tasks estimated: `≈ 12h of work left · 9 working days to goal`
  - Some unestimated: `≈ 12h of work left (+3 tasks without estimates) · 9 working days to goal`
  - None estimated: `3 open tasks without estimates · 9 working days to goal`
  - Goal passed: leave out the working-days part. The existing caption already says `Overdue · <date>`.
- **No verdict.** The app never says "behind" and never compares hours to days with a colour. You judge it.

### F5 — Project log

- A **Log** section below the board on the project page, collapsed by default and showing the latest 30 entries. It's backed by `projects.log`.
- Refactor `TaskHistory.tsx` into a presentational `BlockHistoryList` component that takes `blocks` and `filterMembership(m) => boolean`. `TaskHistory` keeps its rollup header and wraps it. The project log wraps it too, with a project-scoped filter.
- Each row shows the date and time range, the block title, the project's task(s) in that block with outcome badge, time spent, focus, note, `nextStep` (new; shown as `Next: …`) and `blockedReason` (new; shown as `Blocked: …`). Add the last two to `TaskHistory` as well, since they're already in the data.
- If a past block's project memberships haven't been reviewed, show a **Review** button that opens `ReviewBlockModal`, as `TaskHistory` already does.
- When the project has no past blocks, show `No blocks yet.`

### F6 — Health with a reason

- In `EditProjectModal`, an optional **Reason** text input (max 140) appears under the health select whenever a health is chosen. Placeholder: `e.g. waiting on API access`.
- Card and page: show the note after the health label, as `At risk · waiting on API access`. On the card it's truncated to one line, and the page shows it in full.
- **Out of scope here:** "optionally ask about it during the weekly review". The weekly review doesn't exist yet (backlog §2). That ticket should read `healthNote` when it's built.

## Frontend plumbing

- `src/lib/project-stats.ts` (new) holds `useWeekWindow()` (local Monday-start window), `useNowMinute()`, `formatLastBlock(lastBlockStart, nowMs)`, `isStalled(stats, project, nowMs, n)`, `workingDaysUntil(today, goalDate)`, `formatRemainingWork(stats.remaining, workingDays)`, and `STALLED_AFTER_DAYS_DEFAULT`.
- The projects grid prefetches `projects.stats` in its loader along with the existing three queries. It passes `stats[project._id]` to `ProjectCard` through a new optional `stats` prop. When the prop is missing the card renders exactly as it does today, so the change is safe for incremental rollout and for other callers.
- The project page uses `useSuspenseQuery(convexQuery(api.projects.statsFor, …))`, matching how the page already loads data.
- Mutations don't need optimistic updates. These are read-only views, and Convex reactivity refreshes them after a review.

## Tests

**Unit (vitest, pure helpers):**
- Even split: 90 minutes over 3 memberships gives 30/30/30, and 100 over 3 gives 34/33/33 with the leftover going to the lowest `order`.
- Week bucketing: a block starting Sunday at 23:30 local belongs to that week, and one starting Monday at 00:00 belongs to the next.
- Next-action ordering: right-to-left columns, Backlog last, `order` within a column, with done and archived tasks skipped.
- `isStalled`: the creation-time fallback, a future block suppressing the flag, no open tasks meaning not stalled, and the boundary at exactly N days.
- `workingDaysUntil`: same day, across a weekend, and a goal in the past.
- `formatRemainingWork`: all three copy variants.

**Convex (`convex-test`, in `projects.test.ts`):**
- `stats` attributes a block with tasks from two projects to each project at the split share.
- Spent counts only reviewed memberships, and the focus buckets add up to the spent total.
- Reassigning a task's `projectId` moves its history.
- `log` returns past blocks only, newest first, honours `limit`, sets `hasMore`, and rejects another user's project.
- `update` with `healthNote`: trims it, clears it on `""` or `null`, clears it when health is cleared, rejects notes over 140 characters, and keeps it when health changes.

**E2E:** none required. The existing smoke test must keep passing.

## Ticket breakdown

| # | Ticket | Depends on |
|---|---|---|
| T1 | `projectStats` lib + `projects.stats` / `statsFor` queries + unit and convex tests | — |
| T2 | F1 time per project (card + page strip) | T1 |
| T3 | F2 last block + stalled hint | T1 |
| T4 | F3 next action | T1 |
| T5 | F4 remaining work vs goal | T1 |
| T6 | `BlockHistoryList` refactor + `projects.log` + F5 project log | — |
| T7 | F6 `healthNote` (schema, mutation, modal, display) | — |

T1, T6 and T7 can run in parallel.

## Decisions taken in this spec (flag if you disagree)

1. **Mixed-project blocks are split evenly** for planned time. The other option, counting the full block for each project, would add up to more than the time you blocked.
2. **Attribution follows the task's current project**, not its project when the block happened.
3. **"Next action" reads the board right to left** (closest to Done first). Reading left to right would surface Backlog items ahead of work in progress.
4. **Remaining work subtracts time already spent** from each task's estimate, with a floor of 0.
5. **The stalled hint needs open tasks and no future block.** A finished project or one with time already booked isn't stalled.
6. **Week starts Monday** and stalled is 14 days. Both are hard-coded in one place until `userSettings` lands.

## Not yet specified

- Whether archived projects should show their totals anywhere, for example on an archive view.
- Whether the Today "Moving forward" panel should use `lastBlockStart`. That's handled by backlog §2 "Fix Moving forward".

## Out of scope

- Changing `health` automatically from any of this data.
- Asking about health in a weekly review (§2).
- Charts or trend lines over time.
- Storing aggregates or adopting `@convex-dev/aggregate`.

## Risks

- **Scan cost.** `buildProjectStatsMap` reads every membership the user has, plus each distinct block. That's fine at a personal scale of thousands of rows. If the project page ever feels slow, the path forward is to store `projectId` on `timeBlockTasks` (kept in sync in `replaceMemberships` and in task moves) and/or adopt `@convex-dev/aggregate`. The query shape stays the same.
- **Google-origin blocks** can't be reviewed (`review` requires `origin === "app"`). They count toward planned time but never toward spent. That's intended, but it could confuse someone who links tasks to Google events.
