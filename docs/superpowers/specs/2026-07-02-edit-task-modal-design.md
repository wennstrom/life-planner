# View/Edit Task Modal — Design

**Date:** 2026-07-02
**Status:** Approved

## Purpose

Give users a way to view and edit an existing task. Today tasks can only be
created (`AddTaskModal`), toggled done, and moved between Today/Backlog via row
buttons — there is no way to change a task's title, notes, project, dates, or
priority after creation. This adds a single always-editable modal, opened by
clicking a task's title, that exposes the full editable field set and can delete
the task.

## Approach

A standalone `EditTaskModal` component (Approach A), mirroring the existing
`AddTaskModal`'s structure and reusing its modal styling. It is pre-filled from
a task and calls `tasks.update`.

A unified `TaskModal` with a `mode: 'create' | 'edit'` prop (Approach B) was
rejected: the two modals diverge enough (different mutations, edit has two extra
fields plus delete, `create`'s `scheduledDate` is a hidden pass-through while
edit's is a visible control) that a shared component adds more branching than it
removes, and it would put the working Add flow at risk. Extracting a shared
`TaskFormFields` presentational component (Approach C) was rejected as premature
indirection while the field sets don't match; it remains an easy refactor later
if the two converge.

The modal is "always-editable": opening a task shows all fields as pre-filled
editable inputs. There is no separate read-only view — viewing is seeing the
filled-in form.

## Backend: `tasks.update` (`convex/tasks.ts`)

Extend the existing `update` mutation with two args, following the nullable
pattern already used for `projectId`:

- `scheduledDate: v.optional(v.union(v.string(), v.null()))` — when provided, it
  also **drives status**, mirroring `create`/`sendToToday`/`removeFromToday`:
  - non-null date string → `patch.scheduledDate = date`, `patch.status = "today"`
  - `null` → `patch.scheduledDate = undefined`, `patch.status = "backlog"`
- `priority: v.optional(v.union(v.number(), v.null()))` — widen the current
  `number`-only arg so "None" can clear the field:
  `patch.priority = args.priority ?? undefined`.

`title`, `notes`, `projectId`, `dueDate` keep their existing behavior. Status is
only touched when `scheduledDate` is passed, so any caller that omits it is
unaffected. Project ownership validation is unchanged.

**Defined edge case:** rescheduling (or clearing the date on) a task that was
`done` moves it back to `today`/`backlog`. The row checkbox remains the way to
mark a task done/undone; the edit modal does not expose a done control.

## Component: `src/components/tasks/EditTaskModal.tsx`

Standalone, built on the native `<dialog>` element like `AddTaskModal`.

```typescript
type EditTaskModalProps = {
  task: Doc<'tasks'> | null   // task being edited; null when closed
  onClose: () => void
}
```

Behavior:

- Open state is derived from `task !== null`. A `useEffect` calls
  `dialog.showModal()` / `dialog.close()` as that changes; the dialog's `close`
  event (covers Esc) calls `onClose` so page state stays in sync.
- Form state (title, notes, projectId, dueDate, scheduledDate, priority) lives
  in the component and re-initializes from `task` each time the modal opens, so
  every open reflects the current task.
- Active projects are fetched with the non-suspense
  `useQuery(api.projects.list, { status: 'active' })` from `convex/react`
  (same rationale as `AddTaskModal`: the modal is mounted at page level and must
  not suspend the page). While loading, the select renders only the current
  project / "No project" options.
- Fields:
  - **Title** — text input, required, autofocused when the modal opens.
  - **Notes** — textarea, optional.
  - **Project** — select with a "No project" option.
  - **Scheduled date** — native `<input type="date">`, optional. Drives status
    on save (see Backend).
  - **Due date** — native `<input type="date">`, optional.
  - **Priority** — select: None / Low / Medium / High, mapped to
    `undefined` / `1` / `2` / `3`.
- **Save changes** — `btn primary`. Trims title; ignores submit when empty.
  Calls `tasks.update` with the current field values (`notes` sent as
  `undefined` when blank, `projectId`/`scheduledDate` sent as `null` when
  cleared, `priority` as `null` for None). Disabled while the mutation is
  pending. On success, closes the modal; on error, an inline `.modal-error`
  message is shown and the modal stays open with form state preserved.
- **Cancel** — `btn ghost`, discards and closes. Esc behaves the same.
- **Delete** — destructive button in the footer's left side. First click reveals
  an inline confirm ("Delete this task?" with confirm/cancel actions — no
  `window.confirm`). Confirming calls `tasks.remove` and closes the modal.

## Row wiring: `TaskRow` + pages

- `TaskRow` (`src/components/tasks/TaskRow.tsx`) gains an optional
  `onOpenDetails?: () => void`. The title becomes a text-styled
  `<button className="task-title">` that calls it. The checkbox and mini action
  buttons keep their own handlers, so only the title opens the modal.
- Each page that lists tasks holds `editingTask` state, passes
  `onOpenDetails={() => setEditingTask(task)}` to each row, and renders a single
  `EditTaskModal task={editingTask} onClose={() => setEditingTask(null)}`. One
  dialog and one projects query per page, never per row.

| Page | Task source |
|------|-------------|
| Today (`today.tsx`) | `data.tasks` |
| Backlog (`backlog.tsx`) | `group.tasks` (raw task doc; the `project: null` decoration is only for `TaskRow` display) |
| Project detail (`projects/$projectId.tsx`) | `data.tasks` |

The `EditTaskModal` reads `task.projectId` for its Project select; it does not
need the decorated `project` object the pages pass to `TaskRow` for display.

## Styling (`src/styles/planner.css`)

Reuse the existing Modal section (`.modal`, `.field`, `.modal-title`,
`.modal-error`, `.modal-actions`). Add:

- `.task-title` as a clickable text button: unset default button chrome, inherit
  font/color, pointer cursor, hover underline. Must not disturb the existing
  row/`.done` strikethrough styling.
- A destructive button variant (`.btn.danger`) for Delete.
- A small inline delete-confirm row in the modal footer.

## Error handling

- Empty title: submit ignored (button does nothing until title is non-empty
  after trimming).
- Mutation failure (network, project ownership): inline error text inside the
  modal; modal stays open, form state preserved.
- Delete failure: same inline error treatment; modal stays open.

## Testing

Extend the existing `convex/tasks.test.ts` (uses `convex-test`) to cover the new
`update` behavior:

- setting `scheduledDate` to a date sets status `today`;
- clearing `scheduledDate` (`null`) sets status `backlog`;
- setting `priority` to a number persists it; `null` clears it;
- updating a task owned by another user throws.

No frontend component test: the project has no React test infrastructure and
adding it is out of scope (same precedent as the add-task modal spec). The modal
is verified manually in dev: open from a row on each page, edit each field, save,
Cancel/Esc, scheduled-date-drives-status, priority round-trip, delete with
confirm, and pending/error states.

## Out of scope

- A read-only view mode / view-then-edit toggle (the modal is always editable).
- Editing done state from the modal (row checkbox owns done/undone).
- Reordering, or a global "edit task" shortcut.
- Any change to `AddTaskModal` (left untouched per Approach A).
