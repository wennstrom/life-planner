# View/Edit Task Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users view and edit an existing task in an always-editable modal opened by clicking the task's title, and delete the task from it.

**Architecture:** A standalone `EditTaskModal` component (native `<dialog>`, mirroring `AddTaskModal`) is pre-filled from a task `Doc` and calls an extended `tasks.update` mutation. `TaskRow`'s title becomes a clickable button; each list page owns a single `editingTask` state and renders one modal instance. `tasks.update` gains `scheduledDate` (which drives `status`) and nullable `priority`/`notes`/`dueDate` so fields can be cleared.

**Tech Stack:** React 19, TanStack Router file routes, Convex (`convex/react` hooks), convex-test + vitest (edge-runtime), plain CSS in `src/styles/planner.css`.

**Spec:** `docs/superpowers/specs/2026-07-02-edit-task-modal-design.md`

---

### Task 1: Extend `tasks.update` (backend)

Add `scheduledDate` (drives `status`) and widen `priority`/`notes`/`dueDate` to nullable so the edit form can clear them. `tasks.update` currently has **no callers** (verified by grep), so widening arg types is safe. TDD: write failing tests first.

**Files:**
- Modify: `convex/tasks.ts` (the `update` mutation, currently lines ~73-103)
- Test: `convex/tasks.test.ts` (append a new `describe` block)
- Reference: `convex/lib/dates.ts` (`formatDateKey`), existing `tasks.create` tests in the same file for conventions

- [ ] **Step 1: Write the failing tests**

Append to `convex/tasks.test.ts` (after the existing `describe("tasks.create", ...)` block, before end of file). Reuse the existing `createAuthedTest` helper already defined at the top of the file — do **not** redefine it.

```typescript
describe("tasks.update", () => {
  it("sets status to today when a scheduled date is set", async () => {
    const { t, asUser } = await createAuthedTest();
    const taskId = await asUser.mutation(api.tasks.create, { title: "Task" });

    await asUser.mutation(api.tasks.update, {
      taskId,
      scheduledDate: "2030-02-01",
    });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.scheduledDate).toBe("2030-02-01");
    expect(task?.status).toBe("today");
  });

  it("sends the task to backlog when the scheduled date is cleared", async () => {
    const { t, asUser } = await createAuthedTest();
    const taskId = await asUser.mutation(api.tasks.create, {
      title: "Scheduled task",
      scheduledDate: "2030-02-01",
    });

    await asUser.mutation(api.tasks.update, {
      taskId,
      scheduledDate: null,
    });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.scheduledDate).toBeUndefined();
    expect(task?.status).toBe("backlog");
  });

  it("stores a numeric priority and clears it with null", async () => {
    const { t, asUser } = await createAuthedTest();
    const taskId = await asUser.mutation(api.tasks.create, { title: "Task" });

    await asUser.mutation(api.tasks.update, { taskId, priority: 3 });
    let task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.priority).toBe(3);

    await asUser.mutation(api.tasks.update, { taskId, priority: null });
    task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.priority).toBeUndefined();
  });

  it("does not touch status when scheduledDate is omitted", async () => {
    const { t, asUser } = await createAuthedTest();
    const taskId = await asUser.mutation(api.tasks.create, {
      title: "Scheduled task",
      scheduledDate: "2030-02-01",
    });

    await asUser.mutation(api.tasks.update, { taskId, title: "Renamed" });

    const task = await t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.title).toBe("Renamed");
    expect(task?.status).toBe("today");
    expect(task?.scheduledDate).toBe("2030-02-01");
  });

  it("rejects updating a task owned by another user", async () => {
    const { t, asUser } = await createAuthedTest();

    const otherUserId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "other@example.com", name: "Other" }),
    );
    const foreignTaskId = await t.run(async (ctx) =>
      ctx.db.insert("tasks", {
        userId: otherUserId,
        title: "Foreign task",
        status: "backlog",
        order: 0,
      }),
    );

    await expect(
      asUser.mutation(api.tasks.update, {
        taskId: foreignTaskId,
        title: "Hijack",
      }),
    ).rejects.toThrow("Task not found");
  });
});
```

- [ ] **Step 2: Run the tests — they must FAIL**

Run: `npx vitest run convex/tasks.test.ts`
Expected: the new `tasks.update` tests fail. The `scheduledDate` arg is not yet accepted (validator error / status not updated), and the `priority: null` case fails because the arg is currently `v.number()` only. The existing `tasks.create` tests still pass.

- [ ] **Step 3: Implement the mutation change**

In `convex/tasks.ts`, replace the entire `update` mutation with:

```typescript
export const update = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    notes: v.optional(v.union(v.string(), v.null())),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    priority: v.optional(v.union(v.number(), v.null())),
    dueDate: v.optional(v.union(v.string(), v.null())),
    scheduledDate: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const { task } = await getOwnedTask(ctx, args.taskId);

    if (args.projectId) {
      const project = await ctx.db.get("projects", args.projectId);
      if (!project || project.userId !== task.userId) {
        throw new Error("Project not found");
      }
    }

    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.notes !== undefined) patch.notes = args.notes ?? undefined;
    if (args.priority !== undefined) patch.priority = args.priority ?? undefined;
    if (args.dueDate !== undefined) patch.dueDate = args.dueDate ?? undefined;
    if (args.projectId !== undefined) {
      patch.projectId = args.projectId ?? undefined;
    }
    if (args.scheduledDate !== undefined) {
      if (args.scheduledDate) {
        patch.scheduledDate = args.scheduledDate;
        patch.status = "today";
      } else {
        patch.scheduledDate = undefined;
        patch.status = "backlog";
      }
    }

    await ctx.db.patch("tasks", args.taskId, patch);
  },
});
```

- [ ] **Step 4: Run the tests — they must PASS**

Run: `npx vitest run convex/tasks.test.ts`
Expected: all tests pass (existing `tasks.create` + new `tasks.update`).

- [ ] **Step 5: Commit**

```bash
git add convex/tasks.ts convex/tasks.test.ts
git commit -m "feat: extend tasks.update with scheduled date and nullable fields"
```

---

### Task 2: `EditTaskModal` component

A standalone modal mirroring `AddTaskModal`, pre-filled from a task and calling `tasks.update` / `tasks.remove`, with inline delete confirmation.

**Files:**
- Create: `src/components/tasks/EditTaskModal.tsx`
- Modify: `src/styles/planner.css` (append to the Modal section, after line ~579)
- Reference: `src/components/tasks/AddTaskModal.tsx` (structure/patterns to mirror)

- [ ] **Step 1: Create the component**

Create `src/components/tasks/EditTaskModal.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

import type { FormEvent } from 'react'
import type { Doc, Id } from '../../../convex/_generated/dataModel'

type EditTaskModalProps = {
  task: Doc<'tasks'> | null
  onClose: () => void
}

export function EditTaskModal({ task, onClose }: EditTaskModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  // Non-suspense useQuery: this component is always mounted at page level, so
  // it must not suspend the page while projects load.
  const projects = useQuery(api.projects.list, { status: 'active' })
  const updateTask = useMutation(api.tasks.update)
  const removeTask = useMutation(api.tasks.remove)

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [projectId, setProjectId] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (task && !dialog.open) {
      setTitle(task.title)
      setNotes(task.notes ?? '')
      setProjectId(task.projectId ?? '')
      setScheduledDate(task.scheduledDate ?? '')
      setDueDate(task.dueDate ?? '')
      setPriority(task.priority != null ? String(task.priority) : '')
      setError(null)
      setPending(false)
      setConfirmingDelete(false)
      dialog.showModal()
    } else if (!task && dialog.open) {
      dialog.close()
    }
  }, [task])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!task) return
    const trimmedTitle = title.trim()
    if (!trimmedTitle || pending) return

    setPending(true)
    setError(null)
    try {
      await updateTask({
        taskId: task._id,
        title: trimmedTitle,
        notes: notes.trim() || null,
        projectId: projectId ? (projectId as Id<'projects'>) : null,
        scheduledDate: scheduledDate || null,
        dueDate: dueDate || null,
        priority: priority ? Number(priority) : null,
      })
      onClose()
    } catch {
      setError('Could not save the task. Please try again.')
    } finally {
      setPending(false)
    }
  }

  const handleDelete = async () => {
    if (!task || pending) return
    setPending(true)
    setError(null)
    try {
      await removeTask({ taskId: task._id })
      onClose()
    } catch {
      setError('Could not delete the task. Please try again.')
      setPending(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 className="modal-title">Edit task</h2>
        <label className="field">
          <span>Title</span>
          <input
            required
            autoFocus
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
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
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
        <label className="field">
          <span>Due date</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Priority</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">None</option>
            <option value="1">Low</option>
            <option value="2">Medium</option>
            <option value="3">High</option>
          </select>
        </label>
        {error ? <p className="modal-error">{error}</p> : null}
        <div className="modal-footer">
          {confirmingDelete ? (
            <div className="delete-confirm">
              <span>Delete this task?</span>
              <button
                type="button"
                className="btn danger"
                onClick={handleDelete}
                disabled={pending}
              >
                Delete
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setConfirmingDelete(false)}
              >
                Keep
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn danger"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </button>
          )}
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={pending}>
              Save changes
            </button>
          </div>
        </div>
      </form>
    </dialog>
  )
}
```

Notes for the implementer:
- `projectId`, `scheduledDate`, `dueDate`, `priority` are sent as `null` (not `undefined`) when empty so `tasks.update` clears them. Empty string `scheduledDate` becomes `null`, which routes the task to the backlog.
- `task.priority` is a number; `!= null` guards both `null` and `undefined` before stringifying for the `<select>` value.

- [ ] **Step 2: Add the styles**

Append to `src/styles/planner.css` at the end of the Modal section (immediately after the existing `.modal-actions { ... }` rule, ~line 579):

```css
.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}
.btn.danger {
  background: transparent;
  color: #ef4444;
  border-color: transparent;
}
.btn.danger:hover {
  background: color-mix(in srgb, #ef4444 12%, transparent);
}
.delete-confirm {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-muted);
}
```

Note: `.modal-actions` already exists (`display: flex; justify-content: flex-end; gap: 10px`) and is reused inside `.modal-footer` for the Cancel/Save group — do not redefine it.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (The component is not yet imported anywhere; this only checks the component itself compiles.)

- [ ] **Step 4: Commit**

```bash
git add src/components/tasks/EditTaskModal.tsx src/styles/planner.css
git commit -m "feat: add EditTaskModal component"
```

---

### Task 3: Make the task title open the modal (`TaskRow`)

Add an optional `onOpenDetails` callback; render the title as a text button when provided, so only the title opens the modal while the checkbox and mini-buttons keep their own behavior.

**Files:**
- Modify: `src/components/tasks/TaskRow.tsx`
- Modify: `src/styles/planner.css` (the `.task-title` area, ~line 250)

- [ ] **Step 1: Update `TaskRow`**

In `src/components/tasks/TaskRow.tsx`, add `onOpenDetails` to the props type:

```typescript
type TaskRowProps = {
  task: Doc<'tasks'> & { project?: Doc<'projects'> | null }
  onToggle?: () => void
  onSendToToday?: () => void
  onRemoveFromToday?: () => void
  onOpenDetails?: () => void
  showProjectTag?: boolean
}
```

Add it to the destructured params:

```typescript
export function TaskRow({
  task,
  onToggle,
  onSendToToday,
  onRemoveFromToday,
  onOpenDetails,
  showProjectTag = true,
}: TaskRowProps) {
```

Replace the title line:

```typescript
      <span className="task-title">{task.title}</span>
```

with:

```typescript
      {onOpenDetails ? (
        <button type="button" className="task-title" onClick={onOpenDetails}>
          {task.title}
        </button>
      ) : (
        <span className="task-title">{task.title}</span>
      )}
```

- [ ] **Step 2: Add button-reset styling**

In `src/styles/planner.css`, immediately after the existing rule
`.task-title { flex: 1; font-size: 14.5px; }` (~line 250), add:

```css
button.task-title {
  font: inherit;
  font-size: 14.5px;
  text-align: left;
  background: none;
  border: none;
  padding: 0;
  color: inherit;
  cursor: pointer;
}
button.task-title:hover { text-decoration: underline; }
```

The existing `.task.done .task-title` line-through rule already targets the class, so it still applies to the button variant.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/tasks/TaskRow.tsx src/styles/planner.css
git commit -m "feat: make task title open a details modal"
```

---

### Task 4: Wire the modal into the three list pages

Each page tracks the task being edited and renders one `EditTaskModal`.

**Files:**
- Modify: `src/routes/_authenticated/today.tsx`
- Modify: `src/routes/_authenticated/backlog.tsx`
- Modify: `src/routes/_authenticated/projects/$projectId.tsx`

- [ ] **Step 1: Wire Today (`today.tsx`)**

Add the import near the other component imports:

```typescript
import { EditTaskModal } from '~/components/tasks/EditTaskModal'
```

Add the type import (top of file, with existing imports):

```typescript
import type { Doc } from '../../../convex/_generated/dataModel'
```

Add state next to the existing `const [addOpen, setAddOpen] = useState(false)`:

```typescript
  const [editingTask, setEditingTask] = useState<Doc<'tasks'> | null>(null)
```

Pass `onOpenDetails` to the `TaskRow` in the Today list (the one rendering `data.tasks`):

```typescript
              <TaskRow
                key={task._id}
                task={task}
                onOpenDetails={() => setEditingTask(task)}
                onToggle={() =>
                  void completeTask({ taskId: task._id, done: task.status !== 'done' })
                }
                onRemoveFromToday={() => void removeFromToday({ taskId: task._id })}
              />
```

Add the modal next to the existing `<AddTaskModal ... />`:

```typescript
      <EditTaskModal task={editingTask} onClose={() => setEditingTask(null)} />
```

- [ ] **Step 2: Wire Backlog (`backlog.tsx`)**

Add the import:

```typescript
import { EditTaskModal } from '~/components/tasks/EditTaskModal'
```

`Doc` is not yet imported here — add it to the existing type import line
(`import type { Id } from '../../../convex/_generated/dataModel'`) so it reads:

```typescript
import type { Doc, Id } from '../../../convex/_generated/dataModel'
```

Add state next to `const [addOpen, setAddOpen] = useState(false)`:

```typescript
  const [editingTask, setEditingTask] = useState<Doc<'tasks'> | null>(null)
```

Pass `onOpenDetails` to the `TaskRow` inside the group loop. Note the row is
given `task={{ ...task, project: null }}` for display, but the modal needs the
raw task — pass the original `task`:

```typescript
                <TaskRow
                  key={task._id}
                  task={{ ...task, project: null }}
                  showProjectTag={false}
                  onOpenDetails={() => setEditingTask(task)}
                  onToggle={() =>
                    void completeTask({ taskId: task._id, done: task.status === 'done' ? false : true })
                  }
                  onSendToToday={() => void sendToToday({ taskId: task._id })}
                />
```

Add the modal next to the existing `<AddTaskModal ... />`:

```typescript
      <EditTaskModal task={editingTask} onClose={() => setEditingTask(null)} />
```

- [ ] **Step 3: Wire Project detail (`projects/$projectId.tsx`)**

Add the import:

```typescript
import { EditTaskModal } from '~/components/tasks/EditTaskModal'
```

`Doc` is not yet imported — add it to the existing type import line
(`import type { Id } from '../../../../convex/_generated/dataModel'`) so it reads:

```typescript
import type { Doc, Id } from '../../../../convex/_generated/dataModel'
```

Add state next to `const [addOpen, setAddOpen] = useState(false)`:

```typescript
  const [editingTask, setEditingTask] = useState<Doc<'tasks'> | null>(null)
```

Pass `onOpenDetails` to the `TaskRow`. As with backlog, the row is decorated
with `project: data.project` for display, but pass the raw `task` to the modal:

```typescript
              <TaskRow
                key={task._id}
                task={{ ...task, project: data.project }}
                onOpenDetails={() => setEditingTask(task)}
                onToggle={() =>
                  void completeTask({ taskId: task._id, done: task.status !== 'done' })
                }
              />
```

Add the modal next to the existing `<AddTaskModal ... />`:

```typescript
      <EditTaskModal task={editingTask} onClose={() => setEditingTask(null)} />
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. If a page's task element type is a superset of `Doc<'tasks'>` (Today decorates tasks with `project`), assignment to `Doc<'tasks'>` still compiles because the value is not a fresh object literal.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: passes (`tsc` + eslint, `--max-warnings 0`).

- [ ] **Step 6: Commit**

```bash
git add src/routes/_authenticated/today.tsx src/routes/_authenticated/backlog.tsx src/routes/_authenticated/projects/$projectId.tsx
git commit -m "feat: open EditTaskModal from task rows on all list pages"
```

---

### Task 5: Manual verification

No React test infrastructure exists in this project (same precedent as the add-task modal spec), so the UI is verified manually.

**Files:** none (verification only)

- [ ] **Step 1: Run the dev server and full test suite**

Run: `npm test`
Expected: all tests pass, including the new `tasks.update` tests.

Run: `npm run dev` and open the app.

- [ ] **Step 2: Walk through the checklist**

On Today, Backlog, and a Project detail page:
- Click a task's **title** → the Edit modal opens pre-filled with that task's values (title, notes, project, scheduled date, due date, priority).
- Clicking the **checkbox** or a **mini-button** (→ Today / Remove) does **not** open the modal.
- Edit the title and Save → the row reflects the new title.
- Set a **Scheduled date** and Save from Backlog → the task leaves the backlog (moves to Today). Clear the scheduled date on a Today task and Save → it drops to the backlog.
- Change **Priority** to High, reopen → shows High; set back to None, reopen → shows None.
- Clear **Notes** / **Due date** and Save, reopen → they are empty.
- Press **Esc** and click **Cancel** → modal closes with no change.
- Click **Delete** → inline "Delete this task?" appears; **Keep** dismisses it; **Delete** removes the task and closes the modal.

- [ ] **Step 3 (optional): tidy commit if any fixes were needed**

If manual testing surfaced a fix, commit it:

```bash
git add -A
git commit -m "fix: address edit-task modal issues found in manual QA"
```
