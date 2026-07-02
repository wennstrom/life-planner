# Add-Task Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three inconsistent task-creation entry points (inline inputs on Today and Backlog, `window.prompt` on Project detail) with one shared `AddTaskModal` component.

**Architecture:** A self-contained modal component built on the native `<dialog>` element owns its form state and calls `api.tasks.create` directly. Each page renders it with an `open` boolean and context-specific defaults. One behavior-identical cleanup in the `tasks.create` mutation, pinned by new characterization tests first.

**Tech Stack:** React 19, TanStack Router file routes, Convex (`convex/react` hooks), convex-test + vitest (edge-runtime), plain CSS in `src/styles/planner.css`.

**Spec:** `docs/superpowers/specs/2026-07-02-add-task-modal-design.md`

---

### Task 1: Characterization tests for `tasks.create`

The status-derivation code in `tasks.create` is about to be simplified (Task 2). These tests pin its current behavior first, so they must PASS immediately — they are characterization tests, not red-first TDD tests.

**Files:**
- Create: `convex/tasks.test.ts`
- Reference: `convex/sync.test.ts` (existing test conventions), `convex/lib/dates.ts` (`formatDateKey`)

- [ ] **Step 1: Write the tests**

Create `convex/tasks.test.ts`:

```typescript
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./test.setup";
import { formatDateKey } from "./lib/dates";

async function createAuthedTest() {
  const t = convexTest(schema, modules);
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", { email: "test@example.com", name: "Test User" }),
  );
  const asUser = t.withIdentity({ subject: userId });
  return { t, asUser, userId };
}

describe("tasks.create", () => {
  it("creates a backlog task when no scheduled date is given", async () => {
    const { t, asUser } = await createAuthedTest();

    const taskId = await asUser.mutation(api.tasks.create, {
      title: "Write spec",
    });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.status).toBe("backlog");
    expect(task?.scheduledDate).toBeUndefined();
  });

  it("creates a today task when scheduled for today", async () => {
    const { t, asUser } = await createAuthedTest();
    const today = formatDateKey();

    const taskId = await asUser.mutation(api.tasks.create, {
      title: "Review PR",
      scheduledDate: today,
    });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.status).toBe("today");
    expect(task?.scheduledDate).toBe(today);
  });

  it("creates a today task when scheduled for a future date", async () => {
    const { t, asUser } = await createAuthedTest();

    const taskId = await asUser.mutation(api.tasks.create, {
      title: "Plan trip",
      scheduledDate: "2030-01-15",
    });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.status).toBe("today");
    expect(task?.scheduledDate).toBe("2030-01-15");
  });

  it("rejects a project owned by another user", async () => {
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
      asUser.mutation(api.tasks.create, {
        title: "Nope",
        projectId: foreignProjectId,
      }),
    ).rejects.toThrow("Project not found");
  });
});
```

Notes for the implementer:
- `modules` comes from `convex/test.setup.ts` (an `import.meta.glob` map) — required by `convexTest`.
- `t.withIdentity({ subject: userId })` matches how `requireUserId` resolves the user (see `convex/sync.test.ts` for the same pattern).
- Inside `t.run`, use single-argument `ctx.db.get(id)` — this matches the existing convention in `convex/sync.test.ts`.

- [ ] **Step 2: Run the tests — they must PASS (characterization of current behavior)**

Run: `npx vitest run convex/tasks.test.ts`
Expected: 4 passed. If any fail, the assumptions about current behavior are wrong — stop and re-read `convex/tasks.ts` before proceeding.

- [ ] **Step 3: Commit**

```bash
git add convex/tasks.test.ts
git commit -m "test: pin tasks.create status derivation and project ownership"
```

---

### Task 2: Simplify status derivation in `tasks.create`

**Files:**
- Modify: `convex/tasks.ts:50-72` (the `create` mutation handler)
- Test: `convex/tasks.test.ts` (from Task 1, unchanged)

- [ ] **Step 1: Replace the redundant ternary**

In `convex/tasks.ts`, the `create` handler currently reads:

```typescript
    const existing = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const today = formatDateKey();
    const status =
      args.scheduledDate === today
        ? ("today" as const)
        : args.scheduledDate
          ? ("today" as const)
          : ("backlog" as const);

    return await ctx.db.insert("tasks", {
      userId,
      title: args.title,
      notes: args.notes,
      projectId: args.projectId,
      status,
      scheduledDate: args.scheduledDate,
      order: existing.length,
    });
```

Both scheduled branches yield `"today"`, so replace the `const today = ...` and `const status = ...` lines with:

```typescript
    const status = args.scheduledDate
      ? ("today" as const)
      : ("backlog" as const);
```

Do NOT remove the `import { formatDateKey } from "./lib/dates";` at the top of the file — `sendToToday` (around line 126) still uses it.

- [ ] **Step 2: Run the tests to verify behavior is unchanged**

Run: `npx vitest run convex/tasks.test.ts`
Expected: 4 passed.

- [ ] **Step 3: Commit**

```bash
git add convex/tasks.ts
git commit -m "refactor: collapse redundant status ternary in tasks.create"
```

---

### Task 3: Modal styles

**Files:**
- Modify: `src/styles/planner.css` (append a new section before the `/* ---------- Responsive ---------- */` block)

- [ ] **Step 1: Add the modal CSS**

Insert into `src/styles/planner.css`, using the existing design tokens (`--surface`, `--border`, `--radius`, `--shadow`):

```css
/* ---------- Modal ---------- */
dialog.modal {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow);
  color: var(--text);
  padding: 24px;
  width: min(440px, calc(100vw - 32px));
}
dialog.modal::backdrop {
  background: rgba(16, 24, 40, 0.4);
}
.modal-title {
  margin: 0 0 18px;
  font-size: 18px;
  font-weight: 700;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}
.field > span {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
}
.field input,
.field select,
.field textarea {
  font: inherit;
  font-size: 14px;
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 9px 12px;
  background: var(--surface);
  color: var(--text);
}
.field textarea {
  resize: vertical;
}
.modal-error {
  margin: 0 0 12px;
  font-size: 13px;
  color: #ef4444;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 6px;
}
```

The input styling deliberately mirrors the existing `.search` class (border, radius 9px, padding 9px 12px) so form controls look consistent app-wide.

- [ ] **Step 2: Commit**

```bash
git add src/styles/planner.css
git commit -m "style: add modal and form field styles"
```

---

### Task 4: `AddTaskModal` component

**Files:**
- Create: `src/components/tasks/AddTaskModal.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

import type { FormEvent } from 'react'
import type { Id } from '../../../convex/_generated/dataModel'

type AddTaskModalProps = {
  open: boolean
  onClose: () => void
  defaultProjectId?: Id<'projects'>
  lockProject?: boolean
  defaultScheduledDate?: string
}

export function AddTaskModal({
  open,
  onClose,
  defaultProjectId,
  lockProject = false,
  defaultScheduledDate,
}: AddTaskModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  // Non-suspense useQuery: this component is always mounted, so it must not
  // suspend the page while projects load.
  const projects = useQuery(api.projects.list, { status: 'active' })
  const createTask = useMutation(api.tasks.create)

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [projectId, setProjectId] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setTitle('')
      setNotes('')
      setProjectId(defaultProjectId ?? '')
      setScheduledDate(defaultScheduledDate ?? '')
      setError(null)
      setPending(false)
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open, defaultProjectId, defaultScheduledDate])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedTitle = title.trim()
    if (!trimmedTitle || pending) return

    setPending(true)
    setError(null)
    try {
      await createTask({
        title: trimmedTitle,
        notes: notes.trim() || undefined,
        projectId: projectId ? (projectId as Id<'projects'>) : undefined,
        scheduledDate: scheduledDate || undefined,
      })
      onClose()
    } catch {
      setError('Could not create the task. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 className="modal-title">New task</h2>
        <label className="field">
          <span>Title</span>
          <input
            required
            placeholder="What needs doing?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Notes</span>
          <textarea
            rows={3}
            placeholder="Optional details"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Project</span>
          <select
            value={projectId}
            disabled={lockProject}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">No project</option>
            {(projects ?? []).map((project) => (
              <option key={project._id} value={project._id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Scheduled date</span>
          <input
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
          />
        </label>
        {error ? <p className="modal-error">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={pending}>
            Add task
          </button>
        </div>
      </form>
    </dialog>
  )
}
```

Behavior notes for the implementer:
- `dialog.showModal()` automatically focuses the first focusable element — the title input — so no `autoFocus` prop is needed (React's `autoFocus` only fires on mount, and this dialog is mounted before it opens).
- The `onClose` prop on `<dialog>` handles the native `close` event, which also fires on Esc. When the effect closes the dialog programmatically, the resulting `onClose` call is idempotent (the page just sets `open` to `false` again).
- Form state is reset inside the effect each time the dialog transitions to open, so every open starts fresh from the defaults.
- Empty title: the `required` attribute blocks native form submission, and the `trim()` guard catches whitespace-only titles.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (The component is not yet imported anywhere; that's fine.)

- [ ] **Step 3: Commit**

```bash
git add src/components/tasks/AddTaskModal.tsx
git commit -m "feat: add shared AddTaskModal component"
```

---

### Task 5: Wire the Today page

**Files:**
- Modify: `src/routes/_authenticated/today.tsx`

- [ ] **Step 1: Replace the inline quick-add form with the modal**

In `src/routes/_authenticated/today.tsx`:

1. Add the import:

```tsx
import { AddTaskModal } from '~/components/tasks/AddTaskModal'
```

2. Remove the `createTask` mutation hook (`const createTask = useMutation(api.tasks.create)`) and the `newTitle` state (`const [newTitle, setNewTitle] = useState('')`) — the modal owns creation now.

3. Add modal open state where the other `useState` calls are:

```tsx
const [addOpen, setAddOpen] = useState(false)
```

4. Replace the entire `<div className="view-actions">...</div>` block (the one wrapping the inline `<form>`) with:

```tsx
<div className="view-actions">
  <button type="button" className="btn primary" onClick={() => setAddOpen(true)}>
    + Add task
  </button>
</div>
```

5. Render the modal at the end of the component, just before the closing `</section>` tag:

```tsx
<AddTaskModal
  open={addOpen}
  onClose={() => setAddOpen(false)}
  defaultScheduledDate={data.dateKey}
/>
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (in particular, no unused-variable errors from the removed hook/state).

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated/today.tsx
git commit -m "feat: open add-task modal from Today page"
```

---

### Task 6: Wire the Backlog page

**Files:**
- Modify: `src/routes/_authenticated/backlog.tsx`

- [ ] **Step 1: Replace the inline quick-add form with the modal**

In `src/routes/_authenticated/backlog.tsx`:

1. Add imports:

```tsx
import { AddTaskModal } from '~/components/tasks/AddTaskModal'

import type { Id } from '../../../convex/_generated/dataModel'
```

2. Remove the `createTask` mutation hook and the `newTitle` state.

3. Retype the filter state so project ids are properly typed (this removes the need for the existing `as any` cast, which disappears along with the form):

```tsx
const [filter, setFilter] = useState<Id<'projects'> | 'all' | 'none'>('all')
```

4. Add modal open state and the derived default project:

```tsx
const [addOpen, setAddOpen] = useState(false)
const defaultProjectId =
  filter !== 'all' && filter !== 'none' ? filter : undefined
```

5. Replace the entire `<form className="view-actions">...</form>` block in the header with:

```tsx
<div className="view-actions">
  <button type="button" className="btn primary" onClick={() => setAddOpen(true)}>
    + Add task
  </button>
</div>
```

6. Render the modal just before the closing `</section>` tag:

```tsx
<AddTaskModal
  open={addOpen}
  onClose={() => setAddOpen(false)}
  defaultProjectId={defaultProjectId}
/>
```

The `filteredGroups` memo and the filter chips (`setFilter(project._id)`) keep working unchanged with the narrowed state type.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated/backlog.tsx
git commit -m "feat: open add-task modal from Backlog page with filter prefill"
```

---

### Task 7: Wire the Project detail page

**Files:**
- Modify: `src/routes/_authenticated/projects/$projectId.tsx`

- [ ] **Step 1: Replace `window.prompt` with the modal**

In `src/routes/_authenticated/projects/$projectId.tsx`:

1. Add imports:

```tsx
import { useState } from 'react'
import { AddTaskModal } from '~/components/tasks/AddTaskModal'
```

2. Remove the `createTask` mutation hook.

3. Add modal open state:

```tsx
const [addOpen, setAddOpen] = useState(false)
```

4. Replace the `+ Add task` button (the one with the `window.prompt` onClick) with:

```tsx
<button type="button" className="btn primary" onClick={() => setAddOpen(true)}>
  + Add task
</button>
```

5. Render the modal just before the closing `</section>` tag, with the project locked:

```tsx
<AddTaskModal
  open={addOpen}
  onClose={() => setAddOpen(false)}
  defaultProjectId={projectIdTyped}
  lockProject
/>
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authenticated/projects/\$projectId.tsx
git commit -m "feat: open add-task modal from project detail page"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (both `convex/sync.test.ts` and `convex/tasks.test.ts`).

- [ ] **Step 2: Run lint + typecheck**

Run: `npm run lint`
Expected: exits 0 with no errors or warnings (`--max-warnings 0` is set).

- [ ] **Step 3: Manual verification in dev**

Run: `npm run dev`, sign in, then verify:

1. **Today**: `+ Add task` opens the modal with the scheduled date prefilled to today; creating a task makes it appear in Today's list.
2. **Backlog, "All" filter**: modal opens with "No project"; created task lands in the backlog groups.
3. **Backlog, project chip selected**: modal opens with that project preselected.
4. **Project detail**: modal opens with the project preselected and the select disabled; created task appears in the project's task list.
5. Esc and Cancel both close the modal without creating anything; reopening shows a fresh form.
6. Title field is focused on open; submitting with an empty/whitespace title does nothing.

- [ ] **Step 4: Fix anything found, then final commit if fixes were needed**

If manual verification surfaces fixes, commit them with a descriptive message, e.g.:

```bash
git add -A -- src convex
git commit -m "fix: <description of what manual verification caught>"
```
