# Custom Board Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded task statuses with per-account board columns so Backlog and Active share one task set: unset `columnId` is Backlog, a locked last Done column drives `completedAt`, and users can name/color/reorder 2–8 columns.

**Architecture:** Add a `boardColumns` table and optional `tasks.columnId`. Queries stay read-only; the client calls `boardColumns.ensureDefaults` when `list` is empty. A one-shot migration seeds defaults for every existing `userId` and maps `in-progress`/`test`/`done` onto those columns (`backlog`/`investigate`/`review` stay unset). After reads and writes use `columnId`, drop `tasks.status`.

**Tech Stack:** Convex queries/mutations + `convex-test`, TanStack Router `?view=`, shadcn Dialog/Select/Tabs, existing `@dnd-kit` board, existing task modals.

**Spec:** `docs/superpowers/specs/2026-09-01-custom-board-columns-design.md` (PR #18). This plan amends the shipped board in `docs/superpowers/specs/2026-08-31-backlog-board-view-design.md`.

## Global Constraints

- Scope is **per account** (Clerk `userId` string). Not per project, not app-wide.
- Backlog is **not** a `boardColumns` row. Unset `columnId` = Backlog.
- Terminal column: exactly one `isDone: true` per user, name locked to `Done`, always highest `order`, not deletable, not moved off the end. Color is choosable.
- Column count: **2–8** (at least one workflow column + Done).
- Colors: only `BOARD_COLUMN_COLORS`. No hex input.
- Defaults: In-Progress (`#3b82f6`), Test (`#eab308`), Done (`#22c55e`).
- `completedAt` is set only when **entering** Done, cleared when **leaving** Done, unchanged for intra-Done reorder.
- Orphan/missing `columnId` is Backlog, never Done.
- Queries (`list` / `board` / `get`) never insert defaults.
- `moveOnBoard` destination is `columnId: Id<"boardColumns"> | null` (`null` = Backlog). Rewrite `order` only in the destination bucket.
- `/backlog` toggle is Board | Table (`?view=board|table`, default **board**). Same task set, including Done. Shared project filter.
- New tasks default to no column. Column-header **+** still preselects that column (Backlog **+** means no column).
- Do not add a toast library. Do not add per-project workflows, WIP limits, swimlanes, or nested `/backlog/board`.
- Prettier: Convex files keep double quotes + semicolons; `src/` uses single quotes, no semicolons.
- Public Convex functions: `requireUserId`. Unknown/other-user task, column, or `beforeTaskId` → `"Task not found"`.
- Do not use `Date.now()` inside queries. Dual-write to `status` is forbidden once custom column names exist — cut over reads/writes to `columnId` in Task 4, then drop `status` in Task 8.

## File map

| Path | Responsibility |
|------|----------------|
| `convex/lib/boardColumnColors.ts` | Palette, default seed rows, color/name helpers |
| `convex/lib/boardColumns.ts` | Load/sort columns, Done lookup, ownership, seed |
| `convex/boardColumns.ts` | `list`, `ensureDefaults`, `save`, `remove` |
| `convex/boardColumns.test.ts` | Column CRUD + auth + limits |
| `convex/schema.ts` | `boardColumns` table; `tasks.columnId`; later drop `status` |
| `convex/lib/legacyStatus.ts` | Map old `status` literals → default column names |
| `convex/migrations.ts` | `backfillBoardColumns` for every user with tasks |
| `convex/tasks.ts` | `create`/`update`/`moveOnBoard` on `columnId` |
| `convex/lib/taskStats.ts` | `isTaskActive(isDone, stats)` |
| `convex/backlog.ts` | Table + board over `columnId`, synthetic Backlog column |
| `convex/timeBlocks.ts` | Review “mark done” assigns Done `columnId` |
| `src/lib/backlog-board.ts` | Filter/optimistic move keyed by `columnId \| null` |
| `src/lib/forms/edit-task.ts` | `columnId: ''` for Backlog |
| `src/components/tasks/BoardColumnSettingsDialog.tsx` | Settings: names, colors, add/remove/reorder |
| `src/components/tasks/BacklogBoard.tsx` | Backlog \| user columns \| Done; inline rename/add/remove |
| `src/routes/_authenticated/backlog.tsx` | Settings, Board/Table labels, ensureDefaults, default view board |
| `src/lib/task-status.ts` | Delete after UI no longer uses six literals |
| `convex/lib/boardStatus.ts` | Delete after `moveOnBoard` no longer uses status union |

Do **not** split this spec into multiple plans: columns, board, table, and Done/`completedAt` are one workflow.

---

### Task 1: Palette helpers and schema widen

**Files:**
- Create: `convex/lib/boardColumnColors.ts`
- Create: `convex/lib/boardColumnColors.test.ts`
- Modify: `convex/schema.ts`

**Interfaces:**
- Consumes: none
- Produces: `BOARD_COLUMN_COLORS`, `DEFAULT_BOARD_COLUMNS`, `isBoardColumnColor()`, `normalizeColumnName()`, schema tables `boardColumns` + optional `tasks.columnId` (keep required `tasks.status` and `by_user_status`)

- [ ] **Step 1: Write the failing tests**

Create `convex/lib/boardColumnColors.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  BOARD_COLUMN_COLORS,
  DEFAULT_BOARD_COLUMNS,
  isBoardColumnColor,
  normalizeColumnName,
} from "./boardColumnColors";

describe("boardColumnColors", () => {
  it("lists the eight palette colors from the spec", () => {
    expect(BOARD_COLUMN_COLORS).toEqual([
      "#6366f1",
      "#3b82f6",
      "#22c55e",
      "#eab308",
      "#f97316",
      "#ec4899",
      "#a855f7",
      "#14b8a6",
    ]);
  });

  it("seeds In-Progress, Test, Done with the spec colors", () => {
    expect(DEFAULT_BOARD_COLUMNS).toEqual([
      { name: "In-Progress", color: "#3b82f6", isDone: false },
      { name: "Test", color: "#eab308", isDone: false },
      { name: "Done", color: "#22c55e", isDone: true },
    ]);
  });

  it("accepts only palette colors", () => {
    expect(isBoardColumnColor("#3b82f6")).toBe(true);
    expect(isBoardColumnColor("#ffffff")).toBe(false);
    expect(isBoardColumnColor("blue")).toBe(false);
  });

  it("trims names and rejects blank", () => {
    expect(normalizeColumnName("  Review  ")).toBe("Review");
    expect(normalizeColumnName("   ")).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- convex/lib/boardColumnColors.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement palette helpers**

Create `convex/lib/boardColumnColors.ts`:

```typescript
export const BOARD_COLUMN_COLORS = [
  "#6366f1",
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#f97316",
  "#ec4899",
  "#a855f7",
  "#14b8a6",
] as const;

export type BoardColumnColor = (typeof BOARD_COLUMN_COLORS)[number];

export const DEFAULT_BOARD_COLUMNS: ReadonlyArray<{
  name: string;
  color: BoardColumnColor;
  isDone: boolean;
}> = [
  { name: "In-Progress", color: "#3b82f6", isDone: false },
  { name: "Test", color: "#eab308", isDone: false },
  { name: "Done", color: "#22c55e", isDone: true },
];

export function isBoardColumnColor(color: string): color is BoardColumnColor {
  return (BOARD_COLUMN_COLORS as readonly string[]).includes(color);
}

export function normalizeColumnName(name: string): string {
  return name.trim();
}
```

- [ ] **Step 4: Widen the schema**

In `convex/schema.ts`, keep `taskStatus` and `tasks.status`. Add `columnId` and the new table. Add `by_user_columnId`.

Replace the `tasks` table and append `boardColumns`:

```typescript
  tasks: defineTable({
    userId: v.string(),
    title: v.string(),
    notes: v.optional(v.string()),
    checklist: v.optional(v.array(checklistItem)),
    archived: v.optional(v.boolean()),
    projectId: v.optional(v.id("projects")),
    status: taskStatus,
    columnId: v.optional(v.id("boardColumns")),
    scheduledDate: v.optional(v.string()),
    estimateMinutes: v.optional(v.number()),
    dueDate: v.optional(v.string()),
    priority: v.optional(v.union(v.literal(1), v.literal(2), v.literal(3))),
    order: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_columnId", ["userId", "columnId"])
    .index("by_user_scheduledDate", ["userId", "scheduledDate"])
    .index("by_project", ["projectId"]),

  boardColumns: defineTable({
    userId: v.string(),
    name: v.string(),
    color: v.string(),
    order: v.number(),
    isDone: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_user_order", ["userId", "order"]),
```

Do not enforce uniqueness, Done-last, or palette in schema. Mutations own those invariants.

- [ ] **Step 5: Re-run tests**

Run: `npm test -- convex/lib/boardColumnColors.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add convex/lib/boardColumnColors.ts convex/lib/boardColumnColors.test.ts convex/schema.ts
git commit -m "feat: add board column palette and schema widen"
```

---

### Task 2: `boardColumns` list, ensureDefaults, save, remove

**Files:**
- Create: `convex/lib/boardColumns.ts`
- Create: `convex/boardColumns.ts`
- Create: `convex/boardColumns.test.ts`

**Interfaces:**
- Consumes: `BOARD_COLUMN_COLORS`, `DEFAULT_BOARD_COLUMNS`, `isBoardColumnColor`, `normalizeColumnName`
- Produces:
  - `listColumnsForUser(ctx, userId): Promise<Doc<"boardColumns">[]>`
  - `getDoneColumn(ctx, userId): Promise<Doc<"boardColumns"> | null>`
  - `requireOwnedColumn(ctx, userId, columnId): Promise<Doc<"boardColumns">>`
  - `seedDefaultColumns(ctx, userId): Promise<boolean>` (`true` if inserted)
  - `api.boardColumns.list` → columns sorted by `order` (Done last after seed)
  - `api.boardColumns.ensureDefaults` → `null`; no-op when any columns exist
  - `api.boardColumns.save` args `{ columns: Array<{ id?: Id<"boardColumns">; name: string; color: string }> }`
  - `api.boardColumns.remove` args `{ columnId: Id<"boardColumns">; disposition?: "delete-tasks" | "move-to-backlog" }`

Exact error strings (use these in tests and handlers):

| Condition | Message |
|-----------|---------|
| Empty name after trim | `Column name is required` |
| Duplicate name (trim, case-insensitive) | `Column name already exists` |
| Color not in palette | `Invalid column color` |
| Count after save/remove outside 2–8 | `Board must have between 2 and 8 columns` |
| Rename Done or change `isDone` | `Done cannot be renamed` |
| Remove Done | `Done cannot be removed` |
| Done not last in `save` array / not the existing Done id | `Done must stay last` |
| `save` omits an existing non-Done column | `Use remove to delete a column` |
| Remove last workflow column (would leave only Done) | `Cannot remove the last workflow column` |
| Tasks remain and `disposition` missing/invalid | `Disposition required` |
| Other user’s column | `Task not found` (same as unknown id — do not leak existence) |

- [ ] **Step 1: Write the failing tests**

Create `convex/boardColumns.test.ts`:

```typescript
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";

async function authed() {
  const t = convexTest(schema, modules);
  const userId = "user_test1";
  const asUser = t.withIdentity({ subject: userId });
  return { t, asUser, userId };
}

describe("boardColumns.ensureDefaults", () => {
  it("inserts In-Progress, Test, Done once", async () => {
    const { asUser } = await authed();
    expect(await asUser.query(api.boardColumns.list, {})).toEqual([]);
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const columns = await asUser.query(api.boardColumns.list, {});
    expect(columns.map((c) => ({ name: c.name, isDone: c.isDone, color: c.color }))).toEqual([
      { name: "In-Progress", isDone: false, color: "#3b82f6" },
      { name: "Test", isDone: false, color: "#eab308" },
      { name: "Done", isDone: true, color: "#22c55e" },
    ]);
    expect(columns[2]!.order).toBeGreaterThan(columns[1]!.order);
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    expect((await asUser.query(api.boardColumns.list, {})).length).toBe(3);
  });
});

describe("boardColumns.save", () => {
  it("renames a workflow column and changes colors without rewriting ids", async () => {
    const { asUser } = await authed();
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const before = await asUser.query(api.boardColumns.list, {});
    await asUser.mutation(api.boardColumns.save, {
      columns: [
        { id: before[0]!._id, name: "Doing", color: "#14b8a6" },
        { id: before[1]!._id, name: "Test", color: "#eab308" },
        { id: before[2]!._id, name: "Done", color: "#22c55e" },
      ],
    });
    const after = await asUser.query(api.boardColumns.list, {});
    expect(after[0]!._id).toBe(before[0]!._id);
    expect(after[0]!.name).toBe("Doing");
    expect(after[0]!.color).toBe("#14b8a6");
  });

  it("appends a new column immediately before Done", async () => {
    const { asUser } = await authed();
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const before = await asUser.query(api.boardColumns.list, {});
    await asUser.mutation(api.boardColumns.save, {
      columns: [
        { id: before[0]!._id, name: "In-Progress", color: "#3b82f6" },
        { id: before[1]!._id, name: "Test", color: "#eab308" },
        { name: "Review", color: "#a855f7" },
        { id: before[2]!._id, name: "Done", color: "#22c55e" },
      ],
    });
    const after = await asUser.query(api.boardColumns.list, {});
    expect(after.map((c) => c.name)).toEqual([
      "In-Progress",
      "Test",
      "Review",
      "Done",
    ]);
    expect(after[3]!.isDone).toBe(true);
  });

  it("rejects Done rename, palette miss, duplicates, and omitting a column", async () => {
    const { asUser } = await authed();
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const cols = await asUser.query(api.boardColumns.list, {});
    const done = cols[2]!;
    const workflow = cols.slice(0, 2).map((c) => ({
      id: c._id,
      name: c.name,
      color: c.color,
    }));
    await expect(
      asUser.mutation(api.boardColumns.save, {
        columns: [...workflow, { id: done._id, name: "Finished", color: done.color }],
      }),
    ).rejects.toThrow("Done cannot be renamed");
    await expect(
      asUser.mutation(api.boardColumns.save, {
        columns: [...workflow, { id: done._id, name: "Done", color: "#ffffff" }],
      }),
    ).rejects.toThrow("Invalid column color");
    await expect(
      asUser.mutation(api.boardColumns.save, {
        columns: [
          { id: cols[0]!._id, name: "Test", color: cols[0]!.color },
          { id: cols[1]!._id, name: "Test", color: cols[1]!.color },
          { id: done._id, name: "Done", color: done.color },
        ],
      }),
    ).rejects.toThrow("Column name already exists");
    await expect(
      asUser.mutation(api.boardColumns.save, {
        columns: [
          { id: cols[0]!._id, name: cols[0]!.name, color: cols[0]!.color },
          { id: done._id, name: "Done", color: done.color },
        ],
      }),
    ).rejects.toThrow("Use remove to delete a column");
  });
});

describe("boardColumns.remove", () => {
  it("rejects removing Done and removing the last workflow column", async () => {
    const { asUser } = await authed();
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const cols = await asUser.query(api.boardColumns.list, {});
    await expect(
      asUser.mutation(api.boardColumns.remove, { columnId: cols[2]!._id }),
    ).rejects.toThrow("Done cannot be removed");
    await asUser.mutation(api.boardColumns.remove, { columnId: cols[1]!._id });
    await expect(
      asUser.mutation(api.boardColumns.remove, { columnId: cols[0]!._id }),
    ).rejects.toThrow("Cannot remove the last workflow column");
  });

  it("requires disposition when the column still has tasks", async () => {
    const { t, asUser, userId } = await authed();
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const cols = await asUser.query(api.boardColumns.list, {});
    await t.run(async (ctx) => {
      await ctx.db.insert("tasks", {
        userId,
        title: "Held",
        status: "in-progress",
        columnId: cols[0]!._id,
        order: 0,
      });
    });
    await expect(
      asUser.mutation(api.boardColumns.remove, { columnId: cols[0]!._id }),
    ).rejects.toThrow("Disposition required");
  });

  it("move-to-backlog clears columnId; delete-tasks deletes only that column's tasks", async () => {
    const { t, asUser, userId } = await authed();
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const cols = await asUser.query(api.boardColumns.list, {});
    const [keepId, dropId] = await t.run(async (ctx) => {
      const keepId = await ctx.db.insert("tasks", {
        userId,
        title: "Keep",
        status: "test",
        columnId: cols[1]!._id,
        order: 0,
      });
      const dropId = await ctx.db.insert("tasks", {
        userId,
        title: "Drop",
        status: "in-progress",
        columnId: cols[0]!._id,
        order: 0,
      });
      return [keepId, dropId] as const;
    });
    await asUser.mutation(api.boardColumns.remove, {
      columnId: cols[0]!._id,
      disposition: "move-to-backlog",
    });
    expect((await t.run(async (ctx) => ctx.db.get("tasks", dropId)))?.columnId).toBeUndefined();
    await asUser.mutation(api.boardColumns.remove, {
      columnId: cols[1]!._id,
      disposition: "delete-tasks",
    });
    expect(await t.run(async (ctx) => ctx.db.get("tasks", keepId))).toBeNull();
    expect(await t.run(async (ctx) => ctx.db.get("tasks", dropId))).not.toBeNull();
  });

  it("does not leak another user's columns", async () => {
    const { t, asUser } = await authed();
    const other = t.withIdentity({ subject: "user_other" });
    await other.mutation(api.boardColumns.ensureDefaults, {});
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const foreign = await other.query(api.boardColumns.list, {});
    const mine = await asUser.query(api.boardColumns.list, {});
    expect(mine.map((c) => c._id)).not.toEqual(foreign.map((c) => c._id));
    await expect(
      asUser.mutation(api.boardColumns.remove, { columnId: foreign[0]!._id }),
    ).rejects.toThrow("Task not found");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- convex/boardColumns.test.ts`

Expected: FAIL — `api.boardColumns` missing.

- [ ] **Step 3: Implement helpers**

Create `convex/lib/boardColumns.ts`:

```typescript
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  DEFAULT_BOARD_COLUMNS,
  isBoardColumnColor,
  normalizeColumnName,
} from "./boardColumnColors";

type Ctx = QueryCtx | MutationCtx;

export async function listColumnsForUser(
  ctx: Ctx,
  userId: string,
): Promise<Array<Doc<"boardColumns">>> {
  const rows = await ctx.db
    .query("boardColumns")
    .withIndex("by_user_order", (q) => q.eq("userId", userId))
    .collect();
  return rows.sort((a, b) => a.order - b.order || a._id.localeCompare(b._id));
}

export async function getDoneColumn(
  ctx: Ctx,
  userId: string,
): Promise<Doc<"boardColumns"> | null> {
  const columns = await listColumnsForUser(ctx, userId);
  return columns.find((column) => column.isDone) ?? null;
}

export async function requireOwnedColumn(
  ctx: Ctx,
  userId: string,
  columnId: Id<"boardColumns">,
): Promise<Doc<"boardColumns">> {
  const column = await ctx.db.get("boardColumns", columnId);
  if (!column || column.userId !== userId) {
    throw new Error("Task not found");
  }
  return column;
}

export async function seedDefaultColumns(
  ctx: MutationCtx,
  userId: string,
): Promise<boolean> {
  const existing = await listColumnsForUser(ctx, userId);
  if (existing.length > 0) return false;
  for (let i = 0; i < DEFAULT_BOARD_COLUMNS.length; i++) {
    const seed = DEFAULT_BOARD_COLUMNS[i]!;
    await ctx.db.insert("boardColumns", {
      userId,
      name: seed.name,
      color: seed.color,
      order: i,
      isDone: seed.isDone,
    });
  }
  return true;
}

export function assertValidColor(color: string) {
  if (!isBoardColumnColor(color)) {
    throw new Error("Invalid column color");
  }
}

export function assertUniqueNames(names: string[]) {
  const seen = new Set<string>();
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) throw new Error("Column name already exists");
    seen.add(key);
  }
}

export { normalizeColumnName };
```

- [ ] **Step 4: Implement public functions**

Create `convex/boardColumns.ts`. `save` treats array order as `order` 0..n-1. Last row must be the existing Done column with name `Done`. New rows (no `id`) insert with `isDone: false`. Existing ids must all appear (except Done which must appear last). Reorder existing workflow columns by array position.

`remove`: load owned column; if `isDone` throw; if remaining count would be < 2 throw; collect tasks with that `columnId`; if any and no valid disposition throw; `delete-tasks` deletes those task docs (and should use the same membership cleanup as `tasks.remove` — call `deleteMembershipsForTask` per task, then delete the task); `move-to-backlog` patches `columnId: undefined`; then delete the column and compact `order` on remaining columns to 0..n-1 with Done last.

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import {
  assertUniqueNames,
  assertValidColor,
  listColumnsForUser,
  normalizeColumnName,
  requireOwnedColumn,
  seedDefaultColumns,
} from "./lib/boardColumns";
import { deleteMembershipsForTask } from "./lib/timeBlockMemberships";
import type { Id } from "./_generated/dataModel";

const saveColumn = v.object({
  id: v.optional(v.id("boardColumns")),
  name: v.string(),
  color: v.string(),
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await listColumnsForUser(ctx, userId);
  },
});

export const ensureDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    await seedDefaultColumns(ctx, userId);
    return null;
  },
});

export const save = mutation({
  args: { columns: v.array(saveColumn) },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await listColumnsForUser(ctx, userId);
    if (existing.length === 0) {
      throw new Error("Board must have between 2 and 8 columns");
    }
    if (args.columns.length < 2 || args.columns.length > 8) {
      throw new Error("Board must have between 2 and 8 columns");
    }
    const done = existing.find((c) => c.isDone);
    if (!done) throw new Error("Done must stay last");
    const last = args.columns[args.columns.length - 1];
    if (!last || last.id !== done._id) {
      throw new Error("Done must stay last");
    }
    const lastName = normalizeColumnName(last.name);
    if (lastName !== "Done") throw new Error("Done cannot be renamed");
    assertValidColor(last.color);

    const existingIds = new Set(existing.filter((c) => !c.isDone).map((c) => c._id));
    const seenIds = new Set<string>();
    const names: string[] = [];
    for (const row of args.columns) {
      const name = normalizeColumnName(row.name);
      if (!name) throw new Error("Column name is required");
      names.push(name);
      assertValidColor(row.color);
      if (row.id) {
        const col = await requireOwnedColumn(ctx, userId, row.id);
        seenIds.add(row.id);
        if (col.isDone && row !== last) throw new Error("Done must stay last");
      }
    }
    assertUniqueNames(names);
    for (const id of existingIds) {
      if (!seenIds.has(id)) {
        throw new Error("Use remove to delete a column");
      }
    }

    for (let i = 0; i < args.columns.length; i++) {
      const row = args.columns[i]!;
      const name = normalizeColumnName(row.name);
      if (row.id) {
        await ctx.db.patch("boardColumns", row.id, {
          name,
          color: row.color,
          order: i,
        });
      } else {
        await ctx.db.insert("boardColumns", {
          userId,
          name,
          color: row.color,
          order: i,
          isDone: false,
        });
      }
    }
    return null;
  },
});

export const remove = mutation({
  args: {
    columnId: v.id("boardColumns"),
    disposition: v.optional(
      v.union(v.literal("delete-tasks"), v.literal("move-to-backlog")),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const column = await requireOwnedColumn(ctx, userId, args.columnId);
    if (column.isDone) throw new Error("Done cannot be removed");
    const existing = await listColumnsForUser(ctx, userId);
    if (existing.length - 1 < 2) {
      throw new Error("Cannot remove the last workflow column");
    }
    const tasks = (
      await ctx.db
        .query("tasks")
        .withIndex("by_user_columnId", (q) =>
          q.eq("userId", userId).eq("columnId", args.columnId),
        )
        .collect()
    );
    if (tasks.length > 0) {
      if (
        args.disposition !== "delete-tasks" &&
        args.disposition !== "move-to-backlog"
      ) {
        throw new Error("Disposition required");
      }
      if (args.disposition === "delete-tasks") {
        for (const task of tasks) {
          await deleteMembershipsForTask(ctx, task._id);
          await ctx.db.delete("tasks", task._id);
        }
      } else {
        for (const task of tasks) {
          await ctx.db.patch("tasks", task._id, { columnId: undefined });
        }
      }
    }
    await ctx.db.delete("boardColumns", args.columnId);
    const remaining = (await listColumnsForUser(ctx, userId)).filter(
      (c) => c._id !== args.columnId,
    );
    remaining.sort((a, b) => a.order - b.order || a._id.localeCompare(b._id));
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i]!.order !== i) {
        await ctx.db.patch("boardColumns", remaining[i]!._id, { order: i });
      }
    }
    return null;
  },
});
```

If `deleteMembershipsForTask` plus empty-block cleanup is required to match `tasks.remove`, copy that loop from `convex/tasks.ts` `remove` (schedule block delete when a block has no memberships left). Prefer extracting a shared `deleteTaskRecord(ctx, taskId)` in `convex/tasks.ts` and calling it from both `tasks.remove` and `boardColumns.remove` rather than duplicating.

- [ ] **Step 5: Run tests**

Run: `npm test -- convex/boardColumns.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add convex/lib/boardColumns.ts convex/boardColumns.ts convex/boardColumns.test.ts convex/tasks.ts
git commit -m "feat: add per-account boardColumns CRUD"
```

---

### Task 3: Legacy status backfill

**Files:**
- Create: `convex/lib/legacyStatus.ts`
- Create: `convex/lib/legacyStatus.test.ts`
- Modify: `convex/migrations.ts`
- Create: `convex/lib/backfillBoardColumns.ts` (pure + handler) or put handler helpers next to migrations
- Modify: `convex/migrations.test.ts` (add describe; do not break existing tests)

**Interfaces:**
- Consumes: `seedDefaultColumns`, `listColumnsForUser`
- Produces:
  - `legacyStatusToDefaultName(status: string): "In-Progress" | "Test" | "Done" | null`
  - `backfillBoardColumnsForUsers(ctx): Promise<{ users: number; tasks: number }>`
  - `api.migrations.backfillBoardColumns` public mutation (idempotent, same pattern as `migrateLegacyTasks`)

Mapping:

| `status` | `columnId` |
|----------|------------|
| `in-progress` | column named `In-Progress` |
| `test` | column named `Test` |
| `done` | column named `Done` |
| `backlog`, `investigate`, `review`, anything else | unset |

Skip a task that already has `columnId` set (idempotent). Users with zero columns get defaults first, even if they never open `/backlog`. Collect distinct `userId` from `tasks` **and** existing `boardColumns`.

- [ ] **Step 1: Write failing tests**

Create `convex/lib/legacyStatus.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { legacyStatusToDefaultName } from "./legacyStatus";

describe("legacyStatusToDefaultName", () => {
  it("maps in-progress, test, and done", () => {
    expect(legacyStatusToDefaultName("in-progress")).toBe("In-Progress");
    expect(legacyStatusToDefaultName("test")).toBe("Test");
    expect(legacyStatusToDefaultName("done")).toBe("Done");
  });

  it("leaves backlog, investigate, and review unset", () => {
    expect(legacyStatusToDefaultName("backlog")).toBeNull();
    expect(legacyStatusToDefaultName("investigate")).toBeNull();
    expect(legacyStatusToDefaultName("review")).toBeNull();
  });
});
```

Add to `convex/migrations.test.ts` (keep existing tests). Use the same `convexTest` + identity pattern as other files:

```typescript
describe("backfillBoardColumns", () => {
  it("seeds defaults and maps statuses without creating Investigate or Review columns", async () => {
    const t = convexTest(schema, modules);
    const userId = "user_migrate";
    const asUser = t.withIdentity({ subject: userId });
    await t.run(async (ctx) => {
      for (const [title, status] of [
        ["A", "backlog"],
        ["B", "investigate"],
        ["C", "review"],
        ["D", "in-progress"],
        ["E", "test"],
        ["F", "done"],
      ] as const) {
        await ctx.db.insert("tasks", { userId, title, status, order: 0 });
      }
    });
    await asUser.mutation(api.migrations.backfillBoardColumns, {});
    const columns = await asUser.query(api.boardColumns.list, {});
    expect(columns.map((c) => c.name)).toEqual(["In-Progress", "Test", "Done"]);
    const tasks = await t.run(async (ctx) =>
      (await ctx.db.query("tasks").collect()).sort((a, b) =>
        a.title.localeCompare(b.title),
      ),
    );
    const byTitle = Object.fromEntries(tasks.map((task) => [task.title, task]));
    const ids = Object.fromEntries(columns.map((c) => [c.name, c._id]));
    expect(byTitle.A?.columnId).toBeUndefined();
    expect(byTitle.B?.columnId).toBeUndefined();
    expect(byTitle.C?.columnId).toBeUndefined();
    expect(byTitle.D?.columnId).toBe(ids["In-Progress"]);
    expect(byTitle.E?.columnId).toBe(ids.Test);
    expect(byTitle.F?.columnId).toBe(ids.Done);
  });

  it("is a no-op for tasks that already have columnId", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user_migrate2" });
    await asUser.mutation(api.boardColumns.ensureDefaults, {});
    const columns = await asUser.query(api.boardColumns.list, {});
    const taskId = await asUser.mutation(api.tasks.create, { title: "Parked" });
    await t.run(async (ctx) => {
      await ctx.db.patch("tasks", taskId, { columnId: columns[1]!._id });
    });
    await asUser.mutation(api.migrations.backfillBoardColumns, {});
    expect((await t.run(async (ctx) => ctx.db.get("tasks", taskId)))?.columnId).toBe(
      columns[1]!._id,
    );
  });
});
```

The second test uses `api.tasks.create` which still writes `status: "backlog"` until Task 4 — that is fine.

If `api.migrations` is not in `_generated/api` until the export exists, the test will fail as expected.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- convex/lib/legacyStatus.test.ts convex/migrations.test.ts`

Expected: FAIL on missing `legacyStatusToDefaultName` / `backfillBoardColumns`.

- [ ] **Step 3: Implement mapping + mutation**

Create `convex/lib/legacyStatus.ts`:

```typescript
export function legacyStatusToDefaultName(
  status: string,
): "In-Progress" | "Test" | "Done" | null {
  if (status === "in-progress") return "In-Progress";
  if (status === "test") return "Test";
  if (status === "done") return "Done";
  return null;
}
```

Append to `convex/migrations.ts`:

```typescript
import { seedDefaultColumns, listColumnsForUser } from "./lib/boardColumns";
import { legacyStatusToDefaultName } from "./lib/legacyStatus";

async function backfillBoardColumnsHandler(ctx: MutationCtx) {
  const tasks = await ctx.db.query("tasks").collect();
  const columns = await ctx.db.query("boardColumns").collect();
  const userIds = new Set<string>();
  for (const task of tasks) userIds.add(task.userId);
  for (const column of columns) userIds.add(column.userId);
  for (const userId of userIds) {
    await seedDefaultColumns(ctx, userId);
    const seeded = await listColumnsForUser(ctx, userId);
    const byName = new Map(seeded.map((c) => [c.name, c._id]));
    const userTasks = tasks.filter((task) => task.userId === userId);
    for (const task of userTasks) {
      if (task.columnId !== undefined) continue;
      const name = legacyStatusToDefaultName(task.status);
      if (!name) continue;
      const columnId = byName.get(name);
      if (columnId) {
        await ctx.db.patch("tasks", task._id, { columnId });
      }
    }
  }
}

export const backfillBoardColumns = mutation({
  args: {},
  handler: async (ctx) => {
    await backfillBoardColumnsHandler(ctx);
  },
});
```

Reload `tasks` inside the loop if the collected snapshot is stale after seed — using the original `tasks` array is correct for `columnId` patches because seed does not change tasks.

- [ ] **Step 4: Run tests**

Run: `npm test -- convex/lib/legacyStatus.test.ts convex/migrations.test.ts convex/boardColumns.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/legacyStatus.ts convex/lib/legacyStatus.test.ts convex/migrations.ts convex/migrations.test.ts
git commit -m "feat: backfill board columns from legacy task status"
```

---

### Task 4: Cut over task writes to `columnId`

Make `tasks.status` **optional** in the schema so new writes can omit it. All create/update/moveOnBoard/time-block-done paths read and write `columnId` + `completedAt` only. Stop importing `boardColumnStatus` in `tasks.ts`.

**Files:**
- Modify: `convex/schema.ts` (`status: v.optional(taskStatus)`)
- Modify: `convex/tasks.ts`
- Modify: `convex/tasks.test.ts`
- Modify: `convex/timeBlocks.ts`
- Modify: `convex/timeBlocks.test.ts`
- Modify: `convex/lib/taskStats.ts`
- Modify: `convex/lib/taskStats.test.ts`
- Modify: `convex/today.ts`
- Modify: `src/routes/_authenticated/projects/$projectId.tsx`
- Modify: `src/routes/_authenticated/projects/index.tsx`
- Modify: `src/components/tasks/TaskRow.tsx`
- Modify: `src/components/time-block/AddTimeBlockModal.tsx`

**Interfaces:**
- Consumes: `requireOwnedColumn`, `getDoneColumn`, `listColumnsForUser`
- Produces:
  - `isTaskDone(columnId, doneColumnId): boolean`
  - `isTaskActive(isDone, stats): boolean`
  - `completedAtForMove(wasDone, willBeDone, previous): number | undefined`
  - `api.tasks.create` args: `columnId: v.optional(v.union(v.id("boardColumns"), v.null()))` instead of `status`
  - `api.tasks.update` same `columnId` optional union (omit key = leave unchanged; `null` = Backlog)
  - `api.tasks.moveOnBoard` args: `{ taskId, columnId: v.union(v.id("boardColumns"), v.null()), beforeTaskId?: Id<"tasks"> }`

`completedAtForMove`:

```typescript
export function completedAtForMove(
  wasDone: boolean,
  willBeDone: boolean,
  previous: number | undefined,
): number | undefined {
  if (wasDone && willBeDone) return previous;
  if (!wasDone && willBeDone) return Date.now();
  return undefined;
}
```

`isTaskDone`: `columnId !== undefined && doneColumnId !== undefined && columnId === doneColumnId`.

Project checkbox and time-block `taskDone`: load `getDoneColumn`; if missing, `seedDefaultColumns` then reload (mutations may seed; queries must not). Then patch `columnId` to Done id or `undefined` (Backlog) and set `completedAt` via `completedAtForMove`.

Surfaces without a Done id (TaskRow, project cards, AddTimeBlockModal): treat **`completedAt != null` as Done** until they receive `isDone` from a query. After this task, `tasks.create`/`update` keep `completedAt` in sync, so that is equivalent.

- [ ] **Step 1: Write failing `moveOnBoard` / create tests**

Replace `describe("tasks.moveOnBoard")` in `convex/tasks.test.ts` with columnId versions. Helper at top of the describe:

```typescript
async function seedColumns(asUser: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>) {
  await asUser.mutation(api.boardColumns.ensureDefaults, {});
  return await asUser.query(api.boardColumns.list, {});
}
```

Port each existing case:

- Drop onto another column with `beforeTaskId` → that task’s `columnId` matches dest; source bucket order unchanged.
- Append: omit `beforeTaskId`; moved task is last in dest (`order` 0..n-1 on dest only).
- Intra-column reorder does not change other columns’ `order`.
- Entering Done sets `completedAt`; leaving clears it; intra-Done keeps it.
- `columnId: null` moves to Backlog (`columnId` undefined).
- Foreign `beforeTaskId` / wrong bucket → `"Task not found"` or `"Invalid drop target"` as today.
- `beforeTaskId === taskId` → `"Invalid drop target"`.

Replace create tests that expect `status: "backlog"`:

```typescript
expect(task?.columnId).toBeUndefined();
expect(task?.completedAt).toBeUndefined();
```

Create with `columnId` of Done → `completedAt` is a number.

Create/update with another user’s `columnId` → `"Task not found"`.

Update `{ columnId: null }` clears the column.

Replace `status: "done"` in update tests with `columnId: doneId`.

In `convex/lib/taskStats.test.ts`:

```typescript
expect(isTaskActive(false, stats)).toBe(true);
expect(isTaskActive(true, stats)).toBe(false);
expect(isTaskActive(false, emptyTaskStats())).toBe(false);
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npm test -- convex/tasks.test.ts convex/lib/taskStats.test.ts`

Expected: FAIL — `columnId` args not accepted / `isTaskActive` still wants status.

- [ ] **Step 3: Implement helpers and mutations**

Add `completedAtForMove` and `isTaskDone` to `convex/lib/boardColumns.ts` (or `convex/lib/taskDone.ts` if you want a smaller module).

`convex/lib/taskStats.ts`:

```typescript
export function isTaskActive(
  isDone: boolean,
  stats: TaskStats | undefined,
): boolean {
  return !isDone && (stats?.blockCount ?? 0) > 0;
}
```

`convex/today.ts` enrich:

```typescript
const done = await getDoneColumn(ctx, userId);
const doneId = done?._id;
// ...
active: isTaskActive(isTaskDone(task.columnId, doneId), statsMap.get(task._id)),
```

`moveOnBoard` algorithm (one mutation):

1. `getOwnedTask`.
2. If `columnId` is an id, `requireOwnedColumn`.
3. If `beforeTaskId`: load owned task; must not be `taskId`; destination match: both `columnId` equal (treat missing as null).
4. `wasDone` / `willBeDone` from `getDoneColumn`.
5. Patch `{ columnId: args.columnId ?? undefined, completedAt: completedAtForMove(...) }`.
6. Load destination bucket: if dest id, `by_user_columnId`; if Backlog, `by_user` then `task.columnId === undefined`. Exclude archived if board excludes them — **include archived in order rewrite only if they share the bucket**; board UI filters archived separately. Match current `moveOnBoard`: all tasks in the dest status, including archived. Keep that: all dest-bucket tasks.
7. Sort `order` then `_id`, remove moved, insert before `beforeTaskId` or append, write `order = 0..n-1` only on that list.

`create`: default omit `columnId`. If provided, `requireOwnedColumn`. `completedAt` if that column `isDone`. Do not set `status` (optional).

`update`: if `columnId` in args (`null` or id), same ownership + `completedAtForMove`. Do not patch `status`.

`timeBlocks` review `taskDone`: seed defaults if needed, patch Done column + `completedAt: Date.now()`.

Project page toggle:

```typescript
onToggleDone={(done) =>
  void updateTask({
    taskId: task._id,
    columnId: done ? doneColumnId : null,
  })
}
```

The project page must `useQuery(api.boardColumns.list)` (and `ensureDefaults` if empty) to get `doneColumnId`. Until that query exists on the page, pass `columnId: null` for not-done and require Done id for done — do not pass a fake status.

TaskRow: `const done = task.completedAt != null`.

Projects index: `const done = projectTasks.filter((task) => task.completedAt != null).length`.

AddTimeBlockModal: `task.completedAt == null`.

- [ ] **Step 4: Run Convex tests**

Run: `npm test -- convex/tasks.test.ts convex/lib/taskStats.test.ts convex/timeBlocks.test.ts convex/today.test.ts`

Fix any insert that still **requires** status — with optional status, old inserts still work.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/tasks.ts convex/tasks.test.ts convex/timeBlocks.ts convex/timeBlocks.test.ts convex/lib/taskStats.ts convex/lib/taskStats.test.ts convex/today.ts src/routes/_authenticated/projects src/components/tasks/TaskRow.tsx src/components/time-block/AddTimeBlockModal.tsx convex/lib/boardColumns.ts
git commit -m "feat: store task board position as columnId"
```

---

### Task 5: Backlog queries share one task set

**Files:**
- Modify: `convex/backlog.ts`
- Modify: `convex/backlog.test.ts`

**Interfaces:**
- Consumes: `listColumnsForUser`, `isTaskDone`, `isTaskActive`
- Produces:
  - `api.backlog.get` — all non-archived tasks (or archived when `archived: true`), grouped by project, **including Done and Backlog**. `total` is that set’s length.
  - `api.backlog.board` — `{ total, columns }` where `columns` is:
    1. Synthetic Backlog: `{ columnId: null, name: "Backlog", color: null, isDone: false, isBacklog: true, tasks }`
    2. Each `boardColumns` row in `order` (Done last): `{ columnId, name, color, isDone, isBacklog: false, tasks }`
  - Empty named columns still appear. If the user has zero columns, `board` returns **only** the Backlog bucket (client will `ensureDefaults`).
  - Enriched task: existing fields plus `columnId` and `isDone: boolean` (from Done column id; orphan column → `isDone: false`).

- [ ] **Step 1: Rewrite failing tests in `convex/backlog.test.ts`**

Change `insertTask` to take `columnId?: Id<"boardColumns">` instead of `status` (status optional in insert for now).

`backlog.get`:

- Insert Backlog (no column), In-Progress, Done → `total === 3`, all three titles present.
- Archived excluded from default; included when `archived: true`.
- Still groups by project including `"No project"`.

`backlog.board`:

- After `ensureDefaults`, `columns[0].isBacklog === true` and `columns.at(-1).isDone === true`.
- Names: `["Backlog", "In-Progress", "Test", "Done"]`.
- Empty Test column still present with `tasks: []`.
- Cards sorted by `order` then `_id`.
- Other user’s tasks absent.
- `active` false when `isDone` even if the task has time-block memberships.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- convex/backlog.test.ts`

Expected: FAIL — get still filters `status === "backlog"`; board still uses `BOARD_COLUMN_STATUSES`.

- [ ] **Step 3: Implement `convex/backlog.ts`**

```typescript
function enrichTask(
  task: Doc<"tasks">,
  projectMap: Map<Id<"projects">, Doc<"projects">>,
  statsMap: Map<Id<"tasks">, TaskStats>,
  doneColumnId: Id<"boardColumns"> | undefined,
) {
  const stats = statsMap.get(task._id) ?? emptyTaskStats();
  const isDone = isTaskDone(task.columnId, doneColumnId);
  return {
    ...task,
    project: task.projectId ? (projectMap.get(task.projectId) ?? null) : null,
    stats,
    isDone,
    active: isTaskActive(isDone, stats),
  };
}
```

`get`: query `by_user`, filter archived flag, sort `order` then `_id`, group as today.

`board`: load columns + tasks; bucket by `columnId` (undefined → Backlog). Sort each bucket. `total` = sum of tasks in returned columns (all non-archived).

Remove imports of `BOARD_COLUMN_STATUSES`.

- [ ] **Step 4: Run tests**

Run: `npm test -- convex/backlog.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/backlog.ts convex/backlog.test.ts
git commit -m "feat: serve backlog table and board from columnId"
```

---

### Task 6: Client helpers and task forms

**Files:**
- Modify: `src/lib/backlog-board.ts`
- Modify: `src/lib/backlog-board.test.ts`
- Modify: `src/lib/forms/edit-task.ts`
- Modify: `src/lib/forms/edit-task.test.ts`
- Modify: `src/lib/forms/add-task.ts`
- Modify: `src/lib/forms/add-task.test.ts`
- Modify: `src/lib/task-status.ts` (replace six literals with column-option helpers **or** delete and move helpers to `src/lib/board-columns.ts`)
- Modify: `src/lib/task-status.test.ts`
- Modify: `src/components/tasks/TaskFormFields.tsx`
- Modify: `src/components/tasks/AddTaskModal.tsx`
- Modify: `src/components/tasks/EditTaskModal.tsx`

**Interfaces:**
- Consumes: `api.boardColumns.list` docs: `{ _id, name, color, isDone, order }`
- Produces:
  - `BoardColumnKey = string | null` (`null` = Backlog)
  - `toMoveOnBoardArgs({ movedId, destColumnId, destOrderedIds })` → `{ taskId, columnId: destColumnId, beforeTaskId?: string } | null`
  - `applyMoveToBoard(board, args)` updates `columnId` on the moved card
  - `columnDroppableId(columnId: BoardColumnKey)` → `column:backlog` or `column:${id}`
  - `editTaskSchema.columnId: z.string()` (`''` = Backlog)
  - `toCreateTaskArgs` / `toUpdateTaskArgs` send `columnId: values.columnId || null`
  - `emptyAddTaskValues(projectId?, columnId = '')`
  - `columnSelectOptions(columns)` → `[{ value: '', label: 'Backlog' }, ...columns.map(...)]`

- [ ] **Step 1: Rewrite failing client tests**

`src/lib/backlog-board.test.ts` — columns use `columnId: null | 'c1'` etc., not status strings. `toMoveOnBoardArgs` expects `columnId: null` for Backlog and `columnId: 'c-review'` for a named column.

`src/lib/forms/add-task.test.ts` / `edit-task.test.ts` — replace `status: 'backlog'` with `columnId: ''`; `'in-progress'` with a fake id `'k1'`. Default create args:

```typescript
expect(toCreateTaskArgs({ ...emptyAddTaskValues(), title: 'Buy milk' })).toMatchObject({
  columnId: null,
})
```

`task-status.test.ts` — if you keep the file, test `columnSelectOptions`:

```typescript
expect(columnSelectOptions([
  { _id: '1', name: 'In-Progress', isDone: false },
  { _id: '2', name: 'Done', isDone: true },
])).toEqual([
  { value: '', label: 'Backlog' },
  { value: '1', label: 'In-Progress' },
  { value: '2', label: 'Done' },
])
```

Delete `TASK_STATUSES` / `BOARD_COLUMN_STATUSES` / `STATUS_CONFIG` once nothing imports them.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/backlog-board.test.ts src/lib/forms/add-task.test.ts src/lib/forms/edit-task.test.ts src/lib/task-status.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement helpers and wire forms**

`toMoveOnBoardArgs`:

```typescript
export function toMoveOnBoardArgs(input: {
  movedId: string
  destColumnId: string | null
  destOrderedIds: Array<string>
}): { taskId: string; columnId: string | null; beforeTaskId?: string } | null {
  const index = input.destOrderedIds.indexOf(input.movedId)
  if (index === -1) return null
  const beforeTaskId = input.destOrderedIds[index + 1]
  return beforeTaskId
    ? { taskId: input.movedId, columnId: input.destColumnId, beforeTaskId }
    : { taskId: input.movedId, columnId: input.destColumnId }
}
```

`applyMoveToBoard`: find card, strip from all columns, insert into the column whose `columnId` equals `args.columnId` (use `==` so `null` matches Backlog). Set `moved.columnId = args.columnId ?? undefined` and `moved.isDone` if you have `isDone` on the dest column.

`TaskFormFields`: take `columnOptions: Array<{ value: string; label: string }>` as a form prop (default `[{ value: '', label: 'Backlog' }]`). Field name `columnId`, label `Status` (spec: status field uses the same list).

`AddTaskModal` / `EditTaskModal`: `useQuery(api.boardColumns.list)`, pass options, `defaultColumnId` instead of `defaultStatus`. `ensureDefaults` is owned by the Backlog page (Task 7); modals on other pages should call `ensureDefaults` if `list` is `[]` so Done/Backlog options exist.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/backlog-board.test.ts src/lib/forms src/lib/task-status.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/backlog-board.ts src/lib/backlog-board.test.ts src/lib/forms src/lib/task-status.ts src/lib/task-status.test.ts src/components/tasks/TaskFormFields.tsx src/components/tasks/AddTaskModal.tsx src/components/tasks/EditTaskModal.tsx
git commit -m "feat: switch task forms and board helpers to columnId"
```

---

### Task 7: Settings dialog

**Files:**
- Create: `src/lib/board-column-settings.ts`
- Create: `src/lib/board-column-settings.test.ts`
- Create: `src/components/tasks/BoardColumnSettingsDialog.tsx`
- Modify: `src/routes/_authenticated/backlog.tsx` (button + dialog only; full page chrome in Task 8 if easier to do together — **this task must ship a working Settings button**)

**Interfaces:**
- Consumes: `BOARD_COLUMN_COLORS` from `convex/lib/boardColumnColors.ts`, `api.boardColumns.save` / `remove`, `api.backlog.board` (task counts per `columnId`)
- Produces:
  - `type SettingsRow = { key: string; id?: string; name: string; color: string; isDone: boolean }`
  - `rowsFromColumns(columns): SettingsRow[]`
  - `canAddColumn(rows): boolean` — `rows.length < 8`
  - `insertWorkflowRow(rows, row): SettingsRow[]` — insert immediately before the Done row
  - `moveRow(rows, index, dir: -1 | 1): SettingsRow[]` — no-op on Done or moving past Done
  - `toSavePayload(rows)` — `{ columns: Array<{ id?: Id; name; color }> }` in display order
  - Dialog: name inputs, 8 swatches, up/down hidden/disabled on Done, trash on non-Done, Add column, Done name read-only

Remove confirm:

- Count 0: existing `ConfirmDialog` — title `Delete column?`, confirm `Delete`.
- Count > 0: two actions — not a single confirm. Use the same Dialog with two buttons: `Move N tasks to Backlog` (default) and `Delete N tasks` (destructive). Call `remove` with the matching `disposition`.

Save: on dialog Save (or blur if you save live), call `save` with `toSavePayload`. Remove can run immediately after confirm without waiting for Save.

- [ ] **Step 1: Write failing helper tests**

```typescript
import { describe, expect, it } from 'vitest'
import {
  canAddColumn,
  insertWorkflowRow,
  moveRow,
  rowsFromColumns,
  toSavePayload,
} from './board-column-settings'

const columns = [
  { _id: '1', name: 'In-Progress', color: '#3b82f6', isDone: false, order: 0 },
  { _id: '2', name: 'Test', color: '#eab308', isDone: false, order: 1 },
  { _id: '3', name: 'Done', color: '#22c55e', isDone: true, order: 2 },
]

describe('board-column-settings', () => {
  it('inserts before Done', () => {
    const rows = insertWorkflowRow(rowsFromColumns(columns), {
      key: 'new',
      name: 'Review',
      color: '#a855f7',
      isDone: false,
    })
    expect(rows.map((r) => r.name)).toEqual(['In-Progress', 'Test', 'Review', 'Done'])
  })

  it('does not move Done', () => {
    const rows = rowsFromColumns(columns)
    expect(moveRow(rows, 2, -1)).toEqual(rows)
  })

  it('caps at 8 columns', () => {
    const eight = Array.from({ length: 7 }, (_, i) => ({
      _id: String(i),
      name: `C${i}`,
      color: '#3b82f6',
      isDone: false,
      order: i,
    }))
    eight.push(columns[2]!)
    expect(canAddColumn(rowsFromColumns(eight))).toBe(false)
  })

  it('omits client-only keys from save payload', () => {
    expect(toSavePayload(rowsFromColumns(columns)).columns[0]).toEqual({
      id: '1',
      name: 'In-Progress',
      color: '#3b82f6',
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/board-column-settings.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement helpers + dialog**

Swatches: buttons with `aria-label` color hex, `style={{ background: color }}`, selected ring. Done row: no name `<Input>` (text only), no trash, no up/down.

Header Settings button on `/backlog` next to **+ Add task**:

```tsx
<div className="flex gap-2">
  <Button type="button" variant="outline" onClick={() => setSettingsOpen(true)}>
    Settings
  </Button>
  <Button type="button" onClick={() => openAddTask()}>
    + Add task
  </Button>
</div>
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/board-column-settings.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/board-column-settings.ts src/lib/board-column-settings.test.ts src/components/tasks/BoardColumnSettingsDialog.tsx src/routes/_authenticated/backlog.tsx
git commit -m "feat: add board column settings dialog"
```

---

### Task 8: Backlog page, board UI, table, schema narrow

**Files:**
- Modify: `src/routes/_authenticated/backlog.tsx`
- Modify: `src/components/tasks/BacklogBoard.tsx`
- Modify: `src/components/tasks/BacklogTasksTable.tsx`
- Delete: `convex/lib/boardStatus.ts` (if unused)
- Modify: `convex/schema.ts` — **remove** `tasks.status` and `by_user_status`
- Update every remaining `status:` on **task** inserts in tests (not `projects.status`, not HTTP `status`)
- Delete unused `src/lib/task-status.ts` if fully replaced

**Interfaces:**
- Consumes: Tasks 4–7
- Produces: spec UI

Page chrome:

- Title Backlog; count of **visible** tasks after project filter (board and table share the same filtered set).
- Settings + Add task.
- Project filter (keep archived select).
- Tabs labeled **Board** | **Table** (`TabsTrigger` values `board` / `table`).
- `validateSearch`: unchanged union; **`activeView = view ?? 'board'`**.
- `useEffect`: if `boardColumns.list` is `[]`, call `ensureDefaults`.
- Optimistic `moveOnBoard` still uses `applyMoveToBoard` with `{ taskId, columnId, beforeTaskId }`.
- Table `setStatus` becomes `setColumnId(taskId, columnId: string | null)` → `updateTask({ taskId, columnId })`.
- Header count uses filtered table/board length, including Done.

Board:

- Horizontal scroll. Column well tint from `color` (Backlog: muted, no picker).
- Backlog header not editable, no remove.
- Other headers: click name to rename (Done locked). Menu/trash: same remove confirms as Settings.
- Control **after the last non-Done column** (before Done): add column → `save` with current list plus `{ name: 'New column', color: '#6366f1' }` before Done. If that name collides, use `New column 2`, etc.
- `columnDroppableId`; keyboard sensor stays.
- Card strikethrough: `task.isDone`.
- `onAddTask(columnId: string | null)`.

Table:

- Same tasks as board after project filter, including Done.
- Status select: Backlog + each column name in order.
- Plan / Delete / row-click unchanged.

Schema narrow: remove `status` from `tasks` in `schema.ts` and the `by_user_status` index. Grep `status: "backlog"` / `status: "done"` in `convex/**/*.ts` and drop the field from task inserts. `projects.status` stays.

Grep checklist after narrow (must be zero task-status literals):

```bash
rg -n 'status: "(backlog|investigate|in-progress|review|test|done)"' convex src
```

Allowed leftovers: none on `tasks`. Time-block review `outcome: "done"` stays.

- [ ] **Step 1: Update UI tests that still mention six statuses**

Fix any remaining `src/` tests that import `TASK_STATUSES` or `BOARD_COLUMN_STATUSES`.

- [ ] **Step 2: Implement page + board + table**

`BacklogBoard` droppable id `column:backlog` for `columnId === null`. When resolving dest from `over`:

- `over.id === 'column:backlog'` or a card whose column is Backlog → `destColumnId = null`
- `over.id.startsWith('column:')` → dest id is the suffix
- otherwise dest is the column that contains `over.id`

Keep 8px pointer activation distance (already in sensors) so click still opens edit.

Inline rename: local state, on blur/Enter call `save` with the full column list from `api.boardColumns.list` (map to `{ id, name, color }`, substitute the new name).

- [ ] **Step 3: Make `status` optional already? Then remove it**

If Task 4 left `status` optional, delete the field from the schema object and index. Run the full suite:

Run: `npm test`

Expected: PASS. Fix remaining `insert("tasks", { status: ... })` TypeScript errors by removing `status`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`

Expected: no errors. `Doc<'tasks'>` no longer has `status`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: custom board columns on backlog and drop task status"
```

---

### Task 9: Manual verification notes (implementer)

Not a code task. After Task 8:

1. Run `backfillBoardColumns` once against the agent Convex deployment (`CONVEX_AGENT_MODE=anonymous npx convex run migrations:backfillBoardColumns` or dashboard). Then open `/backlog`.
2. Confirm default view is Board with Backlog | In-Progress | Test | Done.
3. Toggle Table; `?view=table` restores table; both show the same tasks including Done.
4. Drag Backlog → In-Progress and back; `completedAt` only when entering/leaving Done.
5. Settings: rename, recolor, add before Done, reorder, remove empty column, remove column with tasks (both dispositions).
6. Add task from page header → Backlog. Add from In-Progress **+** → that column.
7. Project filter applies to both views. Today / time-block review still treat Done via Done column / `completedAt`.

Convex tests in Tasks 2–5 are the source of truth for move/remove semantics. Manual pass covers dnd-kit and dialogs.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| `boardColumns` table + indexes | 1 |
| Palette + default seed colors | 1 |
| `list` / `ensureDefaults` idempotent | 2 |
| `save` names/colors/order/add-before-Done | 2 |
| `remove` dispositions, Done locked, 2–8 | 2 |
| Auth isolation | 2 |
| Status mapping backfill, no Investigate/Review columns | 3 |
| Users who never visit `/backlog` still get mapping | 3 |
| `create`/`update`/`moveOnBoard` on `columnId` | 4 |
| `completedAt` enter/leave/intra-Done | 4 |
| `isTaskActive` via Done column | 4 |
| Time-block mark done / project toggle / TaskRow | 4 |
| `backlog.get` includes Done + Backlog | 5 |
| `board` synthetic Backlog + empty columns | 5 |
| Forms default Backlog; column preselect | 6 |
| Settings dialog | 7 |
| Board inline rename/add/remove, dnd to Backlog | 8 |
| Tabs Board \| Table, default board | 8 |
| Drop `tasks.status` | 8 |
| Non-goals (WIP, hex, per-project, toasts) | omitted |

No placeholders. `columnId` in later tasks is `Id<"boardColumns"> \| null` on the wire (`null` = Backlog); stored as omitted/undefined on the document.
