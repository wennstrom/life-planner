# Project Page Board and Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/projects/$projectId` a project-scoped Backlog board with editable name/color, Done-column progress, and an explicit **Place on board** banner for unassigned tasks.

**Architecture:** Reuse `BacklogBoard` and `tasks.moveOnBoard`. Extend `api.backlog.board` with optional `projectId` (omit the synthetic Backlog column when set). Add `projects.placeOnBoard`. Count leftover/done with a shared helper keyed off `boardColumns.isDone`, not `completedAt`.

**Tech Stack:** Convex queries/mutations + `convex-test`, Vitest, TanStack Router, existing `@dnd-kit` `BacklogBoard`, shadcn `Progress` / `Button`.

**Spec:** `docs/superpowers/specs/2026-09-03-project-page-board-design.md`

## Global Constraints

- No new tables. No `projects.board` query. Do not fork `BacklogBoard`.
- Columns stay account-wide. Project page does **not** pass `onRename` / `onRemoveColumn` / `onReorderColumns` / `onAddColumn`.
- When `projectId` is set, `backlog.board` omits the synthetic Backlog column and omits unassigned/stale-column tasks from every column.
- When `projectId` is omitted, `backlog.board` behavior is unchanged (synthetic Backlog column, stale ids land there).
- Progress: **Done** = task `columnId` equals the Done column (`isDone`). **Leftover** = every other non-archived project task. Do not use `completedAt`.
- Unassigned = no `columnId` or `columnId` not in the current named column set. Banner + `placeOnBoard` use that rule.
- `placeOnBoard` writes only `columnId` (first named column by `order`). Error `No board columns` if none exist. Error `Project not found` if the project is missing or not owned.
- New tasks from the header **+ Add task** stay uncolumned. Column-header **+** may still pass `defaultColumnId` into `AddTaskModal`.
- `projects.update` rejects `color` that fails `isBoardColumnColor` with `Invalid project color`. Empty trimmed `name` throws `Name is required`.
- Copy: banner `N tasks aren't on the board`; place failure `Could not place tasks on the board.`; name empty `Name is required`.
- Prettier: Convex files keep double quotes + semicolons; `src/` uses single quotes, no semicolons.
- Public Convex functions: `requireUserId` (via existing helpers). Do not use `Date.now()` in queries.
- Do not add Playwright unless a smoke test asserts the old task list (none does).

## File map

| Path | Responsibility |
|------|----------------|
| `src/lib/project-progress.ts` | Leftover/done/percent and unassigned count from tasks + columns |
| `src/lib/project-progress.test.ts` | Progress and unassigned unit tests |
| `convex/backlog.ts` | Optional `projectId` on `board` |
| `convex/backlog.test.ts` | Project-scoped board + regression for `{}` |
| `convex/projects.ts` | `placeOnBoard`; validate name/color on `update` |
| `convex/projects.test.ts` | Place-on-board and update validation |
| `src/components/tasks/BacklogBoard.tsx` | Optional `showProjectBadge` (default true) |
| `src/components/projects/ProjectName.tsx` | Click-to-edit title |
| `src/components/projects/ProjectColorPicker.tsx` | Palette swatches that save immediately |
| `src/routes/_authenticated/projects/$projectId.tsx` | Header, banner, board; drop `TaskRow` list |
| `src/routes/_authenticated/projects/index.tsx` | List-card progress via the shared helper |

Do **not** split this spec into multiple plans: board scoping, place-on-board, and header/progress are one page.

---

### Task 1: Shared progress helper

**Files:**
- Create: `src/lib/project-progress.ts`
- Create: `src/lib/project-progress.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `namedColumnIdSet(columns: Array<{ _id: string }>): Set<string>`
  - `isUnassignedOnBoard(columnId: string | undefined, namedIds: ReadonlySet<string>): boolean`
  - `projectProgress(tasks: Array<{ columnId?: string }>, columns: Array<{ _id: string; isDone: boolean }>): { leftover: number; done: number; total: number; percent: number }`
  - `unassignedTaskCount(tasks: Array<{ columnId?: string }>, namedIds: ReadonlySet<string>): number`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/project-progress.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import {
  isUnassignedOnBoard,
  namedColumnIdSet,
  projectProgress,
  unassignedTaskCount,
} from './project-progress'

const columns = [
  { _id: 'col_ip', isDone: false },
  { _id: 'col_done', isDone: true },
]

describe('projectProgress', () => {
  it('counts Done by isDone column, not by presence of a column', () => {
    const result = projectProgress(
      [
        { columnId: 'col_done' },
        { columnId: 'col_ip' },
        {},
      ],
      columns,
    )
    expect(result).toEqual({ leftover: 2, done: 1, total: 3, percent: 33 })
  })

  it('returns 0 percent when there are no tasks', () => {
    expect(projectProgress([], columns)).toEqual({
      leftover: 0,
      done: 0,
      total: 0,
      percent: 0,
    })
  })

  it('treats a stale columnId as leftover, not done', () => {
    const result = projectProgress([{ columnId: 'col_gone' }], columns)
    expect(result.done).toBe(0)
    expect(result.leftover).toBe(1)
  })
})

describe('unassignedTaskCount', () => {
  it('counts missing and stale column ids', () => {
    const named = namedColumnIdSet(columns)
    expect(isUnassignedOnBoard(undefined, named)).toBe(true)
    expect(isUnassignedOnBoard('col_gone', named)).toBe(true)
    expect(isUnassignedOnBoard('col_ip', named)).toBe(false)
    expect(
      unassignedTaskCount(
        [{}, { columnId: 'col_gone' }, { columnId: 'col_ip' }],
        named,
      ),
    ).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/project-progress.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement the helper**

Create `src/lib/project-progress.ts`:

```typescript
export function namedColumnIdSet(
  columns: Array<{ _id: string }>,
): Set<string> {
  return new Set(columns.map((column) => column._id))
}

export function isUnassignedOnBoard(
  columnId: string | undefined,
  namedIds: ReadonlySet<string>,
): boolean {
  return columnId === undefined || !namedIds.has(columnId)
}

export function unassignedTaskCount(
  tasks: Array<{ columnId?: string }>,
  namedIds: ReadonlySet<string>,
): number {
  return tasks.filter((task) =>
    isUnassignedOnBoard(task.columnId, namedIds),
  ).length
}

export function projectProgress(
  tasks: Array<{ columnId?: string }>,
  columns: Array<{ _id: string; isDone: boolean }>,
): {
  leftover: number
  done: number
  total: number
  percent: number
} {
  const doneId = columns.find((column) => column.isDone)?._id
  let done = 0
  let leftover = 0
  for (const task of tasks) {
    if (
      task.columnId !== undefined &&
      doneId !== undefined &&
      task.columnId === doneId
    ) {
      done += 1
    } else {
      leftover += 1
    }
  }
  const total = leftover + done
  return {
    leftover,
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/project-progress.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/project-progress.ts src/lib/project-progress.test.ts
git commit -m "Add shared project leftover/done progress helper."
```

---

### Task 2: Scope `backlog.board` by project

**Files:**
- Modify: `convex/backlog.ts` (`board` query)
- Modify: `convex/backlog.test.ts`

**Interfaces:**
- Consumes: `listColumnsForUser`, `isTaskArchived`, existing `enrichTask` / `sortTasks`
- Produces: `api.backlog.board` args `{ projectId?: Id<"projects"> }`. Same return shape `{ total, columns }`. When `projectId` is set, `columns` has no `isBacklog` row.

- [ ] **Step 1: Write the failing tests**

Append to `describe("backlog.board")` in `convex/backlog.test.ts`:

```typescript
  it("when projectId is set, returns only that project's named-column tasks", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const cols = await seedColumns(asUser);
    const website = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });
    const other = await asUser.mutation(api.projects.create, {
      name: "Other",
      color: "#3b82f6",
    });
    await insertTask(t, userId, {
      title: "Site doing",
      columnId: cols.inProgress._id,
      order: 0,
      projectId: website,
    });
    await insertTask(t, userId, {
      title: "Other doing",
      columnId: cols.inProgress._id,
      order: 1,
      projectId: other,
    });
    await insertTask(t, userId, {
      title: "Site parked",
      order: 2,
      projectId: website,
    });

    const board = await asUser.query(api.backlog.board, {
      projectId: website,
    });
    expect(board.columns.some((c) => c.isBacklog)).toBe(false);
    expect(board.columns.map((c) => c.name)).toEqual([
      "In-Progress",
      "Test",
      "Done",
    ]);
    expect(
      board.columns.flatMap((c) => c.tasks.map((task) => task.title)),
    ).toEqual(["Site doing"]);
    expect(board.total).toBe(1);
  });

  it("when projectId is set, omits stale columnId tasks from every column", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const cols = await seedColumns(asUser);
    const website = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });
    const staleId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("boardColumns", {
        userId,
        name: "Gone",
        color: "#14b8a6",
        order: 99,
        isDone: false,
      });
      await ctx.db.delete(id);
      return id;
    });
    await insertTask(t, userId, {
      title: "Orphan",
      columnId: staleId,
      order: 0,
      projectId: website,
    });
    await insertTask(t, userId, {
      title: "Doing",
      columnId: cols.inProgress._id,
      order: 1,
      projectId: website,
    });

    const board = await asUser.query(api.backlog.board, {
      projectId: website,
    });
    expect(
      board.columns.flatMap((c) => c.tasks.map((task) => task.title)),
    ).toEqual(["Doing"]);
  });

  it("throws Project not found for another user's projectId", async () => {
    const { t, asUser } = await createAuthedTest();
    const otherProjectId = await t
      .withIdentity({ subject: "user_other" })
      .mutation(api.projects.create, {
        name: "Secret",
        color: "#6366f1",
      });
    await expect(
      asUser.query(api.backlog.board, { projectId: otherProjectId }),
    ).rejects.toThrow("Project not found");
  });
```

Keep existing tests that call `api.backlog.board` with `{}` — they must still pass after the args change.

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npm test -- convex/backlog.test.ts`

Expected: FAIL (unknown `projectId` arg, or new assertions fail)

- [ ] **Step 3: Implement scoped `board`**

In `convex/backlog.ts`, change `board` to:

```typescript
export const board = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.projectId) {
      const project = await ctx.db.get("projects", args.projectId);
      if (!project || project.userId !== userId) {
        throw new Error("Project not found");
      }
    }

    const namedColumns = await listColumnsForUser(ctx, userId);
    const namedIds = new Set(namedColumns.map((column) => column._id));
    const tasks = (
      await ctx.db
        .query("tasks")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    ).filter((task) => {
      if (isTaskArchived(task)) return false;
      if (args.projectId && task.projectId !== args.projectId) return false;
      return true;
    });
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const projectMap = new Map(projects.map((p) => [p._id, p]));
    const statsMap = await buildTaskStatsMap(ctx, userId);
    const doneColumnId = namedColumns.find((column) => column.isDone)?._id;

    const enrich = (task: Doc<"tasks">) =>
      enrichTask(task, projectMap, statsMap, doneColumnId);

    const buckets = new Map<string | null, Array<Doc<"tasks">>>();
    buckets.set(null, []);
    for (const column of namedColumns) {
      buckets.set(column._id, []);
    }
    for (const task of tasks) {
      const key = task.columnId ?? null;
      if (args.projectId) {
        if (key === null || !namedIds.has(key)) continue;
        buckets.get(key)!.push(task);
        continue;
      }
      const bucket = buckets.get(key) ?? buckets.get(null)!;
      bucket.push(task);
    }

    const named = namedColumns.map((column) => ({
      columnId: column._id as Id<"boardColumns"> | null,
      name: column.name,
      color: column.color,
      isDone: column.isDone,
      isBacklog: false,
      tasks: sortTasks(buckets.get(column._id)!).map(enrich),
    }));

    const columns = args.projectId
      ? named
      : [
          {
            columnId: null as Id<"boardColumns"> | null,
            name: "Backlog",
            color: BACKLOG_COLUMN_COLOR,
            isDone: false,
            isBacklog: true,
            tasks: sortTasks(buckets.get(null)!).map(enrich),
          },
          ...named,
        ];

    return {
      total: columns.reduce((sum, column) => sum + column.tasks.length, 0),
      columns,
    };
  },
});
```

Keep the `by_user` task load plus the `args.projectId` filter shown above so the global and scoped paths share one query body.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- convex/backlog.test.ts`

Expected: PASS (old `{}` cases + new `projectId` cases)

- [ ] **Step 5: Commit**

```bash
git add convex/backlog.ts convex/backlog.test.ts
git commit -m "Scope the backlog board query to an optional project."
```

---

### Task 3: `placeOnBoard` and stricter `projects.update`

**Files:**
- Modify: `convex/projects.ts`
- Modify: `convex/projects.test.ts`

**Interfaces:**
- Consumes: `listColumnsForUser` from `convex/lib/boardColumns.ts`, `isBoardColumnColor`, `isTaskArchived`
- Produces: `api.projects.placeOnBoard({ projectId: Id<"projects"> }) => null`; `projects.update` throws `Invalid project color` / `Name is required` as specified

- [ ] **Step 1: Write the failing tests**

Append to `convex/projects.test.ts` (reuse `createAuthedTest`; add the same `insertTask` / `seedColumns` helpers as in `convex/backlog.test.ts` if this file does not already have them):

```typescript
describe("projects.placeOnBoard", () => {
  it("assigns unassigned and stale-column tasks to the first named column", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const cols = await seedColumns(asUser);
    const website = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });
    const other = await asUser.mutation(api.projects.create, {
      name: "Other",
      color: "#3b82f6",
    });
    const parked = await insertTask(t, userId, {
      title: "Parked",
      order: 0,
      projectId: website,
    });
    const staleId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("boardColumns", {
        userId,
        name: "Gone",
        color: "#14b8a6",
        order: 99,
        isDone: false,
      });
      await ctx.db.delete(id);
      return id;
    });
    const orphan = await insertTask(t, userId, {
      title: "Orphan",
      columnId: staleId,
      order: 1,
      projectId: website,
    });
    const already = await insertTask(t, userId, {
      title: "Doing",
      columnId: cols.test._id,
      order: 2,
      projectId: website,
    });
    const otherParked = await insertTask(t, userId, {
      title: "Else",
      order: 3,
      projectId: other,
    });

    await asUser.mutation(api.projects.placeOnBoard, { projectId: website });

    expect((await t.run(async (ctx) => ctx.db.get(parked)))?.columnId).toBe(
      cols.inProgress._id,
    );
    expect((await t.run(async (ctx) => ctx.db.get(orphan)))?.columnId).toBe(
      cols.inProgress._id,
    );
    expect((await t.run(async (ctx) => ctx.db.get(already)))?.columnId).toBe(
      cols.test._id,
    );
    expect(
      (await t.run(async (ctx) => ctx.db.get(otherParked)))?.columnId,
    ).toBeUndefined();
  });

  it("is a no-op when every task already has a named column", async () => {
    const { t, asUser, userId } = await createAuthedTest();
    const cols = await seedColumns(asUser);
    const website = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });
    const taskId = await insertTask(t, userId, {
      title: "Doing",
      columnId: cols.test._id,
      order: 0,
      projectId: website,
    });
    await asUser.mutation(api.projects.placeOnBoard, { projectId: website });
    expect((await t.run(async (ctx) => ctx.db.get(taskId)))?.columnId).toBe(
      cols.test._id,
    );
  });

  it("throws No board columns when the user has none", async () => {
    const { asUser } = await createAuthedTest();
    const website = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });
    await expect(
      asUser.mutation(api.projects.placeOnBoard, { projectId: website }),
    ).rejects.toThrow("No board columns");
  });
});

describe("projects.update validation", () => {
  it("rejects an invalid color", async () => {
    const { asUser } = await createAuthedTest();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });
    await expect(
      asUser.mutation(api.projects.update, {
        projectId,
        color: "#ffffff",
      }),
    ).rejects.toThrow("Invalid project color");
  });

  it("rejects an empty name", async () => {
    const { asUser } = await createAuthedTest();
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
    });
    await expect(
      asUser.mutation(api.projects.update, {
        projectId,
        name: "   ",
      }),
    ).rejects.toThrow("Name is required");
  });
});
```

Copy `insertTask` and `seedColumns` from `convex/backlog.test.ts` into this file (same implementations). Do not import them from the backlog test file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- convex/projects.test.ts`

Expected: FAIL (`placeOnBoard` missing; color/name not rejected)

- [ ] **Step 3: Implement mutation and update checks**

In `convex/projects.ts`:

1. Import `listColumnsForUser` from `./lib/boardColumns`.
2. In `update`, when `color !== undefined`, throw `Invalid project color` unless `isBoardColumnColor(color)`. When `name !== undefined`, trim; if empty throw `Name is required`; otherwise `patch.name = trimmed`.
3. Add:

```typescript
export const placeOnBoard = mutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const project = await ctx.db.get("projects", args.projectId);
    if (!project || project.userId !== userId) {
      throw new Error("Project not found");
    }

    const namedColumns = await listColumnsForUser(ctx, userId);
    const first = namedColumns[0];
    if (!first) {
      throw new Error("No board columns");
    }
    const namedIds = new Set(namedColumns.map((column) => column._id));

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const task of tasks) {
      if (isTaskArchived(task)) continue;
      if (task.userId !== userId) continue;
      const columnId = task.columnId;
      const unassigned =
        columnId === undefined || !namedIds.has(columnId);
      if (!unassigned) continue;
      await ctx.db.patch("tasks", task._id, { columnId: first._id });
    }

    return null;
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- convex/projects.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/projects.ts convex/projects.test.ts
git commit -m "Place unassigned project tasks on the first board column."
```

---

### Task 4: Hide project badge on `BacklogBoard`

**Files:**
- Modify: `src/components/tasks/BacklogBoard.tsx`

**Interfaces:**
- Consumes: existing `BacklogBoard` props
- Produces: `showProjectBadge?: boolean` default `true`. When `false`, `TaskCardBody` does not render the project `Badge`. Backlog page omits the prop.

- [ ] **Step 1: Thread `showProjectBadge` through card UI**

Change `TaskCardBody` to:

```typescript
function TaskCardBody({
  task,
  showProjectBadge = true,
}: {
  task: BacklogTask
  showProjectBadge?: boolean
}) {
```

Wrap the project `Badge` with `showProjectBadge && task.project ? ( ... ) : null`.

Pass `showProjectBadge` into every `TaskCardBody` (`SortableTaskCard`, `ColumnDragPreview`, `DragOverlay`).

Add `showProjectBadge?: boolean` to `BacklogBoard` props (default `true`) and to `BoardColumn` / `SortableBoardColumn` so cards receive it.

Do not change Backlog’s `<BacklogBoard>` call.

There is no existing component test file for `BacklogBoard`. Do not add a Playwright spec. Verify by typecheck in the next step.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

Expected: PASS (or only pre-existing errors unrelated to this prop)

- [ ] **Step 3: Commit**

```bash
git add src/components/tasks/BacklogBoard.tsx
git commit -m "Allow hiding the project badge on board cards."
```

---

### Task 5: Project detail board and Place on board banner

**Files:**
- Modify: `src/routes/_authenticated/projects/$projectId.tsx`

**Interfaces:**
- Consumes: `api.backlog.board` `{ projectId }`, `api.projects.placeOnBoard`, `applyMoveToBoard` from `~/lib/backlog-board`, `unassignedTaskCount` / `namedColumnIdSet` from `~/lib/project-progress`, `BacklogBoard` with `showProjectBadge={false}`
- Produces: project page renders the board instead of `TaskRow`; banner when unassigned count > 0

- [ ] **Step 1: Replace the task list with the scoped board**

In `$projectId.tsx`:

- Keep `projects.get` for the header/banner task list.
- `useSuspenseQuery(convexQuery(api.backlog.board, { projectId: projectIdTyped }))`.
- Keep `boardColumns.list` + `ensureDefaults` when empty.
- `useMutation(api.tasks.moveOnBoard).withOptimisticUpdate` reading/writing `api.backlog.board` with `{ projectId: projectIdTyped }` and `applyMoveToBoard` (same pattern as `src/routes/_authenticated/backlog.tsx`, different query args).
- `useMutation(api.projects.placeOnBoard)`.
- Remove `TaskRow` and the “Tasks” `<ul>`.
- State: `addOpen`, `addColumnId` (`Id<'boardColumns'> | null | undefined`), `editingTask`, `deleteOpen`, `placeError: string | null`.
- Banner (above the board, only if `unassignedTaskCount(data.tasks, namedColumnIdSet(columns ?? [])) > 0` and `columns` is loaded):

```tsx
<div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
  <p>{unassigned} tasks aren't on the board</p>
  <Button
    type="button"
    variant="outline"
    onClick={() => {
      setPlaceError(null)
      void placeOnBoard({ projectId: projectIdTyped }).catch(() => {
        setPlaceError('Could not place tasks on the board.')
      })
    }}
  >
    Place on board
  </Button>
  {placeError ? (
    <p className="w-full text-sm text-destructive">{placeError}</p>
  ) : null}
</div>
```

Banner text is exactly `${unassigned} tasks aren't on the board` (including when N is 1).

- Render:

```tsx
<BacklogBoard
  board={boardData}
  filter="all"
  showProjectBadge={false}
  onMove={(args) => moveOnBoard(args)}
  onAddTask={(columnId) => {
    setAddColumnId(columnId)
    setAddOpen(true)
  }}
  actions={{ openDetails: setEditingTask }}
/>
```

Do **not** call `mergeBoardCatalog` here — that helper injects a Backlog column.

- Header **+ Add task** sets `addColumnId` to `null` (or `undefined`) then opens the modal so create stays uncolumned.
- `AddTaskModal`: `defaultProjectId={projectIdTyped}` `lockProject` `defaultColumnId={addColumnId}` `onClose` clears column id.
- Empty board: still render `BacklogBoard` (empty droppable named columns). No banner when unassigned is 0.

If `boardData` columns use `columnId: Id | null` and `BacklogBoard` expects `NamedBoardColumn`, pass `boardData` through as-is; the query already includes `name` and `color`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

Expected: PASS for the touched files

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated/projects/\$projectId.tsx
git commit -m "Show a project-scoped board on the project detail page."
```

---

### Task 6: Header identity and list-card progress

**Files:**
- Create: `src/components/projects/ProjectName.tsx`
- Create: `src/components/projects/ProjectColorPicker.tsx`
- Modify: `src/routes/_authenticated/projects/$projectId.tsx`
- Modify: `src/routes/_authenticated/projects/index.tsx`

**Interfaces:**
- Consumes: `api.projects.update`, `BOARD_COLUMN_COLORS`, `projectProgress`, `ProjectDescription`
- Produces: click-to-edit name; immediate color save; list and detail progress both use `projectProgress`

- [ ] **Step 1: Add `ProjectName`**

Mirror `ProjectDescription` (`src/components/projects/ProjectDescription.tsx`) but:

- Display the committed name in an `<h1 className="text-2xl font-bold">` click target (button wrapping or replacing the current h1).
- Edit with `Input` `autoFocus`. Escape cancels. Blur and Enter save.
- If `draft.trim() === ''`, stay in edit, set error `Name is required`, do not call the mutation.
- Save: `updateProject({ projectId, name: trimmed })`. Failure message `Could not save name.`

- [ ] **Step 2: Add `ProjectColorPicker`**

```typescript
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { BOARD_COLUMN_COLORS } from '../../../convex/lib/boardColumnColors'
import type { Id } from '../../../convex/_generated/dataModel'
import { cn } from '~/lib/utils'

export function ProjectColorPicker({
  projectId,
  color,
}: {
  projectId: Id<'projects'>
  color: string
}) {
  const updateProject = useMutation(api.projects.update)
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {BOARD_COLUMN_COLORS.map((swatch) => {
        const selected = color === swatch
        return (
          <button
            key={swatch}
            type="button"
            aria-label={swatch}
            aria-pressed={selected}
            className={cn(
              'size-7 rounded-full border border-border/60',
              selected &&
                'ring-2 ring-ring ring-offset-2 ring-offset-background',
            )}
            style={{ background: swatch }}
            onClick={() => void updateProject({ projectId, color: swatch })}
          />
        )
      })}
    </div>
  )
}
```

Same swatch classes as `AddProjectModal`.

- [ ] **Step 3: Wire the project header**

Under the back link, replace the static `<h1>` with `ProjectName`. Put `ProjectColorPicker` next to the title row (or directly under the title, above description). Keep archive, delete, **+ Add task**.

Compute progress:

```typescript
const progress = projectProgress(data.tasks, columns ?? [])
```

Show leftover/done text and `<Progress value={progress.percent} className="h-1.5" />` in the header (same numbers as the list cards). Call `projectProgress` only when `columns` is an array; while it is `undefined`, do not render the counts or bar.

- [ ] **Step 4: Fix list-card progress**

In `src/routes/_authenticated/projects/index.tsx`:

- `useQuery(api.boardColumns.list)` (in addition to existing suspense queries).
- For each project, `projectTasks` as today, then:

```typescript
const { leftover, done, percent } = projectProgress(
  projectTasks,
  columns ?? [],
)
```

`tasks.list` already defaults to non-archived. Display `{projectTasks.length} tasks` · `{done} done`. `<Progress value={percent} />`. Stop using `completedAt`.

- [ ] **Step 5: Typecheck and unit tests**

Run:

```bash
npm test -- src/lib/project-progress.test.ts convex/backlog.test.ts convex/projects.test.ts
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/projects/ProjectName.tsx src/components/projects/ProjectColorPicker.tsx src/routes/_authenticated/projects/\$projectId.tsx src/routes/_authenticated/projects/index.tsx
git commit -m "Add project name, color, and Done-column progress on project pages."
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Optional `projectId` on `backlog.board`; omit synthetic Backlog; omit unassigned/stale | 2 |
| Foreign project → `Project not found` | 2 |
| Unchanged `{}` board | 2 |
| `placeOnBoard` first named column; no-op; no columns error; other projects untouched | 3 |
| `update` color + empty name | 3 |
| Shared leftover/done helper; not `completedAt` | 1, 6 |
| List cards same progress rule | 6 |
| Drop `TaskRow`; reuse `BacklogBoard`; hide badge; no column settings | 4, 5 |
| Banner + Place on board; header add stays uncolumned | 5 |
| Optimistic move keyed by `{ projectId }` | 5 |
| Click-to-edit name; palette color | 6 |
| `ensureDefaults` | 5 (keep existing effect) |
