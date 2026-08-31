# Backlog Board View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Board tab on `/backlog` with Investigate → In Progress → Review → Test → Done columns, drag-to-change status and order, and click-to-edit, without changing the table tab’s data contract.

**Architecture:** Keep `api.backlog.get` for the table. Add `api.backlog.board` (five columns, includes Done, excludes `backlog` status) and `api.tasks.moveOnBoard` (one transaction: status + destination-column `order`). The page uses shadcn Tabs and `?view=table|board`. Cards use `@dnd-kit` with an 8px activation distance so clicks still open `EditTaskModal`.

**Tech Stack:** Convex queries/mutations + `convex-test`, TanStack Router search params, shadcn Tabs/Badge, `@dnd-kit/core` + `@dnd-kit/sortable`, existing task modals.

**Spec:** `docs/superpowers/specs/2026-08-31-backlog-board-view-design.md`

## Global Constraints

- Table tab still uses `api.backlog.get` (non-done only). Do not change that query’s return shape or Done-exclusion.
- Board columns, left to right: `investigate`, `in-progress`, `review`, `test`, `done`. No Backlog column.
- `moveOnBoard` destination must not be `backlog`. Do not use `tasks.reorder` for drops.
- Destination-status tasks only get `order = 0..n-1`. Other statuses keep their `order`.
- `completedAt` follows `tasks.update`: set `Date.now()` when status is `done`, otherwise `undefined`.
- Project filter is shared across tabs. New tasks default to `backlog` (table only).
- Prettier: Convex files keep existing double quotes + semicolons; `src/` uses single quotes, no semicolons.
- Extract shared status colors rather than duplicating `STATUS_CONFIG` strings.

## File map

| Path | Responsibility |
|------|----------------|
| `src/lib/task-status.ts` | Status labels/colors for table + board headers |
| `src/lib/task-due.ts` | Due-date badge class + label (shared table/card) |
| `src/lib/backlog-board.ts` | Filter columns, optimistic move, `moveOnBoard` args |
| `convex/lib/boardStatus.ts` | Board status union + column order for backend |
| `convex/backlog.ts` | `get` (unchanged contract) + new `board` query |
| `convex/tasks.ts` | New `moveOnBoard` mutation |
| `src/components/tasks/BacklogBoard.tsx` | Columns, cards, dnd-kit |
| `src/routes/_authenticated/backlog.tsx` | Tabs, search param, shared filter |
| `src/components/tasks/BacklogTasksTable.tsx` | Import shared status/due helpers |

---

### Task 1: Shared status and due-date helpers

**Files:**
- Create: `src/lib/task-status.ts`
- Create: `src/lib/task-status.test.ts`
- Create: `src/lib/task-due.ts`
- Create: `src/lib/task-due.test.ts`
- Modify: `src/components/tasks/BacklogTasksTable.tsx`

**Interfaces:**
- Consumes: `Doc<'tasks'>['status']` from Convex dataModel
- Produces: `TASK_STATUSES`, `STATUS_CONFIG`, `BOARD_COLUMN_STATUSES`, `dueDateBadge(dueDate, now?)`

- [x] **Step 1: Write the failing tests**

Create `src/lib/task-status.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { BOARD_COLUMN_STATUSES, STATUS_CONFIG, TASK_STATUSES } from './task-status'

describe('task-status', () => {
  it('lists all six statuses for the table dropdown', () => {
    expect(TASK_STATUSES).toEqual([
      'backlog',
      'in-progress',
      'review',
      'test',
      'investigate',
      'done',
    ])
  })

  it('lists board columns in workflow order without backlog', () => {
    expect(BOARD_COLUMN_STATUSES).toEqual([
      'investigate',
      'in-progress',
      'review',
      'test',
      'done',
    ])
  })

  it('has a label and className for every table status', () => {
    for (const status of TASK_STATUSES) {
      expect(STATUS_CONFIG[status].label.length).toBeGreaterThan(0)
      expect(STATUS_CONFIG[status].className.length).toBeGreaterThan(0)
    }
  })
})
```

Create `src/lib/task-due.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { dueDateBadge } from './task-due'

describe('dueDateBadge', () => {
  const now = new Date('2026-08-31T12:00:00')

  it('returns null when there is no due date', () => {
    expect(dueDateBadge(undefined, now)).toBeNull()
  })

  it('marks overdue dates red', () => {
    const badge = dueDateBadge('2026-08-01', now)
    expect(badge?.tone).toBe('overdue')
    expect(badge?.label).toMatch(/Aug/)
  })

  it('marks dates later this week orange', () => {
    const badge = dueDateBadge('2026-09-02', now)
    expect(badge?.tone).toBe('thisWeek')
  })

  it('marks later dates muted', () => {
    const badge = dueDateBadge('2026-10-01', now)
    expect(badge?.tone).toBe('later')
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/task-status.test.ts src/lib/task-due.test.ts`

Expected: FAIL — modules not found.

- [x] **Step 3: Implement helpers and switch the table to them**

Create `src/lib/task-status.ts`:

```typescript
import type { Doc } from '../../convex/_generated/dataModel'

export type TaskStatus = Doc<'tasks'>['status']

export const TASK_STATUSES = [
  'backlog',
  'in-progress',
  'review',
  'test',
  'investigate',
  'done',
] as const satisfies ReadonlyArray<TaskStatus>

export const BOARD_COLUMN_STATUSES = [
  'investigate',
  'in-progress',
  'review',
  'test',
  'done',
] as const satisfies ReadonlyArray<TaskStatus>

export type BoardColumnStatus = (typeof BOARD_COLUMN_STATUSES)[number]

export const STATUS_CONFIG: Record<TaskStatus, { label: string; className: string }> = {
  backlog: {
    label: 'Backlog',
    className: 'bg-muted text-muted-foreground',
  },
  'in-progress': {
    label: 'In Progress',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  },
  review: {
    label: 'Review',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  },
  test: {
    label: 'Test',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  },
  investigate: {
    label: 'Investigate',
    className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  },
  done: {
    label: 'Done',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  },
}
```

Create `src/lib/task-due.ts`:

```typescript
export type DueTone = 'overdue' | 'thisWeek' | 'later'

export const DUE_TONE_CLASS: Record<DueTone, string> = {
  overdue: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  thisWeek: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  later: 'bg-muted text-muted-foreground',
}

export function dueDateBadge(
  dueDate: string | undefined,
  now: Date = new Date(),
): { label: string; tone: DueTone } | null {
  if (!dueDate) return null
  const date = new Date(dueDate)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const msPerDay = 86_400_000
  const daysUntil = Math.ceil((date.getTime() - today.getTime()) / msPerDay)
  const endOfWeek = new Date(today)
  endOfWeek.setDate(today.getDate() + (7 - today.getDay()))
  const tone: DueTone =
    daysUntil < 0 ? 'overdue' : date <= endOfWeek ? 'thisWeek' : 'later'
  const label = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return { label, tone }
}
```

In `BacklogTasksTable.tsx`: delete the local `STATUS_CONFIG` object. Import `STATUS_CONFIG`, `TASK_STATUSES`, and `type TaskStatus` from `~/lib/task-status`. Replace the status dropdown map to iterate `TASK_STATUSES`. Replace the due-date cell body with:

```tsx
const badge = dueDateBadge(row.original.dueDate)
if (!badge) return null
return (
  <Badge className={cn('border-0 text-[11px]', DUE_TONE_CLASS[badge.tone])}>
    {badge.label}
  </Badge>
)
```

Import `dueDateBadge`, `DUE_TONE_CLASS` from `~/lib/task-due`. Keep the local `type TaskStatus = Doc<'tasks'>['status']` only if still needed; prefer the shared type.

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/task-status.test.ts src/lib/task-due.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/task-status.ts src/lib/task-status.test.ts src/lib/task-due.ts src/lib/task-due.test.ts src/components/tasks/BacklogTasksTable.tsx
git commit -m "refactor: share task status colors and due-date badges"
```

---

### Task 2: `api.backlog.board` query

**Files:**
- Create: `convex/lib/boardStatus.ts`
- Create: `convex/backlog.test.ts`
- Modify: `convex/backlog.ts`

**Interfaces:**
- Consumes: `requireUserId`, `buildTaskStatsMap`, `emptyTaskStats`, `isTaskActive`
- Produces: `api.backlog.board` → `{ total: number, columns: Array<{ status: BoardColumnStatus, tasks: EnrichedTask[] }> }` with five columns always present

- [x] **Step 1: Write the failing tests**

Create `convex/backlog.test.ts`:

```typescript
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { modules } from "./test.setup";

async function createAuthedTest() {
  const t = convexTest(schema, modules);
  const userId = "user_test1";
  const asUser = t.withIdentity({ subject: userId });
  return { t, asUser, userId };
}

async function insertTask(
  t: ReturnType<typeof convexTest>,
  userId: string,
  fields: {
    title: string;
    status:
      | "backlog"
      | "investigate"
      | "in-progress"
      | "review"
      | "test"
      | "done";
    order: number;
    projectId?: Id<"projects">;
  },
) {
  return t.run(async (ctx) =>
    ctx.db.insert("tasks", {
      userId,
      title: fields.title,
      status: fields.status,
      order: fields.order,
      ...(fields.projectId ? { projectId: fields.projectId } : {}),
    }),
  );
}

describe("backlog.board", () => {
  it("returns five columns in workflow order including empties", async () => {
    const { asUser } = await createAuthedTest();
    const board = await asUser.query(api.backlog.board, {});
    expect(board.columns.map((c) => c.status)).toEqual([
      "investigate",
      "in-progress",
      "review",
      "test",
      "done",
    ]);
    expect(board.total).toBe(0);
    expect(board.columns.every((c) => c.tasks.length === 0)).toBe(true);
  });

  it("excludes backlog status and includes done", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    await insertTask(t, userId, { title: "Parked", status: "backlog", order: 0 });
    await insertTask(t, userId, {
      title: "Shipped",
      status: "done",
      order: 1,
    });
    await insertTask(t, userId, {
      title: "Looking",
      status: "investigate",
      order: 2,
    });

    const board = await asUser.query(api.backlog.board, {});
    expect(board.total).toBe(2);
    const titles = board.columns.flatMap((c) => c.tasks.map((task) => task.title));
    expect(titles).toEqual(["Looking", "Shipped"]);
    expect(board.columns.find((c) => c.status === "done")?.tasks[0]?.title).toBe(
      "Shipped",
    );
  });

  it("sorts a column by order then _id", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    await insertTask(t, userId, {
      title: "Second",
      status: "review",
      order: 5,
    });
    await insertTask(t, userId, {
      title: "First",
      status: "review",
      order: 1,
    });

    const board = await asUser.query(api.backlog.board, {});
    const review = board.columns.find((c) => c.status === "review")!;
    expect(review.tasks.map((task) => task.title)).toEqual(["First", "Second"]);
  });

  it("does not return another user's tasks", async () => {
    const { t, asUser } = await createAuthedTest();
    await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId: "user_other",
        title: "Secret",
        status: "investigate",
        order: 0,
      }),
    );

    const board = await asUser.query(api.backlog.board, {});
    expect(board.total).toBe(0);
  });

  it("enriches project and active from block memberships", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });
    const taskId = await insertTask(t, userId, {
      title: "Wireframes",
      status: "in-progress",
      order: 0,
      projectId,
    });
    await t.run(async (ctx) => {
      const blockId = await ctx.db.insert("timeBlocks", {
        userId,
        title: "Focus",
        start: Date.now(),
        end: Date.now() + 3600000,
        origin: "app",
        syncState: "synced",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("timeBlockTasks", {
        userId,
        blockId,
        taskId,
        order: 0,
      });
    });

    const board = await asUser.query(api.backlog.board, {});
    const task = board.columns
      .find((c) => c.status === "in-progress")
      ?.tasks[0];
    expect(task?.project?.name).toBe("Website");
    expect(task?.active).toBe(true);
    expect(task?.stats.blockCount).toBe(1);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- convex/backlog.test.ts`

Expected: FAIL — `api.backlog.board` is not a function / not in API.

- [x] **Step 3: Implement board status helper and query**

Create `convex/lib/boardStatus.ts`:

```typescript
export const BOARD_COLUMN_STATUSES = [
  "investigate",
  "in-progress",
  "review",
  "test",
  "done",
] as const;

export type BoardColumnStatus = (typeof BOARD_COLUMN_STATUSES)[number];

export function isBoardColumnStatus(
  status: string,
): status is BoardColumnStatus {
  return (BOARD_COLUMN_STATUSES as readonly string[]).includes(status);
}
```

Modify `convex/backlog.ts`: keep `get` filtering `status !== "done"`. Extract an inner `enrich` used by both handlers (same as today’s enrich). Add:

```typescript
import { BOARD_COLUMN_STATUSES } from "./lib/boardStatus";

export const board = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const projectMap = new Map(projects.map((p) => [p._id, p]));
    const statsMap = await buildTaskStatsMap(ctx, userId);

    const enrich = (task: (typeof tasks)[number]) => {
      const stats = statsMap.get(task._id) ?? emptyTaskStats();
      return {
        ...task,
        project: task.projectId ? projectMap.get(task.projectId) ?? null : null,
        stats,
        active: isTaskActive(task.status, stats),
      };
    };

    const columns = BOARD_COLUMN_STATUSES.map((status) => ({
      status,
      tasks: tasks
        .filter((task) => task.status === status)
        .sort((a, b) => a.order - b.order || a._id.localeCompare(b._id))
        .map(enrich),
    }));

    return {
      total: columns.reduce((sum, column) => sum + column.tasks.length, 0),
      columns,
    };
  },
});
```

Refactor `get` to reuse `enrich` if that stays readable; do not change `get`’s grouping or Done exclusion.

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- convex/backlog.test.ts`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add convex/lib/boardStatus.ts convex/backlog.ts convex/backlog.test.ts
git commit -m "feat: add backlog board query grouped by workflow status"
```

---

### Task 3: `api.tasks.moveOnBoard`

**Files:**
- Modify: `convex/tasks.ts`
- Modify: `convex/tasks.test.ts`

**Interfaces:**
- Consumes: `getOwnedTask`, `BOARD_COLUMN_STATUSES` / `isBoardColumnStatus`
- Produces: `moveOnBoard({ taskId, status, beforeTaskId? })` — void; patches status, `completedAt`, destination `order`

- [x] **Step 1: Write the failing tests**

Append to `convex/tasks.test.ts`:

```typescript
describe("tasks.moveOnBoard", () => {
  async function seedThree(
    t: ReturnType<typeof convexTest>,
    userId: string,
  ) {
    const a = await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId,
        title: "A",
        status: "investigate",
        order: 0,
      }),
    );
    const b = await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId,
        title: "B",
        status: "investigate",
        order: 1,
      }),
    );
    const c = await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId,
        title: "C",
        status: "review",
        order: 2,
      }),
    );
    return { a, b, c };
  }

  it("moves a task to another column and appends", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const { a, c } = await seedThree(t, userId);

    await asUser.mutation(api.tasks.moveOnBoard, {
      taskId: a,
      status: "review",
    });

    const moved = await t.run(async (ctx) => ctx.db.get(a));
    const reviewMate = await t.run(async (ctx) => ctx.db.get(c));
    expect(moved?.status).toBe("review");
    expect(moved?.order).toBe(1);
    expect(reviewMate?.order).toBe(0);
  });

  it("inserts before a destination card", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const { a, c } = await seedThree(t, userId);

    await asUser.mutation(api.tasks.moveOnBoard, {
      taskId: a,
      status: "review",
      beforeTaskId: c,
    });

    const moved = await t.run(async (ctx) => ctx.db.get(a));
    const reviewMate = await t.run(async (ctx) => ctx.db.get(c));
    expect(moved?.order).toBe(0);
    expect(reviewMate?.order).toBe(1);
  });

  it("reorders within a column without touching other statuses", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const { a, b, c } = await seedThree(t, userId);

    await asUser.mutation(api.tasks.moveOnBoard, {
      taskId: b,
      status: "investigate",
      beforeTaskId: a,
    });

    expect((await t.run(async (ctx) => ctx.db.get(b)))?.order).toBe(0);
    expect((await t.run(async (ctx) => ctx.db.get(a)))?.order).toBe(1);
    expect((await t.run(async (ctx) => ctx.db.get(c)))?.order).toBe(2);
  });

  it("sets completedAt when moving to done and clears it when leaving", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const taskId = await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId,
        title: "Finish",
        status: "test",
        order: 0,
      }),
    );

    await asUser.mutation(api.tasks.moveOnBoard, {
      taskId,
      status: "done",
    });
    let task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.completedAt).toEqual(expect.any(Number));

    await asUser.mutation(api.tasks.moveOnBoard, {
      taskId,
      status: "test",
    });
    task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.completedAt).toBeUndefined();
  });

  it("rejects another user's task", async () => {
    const { t, asUser } = await createAuthedTest();
    const foreignId = await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId: "user_other",
        title: "Nope",
        status: "investigate",
        order: 0,
      }),
    );

    await expect(
      asUser.mutation(api.tasks.moveOnBoard, {
        taskId: foreignId,
        status: "review",
      }),
    ).rejects.toThrow("Task not found");
  });

  it("rejects beforeTaskId in the wrong column", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const { a, c } = await seedThree(t, userId);

    await expect(
      asUser.mutation(api.tasks.moveOnBoard, {
        taskId: a,
        status: "test",
        beforeTaskId: c,
      }),
    ).rejects.toThrow("Invalid drop target");
  });
});
```

Do not add a test that destination `backlog` is accepted: the Convex validator must omit `backlog`, so TypeScript/clients cannot pass it.

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- convex/tasks.test.ts`

Expected: FAIL — `moveOnBoard` missing.

- [x] **Step 3: Implement the mutation**

In `convex/tasks.ts`, import `v` board union from the five literals (same as `taskStatus` minus `backlog`). Add:

```typescript
export const moveOnBoard = mutation({
  args: {
    taskId: v.id("tasks"),
    status: v.union(
      v.literal("investigate"),
      v.literal("in-progress"),
      v.literal("review"),
      v.literal("test"),
      v.literal("done"),
    ),
    beforeTaskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const { userId, task } = await getOwnedTask(ctx, args.taskId);

    if (args.beforeTaskId) {
      if (args.beforeTaskId === args.taskId) {
        throw new Error("Invalid drop target");
      }
      const before = await ctx.db.get("tasks", args.beforeTaskId);
      if (!before || before.userId !== userId) {
        throw new Error("Task not found");
      }
      if (before.status !== args.status) {
        throw new Error("Invalid drop target");
      }
    }

    await ctx.db.patch("tasks", args.taskId, {
      status: args.status,
      completedAt: args.status === "done" ? Date.now() : undefined,
    });

    const dest = (
      await ctx.db
        .query("tasks")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", userId).eq("status", args.status),
        )
        .collect()
    ).sort((a, b) => a.order - b.order || a._id.localeCompare(b._id));

    const withoutMoved = dest.filter((row) => row._id !== args.taskId);
    const insertAt = args.beforeTaskId
      ? withoutMoved.findIndex((row) => row._id === args.beforeTaskId)
      : withoutMoved.length;
    if (args.beforeTaskId && insertAt === -1) {
      throw new Error("Invalid drop target");
    }
    const next = [
      ...withoutMoved.slice(0, insertAt),
      dest.find((row) => row._id === args.taskId)!,
      ...withoutMoved.slice(insertAt),
    ];

    for (let i = 0; i < next.length; i++) {
      if (next[i].order !== i) {
        await ctx.db.patch("tasks", next[i]._id, { order: i });
      }
    }
  },
});
```

If `getOwnedTask` currently does not return `userId`, change it to `return { userId, task }` (it already does).

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- convex/tasks.test.ts convex/backlog.test.ts`

Expected: PASS. Confirm the append test: after moving A onto review, C was the only review task so it becomes `order` 0 and A becomes 1.

- [x] **Step 5: Commit**

```bash
git add convex/tasks.ts convex/tasks.test.ts
git commit -m "feat: move tasks on the backlog board in one mutation"
```

---

### Task 4: Client board move/filter helpers

**Files:**
- Create: `src/lib/backlog-board.ts`
- Create: `src/lib/backlog-board.test.ts`

**Interfaces:**
- Consumes: `BOARD_COLUMN_STATUSES`, `BoardColumnStatus`
- Produces:
  - `filterBoardColumns(columns, filter)`
  - `toMoveOnBoardArgs({ movedId, destStatus, destOrderedIds })`
  - `applyMoveToBoard(board, args)`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/backlog-board.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import {
  applyMoveToBoard,
  filterBoardColumns,
  toMoveOnBoardArgs,
} from './backlog-board'
import { BOARD_COLUMN_STATUSES } from './task-status'

type Task = {
  _id: string
  title: string
  status: string
  project: { _id: string } | null
}

function col(status: string, tasks: Array<Task>) {
  return { status, tasks }
}

const board = {
  total: 3,
  columns: [
    col('investigate', [
      { _id: 'a', title: 'A', status: 'investigate', project: { _id: 'p1' } },
    ]),
    col('in-progress', []),
    col('review', [
      { _id: 'c', title: 'C', status: 'review', project: null },
    ]),
    col('test', []),
    col('done', [
      { _id: 'd', title: 'D', status: 'done', project: { _id: 'p1' } },
    ]),
  ],
}

describe('filterBoardColumns', () => {
  it('keeps all columns when filter is all', () => {
    const result = filterBoardColumns(board.columns, 'all')
    expect(result.map((c) => c.tasks.length)).toEqual([1, 0, 1, 0, 1])
  })

  it('keeps none-project tasks only', () => {
    const result = filterBoardColumns(board.columns, 'none')
    expect(result.find((c) => c.status === 'review')?.tasks).toHaveLength(1)
    expect(result.find((c) => c.status === 'investigate')?.tasks).toHaveLength(0)
  })

  it('filters to one project without dropping columns', () => {
    const result = filterBoardColumns(board.columns, 'p1')
    expect(result).toHaveLength(BOARD_COLUMN_STATUSES.length)
    expect(result.find((c) => c.status === 'review')?.tasks).toHaveLength(0)
    expect(result.find((c) => c.status === 'done')?.tasks[0]?._id).toBe('d')
  })
})

describe('toMoveOnBoardArgs', () => {
  it('omits beforeTaskId when appending', () => {
    expect(
      toMoveOnBoardArgs({
        movedId: 'a',
        destStatus: 'review',
        destOrderedIds: ['c', 'a'],
      }),
    ).toEqual({ taskId: 'a', status: 'review' })
  })

  it('sets beforeTaskId to the following card', () => {
    expect(
      toMoveOnBoardArgs({
        movedId: 'a',
        destStatus: 'review',
        destOrderedIds: ['a', 'c'],
      }),
    ).toEqual({ taskId: 'a', status: 'review', beforeTaskId: 'c' })
  })

  it('returns null when destOrderedIds does not contain the moved task', () => {
    expect(
      toMoveOnBoardArgs({
        movedId: 'a',
        destStatus: 'review',
        destOrderedIds: ['c'],
      }),
    ).toBeNull()
  })
})

describe('applyMoveToBoard', () => {
  it('moves a card before a target and updates status', () => {
    const next = applyMoveToBoard(board, {
      taskId: 'a',
      status: 'review',
      beforeTaskId: 'c',
    })
    expect(next.columns.find((c) => c.status === 'investigate')?.tasks).toEqual([])
    expect(
      next.columns.find((c) => c.status === 'review')?.tasks.map((t) => t._id),
    ).toEqual(['a', 'c'])
    expect(next.columns.find((c) => c.status === 'review')?.tasks[0]?.status).toBe(
      'review',
    )
    expect(next.total).toBe(3)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/backlog-board.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement helpers**

Create `src/lib/backlog-board.ts`:

```typescript
import type { BoardColumnStatus } from './task-status'

export type BoardFilter = 'all' | 'none' | string

export type BoardCard = {
  _id: string
  status: string
  project: { _id: string } | null
}

export type BoardColumn<T extends BoardCard> = {
  status: string
  tasks: Array<T>
}

export type BoardData<T extends BoardCard> = {
  total: number
  columns: Array<BoardColumn<T>>
}

export function filterBoardColumns<T extends BoardCard>(
  columns: Array<BoardColumn<T>>,
  filter: BoardFilter,
): Array<BoardColumn<T>> {
  if (filter === 'all') return columns
  return columns.map((column) => ({
    ...column,
    tasks: column.tasks.filter((task) =>
      filter === 'none' ? task.project == null : task.project?._id === filter,
    ),
  }))
}

export function toMoveOnBoardArgs(input: {
  movedId: string
  destStatus: BoardColumnStatus
  destOrderedIds: Array<string>
}): { taskId: string; status: BoardColumnStatus; beforeTaskId?: string } | null {
  const index = input.destOrderedIds.indexOf(input.movedId)
  if (index === -1) return null
  const beforeTaskId = input.destOrderedIds[index + 1]
  return beforeTaskId
    ? {
        taskId: input.movedId,
        status: input.destStatus,
        beforeTaskId,
      }
    : { taskId: input.movedId, status: input.destStatus }
}

export function applyMoveToBoard<T extends BoardCard>(
  board: BoardData<T>,
  args: { taskId: string; status: BoardColumnStatus; beforeTaskId?: string },
): BoardData<T> {
  let moved: T | undefined
  const stripped = board.columns.map((column) => ({
    ...column,
    tasks: column.tasks.filter((task) => {
      if (task._id === args.taskId) {
        moved = task
        return false
      }
      return true
    }),
  }))
  if (!moved) return board
  const nextTask = { ...moved, status: args.status }
  const columns = stripped.map((column) => {
    if (column.status !== args.status) return column
    const tasks = [...column.tasks]
    const insertAt = args.beforeTaskId
      ? tasks.findIndex((task) => task._id === args.beforeTaskId)
      : tasks.length
    const at = insertAt === -1 ? tasks.length : insertAt
    tasks.splice(at, 0, nextTask)
    return { ...column, tasks }
  })
  return {
    total: columns.reduce((sum, column) => sum + column.tasks.length, 0),
    columns,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/backlog-board.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/backlog-board.ts src/lib/backlog-board.test.ts
git commit -m "feat: add backlog board filter and move helpers"
```

---

### Task 5: `BacklogBoard` UI with drag-and-drop

**Files:**
- Modify: `package.json` (add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`)
- Create: `src/components/tasks/BacklogBoard.tsx`

**Interfaces:**
- Consumes: `BacklogTask`, `BacklogTaskActions` from `BacklogTasksTable`; `filterBoardColumns`, `toMoveOnBoardArgs`; `STATUS_CONFIG`, `BOARD_COLUMN_STATUSES`; `dueDateBadge`; `formatMinutes`
- Produces: `<BacklogBoard board filter onMove actions />`

- [ ] **Step 1: Install dnd-kit**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: packages in `package.json`.

- [ ] **Step 2: Implement `BacklogBoard`**

Create `src/components/tasks/BacklogBoard.tsx`:

```tsx
import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Id } from '../../../convex/_generated/dataModel'
import type { BacklogTask, BacklogTaskActions } from '~/components/tasks/BacklogTasksTable'
import { Badge } from '~/components/ui/badge'
import { filterBoardColumns, toMoveOnBoardArgs } from '~/lib/backlog-board'
import { formatMinutes } from '~/lib/format'
import { BOARD_COLUMN_STATUSES, STATUS_CONFIG, type BoardColumnStatus } from '~/lib/task-status'
import { DUE_TONE_CLASS, dueDateBadge } from '~/lib/task-due'
import { cn } from '~/lib/utils'

export type BoardResult = {
  total: number
  columns: Array<{ status: BoardColumnStatus; tasks: Array<BacklogTask> }>
}

function columnDroppableId(status: BoardColumnStatus) {
  return `column:${status}`
}

function TaskCardBody({ task }: { task: BacklogTask }) {
  const done = task.status === 'done'
  const due = dueDateBadge(task.dueDate)
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <span className={cn('text-sm', done && 'text-muted-foreground line-through')}>
          {task.title}
        </span>
        {task.active ? (
          <Badge variant="secondary" className="shrink-0 text-[11px]">
            Active
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {task.project ? (
          <Badge
            className="rounded-full border-0 px-2.5 py-0.5 text-[11px] font-semibold"
            style={{
              color: task.project.color,
              backgroundColor: `color-mix(in srgb, ${task.project.color} 14%, transparent)`,
            }}
          >
            {task.project.name}
          </Badge>
        ) : null}
        {due ? (
          <Badge className={cn('border-0 text-[11px]', DUE_TONE_CLASS[due.tone])}>
            {due.label}
          </Badge>
        ) : null}
        {task.estimateMinutes != null ? (
          <span className="text-xs text-muted-foreground">
            {formatMinutes(task.estimateMinutes)}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function SortableTaskCard({
  task,
  onOpen,
}: {
  task: BacklogTask
  onOpen: (task: BacklogTask) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task._id,
    data: { type: 'card', status: task.status },
  })
  return (
    <button
      type="button"
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'w-full rounded-md border border-border bg-card p-3 text-left shadow-soft',
        isDragging && 'opacity-50',
      )}
      onClick={() => onOpen(task)}
      {...attributes}
      {...listeners}
    >
      <TaskCardBody task={task} />
    </button>
  )
}

function BoardColumn({
  status,
  tasks,
  onOpen,
}: {
  status: BoardColumnStatus
  tasks: Array<BacklogTask>
  onOpen: (task: BacklogTask) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDroppableId(status),
    data: { type: 'column', status },
  })
  const cfg = STATUS_CONFIG[status]
  return (
    <div className="flex min-w-[16rem] flex-1 flex-col">
      <div className={cn('mb-2 rounded-md px-2 py-1 text-xs font-semibold', cfg.className)}>
        {cfg.label} · {tasks.length}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-32 flex-1 flex-col gap-2 rounded-md p-1',
          isOver && 'bg-accent/40',
        )}
      >
        <SortableContext items={tasks.map((t) => t._id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTaskCard key={task._id} task={task} onOpen={onOpen} />
          ))}
        </SortableContext>
        {tasks.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-2 py-6 text-center text-xs text-muted-foreground">
            No tasks
          </p>
        ) : null}
      </div>
    </div>
  )
}

export function BacklogBoard({
  board,
  filter,
  onMove,
  actions,
}: {
  board: BoardResult
  filter: 'all' | 'none' | Id<'projects'>
  onMove: (args: {
    taskId: Id<'tasks'>
    status: BoardColumnStatus
    beforeTaskId?: Id<'tasks'>
  }) => Promise<void>
  actions: Pick<BacklogTaskActions, 'openDetails'>
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const columns = useMemo(
    () => filterBoardColumns(board.columns, filter) as BoardResult['columns'],
    [board.columns, filter],
  )
  const taskById = useMemo(() => {
    const map = new Map<string, BacklogTask>()
    for (const column of board.columns) {
      for (const task of column.tasks) map.set(task._id, task)
    }
    return map
  }, [board.columns])
  const activeTask = activeId ? (taskById.get(activeId) ?? null) : null

  function statusOfOver(overId: string, overStatus?: BoardColumnStatus): BoardColumnStatus | null {
    if (overStatus) return overStatus
    if (overId.startsWith('column:')) {
      return overId.slice('column:'.length) as BoardColumnStatus
    }
    for (const column of columns) {
      if (column.tasks.some((task) => task._id === overId)) return column.status
    }
    return null
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    const destStatus = statusOfOver(
      String(over.id),
      over.data.current?.status as BoardColumnStatus | undefined,
    )
    if (!destStatus) return
    const dest = columns.find((column) => column.status === destStatus)
    if (!dest) return
    const movedId = String(active.id)
    const destIds = dest.tasks.map((task) => task._id).filter((id) => id !== movedId)
    const overId = String(over.id)
    if (!overId.startsWith('column:') && overId !== movedId) {
      const overIndex = destIds.indexOf(overId)
      if (overIndex >= 0) destIds.splice(overIndex, 0, movedId)
      else destIds.push(movedId)
    } else {
      destIds.push(movedId)
    }
    const args = toMoveOnBoardArgs({
      movedId,
      destStatus,
      destOrderedIds: destIds,
    })
    if (!args) return
    const from = taskById.get(movedId)
    if (!from) return
    const currentIndex = dest.tasks.findIndex((task) => task._id === movedId)
    const currentBefore =
      currentIndex >= 0 ? dest.tasks[currentIndex + 1]?._id : undefined
    if (from.status === destStatus && currentBefore === args.beforeTaskId) return
    void onMove({
      taskId: args.taskId as Id<'tasks'>,
      status: args.status,
      beforeTaskId: args.beforeTaskId as Id<'tasks'> | undefined,
    })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-3 overflow-x-auto pb-2">
        {BOARD_COLUMN_STATUSES.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            tasks={columns.find((column) => column.status === status)?.tasks ?? []}
            onOpen={actions.openDetails}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="w-[16rem] rounded-md border border-border bg-card p-3 shadow-soft">
            <TaskCardBody task={activeTask} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
```

Do not put Plan, Delete, or a status select on cards. `PointerSensor` distance 8 is what keeps click-to-edit working.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`

Expected: PASS (or only pre-existing errors unrelated to these files).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/tasks/BacklogBoard.tsx
git commit -m "feat: render backlog kanban board with drag-and-drop"
```

---

### Task 6: Wire tabs, search param, and mutations on `/backlog`

**Files:**
- Modify: `src/routes/_authenticated/backlog.tsx`

**Interfaces:**
- Consumes: `api.backlog.board`, `api.tasks.moveOnBoard`, `BacklogBoard`, `Tabs`, `Route.useSearch` / `useNavigate`
- Produces: `?view=table|board` (default table); shared filter; header count depends on tab

- [ ] **Step 1: Add search validation, board query, and optimistic move**

Imports to add: `useNavigate` from `@tanstack/react-router`, `Tabs` family, `BacklogBoard`, `applyMoveToBoard`, `filterBoardColumns`.

Replace the route export with:

```tsx
export const Route = createFileRoute('/_authenticated/backlog')({
  validateSearch: (raw: Record<string, unknown>): { view?: 'table' | 'board' } => ({
    view: raw.view === 'board' ? 'board' : raw.view === 'table' ? 'table' : undefined,
  }),
  component: BacklogPage,
})
```

At the top of `BacklogPage`:

```tsx
const { view } = Route.useSearch()
const navigate = useNavigate({ from: Route.fullPath })
const activeView = view ?? 'table'
const { data } = useSuspenseQuery(convexQuery(api.backlog.get, {}))
const { data: boardData } = useSuspenseQuery(convexQuery(api.backlog.board, {}))
const { data: projects } = useSuspenseQuery(
  convexQuery(api.projects.list, { status: 'active' }),
)
const updateTask = useMutation(api.tasks.update)
const removeTask = useMutation(api.tasks.remove)
const moveOnBoard = useMutation(api.tasks.moveOnBoard).withOptimisticUpdate(
  (localStore, args) => {
    const current = localStore.getQuery(api.backlog.board, {})
    if (!current) return
    localStore.setQuery(api.backlog.board, {}, applyMoveToBoard(current, args))
  },
)
```

- [ ] **Step 2: Render Tabs under the project filter**

Keep the existing header, Add task button, and project `Select`. Change the subtitle to:

```tsx
<p className="mt-1 text-sm text-muted-foreground">
  {activeView === 'board'
    ? `${filterBoardColumns(boardData.columns, filter).reduce((sum, c) => sum + c.tasks.length, 0)} tasks`
    : `${data.total} tasks`}
</p>
```

Immediately after the filter `Select`, wrap the table in tabs:

```tsx
<Tabs
  value={activeView}
  onValueChange={(next) =>
    void navigate({
      search: (prev) => ({ ...prev, view: next as 'table' | 'board' }),
      replace: true,
    })
  }
>
  <TabsList>
    <TabsTrigger value="table">Table</TabsTrigger>
    <TabsTrigger value="board">Board</TabsTrigger>
  </TabsList>
  <TabsContent value="table">
    <BacklogTasksTable
      tasks={filteredTasks}
      actions={{
        setStatus: (taskId, status) => void updateTask({ taskId, status }),
        plan: setPlanTaskId,
        openDetails: setEditingTask,
        remove: setTaskToDelete,
      }}
    />
  </TabsContent>
  <TabsContent value="board">
    <BacklogBoard
      board={boardData}
      filter={filter}
      onMove={(args) => moveOnBoard(args)}
      actions={{ openDetails: setEditingTask }}
    />
  </TabsContent>
</Tabs>
```

Leave `AddTaskModal`, `AddTimeBlockModal`, `EditTaskModal`, and `ConfirmDialog` exactly as they are today.

- [ ] **Step 3: Run unit tests + typecheck**

Run: `npm test && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 4: Manual verify**

Start `npm run dev`. Sign in. On `/backlog`:

1. Table tab still lists non-done tasks including `backlog` status; Done is absent.
2. Board tab shows five columns; `backlog` tasks absent; Done tasks present.
3. `?view=board` restores Board after refresh.
4. Project filter applies to both tabs; columns stay visible when empty.
5. Click card → edit modal. Drag to another column → status updates. Drag between cards → order updates.
6. Add task → appears on Table only until status is a board status.
7. Failed network is not required; optimistic + query reconcile is enough.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_authenticated/backlog.tsx
git commit -m "feat: add table and board tabs on the backlog page"
```

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| Table + Board tabs on `/backlog` | 6 |
| `?view=table\|board` | 6 |
| Shared project filter | 4, 6 |
| Columns Investigate → Done | 1, 2 |
| Hide `backlog` status on board | 2 |
| Done column uncapped | 2 |
| `get` unchanged | 2 (do not modify contract) |
| `moveOnBoard` status + dest order | 3 |
| `completedAt` parity with `update` | 3 |
| Click opens edit modal; 8px drag distance | 5 |
| Card fields (title, project, due, active, estimate) | 5 |
| No Plan/Delete/dropdown on cards | 5 |
| Optimistic move, revert via query | 6 |
| Header counts | 6 |
| Convex tests for board + move | 2, 3 |
| New task stays on table | default `create` + manual step 6.4 |

No nested `/backlog/board` route. No toast library. No `tasks.reorder` for drops.
