# Add-Task Modal — Design

**Date:** 2026-07-02
**Status:** Approved

## Purpose

Replace the three inconsistent task-creation entry points (inline quick-add
inputs on Today and Backlog, `window.prompt` on Project detail) with one
shared modal that exposes the full set of fields `tasks.create` accepts:
title, notes, project, and scheduled date.

## Approach

A single self-contained `AddTaskModal` component rendered by each page
(Approach A). No global provider or route-based modal state; each page owns
an `open` boolean and passes context-specific defaults. A global provider
(Approach B) was considered and rejected as unneeded indirection for three
page-level buttons; it remains an easy refactor if a global "new task"
shortcut is ever wanted. A route/search-param-driven modal (Approach C) was
rejected as machinery a quick-entry form does not need.

## Component: `src/components/tasks/AddTaskModal.tsx`

Built on the native `<dialog>` element for built-in focus trapping,
Esc-to-close, and backdrop rendering.

```typescript
type AddTaskModalProps = {
  open: boolean
  onClose: () => void
  defaultProjectId?: Id<'projects'>
  lockProject?: boolean         // project select shown but disabled
  defaultScheduledDate?: string // YYYY-MM-DD, matches formatDateKey output
}
```

Behavior:

- A `useEffect` calls `dialog.showModal()` / `dialog.close()` as `open`
  changes. The dialog's `close` event (covers Esc) calls `onClose` so page
  state stays in sync.
- Form state (title, notes, projectId, scheduledDate) lives in the
  component and is re-initialized from the defaults each time the modal
  opens, so every open starts fresh.
- Active projects are fetched inside the component with the non-suspense
  `useQuery(api.projects.list, { status: 'active' })` from `convex/react`.
  Non-suspense is required because the modal is always mounted; the page
  must not suspend on its behalf. While loading, the select renders only
  the "No project" option.
- Fields:
  - **Title** — text input, required, autofocused when the modal opens.
  - **Notes** — textarea, optional.
  - **Project** — select with "No project" option; disabled when
    `lockProject` is set.
  - **Scheduled date** — native `<input type="date">`, optional.
- Submit: trim title; ignore submission if empty. Call `api.tasks.create`
  with `notes` sent as `undefined` when blank. On success, close the modal.
  The submit button is disabled while the mutation is pending; on error, an
  inline error message is shown and the modal stays open.

## Page wiring

Each page replaces its current creation UI with a `+ Add task` button
(`btn primary`) that opens the modal:

| Page | Removed | Modal defaults |
|------|---------|----------------|
| Today (`today.tsx`) | inline title form | `defaultScheduledDate={data.dateKey}` |
| Backlog (`backlog.tsx`) | inline title form | `defaultProjectId` from active project filter (typed `Id<'projects'>`, removing the existing `as any` cast) |
| Project detail (`projects/$projectId.tsx`) | `window.prompt` handler | `defaultProjectId={projectIdTyped}` + `lockProject` |

## Backend

No API changes. One behavior-identical cleanup in `tasks.create`
(`convex/tasks.ts`): the status derivation is a redundant ternary whose
"scheduled today" and "scheduled other date" branches both yield
`"today"`; collapse it to:

```typescript
const status = args.scheduledDate ? ("today" as const) : ("backlog" as const)
```

The now-unused `formatDateKey()` call for `today` in `create` is removed if
nothing else in the function uses it.

## Styling

New "Modal" section in `src/styles/planner.css`, using existing tokens:

- `dialog.modal` — `--surface` background, `--border`, `--radius`,
  `--shadow`, fixed max-width (~440px).
- `dialog.modal::backdrop` — dimmed overlay (e.g. `rgba(16, 24, 40, .4)`).
- `.field` — stacked label + control pattern; inputs/selects/textarea reuse
  the visual style of the existing `.search` input (border, radius,
  padding, font).
- Footer row with existing `.btn primary` (submit) and `.btn ghost`
  (cancel).

## Error handling

- Empty title: submission ignored (button click does nothing until title
  is non-empty after trimming).
- Mutation failure (network, project ownership): inline error text inside
  the modal; modal stays open, form state preserved.

## Testing

- New `convex/tasks.test.ts` using `convex-test` (same setup as
  `convex/sync.test.ts`), covering `tasks.create`:
  - status is `backlog` when no `scheduledDate` is given;
  - status is `today` when a `scheduledDate` is given (today or future);
  - creating with a `projectId` owned by another user throws.
  This pins the behavior of the status line being cleaned up.
- No frontend component test: the project has no React test infrastructure
  and adding it is out of scope. The modal is verified manually in dev
  (open from each of the three pages, create with/without each optional
  field, Esc/cancel behavior, pending/error states).

## Out of scope

- Due date and priority fields (supported by `tasks.update` but not
  `tasks.create`).
- A global "new task" keyboard shortcut or app-shell button.
- Editing existing tasks via the modal.
