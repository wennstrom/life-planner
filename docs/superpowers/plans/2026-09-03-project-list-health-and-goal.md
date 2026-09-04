# Project List Health, Goal Date, and Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/projects` a denser scan-and-pick directory: user-set health, optional goal date (overdue styling), title color swatch, Done-column progress, and the same fields editable on create and the project header.

**Architecture:** Store `health` and optional `goalDate` on `projects`. Share validators from `convex/lib/projectHealth.ts` (same pattern as `boardColumnColors.ts`). Display helpers live in `src/lib/project-health.ts`; leftover/done uses `src/lib/project-progress.ts`. List cards are display-only `Link`s; writes go through `projects.create` / `projects.update`.

**Tech Stack:** Convex schema/mutations + `convex-test`, Vitest, TanStack Form + Zod, existing shadcn `Button` / `Progress` / `Dialog` / date `TextField`.

**Spec:** `docs/superpowers/specs/2026-09-03-project-list-health-and-goal-design.md`

## Global Constraints

- No new tables. No list filters/sort. Cards are not editable.
- Health is only `"onTrack" | "atRisk" | "offTrack"`. No On hold / inferred health.
- New projects default to `onTrack`. Goal date is optional; never invent dates on backfill.
- Overdue is client-only: `goalDate <` viewer’s local `YYYY-MM-DD` today. Do not use `Date.now()` in Convex queries.
- Invalid health → `Invalid project health`. Invalid goal date → `Invalid goal date`.
- Clearing goal date unsets the field (no `""` stored), same idea as description.
- Progress: **Done** = `columnId` is the Done column (`isDone`). **Leftover** = every other non-archived project task. Do not use `completedAt`.
- Card: health pill + goal/overdue on top; 12px rounded swatch + name; omit blank description (no “No description yet.”); leftover · done + progress bar. No color rail/strip/wash.
- Copy: `On track` / `At risk` / `Off track`; `Goal · Sep 30`; `Overdue · Aug 15`; header save failures `Could not save health.` / `Could not save goal date.`
- Prettier: Convex files keep double quotes + semicolons; `src/` uses single quotes, no semicolons.
- Public Convex functions keep `args` validators. Do not add Playwright unless a smoke test asserts the old left rail or “No description yet.” (none does).
- If `src/lib/project-progress.ts` already exists with the API below (from the project-page board plan), reuse it — do not duplicate.

## File map

| Path | Responsibility |
|------|----------------|
| `convex/lib/projectHealth.ts` | `PROJECT_HEALTH`, `isProjectHealth`, `isCalendarGoalDate` |
| `convex/lib/projectHealth.test.ts` | Validator unit tests |
| `convex/schema.ts` | `health`, optional `goalDate` on `projects` |
| `convex/projects.ts` | Create/update validation, default health, unset goal date |
| `convex/projects.test.ts` | Create/update health and goal date |
| `convex/migrations.ts` | `backfillProjectHealth` |
| `convex/migrations.test.ts` | Backfill idempotence |
| `src/lib/project-health.ts` | Labels, pill classes, overdue + display label |
| `src/lib/project-health.test.ts` | Overdue and label tests |
| `src/lib/project-progress.ts` | Leftover/done/percent |
| `src/lib/project-progress.test.ts` | Done-column counting |
| `src/lib/forms/create-project.ts` | Zod health + optional goal date |
| `src/lib/forms/create-project.test.ts` | Schema tests |
| `src/components/projects/ProjectHealthPills.tsx` | Three health controls |
| `src/components/projects/AddProjectModal.tsx` | Health + goal date fields |
| `src/components/projects/ProjectCard.tsx` | List card layout |
| `src/components/projects/ProjectGoalDate.tsx` | Header goal date control |
| `src/routes/_authenticated/projects/index.tsx` | Grid of `ProjectCard` |
| `src/routes/_authenticated/projects/$projectId.tsx` | Header health + goal date |

Do **not** split this spec into multiple plans: the list is empty without the fields, and the fields are unused without create/header.

---

### Task 1: Health and goal-date validators

**Files:**
- Create: `convex/lib/projectHealth.ts`
- Create: `convex/lib/projectHealth.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `PROJECT_HEALTH`: `readonly ["onTrack", "atRisk", "offTrack"]`
  - `ProjectHealth`: `"onTrack" | "atRisk" | "offTrack"`
  - `isProjectHealth(value: string): value is ProjectHealth`
  - `isCalendarGoalDate(value: string): boolean` — true iff `YYYY-MM-DD` and a real calendar day (UTC y/m/d round-trip)

- [ ] **Step 1: Write the failing tests**

Create `convex/lib/projectHealth.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  PROJECT_HEALTH,
  isCalendarGoalDate,
  isProjectHealth,
} from "./projectHealth";

describe("isProjectHealth", () => {
  it("accepts the three literals", () => {
    expect(PROJECT_HEALTH).toEqual(["onTrack", "atRisk", "offTrack"]);
    expect(isProjectHealth("onTrack")).toBe(true);
    expect(isProjectHealth("atRisk")).toBe(true);
    expect(isProjectHealth("offTrack")).toBe(true);
  });

  it("rejects other strings", () => {
    expect(isProjectHealth("on hold")).toBe(false);
    expect(isProjectHealth("done")).toBe(false);
    expect(isProjectHealth("")).toBe(false);
  });
});

describe("isCalendarGoalDate", () => {
  it("accepts a real YYYY-MM-DD day", () => {
    expect(isCalendarGoalDate("2026-09-30")).toBe(true);
    expect(isCalendarGoalDate("2024-02-29")).toBe(true);
  });

  it("rejects empty, non-ISO, and impossible days", () => {
    expect(isCalendarGoalDate("")).toBe(false);
    expect(isCalendarGoalDate("09/30/2026")).toBe(false);
    expect(isCalendarGoalDate("2026-13-01")).toBe(false);
    expect(isCalendarGoalDate("2026-02-30")).toBe(false);
    expect(isCalendarGoalDate("2026-9-3")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- convex/lib/projectHealth.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement the validators**

Create `convex/lib/projectHealth.ts`:

```typescript
export const PROJECT_HEALTH = ["onTrack", "atRisk", "offTrack"] as const;

export type ProjectHealth = (typeof PROJECT_HEALTH)[number];

export function isProjectHealth(value: string): value is ProjectHealth {
  return (PROJECT_HEALTH as ReadonlyArray<string>).includes(value);
}

export function isCalendarGoalDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- convex/lib/projectHealth.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/lib/projectHealth.ts convex/lib/projectHealth.test.ts
git commit -m "Add project health and goal-date validators."
```

---

### Task 2: Schema (optional health) and create/update

**Files:**
- Modify: `convex/schema.ts` (`projects` table)
- Modify: `convex/projects.ts` (`create`, `update`, description-clear helper)
- Modify: `convex/projects.test.ts`

**Interfaces:**
- Consumes: `isProjectHealth`, `isCalendarGoalDate`, `PROJECT_HEALTH` from Task 1
- Produces:
  - `projects` documents may have `health?: ProjectHealth` and `goalDate?: string`
  - `projects.create` args: existing + `health: v.optional(healthValidator)`, `goalDate: v.optional(v.string())`. Inserts `health: args.health ?? "onTrack"`. Omits `goalDate` when absent. Throws `Invalid project health` / `Invalid goal date`.
  - `projects.update` args: existing + `health: v.optional(healthValidator)`, `goalDate: v.optional(v.union(v.string(), v.null()))`. `null` or `""` unsets `goalDate` via `replace` (must not store empty string). String value must pass `isCalendarGoalDate`.

- [ ] **Step 1: Write the failing tests**

Add to `convex/projects.test.ts` inside the existing `describe("projects.create")` / `describe("projects.update")` (keep `createAuthedTest`):

```typescript
it("defaults health to onTrack when omitted", async () => {
  const { asUser } = await createAuthedTest();
  const projectId = await asUser.mutation(api.projects.create, {
    name: "Website",
    color: "#6366f1",
  });
  const data = await asUser.query(api.projects.get, { projectId });
  expect(data.project.health).toBe("onTrack");
  expect(data.project.goalDate).toBeUndefined();
});

it("stores explicit health and goalDate", async () => {
  const { asUser } = await createAuthedTest();
  const projectId = await asUser.mutation(api.projects.create, {
    name: "Website",
    color: "#6366f1",
    health: "atRisk",
    goalDate: "2026-09-30",
  });
  const data = await asUser.query(api.projects.get, { projectId });
  expect(data.project.health).toBe("atRisk");
  expect(data.project.goalDate).toBe("2026-09-30");
});

it("rejects an invalid goalDate on create", async () => {
  const { asUser } = await createAuthedTest();
  await expect(
    asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
      goalDate: "2026-02-30",
    }),
  ).rejects.toThrow("Invalid goal date");
});
```

And in `describe("projects.update")`:

```typescript
it("updates health and sets then clears goalDate", async () => {
  const { asUser } = await createAuthedTest();
  const projectId = await asUser.mutation(api.projects.create, {
    name: "Website",
    color: "#6366f1",
  });
  await asUser.mutation(api.projects.update, {
    projectId,
    health: "offTrack",
    goalDate: "2026-08-15",
  });
  let data = await asUser.query(api.projects.get, { projectId });
  expect(data.project.health).toBe("offTrack");
  expect(data.project.goalDate).toBe("2026-08-15");

  await asUser.mutation(api.projects.update, {
    projectId,
    goalDate: null,
  });
  data = await asUser.query(api.projects.get, { projectId });
  expect(data.project.health).toBe("offTrack");
  expect(data.project.goalDate).toBeUndefined();
});

it("rejects invalid health and goalDate on update", async () => {
  const { asUser } = await createAuthedTest();
  const projectId = await asUser.mutation(api.projects.create, {
    name: "Website",
    color: "#6366f1",
  });
  await expect(
    asUser.mutation(api.projects.update, {
      projectId,
      goalDate: "nope",
    }),
  ).rejects.toThrow("Invalid goal date");
});
```

Do **not** add an `isProjectHealth` test that passes a bad `health` string through `api.projects.update` — the Convex `v.union` of literals will reject it before the handler. The create default + valid `atRisk` / `offTrack` paths are enough.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- convex/projects.test.ts`

Expected: FAIL (unknown `health` / `goalDate` on create args or documents)

- [ ] **Step 3: Widen the schema and implement create/update**

In `convex/schema.ts`, add a module-level validator next to `projectStatus`:

```typescript
const projectHealth = v.union(
  v.literal("onTrack"),
  v.literal("atRisk"),
  v.literal("offTrack"),
);
```

On `projects`, add (still **optional** this task):

```typescript
health: v.optional(projectHealth),
goalDate: v.optional(v.string()),
```

In `convex/projects.ts`, import `isCalendarGoalDate` and `isProjectHealth`. Add:

```typescript
const healthValidator = v.union(
  v.literal("onTrack"),
  v.literal("atRisk"),
  v.literal("offTrack"),
);

function parseGoalDate(value: string): string {
  if (!isCalendarGoalDate(value)) {
    throw new Error("Invalid goal date");
  }
  return value;
}

function projectFieldsWithoutGoalDate(project: Doc<"projects">) {
  const { _id, _creationTime, goalDate: _goalDate, ...fields } = project;
  return fields;
}
```

`create` args: add `health: v.optional(healthValidator)`, `goalDate: v.optional(v.string())`. After the color check:

```typescript
if (args.health !== undefined && !isProjectHealth(args.health)) {
  throw new Error("Invalid project health");
}
const goalDate =
  args.goalDate !== undefined ? parseGoalDate(args.goalDate) : undefined;
```

Insert:

```typescript
health: args.health ?? "onTrack",
...(goalDate ? { goalDate } : {}),
```

`update` args: add `health: v.optional(healthValidator)`, `goalDate: v.optional(v.union(v.string(), v.null()))`.

Extend the patch object with `health?: ProjectHealth` and `goalDate?: string`. If `args.health !== undefined`, set `patch.health` (validator already narrowed it).

Handle `goalDate` like description: if `args.goalDate === null` or `args.goalDate === ""`, `replace` with `projectFieldsWithoutGoalDate` merged with `patch` (and description handling if that branch also runs). If `args.goalDate` is a non-empty string, `parseGoalDate` then include it in the patch.

Keep the existing description-clear `replace` path; when that path runs, spread `patch` (including health / goalDate if set in the same call). If this call only clears `goalDate`, use the goal-date `replace` path and do not strip description.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- convex/projects.test.ts`

Expected: PASS (existing create/update/remove tests still pass)

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/projects.ts convex/projects.test.ts
git commit -m "Store project health and optional goal date."
```

---

### Task 3: Backfill health and require the field

**Files:**
- Modify: `convex/migrations.ts`
- Modify: `convex/migrations.test.ts`
- Modify: `convex/schema.ts` (make `health` required)
- Modify raw inserts: `convex/projects.test.ts`, `convex/tasks.test.ts`, `convex/migrateClerkUser.test.ts` (add `health: "onTrack"` wherever they `insert("projects", …)` without going through `create`)

**Interfaces:**
- Consumes: documents with missing `health` from Task 2
- Produces:
  - `backfillProjectHealthForUsers(ctx): Promise<{ patched: number }>` — every project missing `health` gets `"onTrack"`; does not write `goalDate`; idempotent
  - `api.migrations.backfillProjectHealth` public mutation `{ args: {}, handler }` that calls the helper
  - Schema: `health: projectHealth` (required)

- [ ] **Step 1: Write the failing backfill test**

Add to `convex/migrations.test.ts` (this file already imports `api`):

```typescript
describe("backfillProjectHealth", () => {
  it("leaves existing health and goalDate unchanged", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: "user_test1" });
    const projectId = await asUser.mutation(api.projects.create, {
      name: "Website",
      color: "#6366f1",
      health: "atRisk",
      goalDate: "2026-09-30",
    });

    await asUser.mutation(api.migrations.backfillProjectHealth, {});
    await asUser.mutation(api.migrations.backfillProjectHealth, {});

    const data = await asUser.query(api.projects.get, { projectId });
    expect(data.project.health).toBe("atRisk");
    expect(data.project.goalDate).toBe("2026-09-30");
  });
});
```

Once `health` is required, convex-test cannot insert a project without it, so do not write a “missing health” insert test. The helper still patches only when `health` is missing so a live deploy can backfill old documents.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- convex/migrations.test.ts`

Expected: FAIL (`backfillProjectHealth` missing)

- [ ] **Step 3: Implement backfill**

In `convex/migrations.ts`, add next to `backfillBoardColumns` (no `requireUserId` — same as `backfillBoardColumns`):

```typescript
export async function backfillProjectHealthForUsers(ctx: MutationCtx): Promise<{
  patched: number;
}> {
  const projects = await ctx.db.query("projects").collect();
  let patched = 0;
  for (const project of projects) {
    if (project.health !== undefined) continue;
    await ctx.db.patch(project._id, { health: "onTrack" });
    patched += 1;
  }
  return { patched };
}

export const backfillProjectHealth = mutation({
  args: {},
  handler: async (ctx) => {
    await backfillProjectHealthForUsers(ctx);
    return null;
  },
});
```

- [ ] **Step 4: Require `health` on the schema and fix inserts**

In `convex/schema.ts`, change `health` to `projectHealth` (not wrapped in `v.optional`).

Add `health: "onTrack"` to every `ctx.db.insert("projects", {` that does not set it:

- `convex/projects.test.ts` (foreign-project insert)
- `convex/tasks.test.ts` (foreign-project insert)
- `convex/migrateClerkUser.test.ts` (legacy project insert)

- [ ] **Step 5: Run tests**

Run: `npm test -- convex/migrations.test.ts convex/projects.test.ts convex/tasks.test.ts convex/migrateClerkUser.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add convex/schema.ts convex/migrations.ts convex/migrations.test.ts convex/projects.test.ts convex/tasks.test.ts convex/migrateClerkUser.test.ts
git commit -m "Backfill and require project health."
```

After merge, run `backfillProjectHealth` once against the deployed Convex dashboard (or `npx convex run migrations:backfillProjectHealth`) **before** clients rely on required `health`. If this repo deploys schema and functions together, run the backfill in the same release while any leftover documents still validate — if production already has projects, run backfill **immediately** after deploy. Do not skip this for the personal deployment.

---

### Task 4: Display helpers (health UI + progress)

**Files:**
- Create: `src/lib/project-health.ts`
- Create: `src/lib/project-health.test.ts`
- Create: `src/lib/project-progress.ts` (skip create if this file already exports `projectProgress` as below)
- Create: `src/lib/project-progress.test.ts` (skip if present)

**Interfaces:**
- Consumes: `PROJECT_HEALTH`, `ProjectHealth` from `convex/lib/projectHealth.ts`; `formatDateKey` from `src/lib/dates.ts` is **not** required inside `isGoalOverdue` — the caller passes `today`
- Produces:
  - `PROJECT_HEALTH_LABEL: Record<ProjectHealth, string>` — `On track` / `At risk` / `Off track`
  - `PROJECT_HEALTH_PILL_CLASS: Record<ProjectHealth, string>`
  - `isGoalOverdue(goalDate: string | undefined, today: string): boolean`
  - `goalDateCaption(goalDate: string | undefined, today: string): { text: string; overdue: boolean } | null`
  - `projectProgress(tasks, columns): { leftover, done, total, percent }` as in the project-page board plan

- [ ] **Step 1: Write the failing tests**

Create `src/lib/project-health.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { goalDateCaption, isGoalOverdue } from './project-health'

describe('isGoalOverdue', () => {
  it('is false when missing, today, or future', () => {
    expect(isGoalOverdue(undefined, '2026-09-03')).toBe(false)
    expect(isGoalOverdue('2026-09-03', '2026-09-03')).toBe(false)
    expect(isGoalOverdue('2026-09-04', '2026-09-03')).toBe(false)
  })

  it('is true when the calendar day is before today', () => {
    expect(isGoalOverdue('2026-09-02', '2026-09-03')).toBe(true)
  })
})

describe('goalDateCaption', () => {
  it('returns null without a date', () => {
    expect(goalDateCaption(undefined, '2026-09-03')).toBeNull()
  })

  it('formats Goal vs Overdue with a short month day', () => {
    expect(goalDateCaption('2026-09-30', '2026-09-03')).toEqual({
      text: 'Goal · Sep 30',
      overdue: false,
    })
    expect(goalDateCaption('2026-08-15', '2026-09-03')).toEqual({
      text: 'Overdue · Aug 15',
      overdue: true,
    })
  })
})
```

If `src/lib/project-progress.test.ts` does not exist, create it with:

```typescript
import { describe, expect, it } from 'vitest'
import { projectProgress } from './project-progress'

const columns = [
  { _id: 'col_ip', isDone: false },
  { _id: 'col_done', isDone: true },
]

describe('projectProgress', () => {
  it('counts Done by isDone column', () => {
    expect(
      projectProgress(
        [{ columnId: 'col_done' }, { columnId: 'col_ip' }, {}],
        columns,
      ),
    ).toEqual({ leftover: 2, done: 1, total: 3, percent: 33 })
  })

  it('returns 0 percent when there are no tasks', () => {
    expect(projectProgress([], columns)).toEqual({
      leftover: 0,
      done: 0,
      total: 0,
      percent: 0,
    })
  })

  it('treats a stale columnId as leftover', () => {
    const result = projectProgress([{ columnId: 'col_gone' }], columns)
    expect(result).toEqual({ leftover: 1, done: 0, total: 1, percent: 0 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/project-health.test.ts src/lib/project-progress.test.ts`

Expected: FAIL (modules not found), unless progress already exists and only health tests fail

- [ ] **Step 3: Implement the helpers**

Create `src/lib/project-health.ts`:

```typescript
import type { ProjectHealth } from '../../convex/lib/projectHealth'

export type { ProjectHealth }
export { PROJECT_HEALTH } from '../../convex/lib/projectHealth'

export const PROJECT_HEALTH_LABEL: Record<ProjectHealth, string> = {
  onTrack: 'On track',
  atRisk: 'At risk',
  offTrack: 'Off track',
}

export const PROJECT_HEALTH_PILL_CLASS: Record<ProjectHealth, string> = {
  onTrack: 'bg-emerald-50 text-emerald-800',
  atRisk: 'bg-amber-50 text-amber-800',
  offTrack: 'bg-red-50 text-red-800',
}

export const PROJECT_HEALTH_DOT_CLASS: Record<ProjectHealth, string> = {
  onTrack: 'bg-emerald-600',
  atRisk: 'bg-amber-600',
  offTrack: 'bg-red-600',
}

export function isGoalOverdue(
  goalDate: string | undefined,
  today: string,
): boolean {
  if (!goalDate) return false
  return goalDate < today
}

function shortDay(goalDate: string): string {
  const [year, month, day] = goalDate.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function goalDateCaption(
  goalDate: string | undefined,
  today: string,
): { text: string; overdue: boolean } | null {
  if (!goalDate) return null
  const overdue = isGoalOverdue(goalDate, today)
  const day = shortDay(goalDate)
  return {
    text: overdue ? `Overdue · ${day}` : `Goal · ${day}`,
    overdue,
  }
}
```

If creating `src/lib/project-progress.ts`:

```typescript
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
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  return { leftover, done, total, percent }
}
```

`goalDateCaption` tests use `en` short month (`Sep`, `Aug`). If the runner locale differs, set `toLocaleDateString('en-US', …)` in `shortDay` so the test is stable.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/project-health.test.ts src/lib/project-progress.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/project-health.ts src/lib/project-health.test.ts src/lib/project-progress.ts src/lib/project-progress.test.ts
git commit -m "Add project health captions and Done-column progress."
```

---

### Task 5: Create modal fields

**Files:**
- Modify: `src/lib/forms/create-project.ts`
- Modify: `src/lib/forms/create-project.test.ts`
- Create: `src/components/projects/ProjectHealthPills.tsx`
- Modify: `src/components/projects/AddProjectModal.tsx`

**Interfaces:**
- Consumes: `PROJECT_HEALTH`, `PROJECT_HEALTH_LABEL`, `PROJECT_HEALTH_PILL_CLASS`, `PROJECT_HEALTH_DOT_CLASS`, `isCalendarGoalDate`
- Produces:
  - `createProjectSchema` fields: `health` enum of `PROJECT_HEALTH` (default `onTrack` in `emptyCreateProjectValues`), `goalDate` string (empty allowed)
  - `ProjectHealthPills({ value, onChange, disabled?: boolean })`
  - Modal submit passes `health` always; passes `goalDate` only when non-empty

- [ ] **Step 1: Write the failing schema tests**

Update `valid` in `src/lib/forms/create-project.test.ts` to include `health: 'onTrack'` and add:

```typescript
it('defaults are not required in the payload if health is onTrack', () => {
  expect(
    createProjectSchema.safeParse({ ...valid, health: 'atRisk' }).success,
  ).toBe(true)
})

it('rejects an unknown health', () => {
  expect(
    createProjectSchema.safeParse({ ...valid, health: 'paused' }).success,
  ).toBe(false)
})

it('accepts an empty goalDate and a valid one', () => {
  expect(
    createProjectSchema.safeParse({ ...valid, goalDate: '' }).success,
  ).toBe(true)
  expect(
    createProjectSchema.safeParse({ ...valid, goalDate: '2026-09-30' }).success,
  ).toBe(true)
})

it('rejects an invalid goalDate', () => {
  expect(
    createProjectSchema.safeParse({ ...valid, goalDate: '2026-02-30' }).success,
  ).toBe(false)
})
```

Existing tests that parse `valid` must still pass — add `health: 'onTrack'` to `valid`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/forms/create-project.test.ts`

Expected: FAIL (unknown keys or health missing)

- [ ] **Step 3: Implement schema, pills, and modal**

`src/lib/forms/create-project.ts`:

```typescript
import { z } from 'zod'
import { BOARD_COLUMN_COLORS } from '../../../convex/lib/boardColumnColors'
import type { BoardColumnColor } from '../../../convex/lib/boardColumnColors'
import { PROJECT_HEALTH, isCalendarGoalDate } from '../../../convex/lib/projectHealth'
import type { ProjectHealth } from '../../../convex/lib/projectHealth'

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  description: z.string().optional(),
  color: z.enum(BOARD_COLUMN_COLORS),
  health: z.enum(PROJECT_HEALTH),
  goalDate: z
    .string()
    .optional()
    .refine((value) => !value || isCalendarGoalDate(value), 'Invalid goal date'),
})

export type CreateProjectValues = z.input<typeof createProjectSchema>

export function emptyCreateProjectValues(
  color: BoardColumnColor,
): CreateProjectValues {
  return {
    name: '',
    description: '',
    color,
    health: 'onTrack' satisfies ProjectHealth,
    goalDate: '',
  }
}
```

Create `src/components/projects/ProjectHealthPills.tsx`:

```typescript
import { cn } from '~/lib/utils'
import {
  PROJECT_HEALTH,
  PROJECT_HEALTH_DOT_CLASS,
  PROJECT_HEALTH_LABEL,
  PROJECT_HEALTH_PILL_CLASS,
  type ProjectHealth,
} from '~/lib/project-health'

type ProjectHealthPillsProps = {
  value: ProjectHealth
  onChange: (health: ProjectHealth) => void
  disabled?: boolean
}

export function ProjectHealthPills({
  value,
  onChange,
  disabled,
}: ProjectHealthPillsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {PROJECT_HEALTH.map((health) => {
        const selected = value === health
        return (
          <button
            key={health}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
              PROJECT_HEALTH_PILL_CLASS[health],
              selected
                ? 'ring-2 ring-ring ring-offset-2 ring-offset-background'
                : 'opacity-70',
            )}
            onClick={() => onChange(health)}
          >
            <span
              className={cn('size-1.5 rounded-full', PROJECT_HEALTH_DOT_CLASS[health])}
            />
            {PROJECT_HEALTH_LABEL[health]}
          </button>
        )
      })}
    </div>
  )
}
```

In `AddProjectModal`, after color, add `form.AppField name="health"` with `FieldLabel` **Health** wrapping `ProjectHealthPills`, and `form.AppField name="goalDate"` using `field.TextField` `label="Goal date"` `type="date"` (same as task due date).

In `onSubmit`, pass `health: value.health` and `...(value.goalDate ? { goalDate: value.goalDate } : {})`.

- [ ] **Step 4: Run schema tests**

Run: `npm test -- src/lib/forms/create-project.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/forms/create-project.ts src/lib/forms/create-project.test.ts src/components/projects/ProjectHealthPills.tsx src/components/projects/AddProjectModal.tsx
git commit -m "Capture health and goal date when creating a project."
```

---

### Task 6: List cards

**Files:**
- Create: `src/components/projects/ProjectCard.tsx`
- Modify: `src/routes/_authenticated/projects/index.tsx`

**Interfaces:**
- Consumes: `projectProgress`, `goalDateCaption`, `PROJECT_HEALTH_*`, `formatDateKey` from `src/lib/dates.ts`
- Produces: `ProjectCard` — display-only `Link`; no onClick on pills

- [ ] **Step 1: Replace the list card markup**

There is no RTL in this repo. Implement `ProjectCard` and wire the page; rely on Task 4 unit tests plus a manual pass.

Create `src/components/projects/ProjectCard.tsx`:

```typescript
import { Link } from '@tanstack/react-router'
import { Progress } from '~/components/ui/progress'
import { cn } from '~/lib/utils'
import { formatDateKey } from '~/lib/dates'
import {
  PROJECT_HEALTH_DOT_CLASS,
  PROJECT_HEALTH_LABEL,
  PROJECT_HEALTH_PILL_CLASS,
  goalDateCaption,
  type ProjectHealth,
} from '~/lib/project-health'
import { projectProgress } from '~/lib/project-progress'

type ProjectCardProps = {
  project: {
    _id: string
    name: string
    description?: string
    color: string
    health: ProjectHealth
    goalDate?: string
  }
  tasks: Array<{ columnId?: string }>
  columns: Array<{ _id: string; isDone: boolean }>
  today?: string
}

export function ProjectCard({
  project,
  tasks,
  columns,
  today = formatDateKey(),
}: ProjectCardProps) {
  const { leftover, done, percent } = projectProgress(tasks, columns)
  const caption = goalDateCaption(project.goalDate, today)
  const description = project.description?.trim()

  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project._id }}
      className="overflow-hidden rounded-xl border border-border bg-card p-5 shadow-soft transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold',
            PROJECT_HEALTH_PILL_CLASS[project.health],
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              PROJECT_HEALTH_DOT_CLASS[project.health],
            )}
          />
          {PROJECT_HEALTH_LABEL[project.health]}
        </span>
        {caption ? (
          <span
            className={cn(
              'text-xs text-muted-foreground',
              caption.overdue && 'font-semibold text-destructive',
            )}
          >
            {caption.text}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <span
          className="size-3 shrink-0 rounded-[4px]"
          style={{ background: project.color }}
          aria-hidden
        />
        <h3 className="text-base font-semibold">{project.name}</h3>
      </div>
      {description ? (
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      <div className="mb-3 mt-4 text-sm text-muted-foreground">
        {leftover} leftover · {done} done
      </div>
      <Progress value={percent} className="h-1.5" />
    </Link>
  )
}
```

In `src/routes/_authenticated/projects/index.tsx`:

- Keep `api.projects.list` `{ status: 'active' }` and `api.tasks.list`.
- Add `useSuspenseQuery(convexQuery(api.boardColumns.list, {}))` (same query as the project detail page). If `columns` is empty, still render cards (progress will be 0 done / all leftover).
- Map `projects` to `<ProjectCard project={project} tasks={tasks.filter(t => t.projectId === project._id)} columns={columns} />`.
- Remove the left rail, “No description yet.”, and `completedAt` counts.
- Leave the dashed New project tile and header count unchanged.

`project.health` is required after Task 3. If TypeScript still sees it optional until codegen, use `project.health ?? 'onTrack'` only as a temporary narrow — remove it once `_generated` includes required `health`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

Expected: PASS for the touched files (fix `Id<'projects'>` on `params.projectId` if `ProjectCard` needs `Id<'projects'>` instead of `string` — prefer `Id<'projects'>` from `~/convex/_generated/dataModel` if the `Link` params require it)

If `Link` params need `Id`, type `project._id` as `Id<'projects'>`.

- [ ] **Step 3: Manual check**

With `npm run dev` running: open `/projects` with at least two projects (one with description + future goal, one with no description + past goal). Confirm: no left bar, swatch by title, overdue red, empty description omitted, leftover/done not “N tasks”.

- [ ] **Step 4: Commit**

```bash
git add src/components/projects/ProjectCard.tsx src/routes/_authenticated/projects/index.tsx
git commit -m "Show health, goal date, and swatch on project cards."
```

---

### Task 7: Project header health and goal date

**Files:**
- Create: `src/components/projects/ProjectGoalDate.tsx`
- Modify: `src/routes/_authenticated/projects/$projectId.tsx`
- Reuse: `src/components/projects/ProjectHealthPills.tsx`

**Interfaces:**
- Consumes: `api.projects.update` `{ projectId, health }`, `{ projectId, goalDate }` or `{ projectId, goalDate: null }`
- Produces: header controls under the title (beside or above `ProjectDescription`). Immediate save on health click. Goal date `type="date"`; empty value or a Clear control sends `null`.

- [ ] **Step 1: Implement `ProjectGoalDate`**

Create `src/components/projects/ProjectGoalDate.tsx`:

```typescript
import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Field, FieldLabel } from '~/components/ui/field'

const SAVE_ERROR = 'Could not save goal date.'

type ProjectGoalDateProps = {
  projectId: Id<'projects'>
  goalDate?: string
}

export function ProjectGoalDate({ projectId, goalDate }: ProjectGoalDateProps) {
  const updateProject = useMutation(api.projects.update)
  const saved = goalDate ?? ''
  const [value, setValue] = useState(saved)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setValue(saved)
  }, [saved])

  async function save(next: string) {
    const trimmed = next.trim()
    if (trimmed === saved) {
      setError(null)
      return
    }
    setPending(true)
    try {
      await updateProject({
        projectId,
        goalDate: trimmed === '' ? null : trimmed,
      })
      setError(null)
    } catch (caught) {
      const message =
        caught instanceof Error && caught.message === 'Invalid goal date'
          ? caught.message
          : SAVE_ERROR
      setError(message)
      setValue(saved)
    } finally {
      setPending(false)
    }
  }

  return (
    <Field className="mt-3 max-w-xs">
      <FieldLabel htmlFor="project-goal-date">Goal date</FieldLabel>
      <div className="flex gap-2">
        <Input
          id="project-goal-date"
          type="date"
          value={value}
          disabled={pending}
          aria-invalid={error ? true : undefined}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => {
            void save(value)
          }}
        />
        {saved ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setValue('')
              void save('')
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </Field>
  )
}
```

Check that `Input` exists at `src/components/ui/input.tsx`. If the field primitives already wrap `<input type="date">`, `TextField` is acceptable instead of raw `Input` — match `TaskFormFields` if `Input` styling diverges.

- [ ] **Step 2: Wire the header**

In `$projectId.tsx`, under the `h1` (and above or beside `ProjectDescription`):

```tsx
<div className="mt-3 flex flex-col gap-2">
  <ProjectHealthPills
    value={data.project.health ?? 'onTrack'}
    onChange={(health) => {
      void updateProject({ projectId: projectIdTyped, health }).catch(() => {
        setHealthError('Could not save health.')
      })
    }}
  />
  {healthError ? (
    <p className="text-sm text-destructive">{healthError}</p>
  ) : null}
  <ProjectGoalDate
    projectId={projectIdTyped}
    goalDate={data.project.goalDate}
  />
</div>
```

Add `const updateProject = useMutation(api.projects.update)` if the page only has `archiveProject` today (archive already uses `api.projects.update` — reuse that variable, e.g. rename to `updateProject` and keep the archive `status: 'archived'` call). Add `useState` for `healthError`; clear it on successful health change.

Do **not** change the task list / board in this task.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`

Expected: PASS

- [ ] **Step 4: Manual check**

Open a project: change health (pill ring updates, list card updates on back). Set a past goal date → list shows Overdue. Clear goal date → caption disappears. Invalid dates should not be possible via `type="date"`; Clear must unset, not store `""`.

- [ ] **Step 5: Commit**

```bash
git add src/components/projects/ProjectGoalDate.tsx src/routes/_authenticated/projects/\$projectId.tsx
git commit -m "Edit project health and goal date from the header."
```

---

## Spec coverage

| Spec item | Task |
|-----------|------|
| User-set On track / At risk / Off track | 1–2, 5, 7 |
| Default onTrack + backfill | 2, 3 |
| Optional YYYY-MM-DD goal date, overdue client-side | 1, 4, 6 |
| Create modal fields | 5 |
| Header edit; cards display-only | 6, 7 |
| Title swatch, no rail, omit empty description | 6 |
| Leftover/done via Done column | 4, 6 |
| Unset goal date, error copy | 2, 7 |
| No filters / inferred health / Playwright | Global constraints |

## Placeholder / consistency notes

- `ProjectHealth` / `PROJECT_HEALTH` originate in `convex/lib/projectHealth.ts` and are re-exported from `src/lib/project-health.ts`.
- `goalDate: null` on update is the clear signal; create omits the arg.
- `projectProgress` percent uses `Math.round(done / total * 100)`.
- After Task 3, run `migrations:backfillProjectHealth` on the live deployment if any documents predate this change.
