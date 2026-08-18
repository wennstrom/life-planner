# Tasks and Time Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the time block the unit of work — planning adds blocks, reviews roll up into per-task stats, and Today is derived from today's blocks instead of `scheduledDate`.

**Architecture:** Three deploy steps widen → migrate → narrow the schema. Backend adds embedded block reviews, a shared `taskStats` scan, and block-derived `today.get`. Frontend replaces send-to-today with `AddTimeBlockModal`, adds shutdown via `ReviewBlockModal`, and enriches task rows with rollups.

**Tech Stack:** Convex, React 19, TanStack Router/Query, Radix UI (existing `radix-ui` package), Vitest + convex-test, Playwright (manual pass only).

**Spec:** `docs/superpowers/specs/2026-08-13-tasks-and-timeblocks-design.md`

## Global Constraints

- Planning is adding a block; remove `scheduledDate` and `"today"` status.
- `active` is derived: `status !== "done" && blockCount > 0` — never stored.
- Block intent stays in `timeBlocks.title`; UI label is "What will you get done?"
- Durations stored in minutes; estimate UI shows hours.
- Reviews are embedded on blocks (1:1); blocked = `blockedReason` present.
- `listNeedingReview` is scoped to one calendar day (default today).
- Migration is three separate deploys: widen → migrate → narrow.
- Reviews never sync to Google; outbound summary is `${task.title} — ${block.title}` when linked.
- Inbound sync must not overwrite `title` on `origin === "app"` blocks.
- Only new UI dependency: shadcn tabs (`src/components/ui/tabs.tsx`).
- Run backend tests with `npm test`; manual UI pass per spec §8.

---

## File map

| File | Action |
| --- | --- |
| `convex/schema.ts` | Widen then narrow |
| `convex/migrations.ts` | Add `dropScheduledDate` internal mutation |
| `convex/lib/taskStats.ts` | New shared stats helper |
| `convex/lib/dates.ts` | Add `nextDayDateKey`, `sameClockTimeNextDay` |
| `convex/timeBlocks.ts` | Add `review`, `listNeedingReview`, `listForTask` |
| `convex/today.ts` | Derive tasks from blocks + stats |
| `convex/backlog.ts` | Attach stats to backlog tasks |
| `convex/tasks.ts` | Drop scheduling; add `estimateMinutes` |
| `convex/google/outboundQueries.ts` | Join task title |
| `convex/google/client.ts` | Composed summary in `toGoogleEventPayload` |
| `convex/google/inboundMutations.ts` | Skip title patch for app-origin |
| `convex/*.test.ts` | New/updated tests |
| `src/lib/format.ts` | New duration/rollup formatters |
| `src/components/ui/tabs.tsx` | New shadcn primitive |
| `src/components/time-block/AddTimeBlockModal.tsx` | Rewrite |
| `src/components/time-block/ReviewBlockModal.tsx` | New |
| `src/components/tasks/TaskRow.tsx` | Done toggle, active badge, rollup line |
| `src/components/tasks/EditTaskModal.tsx` | Tabs, estimate, drop scheduled date |
| `src/components/tasks/TaskHistory.tsx` | New History tab content |
| `src/components/tasks/AddTaskModal.tsx` | Drop `scheduledDate` prop |
| `src/routes/_authenticated/today.tsx` | Add block, shutdown bar |
| `src/routes/_authenticated/backlog.tsx` | Plan action |
| `src/routes/_authenticated/calendar.tsx` | Modal + backlog filter |
| `src/components/calendar/DayRail.tsx` | Intent label, review marker |
| `src/components/calendar/WeekView.tsx` | Intent label, review marker |

---

### Task 1: Schema widen

**Files:**
- Modify: `convex/schema.ts`

**Interfaces:**
- Consumes: nothing
- Produces: optional `tasks.estimateMinutes`, optional `timeBlocks.review`, index `timeBlocks.by_task`

- [ ] **Step 1: Add fields and index; keep legacy fields**

In `convex/schema.ts`, add `estimateMinutes` to `tasks`, add `review` object to `timeBlocks`, add `.index("by_task", ["taskId"])`. **Do not** remove `scheduledDate`, `"today"` status, or `by_user_scheduledDate` yet.

```typescript
const blockReview = v.object({
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
});

// tasks table — add:
estimateMinutes: v.optional(v.number()),

// timeBlocks table — add:
review: v.optional(blockReview),
// and index:
.index("by_task", ["taskId"]),
```

- [ ] **Step 2: Deploy widen**

Run: `npx convex dev` (or push to prod) and confirm deploy succeeds with existing documents still valid.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(schema): widen for block reviews and task estimates"
```

---

### Task 2: Migration mutation

**Files:**
- Create: `convex/migrations.ts`
- Create: `convex/migrations.test.ts`

**Interfaces:**
- Consumes: widened schema from Task 1
- Produces: `internal.migrations.dropScheduledDate` — patches all tasks

- [ ] **Step 1: Write failing test**

Create `convex/migrations.test.ts`:

```typescript
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("migrations.dropScheduledDate", () => {
  it("maps today to backlog and clears scheduledDate", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "a@b.com", name: "A" }),
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("tasks", {
        userId,
        title: "Was today",
        status: "today",
        scheduledDate: "2026-08-18",
        order: 0,
      });
      await ctx.db.insert("tasks", {
        userId,
        title: "Scheduled backlog",
        status: "backlog",
        scheduledDate: "2026-09-01",
        order: 1,
      });
    });

    await t.mutation(internal.migrations.dropScheduledDate, {});

    const tasks = await t.run(async (ctx) => ctx.db.query("tasks").collect());
    expect(tasks.every((task) => task.status !== "today")).toBe(true);
    expect(tasks.every((task) => task.scheduledDate === undefined)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npm test -- convex/migrations.test.ts`
Expected: FAIL — `internal.migrations.dropScheduledDate` not defined

- [ ] **Step 3: Implement migration**

Create `convex/migrations.ts`:

```typescript
import { internalMutation } from "./_generated/server";

export const dropScheduledDate = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db.query("tasks").collect();
    for (const task of tasks) {
      const patch: Record<string, unknown> = {};
      if (task.status === "today") {
        patch.status = "backlog";
      }
      if (task.scheduledDate !== undefined) {
        patch.scheduledDate = undefined;
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch("tasks", task._id, patch);
      }
    }
  },
});
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npm test -- convex/migrations.test.ts`

- [ ] **Step 5: Run migration against deployment**

Run: `npx convex run migrations:dropScheduledDate --internal`

Verify in dashboard: no tasks with `status: "today"` or non-empty `scheduledDate`.

- [ ] **Step 6: Commit**

```bash
git add convex/migrations.ts convex/migrations.test.ts
git commit -m "feat: migrate tasks off scheduledDate and today status"
```

---

### Task 3: Schema narrow

**Files:**
- Modify: `convex/schema.ts`

**Interfaces:**
- Consumes: migrated data from Task 2
- Produces: `taskStatus = backlog | done` only; no `scheduledDate` index

- [ ] **Step 1: Narrow schema**

```typescript
const taskStatus = v.union(v.literal("backlog"), v.literal("done"));

// tasks: remove scheduledDate field and by_user_scheduledDate index
```

- [ ] **Step 2: Deploy narrow**

Run convex deploy; must succeed because legacy fields are cleared.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(schema): remove scheduledDate and today task status"
```

---

### Task 4: taskStats helper

**Files:**
- Create: `convex/lib/taskStats.ts`
- Create: `convex/lib/taskStats.test.ts`

**Interfaces:**
- Consumes: `QueryCtx`, user blocks via `by_user`
- Produces:

```typescript
export type TaskStats = {
  blockCount: number;
  spentMinutes: number;
  focusCounts: { deep: number; shallow: number; interrupted: number };
  latestNextStep?: string;
  latestBlockedReason?: string;
};

export async function buildTaskStatsMap(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Map<Id<"tasks">, TaskStats>>;

export function isTaskActive(
  status: Doc<"tasks">["status"],
  stats: TaskStats | undefined,
): boolean;
```

- [ ] **Step 1: Write failing tests**

```typescript
describe("buildTaskStatsMap", () => {
  it("counts all blocks but only reviewed minutes toward spent", async () => {
    // task with 2 blocks: one reviewed 30m, one unreviewed
    // expect blockCount 2, spentMinutes 30
  });

  it("derives active from blockCount when not done", async () => {
    // backlog task with 1 block => active true
    // done task with blocks => active false
  });

  it("tracks latest nextStep and blocked reason from most recent review", async () => {
    // two reviewed blocks; newer review has blockedReason
  });
});
```

(Fill in full convex-test setup mirroring `tasks.test.ts`.)

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- convex/lib/taskStats.test.ts`

- [ ] **Step 3: Implement helper**

```typescript
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export type TaskStats = { /* as above */ };

export async function buildTaskStatsMap(ctx: QueryCtx, userId: Id<"users">) {
  const blocks = await ctx.db
    .query("timeBlocks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const map = new Map<Id<"tasks">, TaskStats>();

  for (const block of blocks) {
    if (!block.taskId) continue;
    const stats = map.get(block.taskId) ?? emptyStats();
    stats.blockCount += 1;

    if (block.review) {
      stats.spentMinutes += block.review.actualMinutes;
      if (block.review.focus) {
        stats.focusCounts[block.review.focus] += 1;
      }
      if (block.review.nextStep) {
        stats.latestNextStep = block.review.nextStep;
      }
      stats.latestBlockedReason = block.review.blockedReason;
    }

    map.set(block.taskId, stats);
  }

  return map;
}

export function isTaskActive(status: Doc<"tasks">["status"], stats?: TaskStats) {
  return status !== "done" && (stats?.blockCount ?? 0) > 0;
}

function emptyStats(): TaskStats {
  return {
    blockCount: 0,
    spentMinutes: 0,
    focusCounts: { deep: 0, shallow: 0, interrupted: 0 },
  };
}
```

Note: `latestBlockedReason` is set only from the chronologically latest reviewed block per task (sort reviewed blocks by `review.reviewedAt` when merging).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add convex/lib/taskStats.ts convex/lib/taskStats.test.ts
git commit -m "feat: add taskStats rollup helper"
```

---

### Task 5: timeBlocks.review and listNeedingReview

**Files:**
- Modify: `convex/lib/dates.ts` — add helpers
- Modify: `convex/timeBlocks.ts`
- Create: `convex/timeBlocks.test.ts`

**Interfaces:**
- Consumes: widened schema, `internal.google.outbound.syncBlock`
- Produces:
  - `api.timeBlocks.review({ blockId, outcome, actualMinutes, focus?, note?, nextStep?, blockedReason?, taskDone?, scheduleNext? })`
  - `api.timeBlocks.listNeedingReview({ dateKey? })`
  - `api.timeBlocks.listForTask({ taskId })` — for History tab

- [ ] **Step 1: Add date helpers**

In `convex/lib/dates.ts`:

```typescript
export function nextDayDateKey(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  return formatDateKey(next);
}

export function sameClockTimeNextDay(startMs: number) {
  const d = new Date(startMs);
  d.setDate(d.getDate() + 1);
  return d.getTime();
}
```

- [ ] **Step 2: Write failing tests** (per spec §8)

Cover: writes review; overwrites on re-review; `taskDone` marks task done; `scheduleNext` creates next-day block at same clock time with same duration and `nextStep` as title; ignores `scheduleNext` without `nextStep` or `taskId`; rejects other user's block; `listNeedingReview` filters correctly.

- [ ] **Step 3: Implement `review` mutation**

Core logic in one transaction:

```typescript
export const review = mutation({
  args: {
    blockId: v.id("timeBlocks"),
    outcome: v.union(v.literal("done"), v.literal("partial"), v.literal("missed")),
    actualMinutes: v.number(),
    focus: v.optional(v.union(v.literal("deep"), v.literal("shallow"), v.literal("interrupted"))),
    note: v.optional(v.string()),
    nextStep: v.optional(v.string()),
    blockedReason: v.optional(v.string()),
    taskDone: v.optional(v.boolean()),
    scheduleNext: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const block = await ctx.db.get("timeBlocks", args.blockId);
    if (!block || block.userId !== userId) throw new Error("Time block not found");

    await ctx.db.patch("timeBlocks", args.blockId, {
      review: {
        outcome: args.outcome,
        actualMinutes: args.actualMinutes,
        focus: args.focus,
        note: args.note,
        nextStep: args.nextStep,
        blockedReason: args.blockedReason,
        reviewedAt: Date.now(),
      },
    });

    if (args.taskDone && block.taskId) {
      await ctx.db.patch("tasks", block.taskId, {
        status: "done",
        completedAt: Date.now(),
      });
    }

    if (args.scheduleNext && block.taskId && args.nextStep?.trim()) {
      const duration = block.end - block.start;
      const nextStart = sameClockTimeNextDay(block.start);
      const followUpId = await ctx.db.insert("timeBlocks", {
        userId,
        title: args.nextStep.trim(),
        start: nextStart,
        end: nextStart + duration,
        taskId: block.taskId,
        origin: "app",
        syncState: "pending",
        updatedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(0, internal.google.outbound.syncBlock, {
        blockId: followUpId,
      });
    }
  },
});
```

- [ ] **Step 4: Implement `listNeedingReview`**

```typescript
export const listNeedingReview = query({
  args: { dateKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const dateKey = args.dateKey ?? formatDateKey();
    const start = startOfDayMs(dateKey);
    const end = endOfDayMs(dateKey);
    const now = Date.now();

    const blocks = await ctx.db
      .query("timeBlocks")
      .withIndex("by_user_start", (q) => q.eq("userId", userId))
      .collect();

    return blocks
      .filter(
        (b) =>
          b.origin === "app" &&
          b.taskId != null &&
          b.end <= now &&
          b.review === undefined &&
          b.start >= start &&
          b.start <= end,
      )
      .sort((a, b) => a.start - b.start);
  },
});
```

- [ ] **Step 5: Add `listForTask` query** for History tab (newest first):

```typescript
export const listForTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.userId !== userId) throw new Error("Task not found");

    const blocks = await ctx.db
      .query("timeBlocks")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();

    return blocks.sort((a, b) => b.start - a.start);
  },
});
```

- [ ] **Step 6: Run tests — expect PASS**

Run: `npm test -- convex/timeBlocks.test.ts`

- [ ] **Step 7: Commit**

---

### Task 6: Refactor tasks, today, backlog

**Files:**
- Modify: `convex/tasks.ts`, `convex/today.ts`, `convex/backlog.ts`
- Modify: `convex/tasks.test.ts`, `convex/sync.test.ts`

**Interfaces:**
- Consumes: `buildTaskStatsMap`, `isTaskActive`
- Produces:
  - `tasks.create` — always `status: "backlog"`, optional `estimateMinutes`, no `scheduledDate`
  - `tasks.update` — `estimateMinutes`, explicit `status` only; delete `sendToToday` / `removeFromToday`
  - `today.get` — tasks from today's blocks, ordered by first block start, includes done tasks with blocks today, each task has `{ project, stats, active }`
  - `backlog.get` — same stats enrichment on non-done tasks

- [ ] **Step 1: Rewrite failing tests**

Replace all `scheduledDate` / `"today"` / `sendToToday` tests in `tasks.test.ts` and `sync.test.ts` with block-based today tests:

```typescript
// sync.test.ts — replace sendToToday flow:
const taskId = await asUser.mutation(api.tasks.create, { title: "Draft proposal" });
const start = startOfDayMs(formatDateKey()) + 10 * 3600000;
await asUser.mutation(api.timeBlocks.create, {
  title: "First hour on proposal",
  start,
  end: start + 3600000,
  taskId,
});
const today = await asUser.query(api.today.get, {});
expect(today.tasks.some((t) => t._id === taskId)).toBe(true);
```

- [ ] **Step 2: Implement `today.get`**

```typescript
const blocks = await ctx.db
  .query("timeBlocks")
  .withIndex("by_user_start", (q) => q.eq("userId", userId))
  .collect();

const todaysBlocks = blocks.filter(
  (b) => b.start < endOfDayMs(dateKey) && b.end > startOfDayMs(dateKey),
);

const firstStartByTask = new Map<Id<"tasks">, number>();
for (const block of todaysBlocks) {
  if (!block.taskId) continue;
  const prev = firstStartByTask.get(block.taskId);
  if (prev === undefined || block.start < prev) {
    firstStartByTask.set(block.taskId, block.start);
  }
}

const statsMap = await buildTaskStatsMap(ctx, userId);
const taskIds = [...firstStartByTask.keys()];
const tasks = (await Promise.all(taskIds.map((id) => ctx.db.get("tasks", id))))
  .filter((t): t is Doc<"tasks"> => t != null)
  .sort(
    (a, b) =>
      (firstStartByTask.get(a._id) ?? 0) - (firstStartByTask.get(b._id) ?? 0),
  );

return {
  dateKey,
  tasks: tasks.map((task) => ({
    ...task,
    project: task.projectId ? projectMap.get(task.projectId) ?? null : null,
    stats: statsMap.get(task._id) ?? emptyStats(),
    active: isTaskActive(task.status, statsMap.get(task._id)),
  })),
};
```

- [ ] **Step 3: Implement backlog stats enrichment** — same `stats` + `active` shape on each task in groups.

- [ ] **Step 4: Simplify `tasks.ts`** — remove scheduling mutations and args; add `estimateMinutes` to create/update.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: all pass

- [ ] **Step 6: Commit**

---

### Task 7: Google Calendar sync

**Files:**
- Modify: `convex/google/outboundQueries.ts`, `convex/google/client.ts`, `convex/google/inboundMutations.ts`
- Modify: `convex/sync.test.ts`

**Interfaces:**
- Consumes: blocks with optional `taskId`
- Produces: composed outbound summary; inbound preserves app block intent

- [ ] **Step 1: Write failing sync tests**

```typescript
it("outbound composes task title and block intent", async () => {
  // insert task + linked block, mock insertEvent, capture summary
  // expect "Task title — Block intent"
});

it("inbound leaves app-origin title unchanged", async () => {
  // existing app block with title "Intent only"
  // applyEvent with summary "Task — Intent only"
  // expect title still "Intent only"; start/end updated
});
```

- [ ] **Step 2: Extend outbound query**

```typescript
export const getBlockQuery = internalQuery({
  args: { blockId: v.id("timeBlocks") },
  handler: async (ctx, args) => {
    const block = await ctx.db.get("timeBlocks", args.blockId);
    if (!block) return null;
    const task = block.taskId ? await ctx.db.get("tasks", block.taskId) : null;
    return { ...block, taskTitle: task?.title ?? null };
  },
});
```

- [ ] **Step 3: Update `toGoogleEventPayload`**

```typescript
export function toGoogleEventPayload(block: {
  title: string;
  start: number;
  end: number;
  taskTitle?: string | null;
}) {
  const summary = block.taskTitle
    ? `${block.taskTitle} — ${block.title}`
    : block.title;
  // ... rest unchanged, use summary
}
```

- [ ] **Step 4: Guard inbound title**

In `applyEvent`, when patching existing block:

```typescript
const patch: Record<string, unknown> = {
  start: times.start,
  end: times.end,
  syncState: "synced",
  lastSyncedAt: Date.now(),
  updatedAt: times.updatedAt,
};
if (existing.origin !== "app") {
  patch.title = event.summary ?? existing.title;
}
await ctx.db.patch("timeBlocks", existing._id, patch);
```

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

---

### Task 8: Shared frontend formatters

**Files:**
- Create: `src/lib/format.ts`

**Interfaces:**
- Produces: `formatMinutes`, `formatTaskRollup(stats, estimateMinutes?)`

- [ ] **Step 1: Add formatters**

```typescript
export function formatMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatTaskRollup(
  stats: { spentMinutes: number; blockCount: number },
  estimateMinutes?: number,
) {
  const spent = formatMinutes(stats.spentMinutes);
  const estimate = estimateMinutes ? formatMinutes(estimateMinutes) : null;
  const blocks = `${stats.blockCount} block${stats.blockCount === 1 ? '' : 's'}`;
  return estimate ? `${spent} / ${estimate} · ${blocks}` : `${spent} · ${blocks}`;
}
```

- [ ] **Step 2: Commit**

---

### Task 9: shadcn tabs primitive

**Files:**
- Create: `src/components/ui/tabs.tsx`

- [ ] **Step 1: Add tabs** (match existing shadcn style — `radix-ui` `Tabs` export, same patterns as `select.tsx`)

- [ ] **Step 2: Verify lint**

Run: `npm run lint`

- [ ] **Step 3: Commit**

---

### Task 10: AddTimeBlockModal

**Files:**
- Rewrite: `src/components/time-block/AddTimeBlockModal.tsx`

**Interfaces:**
- Consumes: `api.tasks.list`, `api.tasks.create`, `api.timeBlocks.create`
- Props: `open`, `onClose`, `defaultTaskId?`, `defaultIntent?`, `defaultStart?`, `defaultDateKey?`

- [ ] **Step 1: Rewrite modal**

Fields in order: Task (searchable select + inline create), "What will you get done?", Date, Start time, Duration (minutes, default 60). On submit call `timeBlocks.create` with computed `start`/`end` ms. Fix broken `import useState from 'react'` → `import { useState } from 'react'`.

- [ ] **Step 2: Manual verify** — open from a test page mount; create personal block and task-linked block.

- [ ] **Step 3: Commit**

---

### Task 11: ReviewBlockModal

**Files:**
- Create: `src/components/time-block/ReviewBlockModal.tsx`

**Interfaces:**
- Consumes: `api.timeBlocks.review`
- Props: `block`, `task?`, `positionLabel?`, `open`, `onClose`, `onSaved?`

- [ ] **Step 1: Build modal**

Read-only: intent, task name, planned time. Inputs: outcome (3-way segmented control), time spent (prefilled from planned duration), focus, note, next step + "schedule it now" checkbox, blocked checkbox → reason field, "task is finished" checkbox. Primary button: "Save" / "Save & next" when `onSaved` provided.

- [ ] **Step 2: Commit**

---

### Task 12: TaskRow rollup and done toggle

**Files:**
- Modify: `src/components/tasks/TaskRow.tsx`

- [ ] **Step 1: Replace status select**

Props gain optional `stats`, `active`, `estimateMinutes`, `onToggleDone`, `onPlan`, `extraActions`.

- Done: `Checkbox` toggling `onToggleDone`
- Active badge when `active === true`
- Rollup line: `formatTaskRollup(stats, estimateMinutes)` below title
- Plan button calls `onPlan` when provided (backlog)

- [ ] **Step 2: Update all TaskRow call sites** to pass new props from enriched task objects.

- [ ] **Step 3: Commit**

---

### Task 13: EditTaskModal tabs + TaskHistory

**Files:**
- Modify: `src/components/tasks/EditTaskModal.tsx`
- Create: `src/components/tasks/TaskHistory.tsx`

- [ ] **Step 1: EditTaskModal**

Remove scheduled date and `"today"` status option. Add estimate field (hours input ↔ `estimateMinutes`). Wrap form in Tabs: **Details** | **History**.

- [ ] **Step 2: TaskHistory**

Query `api.timeBlocks.listForTask`. Rollup strip at top. List blocks newest first with date, intent, outcome tag, time spent, focus, note. Unreviewed past blocks show "Review" button opening `ReviewBlockModal`.

- [ ] **Step 3: Commit**

---

### Task 14: AddTaskModal cleanup

**Files:**
- Modify: `src/components/tasks/AddTaskModal.tsx`
- Modify: `src/routes/_authenticated/today.tsx` (remove AddTaskModal mount)

- [ ] **Step 1: Remove `scheduledDate` prop** and all references in Today page.

- [ ] **Step 2: Commit**

---

### Task 15: Today page — add block + shutdown

**Files:**
- Modify: `src/routes/_authenticated/today.tsx`

- [ ] **Step 1: Header button** → `+ Add time block` opens `AddTimeBlockModal`.

- [ ] **Step 2: Shutdown bar** — query `listNeedingReview`; when non-empty show count, intents, **Start shutdown**. Maintain queue index in page state; walk blocks through `ReviewBlockModal` with `onSaved` advancing queue.

- [ ] **Step 3: Pass stats to TaskRow** from `today.get` tasks.

- [ ] **Step 4: DayRail** — pass task map for block labels; wire single-block review from rail (Task 16).

- [ ] **Step 5: Manual verify** per spec §8 manual pass (first three bullets).

- [ ] **Step 6: Commit**

---

### Task 16: Backlog plan action

**Files:**
- Modify: `src/routes/_authenticated/backlog.tsx`

- [ ] **Step 1: Add Plan button** on each row → `AddTimeBlockModal` with `defaultTaskId` prefilled.

- [ ] **Step 2: Pass stats/active** from enriched backlog tasks.

- [ ] **Step 3: Commit**

---

### Task 17: Calendar surfaces

**Files:**
- Modify: `src/routes/_authenticated/calendar.tsx`
- Modify: `src/components/calendar/DayRail.tsx`
- Modify: `src/components/calendar/WeekView.tsx`

- [ ] **Step 1: calendar.tsx** — replace `window.prompt` with `AddTimeBlockModal`; filter unscheduled tasks with `status === "backlog"`.

- [ ] **Step 2: DayRail / WeekView** — show block intent as primary label; task name as small tag when linked. Ended app blocks with `taskId` and no `review` show review marker; click opens `ReviewBlockModal`.

- [ ] **Step 3: Commit**

---

### Task 18: Final verification

- [ ] **Step 1: Run backend tests**

Run: `npm test`
Expected: all pass

- [ ] **Step 2: Run lint**

Run: `npm run lint`

- [ ] **Step 3: Manual pass** (spec §8)

1. Plan block from Today → task appears, Google event has composed summary
2. Edit event time in Google → intent unchanged in app
3. End block → shutdown → rollup and history update
4. Task with no blocks stays off Today

- [ ] **Step 4: Commit any fixes**

---

## Self-review (spec coverage)

| Spec section | Task |
| --- | --- |
| §3 Data model | 1, 3 |
| §4.1 timeBlocks | 5 |
| §4.2 taskStats | 4 |
| §4.3 today | 6 |
| §4.4 backlog | 6 |
| §4.5 tasks | 6 |
| §5 Google sync | 7 |
| §6.1 Today | 15 |
| §6.2 AddTimeBlockModal | 10 |
| §6.3 ReviewBlockModal | 11 |
| §6.4 Task surfaces | 12, 13, 14 |
| §6.5 Backlog | 16 |
| §6.6 Calendar | 17 |
| §7 Migration | 1, 2, 3 |
| §8 Testing | 2, 4, 5, 6, 7, 18 |

Non-goals (§10) intentionally omitted.
