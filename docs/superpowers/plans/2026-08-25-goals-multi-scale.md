# Goals (multi-scale) + Calendar aside Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `goals` table and API for year → quarter → week planning, a `/goals` page for year/quarter management, and replace the Calendar Unscheduled aside with a living goals dashboard for the visible week.

**Architecture:** One Convex `goals` table with `horizon` + optional `parentId`. Shared validators and period helpers live next to the API. Calendar keeps the week grid; week nav + color legend move top-left; `GoalsAside` loads `listForCalendarWeek` for the displayed `weekStart`. Goals page uses `listForGoalsPage` for year/quarter CRUD and a read-only current-week peek.

**Tech Stack:** Convex (`convex-test` + Vitest), React 19, TanStack Router file routes, `@convex-dev/react-query` + `useSuspenseQuery`, existing shadcn UI (`Button`, `Input`, `Checkbox`, `Select`), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-08-25-goals-multi-scale-design.md`

## Global Constraints

- One `goals` table; no links from `timeBlocks` / `tasks` to goals in v1.
- Auth: every goals function calls `requireUserId`; ownership checks on every get/patch/remove.
- Queries must use indexes (`by_user`, `by_user_horizon_year`, `by_user_week`, `by_parent`) — no full-table scans.
- At most one **active** year goal per calendar `year`; second create **rejects** (do not auto-archive).
- Archive does **not** cascade-archive children; it **clears `parentId`** on children in the same mutation.
- No hard delete in v1 (`archive` only).
- Unscheduled aside removed from Calendar; no replacement task-drag rail on Calendar.
- Aside width ~240–280px; stack below grid on small screens (`max-md:flex-col` stays).
- Error copy for failed saves: `Could not save goal` (or mutation message for second year theme when surfaced).
- No React Testing Library / jsdom. Backend: `convex-test`. UI: manual checklist.
- Do not add npm packages.
- Commit only when the user asked to commit. If they have not, skip every Commit step.
- Before Convex edits, skim `convex/_generated/ai/guidelines.md` for current API rules.

## File structure

| File | Responsibility |
|---|---|
| `convex/schema.ts` | Add `goals` table + indexes |
| `convex/lib/dates.ts` | `calendarQuarter`, `yearFromDateKey` (and reuse `formatDateKey` / `startOfWeekMonday`) |
| `src/lib/dates.ts` | Same `calendarQuarter` / `yearFromDateKey` for UI |
| `convex/goals.ts` | Validators, hierarchy helpers, `listForGoalsPage`, `listForCalendarWeek`, `create`, `update`, `archive` |
| `convex/goals.test.ts` | Authz + hierarchy + list + archive parent clearing |
| `src/routes/_authenticated/goals.tsx` | Goals page (year + quarters + week peek + archived) |
| `src/components/goals/GoalRow.tsx` | Title row: edit, done, archive; optional parent/project label |
| `src/components/goals/GoalComposer.tsx` | Inline create (title + optional parent/project) |
| `src/components/goals/WeeklyFocusEditor.tsx` | Editable checklist for week goals |
| `src/components/goals/GoalsAside.tsx` | Calendar aside: year / weekly focus / quarters / Open Goals |
| `src/components/layout/AppShell.tsx` | Nav item `/goals` |
| `src/components/calendar/WeekView.tsx` | Remove Unscheduled; week nav + legend top-left; host `GoalsAside` |
| `src/routes/_authenticated/calendar.tsx` | Drop unscheduled task wiring; pass `weekStart` into WeekView/aside |

Out of scope (spec §10): task/block↔goal links, auto-carry week items, AI, collaborative goals, full aside editing of year/quarter.

---

### Task 1: Schema + period helpers

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/lib/dates.ts`
- Modify: `src/lib/dates.ts`
- Create: `src/lib/dates.test.ts` (or append if a client dates test already exists — prefer create)

**Interfaces:**
- Consumes: existing `formatDateKey`, `startOfWeekMonday`
- Produces:
  - Schema table `goals` as below
  - `calendarQuarter(date: Date): 1 \| 2 \| 3 \| 4`
  - `yearFromDateKey(dateKey: string): number`
  - `calendarQuarterFromDateKey(dateKey: string): 1 \| 2 \| 3 \| 4`

- [ ] **Step 1: Write failing client helper tests**

Create `src/lib/dates.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  calendarQuarter,
  calendarQuarterFromDateKey,
  yearFromDateKey,
} from './dates'

describe('calendarQuarter', () => {
  it('maps months to Q1–Q4', () => {
    expect(calendarQuarter(new Date(2026, 0, 15))).toBe(1)
    expect(calendarQuarter(new Date(2026, 3, 1))).toBe(2)
    expect(calendarQuarter(new Date(2026, 6, 1))).toBe(3)
    expect(calendarQuarter(new Date(2026, 11, 31))).toBe(4)
  })
})

describe('yearFromDateKey / calendarQuarterFromDateKey', () => {
  it('parses YYYY-MM-DD', () => {
    expect(yearFromDateKey('2026-08-24')).toBe(2026)
    expect(calendarQuarterFromDateKey('2026-08-24')).toBe(3)
    expect(calendarQuarterFromDateKey('2026-01-05')).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dates.test.ts`

Expected: FAIL — exports missing.

- [ ] **Step 3: Implement helpers on client and Convex**

Append to `src/lib/dates.ts`:

```ts
export function calendarQuarter(date: Date): 1 | 2 | 3 | 4 {
  return (Math.floor(date.getMonth() / 3) + 1) as 1 | 2 | 3 | 4
}

export function yearFromDateKey(dateKey: string): number {
  return Number(dateKey.slice(0, 4))
}

export function calendarQuarterFromDateKey(dateKey: string): 1 | 2 | 3 | 4 {
  const month = Number(dateKey.slice(5, 7))
  return (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4
}
```

Append the same three functions to `convex/lib/dates.ts` (Convex uses semicolons / double quotes to match that file).

- [ ] **Step 4: Add `goals` table to schema**

In `convex/schema.ts`, after `dayRecords` (before the closing `});` of `defineSchema`), add:

```ts
  goals: defineTable({
    userId: v.id("users"),
    title: v.string(),
    horizon: v.union(
      v.literal("year"),
      v.literal("quarter"),
      v.literal("week"),
    ),
    status: v.union(
      v.literal("active"),
      v.literal("done"),
      v.literal("archived"),
    ),
    parentId: v.optional(v.id("goals")),
    projectId: v.optional(v.id("projects")),
    year: v.number(),
    quarter: v.optional(
      v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4)),
    ),
    weekStart: v.optional(v.string()),
    order: v.number(),
    notes: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_horizon_year", ["userId", "horizon", "year"])
    .index("by_user_week", ["userId", "weekStart"])
    .index("by_parent", ["parentId"]),
```

- [ ] **Step 5: Run helper tests**

Run: `npx vitest run src/lib/dates.test.ts`

Expected: PASS

- [ ] **Step 6: Commit** (only if the user asked)

```bash
git add convex/schema.ts convex/lib/dates.ts src/lib/dates.ts src/lib/dates.test.ts
git commit -m "$(cat <<'EOF'
feat: add goals schema and calendar quarter helpers

EOF
)"
```

---

### Task 2: `goals.create` + hierarchy validation

**Files:**
- Create: `convex/goals.ts`
- Create: `convex/goals.test.ts`

**Interfaces:**
- Consumes: `requireUserId`, date helpers, schema `goals`
- Produces:
  - Shared validators: `horizonValidator`, `statusValidator`, `quarterValidator`
  - `create` mutation returning `Id<"goals">`
  - Args: `{ title, horizon, year, quarter?, weekStart?, parentId?, projectId?, notes? }`
  - Throws: `"Title is required"`, `"Quarter is required for quarter goals"`, `"weekStart is required for week goals"`, `"Year goals cannot have a parent"`, `"Parent goal not found"`, `"Invalid parent horizon"`, `"Parent year mismatch"`, `"An active year theme already exists for this year. Archive or complete it first."`, `"Project not found"`

- [ ] **Step 1: Write failing create tests**

Create `convex/goals.test.ts`:

```ts
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";
import { formatDateKey, startOfWeekMonday } from "./lib/dates";

async function createAuthedTest() {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", { email: "test@example.com", name: "Test User" }),
  );
  const asUser = t.withIdentity({ subject: userId });
  return { t, asUser, userId };
}

describe("goals.create", () => {
  it("creates year, quarter, and week with valid parents", async () => {
    const { asUser } = await createAuthedTest();
    const weekStart = formatDateKey(startOfWeekMonday(new Date(2026, 7, 25)));

    const yearId = await asUser.mutation(api.goals.create, {
      title: "Deep work year",
      horizon: "year",
      year: 2026,
    });
    const quarterId = await asUser.mutation(api.goals.create, {
      title: "Ship planner",
      horizon: "quarter",
      year: 2026,
      quarter: 3,
      parentId: yearId,
    });
    const weekId = await asUser.mutation(api.goals.create, {
      title: "Finish goals API",
      horizon: "week",
      year: 2026,
      weekStart,
      parentId: quarterId,
    });

    expect(yearId).toBeTruthy();
    expect(quarterId).toBeTruthy();
    expect(weekId).toBeTruthy();
  });

  it("rejects a second active year for the same year", async () => {
    const { asUser } = await createAuthedTest();
    await asUser.mutation(api.goals.create, {
      title: "Theme A",
      horizon: "year",
      year: 2026,
    });
    await expect(
      asUser.mutation(api.goals.create, {
        title: "Theme B",
        horizon: "year",
        year: 2026,
      }),
    ).rejects.toThrow(/active year theme already exists/i);
  });

  it("rejects invalid parent chains", async () => {
    const { asUser } = await createAuthedTest();
    const yearId = await asUser.mutation(api.goals.create, {
      title: "Theme",
      horizon: "year",
      year: 2026,
    });
    await expect(
      asUser.mutation(api.goals.create, {
        title: "Bad week",
        horizon: "week",
        year: 2026,
        weekStart: "2026-08-24",
        parentId: yearId,
      }),
    ).rejects.toThrow(/Invalid parent horizon/i);
  });

  it("rejects another user's projectId", async () => {
    const { t, asUser } = await createAuthedTest();
    const otherUserId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "other@example.com", name: "Other" }),
    );
    const foreignProjectId = await t.run(async (ctx) =>
      ctx.db.insert("projects", {
        userId: otherUserId,
        name: "Foreign",
        color: "#64748b",
        status: "active",
        order: 0,
      }),
    );
    await expect(
      asUser.mutation(api.goals.create, {
        title: "Linked",
        horizon: "year",
        year: 2026,
        projectId: foreignProjectId,
      }),
    ).rejects.toThrow("Project not found");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex/goals.test.ts`

Expected: FAIL — `api.goals` missing.

- [ ] **Step 3: Implement `convex/goals.ts` create + helpers**

Create `convex/goals.ts` with validators, `assertOwnedGoal`, `assertParentValid`, `assertProjectOwned`, `nextOrder`, and `create`:

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import {
  calendarQuarterFromDateKey,
  yearFromDateKey,
} from "./lib/dates";

export const horizonValidator = v.union(
  v.literal("year"),
  v.literal("quarter"),
  v.literal("week"),
);
export const statusValidator = v.union(
  v.literal("active"),
  v.literal("done"),
  v.literal("archived"),
);
export const quarterValidator = v.union(
  v.literal(1),
  v.literal(2),
  v.literal(3),
  v.literal(4),
);

type DbCtx = MutationCtx | QueryCtx;

async function assertOwnedGoal(
  ctx: DbCtx,
  userId: Id<"users">,
  goalId: Id<"goals">,
) {
  const goal = await ctx.db.get("goals", goalId);
  if (!goal || goal.userId !== userId) {
    throw new Error("Goal not found");
  }
  return goal;
}

async function assertProjectOwned(
  ctx: DbCtx,
  userId: Id<"users">,
  projectId: Id<"projects"> | undefined,
) {
  if (!projectId) return;
  const project = await ctx.db.get("projects", projectId);
  if (!project || project.userId !== userId) {
    throw new Error("Project not found");
  }
}

async function assertParentValid(
  ctx: DbCtx,
  userId: Id<"users">,
  horizon: "year" | "quarter" | "week",
  year: number,
  parentId: Id<"goals"> | undefined,
) {
  if (!parentId) {
    if (horizon === "year") return;
    return;
  }
  if (horizon === "year") {
    throw new Error("Year goals cannot have a parent");
  }
  const parent = await assertOwnedGoal(ctx, userId, parentId);
  if (horizon === "quarter") {
    if (parent.horizon !== "year") {
      throw new Error("Invalid parent horizon");
    }
    if (parent.year !== year) {
      throw new Error("Parent year mismatch");
    }
  }
  if (horizon === "week") {
    if (parent.horizon !== "quarter") {
      throw new Error("Invalid parent horizon");
    }
  }
}

async function nextOrder(
  ctx: MutationCtx,
  userId: Id<"users">,
  horizon: "year" | "quarter" | "week",
  year: number,
  weekStart: string | undefined,
) {
  if (horizon === "week" && weekStart) {
    const siblings = await ctx.db
      .query("goals")
      .withIndex("by_user_week", (q) =>
        q.eq("userId", userId).eq("weekStart", weekStart),
      )
      .collect();
    return siblings.length;
  }
  const siblings = await ctx.db
    .query("goals")
    .withIndex("by_user_horizon_year", (q) =>
      q.eq("userId", userId).eq("horizon", horizon).eq("year", year),
    )
    .collect();
  return siblings.length;
}

export const create = mutation({
  args: {
    title: v.string(),
    horizon: horizonValidator,
    year: v.number(),
    quarter: v.optional(quarterValidator),
    weekStart: v.optional(v.string()),
    parentId: v.optional(v.id("goals")),
    projectId: v.optional(v.id("projects")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const title = args.title.trim();
    if (!title) throw new Error("Title is required");

    let year = args.year;
    let quarter = args.quarter;
    let weekStart = args.weekStart;

    if (args.horizon === "quarter" && quarter === undefined) {
      throw new Error("Quarter is required for quarter goals");
    }
    if (args.horizon === "week") {
      if (!weekStart) throw new Error("weekStart is required for week goals");
      year = yearFromDateKey(weekStart);
      // store year for indexing; quarter not required on week
    }
    if (args.horizon === "year") {
      quarter = undefined;
      weekStart = undefined;
    }
    if (args.horizon === "quarter") {
      weekStart = undefined;
    }

    await assertParentValid(ctx, userId, args.horizon, year, args.parentId);
    await assertProjectOwned(ctx, userId, args.projectId);

    if (args.horizon === "year") {
      const existing = await ctx.db
        .query("goals")
        .withIndex("by_user_horizon_year", (q) =>
          q.eq("userId", userId).eq("horizon", "year").eq("year", year),
        )
        .collect();
      if (existing.some((g) => g.status === "active")) {
        throw new Error(
          "An active year theme already exists for this year. Archive or complete it first.",
        );
      }
    }

    const now = Date.now();
    const order = await nextOrder(ctx, userId, args.horizon, year, weekStart);

    return await ctx.db.insert("goals", {
      userId,
      title,
      horizon: args.horizon,
      status: "active",
      parentId: args.parentId,
      projectId: args.projectId,
      year,
      quarter,
      weekStart,
      order,
      notes: args.notes,
      updatedAt: now,
    });
  },
});
```

(Leave `query` import for Task 4; or omit until then if lint complains — add stub queries in Task 4.)

- [ ] **Step 4: Run create tests**

Run: `npx vitest run convex/goals.test.ts`

Expected: PASS for the four create cases.

- [ ] **Step 5: Commit** (only if the user asked)

```bash
git add convex/goals.ts convex/goals.test.ts
git commit -m "$(cat <<'EOF'
feat: add goals.create with hierarchy validation

EOF
)"
```

---

### Task 3: `goals.update` + `goals.archive`

**Files:**
- Modify: `convex/goals.ts`
- Modify: `convex/goals.test.ts`

**Interfaces:**
- Consumes: helpers from Task 2
- Produces:
  - `update({ goalId, title?, status?, parentId?, projectId?, notes?, order? })` — re-validates parent/project; trim title if set
  - `archive({ goalId })` — sets `status: "archived"`, clears children `parentId` via `by_parent`
  - To clear optional fields from the client, pass `parentId: null` / `projectId: null` and map to `undefined` in the patch (Convex docs: omit or undefined removes optional fields)

- [ ] **Step 1: Write failing update/archive tests**

Append to `convex/goals.test.ts`:

```ts
describe("goals.update", () => {
  it("rejects updating another user's goal", async () => {
    const { t, asUser } = await createAuthedTest();
    const otherUserId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "other@example.com", name: "Other" }),
    );
    const foreignId = await t.run(async (ctx) =>
      ctx.db.insert("goals", {
        userId: otherUserId,
        title: "Foreign",
        horizon: "year",
        status: "active",
        year: 2026,
        order: 0,
        updatedAt: Date.now(),
      }),
    );
    await expect(
      asUser.mutation(api.goals.update, {
        goalId: foreignId,
        title: "Hacked",
      }),
    ).rejects.toThrow("Goal not found");
  });

  it("toggles week goal to done", async () => {
    const { asUser, t } = await createAuthedTest();
    const weekStart = "2026-08-24";
    const goalId = await asUser.mutation(api.goals.create, {
      title: "Focus",
      horizon: "week",
      year: 2026,
      weekStart,
    });
    await asUser.mutation(api.goals.update, {
      goalId,
      status: "done",
    });
    const goal = await t.run(async (ctx) => ctx.db.get(goalId));
    expect(goal?.status).toBe("done");
  });
});

describe("goals.archive", () => {
  it("archives parent and clears children parentId", async () => {
    const { asUser, t } = await createAuthedTest();
    const yearId = await asUser.mutation(api.goals.create, {
      title: "Theme",
      horizon: "year",
      year: 2026,
    });
    const quarterId = await asUser.mutation(api.goals.create, {
      title: "Q3",
      horizon: "quarter",
      year: 2026,
      quarter: 3,
      parentId: yearId,
    });
    await asUser.mutation(api.goals.archive, { goalId: yearId });
    const year = await t.run(async (ctx) => ctx.db.get(yearId));
    const quarter = await t.run(async (ctx) => ctx.db.get(quarterId));
    expect(year?.status).toBe("archived");
    expect(quarter?.parentId).toBeUndefined();
    expect(quarter?.status).toBe("active");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex/goals.test.ts`

Expected: FAIL — `update` / `archive` missing.

- [ ] **Step 3: Implement `update` and `archive`**

Append to `convex/goals.ts`:

```ts
export const update = mutation({
  args: {
    goalId: v.id("goals"),
    title: v.optional(v.string()),
    status: v.optional(statusValidator),
    parentId: v.optional(v.union(v.id("goals"), v.null())),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const goal = await assertOwnedGoal(ctx, userId, args.goalId);

    const patch: {
      title?: string;
      status?: "active" | "done" | "archived";
      parentId?: Id<"goals">;
      projectId?: Id<"projects">;
      notes?: string;
      order?: number;
      updatedAt: number;
    } = { updatedAt: Date.now() };

    if (args.title !== undefined) {
      const title = args.title.trim();
      if (!title) throw new Error("Title is required");
      patch.title = title;
    }
    if (args.status !== undefined) patch.status = args.status;
    if (args.order !== undefined) patch.order = args.order;

    if (args.parentId !== undefined) {
      const nextParent =
        args.parentId === null ? undefined : args.parentId;
      await assertParentValid(
        ctx,
        userId,
        goal.horizon,
        goal.year,
        nextParent,
      );
      // Convex clears optional fields when patched to undefined
      (patch as { parentId?: Id<"goals"> }).parentId = nextParent;
    }
    if (args.projectId !== undefined) {
      const nextProject =
        args.projectId === null ? undefined : args.projectId;
      await assertProjectOwned(ctx, userId, nextProject);
      (patch as { projectId?: Id<"projects"> }).projectId = nextProject;
    }
    if (args.notes !== undefined) {
      (patch as { notes?: string }).notes =
        args.notes === null ? undefined : args.notes;
    }

    // If activating a year goal, enforce one-active-year
    if (
      goal.horizon === "year" &&
      (args.status === "active" ||
        (args.status === undefined && goal.status === "active"))
    ) {
      const statusWillBe = args.status ?? goal.status;
      if (statusWillBe === "active") {
        const existing = await ctx.db
          .query("goals")
          .withIndex("by_user_horizon_year", (q) =>
            q
              .eq("userId", userId)
              .eq("horizon", "year")
              .eq("year", goal.year),
          )
          .collect();
        if (
          existing.some((g) => g.status === "active" && g._id !== goal._id)
        ) {
          throw new Error(
            "An active year theme already exists for this year. Archive or complete it first.",
          );
        }
      }
    }

    await ctx.db.patch("goals", args.goalId, patch);
  },
});

export const archive = mutation({
  args: { goalId: v.id("goals") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertOwnedGoal(ctx, userId, args.goalId);

    await ctx.db.patch("goals", args.goalId, {
      status: "archived",
      updatedAt: Date.now(),
    });

    const children = await ctx.db
      .query("goals")
      .withIndex("by_parent", (q) => q.eq("parentId", args.goalId))
      .collect();
    for (const child of children) {
      await ctx.db.patch("goals", child._id, {
        parentId: undefined,
        updatedAt: Date.now(),
      });
    }
  },
});
```

Note: If `ctx.db.patch` typing rejects explicit `undefined` for clears, use the Convex pattern this repo already uses for optional clears (see `projects.remove` unlinking `projectId: undefined` on tasks). Match that.

- [ ] **Step 4: Run tests**

Run: `npx vitest run convex/goals.test.ts`

Expected: PASS

- [ ] **Step 5: Commit** (only if the user asked)

```bash
git add convex/goals.ts convex/goals.test.ts
git commit -m "$(cat <<'EOF'
feat: add goals.update and archive with parent unlink

EOF
)"
```

---

### Task 4: List queries for Goals page + Calendar

**Files:**
- Modify: `convex/goals.ts`
- Modify: `convex/goals.test.ts`

**Interfaces:**
- Produces:
  - `listForCalendarWeek({ weekStart: string })` → `{ yearGoal, quarterGoals, weekGoals }`
    - `yearGoal`: active year goal for `yearFromDateKey(weekStart)`, or `null`
    - `quarterGoals`: active quarters for that year + `calendarQuarterFromDateKey(weekStart)`, sorted by `order`
    - `weekGoals`: goals for `weekStart` with status `active` or `done` (not archived), sorted by `order`
  - `listForGoalsPage({ year: number })` → `{ yearGoals, quarterGoals, weekPeek, weekStart }`
    - `yearGoals`: year-horizon for `year` with status `active` or `done` (page shows archived separately — include `archived` in a separate field `archivedGoals` OR return all non-week for year and let UI filter; prefer return shape below)
    - Prefer explicit shape:

```ts
{
  year: number;
  weekStart: string; // current week's Monday
  yearTheme: Doc<"goals"> | null; // active year
  yearDoneOrArchived: Doc<"goals">[]; // done+archived year rows for this year
  quarters: Doc<"goals">[]; // active+done quarters for year
  archivedQuarters: Doc<"goals">[];
  weekPeek: Doc<"goals">[]; // current week active+done
}
```

  - Unauthenticated callers throw via `requireUserId`
  - Other user’s data never returned (index scoped by `userId`)

- [ ] **Step 1: Write failing list tests**

```ts
describe("goals.listForCalendarWeek", () => {
  it("returns year, quarters, and week slices for weekStart", async () => {
    const { asUser } = await createAuthedTest();
    const weekStart = "2026-08-24"; // Monday in Q3 2026
    await asUser.mutation(api.goals.create, {
      title: "Theme",
      horizon: "year",
      year: 2026,
    });
    await asUser.mutation(api.goals.create, {
      title: "Q3 goal",
      horizon: "quarter",
      year: 2026,
      quarter: 3,
    });
    await asUser.mutation(api.goals.create, {
      title: "Q2 goal",
      horizon: "quarter",
      year: 2026,
      quarter: 2,
    });
    await asUser.mutation(api.goals.create, {
      title: "This week",
      horizon: "week",
      year: 2026,
      weekStart,
    });
    await asUser.mutation(api.goals.create, {
      title: "Other week",
      horizon: "week",
      year: 2026,
      weekStart: "2026-08-17",
    });

    const result = await asUser.query(api.goals.listForCalendarWeek, {
      weekStart,
    });
    expect(result.yearGoal?.title).toBe("Theme");
    expect(result.quarterGoals.map((g) => g.title)).toEqual(["Q3 goal"]);
    expect(result.weekGoals.map((g) => g.title)).toEqual(["This week"]);
  });
});

describe("goals authz", () => {
  it("does not return another user's goals", async () => {
    const { t, asUser } = await createAuthedTest();
    const otherUserId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "other@example.com", name: "Other" }),
    );
    await t.run(async (ctx) =>
      ctx.db.insert("goals", {
        userId: otherUserId,
        title: "Secret",
        horizon: "year",
        status: "active",
        year: 2026,
        order: 0,
        updatedAt: Date.now(),
      }),
    );
    const result = await asUser.query(api.goals.listForCalendarWeek, {
      weekStart: "2026-08-24",
    });
    expect(result.yearGoal).toBeNull();
  });
});
```

Also add one `listForGoalsPage` smoke test asserting `weekPeek` includes current-week items when created with today’s Monday.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run convex/goals.test.ts`

- [ ] **Step 3: Implement queries**

```ts
function sortByOrder<T extends { order: number }>(rows: T[]) {
  return rows.slice().sort((a, b) => a.order - b.order);
}

export const listForCalendarWeek = query({
  args: { weekStart: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const year = yearFromDateKey(args.weekStart);
    const quarter = calendarQuarterFromDateKey(args.weekStart);

    const yearRows = await ctx.db
      .query("goals")
      .withIndex("by_user_horizon_year", (q) =>
        q.eq("userId", userId).eq("horizon", "year").eq("year", year),
      )
      .collect();
    const yearGoal =
      yearRows.find((g) => g.status === "active") ?? null;

    const quarterRows = await ctx.db
      .query("goals")
      .withIndex("by_user_horizon_year", (q) =>
        q.eq("userId", userId).eq("horizon", "quarter").eq("year", year),
      )
      .collect();
    const quarterGoals = sortByOrder(
      quarterRows.filter(
        (g) => g.status === "active" && g.quarter === quarter,
      ),
    );

    const weekRows = await ctx.db
      .query("goals")
      .withIndex("by_user_week", (q) =>
        q.eq("userId", userId).eq("weekStart", args.weekStart),
      )
      .collect();
    const weekGoals = sortByOrder(
      weekRows.filter((g) => g.status === "active" || g.status === "done"),
    );

    return { yearGoal, quarterGoals, weekGoals };
  },
});

export const listForGoalsPage = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const weekStart = formatDateKey(startOfWeekMonday(new Date()));

    const yearRows = await ctx.db
      .query("goals")
      .withIndex("by_user_horizon_year", (q) =>
        q.eq("userId", userId).eq("horizon", "year").eq("year", args.year),
      )
      .collect();
    const yearTheme =
      yearRows.find((g) => g.status === "active") ?? null;
    const yearDoneOrArchived = sortByOrder(
      yearRows.filter(
        (g) => g.status === "done" || g.status === "archived",
      ),
    );

    const quarterRows = await ctx.db
      .query("goals")
      .withIndex("by_user_horizon_year", (q) =>
        q
          .eq("userId", userId)
          .eq("horizon", "quarter")
          .eq("year", args.year),
      )
      .collect();
    const quarters = sortByOrder(
      quarterRows.filter(
        (g) => g.status === "active" || g.status === "done",
      ),
    );
    const archivedQuarters = sortByOrder(
      quarterRows.filter((g) => g.status === "archived"),
    );

    const weekRows = await ctx.db
      .query("goals")
      .withIndex("by_user_week", (q) =>
        q.eq("userId", userId).eq("weekStart", weekStart),
      )
      .collect();
    const weekPeek = sortByOrder(
      weekRows.filter((g) => g.status === "active" || g.status === "done"),
    );

    return {
      year: args.year,
      weekStart,
      yearTheme,
      yearDoneOrArchived,
      quarters,
      archivedQuarters,
      weekPeek,
    };
  },
});
```

Import `formatDateKey` and `startOfWeekMonday` from `./lib/dates` in `convex/goals.ts`.

- [ ] **Step 4: Run all goals tests**

Run: `npx vitest run convex/goals.test.ts`

Expected: PASS

- [ ] **Step 5: Commit** (only if the user asked)

```bash
git add convex/goals.ts convex/goals.test.ts
git commit -m "$(cat <<'EOF'
feat: add goals list queries for page and calendar week

EOF
)"
```

---

### Task 5: Nav + Goals page (year + quarter CRUD)

**Files:**
- Modify: `src/components/layout/AppShell.tsx`
- Create: `src/routes/_authenticated/goals.tsx`
- Create: `src/components/goals/GoalRow.tsx`
- Create: `src/components/goals/GoalComposer.tsx`
- Note: TanStack Router regenerates `src/routeTree.gen.ts` on next `vite`/`convex dev` — do not hand-edit unless the project requires it.

**Interfaces:**
- Consumes: `api.goals.listForGoalsPage`, `create`, `update`, `archive`; `api.projects.list`
- Produces: `/goals` route with year theme, Q1–Q4 sections, week peek (read-only + Link to `/calendar`), collapsed archived section

- [ ] **Step 1: Add Goals to sidebar**

In `AppShell.tsx`, import `Target` from `lucide-react` and insert a nav item **before Calendar**:

```ts
{ to: '/goals', label: 'Goals', icon: Target },
{ to: '/calendar', label: 'Calendar', icon: CalendarDays },
```

- [ ] **Step 2: Create shared `GoalRow` + `GoalComposer`**

`src/components/goals/GoalComposer.tsx` — minimal inline form:

```tsx
import { useState } from 'react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'

type GoalComposerProps = {
  placeholder: string
  submitLabel?: string
  onSubmit: (title: string) => Promise<void>
}

export function GoalComposer({
  placeholder,
  submitLabel = 'Add',
  onSubmit,
}: GoalComposerProps) {
  const [title, setTitle] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault()
        const trimmed = title.trim()
        if (!trimmed || pending) return
        setPending(true)
        setError(null)
        void onSubmit(trimmed)
          .then(() => setTitle(''))
          .catch(() => setError('Could not save goal'))
          .finally(() => setPending(false))
      }}
    >
      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={placeholder}
          disabled={pending}
        />
        <Button type="submit" disabled={pending || !title.trim()}>
          {submitLabel}
        </Button>
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : null}
    </form>
  )
}
```

`src/components/goals/GoalRow.tsx`:

```tsx
import { useState } from 'react'
import type { Doc } from '../../../convex/_generated/dataModel'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import { Input } from '~/components/ui/input'
import { cn } from '~/lib/utils'

type GoalRowProps = {
  goal: Doc<'goals'>
  parentLabel?: string | null
  projectLabel?: string | null
  readOnly?: boolean
  onToggleDone?: (done: boolean) => Promise<void>
  onRename?: (title: string) => Promise<void>
  onArchive?: () => Promise<void>
}

export function GoalRow({
  goal,
  parentLabel,
  projectLabel,
  readOnly,
  onToggleDone,
  onRename,
  onArchive,
}: GoalRowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(goal.title)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-card px-2.5 py-2">
      <div className="flex items-start gap-2">
        {onToggleDone ? (
          <Checkbox
            checked={goal.status === 'done'}
            disabled={readOnly}
            onCheckedChange={(checked) => {
              void onToggleDone(checked === true).catch(() =>
                setError('Could not save goal'),
              )
            }}
            className="mt-0.5"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          {editing && onRename ? (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void onRename(draft.trim())
                  .then(() => setEditing(false))
                  .catch(() => setError('Could not save goal'))
              }}
            >
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                onBlur={() => setEditing(false)}
              />
            </form>
          ) : (
            <button
              type="button"
              className={cn(
                'text-left text-sm font-medium',
                goal.status === 'done' && 'text-muted-foreground line-through',
                !readOnly && onRename && 'hover:underline',
              )}
              disabled={readOnly || !onRename}
              onClick={() => {
                if (readOnly || !onRename) return
                setDraft(goal.title)
                setEditing(true)
              }}
            >
              {goal.title}
            </button>
          )}
          {parentLabel ? (
            <p className="text-[11px] text-muted-foreground">
              ← {parentLabel}
            </p>
          ) : null}
          {projectLabel ? (
            <p className="text-[11px] text-muted-foreground">{projectLabel}</p>
          ) : null}
        </div>
        {onArchive && !readOnly ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-xs text-muted-foreground"
            onClick={() => {
              void onArchive().catch(() => setError('Could not save goal'))
            }}
          >
            Archive
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
```

- [ ] **Step 3: Build Goals page**

Create `src/routes/_authenticated/goals.tsx`:

```tsx
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useMemo, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import { GoalComposer } from '~/components/goals/GoalComposer'
import { GoalRow } from '~/components/goals/GoalRow'
import { Button } from '~/components/ui/button'

export const Route = createFileRoute('/_authenticated/goals')({
  component: GoalsPage,
})

function GoalsPage() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const { data } = useSuspenseQuery(
    convexQuery(api.goals.listForGoalsPage, { year }),
  )
  const { data: projects } = useSuspenseQuery(
    convexQuery(api.projects.list, { status: 'active' }),
  )
  const createGoal = useMutation(api.goals.create)
  const updateGoal = useMutation(api.goals.update)
  const archiveGoal = useMutation(api.goals.archive)
  const [showArchived, setShowArchived] = useState(false)

  const projectName = useMemo(() => {
    const map = new Map(projects.map((p) => [p._id, p.name]))
    return (id: (typeof projects)[number]['_id'] | undefined) =>
      id ? (map.get(id) ?? null) : null
  }, [projects])

  const quartersByQ = [1, 2, 3, 4].map((q) => ({
    quarter: q as 1 | 2 | 3 | 4,
    items: data.quarters.filter((g) => g.quarter === q),
  }))

  return (
    <section className="mx-auto max-w-3xl">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Goals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Year and quarter plans for {year}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setYear((y) => y - 1)}
          >
            ← {year - 1}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setYear((y) => y + 1)}
          >
            {year + 1} →
          </Button>
        </div>
      </header>

      <section className="mb-8 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Year theme
        </h2>
        {data.yearTheme ? (
          <GoalRow
            goal={data.yearTheme}
            projectLabel={projectName(data.yearTheme.projectId)}
            onRename={(title) => updateGoal({ goalId: data.yearTheme!._id, title })}
            onToggleDone={(done) =>
              updateGoal({
                goalId: data.yearTheme!._id,
                status: done ? 'done' : 'active',
              })
            }
            onArchive={() => archiveGoal({ goalId: data.yearTheme!._id })}
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Set a year theme for {year}.
            </p>
            <GoalComposer
              placeholder="Year theme…"
              submitLabel="Set theme"
              onSubmit={(title) =>
                createGoal({ title, horizon: 'year', year })
              }
            />
          </>
        )}
      </section>

      <section className="mb-8 space-y-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Quarters
        </h2>
        {quartersByQ.map(({ quarter, items }) => (
          <div key={quarter} className="space-y-2">
            <h3 className="text-sm font-semibold">Q{quarter}</h3>
            {items.map((goal) => (
              <GoalRow
                key={goal._id}
                goal={goal}
                parentLabel={
                  goal.parentId && data.yearTheme?._id === goal.parentId
                    ? data.yearTheme.title
                    : null
                }
                projectLabel={projectName(goal.projectId)}
                onRename={(title) => updateGoal({ goalId: goal._id, title })}
                onToggleDone={(done) =>
                  updateGoal({
                    goalId: goal._id,
                    status: done ? 'done' : 'active',
                  })
                }
                onArchive={() => archiveGoal({ goalId: goal._id })}
              />
            ))}
            <GoalComposer
              placeholder={`Add Q${quarter} goal…`}
              onSubmit={(title) =>
                createGoal({
                  title,
                  horizon: 'quarter',
                  year,
                  quarter,
                  parentId: data.yearTheme?._id,
                })
              }
            />
          </div>
        ))}
      </section>

      <section className="mb-8 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            This week’s focus
          </h2>
          <Link
            to="/calendar"
            className="text-sm font-medium text-primary hover:underline"
          >
            Open Calendar →
          </Link>
        </div>
        {data.weekPeek.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No focus items this week. Set them on Calendar.
          </p>
        ) : (
          data.weekPeek.map((goal) => (
            <GoalRow key={goal._id} goal={goal} readOnly />
          ))
        )}
      </section>

      <section className="space-y-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? 'Hide archived' : 'Show archived'}
        </Button>
        {showArchived ? (
          <div className="space-y-2">
            {[...data.yearDoneOrArchived, ...data.archivedQuarters].map(
              (goal) => (
                <GoalRow key={goal._id} goal={goal} readOnly />
              ),
            )}
          </div>
        ) : null}
      </section>
    </section>
  )
}
```

- [ ] **Step 4: Manual smoke**

Run app (`npm run dev` / existing Convex+Vite). Confirm:

1. Sidebar shows Goals; `/goals` loads.
2. Can set year theme; second theme fails with error UI.
3. Can add quarter goals; week peek empty until Calendar task.

- [ ] **Step 5: Commit** (only if the user asked)

```bash
git add src/components/layout/AppShell.tsx src/routes/_authenticated/goals.tsx src/components/goals/GoalRow.tsx src/components/goals/GoalComposer.tsx src/routeTree.gen.ts
git commit -m "$(cat <<'EOF'
feat: add Goals page and sidebar nav

EOF
)"
```

---

### Task 6: Calendar layout — remove Unscheduled, move week nav + legend

**Files:**
- Modify: `src/components/calendar/WeekView.tsx`
- Modify: `src/routes/_authenticated/calendar.tsx`

**Interfaces:**
- Consumes: existing `anchorDate`, `onNavigate`, blocks/chip handlers
- Produces: WeekView without `unscheduledTasks` / `onCreateFromTask`; week nav + color legend above or beside grid header (top-left of week composition); aside slot reserved for Task 7 (`children` or `aside` prop)

- [ ] **Step 1: Slim `calendar.tsx`**

Remove `unscheduledTasks` computation and props. Stop passing `onCreateFromTask`. Keep `tasks` only for `taskMap` / review. You may drop the full `api.tasks.list` if review still needs titles — keep `taskMap` as today.

- [ ] **Step 2: Restructure `WeekView`**

Replace props:

```ts
type WeekViewProps = {
  blocks: Array<Doc<'timeBlocks'>>
  taskMap?: Map<Id<'tasks'>, Doc<'tasks'>>
  anchorDate: Date
  now: number
  onNavigate: (date: Date) => void
  onUpdateBlock: (
    blockId: Doc<'timeBlocks'>['_id'],
    patch: { start?: number; end?: number },
  ) => void
  onReviewBlock?: (block: Doc<'timeBlocks'>) => void
  onEmptySlotClick: (args: { startMs: number; dateKey: string }) => void
  onEditBlock: (block: Doc<'timeBlocks'>) => void
  aside?: ReactNode
}
```

Import `type { ReactNode } from 'react'`.

Layout sketch:

```tsx
<div className="flex items-start gap-5 max-md:flex-col">
  <div className="flex min-w-0 flex-1 flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button ... onClick={() => onNavigate(addDays(anchorDate, -7))}>
          <ChevronLeft />
        </Button>
        <Button ... onClick={() => onNavigate(new Date())}>Today</Button>
        <Button ... onClick={() => onNavigate(addDays(anchorDate, 7))}>
          <ChevronRight />
        </Button>
        <p className="text-xs text-muted-foreground">
          Week of {formatDateKey(weekStart)}
        </p>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <i className="inline-block size-2.5 rounded-[3px] bg-event-work" />
          Work
        </span>
        {/* Personal + From Google same as today */}
      </div>
    </div>

    <div className="overflow-hidden rounded-xl border ...">
      {/* existing grid scroller unchanged — remove column onDragOver/onDrop */}
    </div>
  </div>

  <aside className="w-[260px] shrink-0 ... max-md:w-full">
    {aside}
  </aside>
</div>
```

Delete the Unscheduled list and the old aside nav/legend block. Remove unused imports (`TASK_DRAG_TYPE`, `readTaskDragId`, `dropRangeFromPointer` if unused).

- [ ] **Step 3: Temporary aside placeholder**

Pass `aside={<p className="text-sm text-muted-foreground">Goals aside coming…</p>}` from `calendar.tsx` so layout is reviewable before Task 7.

- [ ] **Step 4: Manual check**

1. Unscheduled gone; week nav top-left; legend visible.
2. Empty-slot create + chip edit/review still work.
3. No drag-from-aside (expected).

- [ ] **Step 5: Commit** (only if the user asked)

```bash
git add src/components/calendar/WeekView.tsx src/routes/_authenticated/calendar.tsx
git commit -m "$(cat <<'EOF'
feat: replace calendar unscheduled rail with week nav layout

EOF
)"
```

---

### Task 7: `GoalsAside` + weekly focus editor on Calendar

**Files:**
- Create: `src/components/goals/WeeklyFocusEditor.tsx`
- Create: `src/components/goals/GoalsAside.tsx`
- Modify: `src/routes/_authenticated/calendar.tsx`
- Modify: `src/components/calendar/WeekView.tsx` (only if aside prop needs tweak)

**Interfaces:**
- Consumes: `listForCalendarWeek({ weekStart })`, `create` / `update` / `archive`
- Produces: Aside order — Year → This week’s focus (edit) → Working toward (quarters read-only) → Open Goals →
- `weekStart` = `formatDateKey(startOfWeekMonday(anchorDate))` — **visible week**, not “today”

- [ ] **Step 1: `WeeklyFocusEditor`**

```tsx
import { useMutation } from 'convex/react'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { api } from '../../../convex/_generated/api'
import { GoalComposer } from './GoalComposer'
import { GoalRow } from './GoalRow'

type WeeklyFocusEditorProps = {
  weekStart: string
  year: number
  weekGoals: Array<Doc<'goals'>>
  quarterGoals: Array<Doc<'goals'>>
}

export function WeeklyFocusEditor({
  weekStart,
  year,
  weekGoals,
  quarterGoals,
}: WeeklyFocusEditorProps) {
  const createGoal = useMutation(api.goals.create)
  const updateGoal = useMutation(api.goals.update)
  const archiveGoal = useMutation(api.goals.archive)

  const parentTitle = (parentId: Id<'goals'> | undefined) => {
    if (!parentId) return null
    return quarterGoals.find((q) => q._id === parentId)?.title ?? null
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        This week’s focus
      </h4>
      {weekGoals.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Add what matters this week
        </p>
      ) : null}
      {weekGoals.map((goal) => (
        <GoalRow
          key={goal._id}
          goal={goal}
          parentLabel={parentTitle(goal.parentId)}
          onRename={(title) => updateGoal({ goalId: goal._id, title })}
          onToggleDone={(done) =>
            updateGoal({
              goalId: goal._id,
              status: done ? 'done' : 'active',
            })
          }
          onArchive={() => archiveGoal({ goalId: goal._id })}
        />
      ))}
      <GoalComposer
        placeholder="Weekly focus…"
        onSubmit={async (title) => {
          // Optional: default parent to first quarter goal if exactly one — skip for v1 (YAGNI)
          await createGoal({
            title,
            horizon: 'week',
            year,
            weekStart,
          })
        }}
      />
      {/* Optional parent picker: Select of quarterGoals — include if <30 min; else ship without and add in polish */}
    </div>
  )
}
```

For v1 parent linking from aside: add a small `<select>` under the composer when `quarterGoals.length > 0`:

```tsx
const [parentId, setParentId] = useState<Id<'goals'> | ''>('')
// pass parentId: parentId || undefined into createGoal
```

- [ ] **Step 2: `GoalsAside`**

```tsx
import { Link } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { api } from '../../../convex/_generated/api'
import {
  calendarQuarterFromDateKey,
  yearFromDateKey,
} from '~/lib/dates'
import { WeeklyFocusEditor } from './WeeklyFocusEditor'

export function GoalsAside({ weekStart }: { weekStart: string }) {
  const { data } = useSuspenseQuery(
    convexQuery(api.goals.listForCalendarWeek, { weekStart }),
  )
  const year = yearFromDateKey(weekStart)
  const quarter = calendarQuarterFromDateKey(weekStart)

  return (
    <div className="space-y-5 p-4">
      <div className="space-y-1.5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Year
        </h4>
        {data.yearGoal ? (
          <p className="text-sm font-semibold">{data.yearGoal.title}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Set a year theme on{' '}
            <Link to="/goals" className="text-primary hover:underline">
              Goals
            </Link>
          </p>
        )}
      </div>

      <WeeklyFocusEditor
        weekStart={weekStart}
        year={year}
        weekGoals={data.weekGoals}
        quarterGoals={data.quarterGoals}
      />

      <div className="space-y-1.5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Working toward · Q{quarter}
        </h4>
        {data.quarterGoals.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No quarter goals yet
          </p>
        ) : (
          <ul className="space-y-1">
            {data.quarterGoals.map((g) => (
              <li key={g._id} className="text-sm">
                {g.title}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link
        to="/goals"
        className="inline-block text-sm font-medium text-primary hover:underline"
      >
        Open Goals →
      </Link>
    </div>
  )
}
```

- [ ] **Step 3: Wire calendar**

In `calendar.tsx`:

```tsx
import { GoalsAside } from '~/components/goals/GoalsAside'

// inside WeekView:
aside={<GoalsAside weekStart={formatDateKey(weekStart)} />}
```

Ensure `WeekView` aside wrapper does not double-pad (`GoalsAside` already has `p-4` — either strip outer padding on the aside shell or remove inner `p-4`). Prefer **one** padding: keep `aside className="... p-0"` and let `GoalsAside` pad, or reverse.

- [ ] **Step 4: Manual checklist (spec §9)**

1. Aside shows year / week focus / quarters for **visible** week.
2. Add / check / archive weekly focus; persists on refresh.
3. Change week → aside follows that `weekStart`.
4. Open Goals → works; scheduling via + New block still works.
5. Optional parent on week item shows “← Quarter title”.

- [ ] **Step 5: Commit** (only if the user asked)

```bash
git add src/components/goals/WeeklyFocusEditor.tsx src/components/goals/GoalsAside.tsx src/routes/_authenticated/calendar.tsx src/components/calendar/WeekView.tsx
git commit -m "$(cat <<'EOF'
feat: add calendar goals aside for the visible week

EOF
)"
```

---

### Task 8: Polish — optional project link + second-year UX

**Files:**
- Modify: `src/routes/_authenticated/goals.tsx`
- Modify: `src/components/goals/GoalComposer.tsx` (optional project select)
- Modify: `convex/goals.test.ts` only if gaps remain

**Interfaces:**
- Optional `projectId` on year/quarter create from Goals page via `<select>` of active projects (same pattern as notes project tagging — keep UI light).
- Surface second-active-year mutation message in composer error text when `error.message` matches (show server message instead of generic).

- [ ] **Step 1: Improve create error surfacing**

In `GoalComposer`, change catch to:

```ts
.catch((err: unknown) => {
  const message =
    err instanceof Error && err.message
      ? err.message
      : 'Could not save goal'
  setError(
    message.includes('active year theme')
      ? message
      : 'Could not save goal',
  )
})
```

- [ ] **Step 2: Optional project select on Goals page composers**

Extend `GoalComposer` with optional `projectOptions?: Array<{ id: Id<'projects'>; name: string }>` and `onSubmit: (title: string, projectId?: Id<'projects'>) => Promise<void>`. When options present, render a native `<select>` (or existing `Select` UI). Pass `projectId` into `createGoal` for year/quarter only.

If a linked project is missing later, `GoalRow` already shows no crash when `projectName` returns null — good.

- [ ] **Step 3: Final verification**

Run: `npx vitest run convex/goals.test.ts src/lib/dates.test.ts`

Expected: PASS

Manual: full spec §9 checklist once more.

- [ ] **Step 4: Commit** (only if the user asked)

```bash
git add src/components/goals src/routes/_authenticated/goals.tsx
git commit -m "$(cat <<'EOF'
feat: polish goals project link and year-theme errors

EOF
)"
```

---

## Self-review (plan author)

**Spec coverage**

| Spec section | Task(s) |
|---|---|
| §2 Aside / Unscheduled / week nav / color legend | 6, 7 |
| §2 Hierarchy + one table + optional project | 1–3, 8 |
| §2 Goals page year+quarter; week peek RO | 5 |
| §2 Calendar aside roles | 7 |
| §4 Schema + indexes + hierarchy rules | 1–3 |
| §5 API surface | 2–4 |
| §6 UI architecture | 5–7 |
| §7 Aside content order + empty states + width | 6–7 |
| §8 Errors / week follows anchor / archived | 3, 5, 7, 8 |
| §9 Tests | 2–4 (+ manual in 5–7) |
| §10 Out of scope | Not planned |

**Placeholder scan:** No TBD / “implement later” steps; code blocks included for core API and UI.

**Type consistency:** `weekStart` is `YYYY-MM-DD` Monday; list return fields `yearGoal` / `quarterGoals` / `weekGoals` match aside; `listForGoalsPage` uses `yearTheme` / `weekPeek` / archived arrays as consumed by Goals page.
